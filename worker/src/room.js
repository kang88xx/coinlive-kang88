// The 객장 room: one shared room where everyone sees everyone's character and chat lines.
// Platform-neutral — the Cloudflare Durable Object (src/index.js) and the Bun dev server
// (bun-server.js) both drive this class. It speaks exactly the protocol site/index.html expects:
//
//   client → server   {t:'s', n, c, x, z, r, s, a}   my state (only the changed fields)
//                     {t:'c', m}                      a chat line
//                     'ping'                          keepalive (answered with 'pong')
//   server → client   {t:'hello', id, room, peers, count, chat, now, chatAt, canChat}
//                     {t:'tick', up:[partial states], chat:[{id,m}], left:[ids], count}
//                     {t:'full', cap, why?}   then close 4001
//                     {t:'cx', why, left?}     a chat line was refused
//
// A connection is a `conn` object the host provides: { send(str), close(code, reason), persist() }
// plus the fields this class keeps on it (id, k, d, ip, st, sk, joinedAt, lastChat, lastText, chatAt).

export const CAP = 100;            // people in the room
export const IP_CAP = 12;          // connections from one address
export const CHAT_MAX = 40;        // characters per line
export const CHAT_GAP_MS = 3000;   // between two lines from one person
export const SAME_MS = 20000;      // the same line again within this → refused
export const TICK_MS = 120;        // state updates are batched into ticks this often
export const NAME_MAX = 16;
export const MSG_PER_SEC = 40;   // more than this from one socket → it is a flood, close it
const ROOM = { x0: -11, x1: 11, z0: -10, z1: 14 };
const BODY_N = 6;
const STOCKS = new Set(['BTC', 'ETH']);
const AVG_MAX = 1e9;

const LINK_RE = /(https?:\/\/|www\.|[a-z0-9-]+\.(com|net|org|io|kr|co|me|xyz|gg|link|app|site|shop|ly|to)\b|@[a-z0-9_]{3,}|\b(telegram|텔레그램|텔레방|카톡|카카오톡|오픈채팅|오픈챗|오픈톡|라인아이디|디스코드|discord|t\.me)\b|\d{3}[-.\s]?\d{3,4}[-.\s]?\d{4}|리딩방|수익보장|무료방)/i;
const BAD_RE = /(씨발|시발|씨팔|ㅅㅂ|병신|ㅂㅅ|개새|개쌔|좆|좃|지랄|니미|느금|엿먹|창녀|걸레|씹|fuck|shit)/i;

export function cleanText(v){
  if (typeof v !== 'string') return '';
  const t = v.replace(/[\t\n\r\f\v]+/g, ' ')
    .replace(/[\u0000-\u001f\u007f-\u009f­؜ᅟᅠ᠎​-‏‪-‮⁠-⁯ㅤ﻿ﾠ]/g, '')
    .replace(/[֐-ࣿיִ-﷿ﹰ-﻾\u{10800}-\u{10fff}\u{1e800}-\u{1efff}]/gu, '')
    .replace(/\s+/g, ' ').trim();
  return [...t];
}
export function cleanName(v){
  const s = typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, '').trim().slice(0, NAME_MAX) : '';
  return s || '이름 없는 김정은';
}
const num = (v, a, b) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(a, Math.min(b, Math.round(v * 100) / 100)) : null);
const HEX32 = /^[0-9a-f]{32}$/;

export function hex(bytes){ return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join(''); }
export async function sha256hex(s){ return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))); }
// the speaker key others see: a keyed hash of the device key, so a block keeps working across visits
export async function speakerKey(secret, d){
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(d))).slice(0, 12);
}
export function randomId(){ const b = new Uint8Array(4); crypto.getRandomValues(b); return hex(b); }

export class Room {
  // opts: { roomNo, secret, chatWaitMs, devices: { firstSeen(hash) → Promise<number|null>, seen(hash, ts) → Promise<void> }, now() }
  constructor(opts){
    this.opts = Object.assign({ roomNo: 1, secret: 'coinlive-dev', chatWaitMs: 60000, now: () => Date.now() }, opts);
    this.conns = new Map();   // id → conn
    this.pending = { up: new Map(), chat: [], left: [] };
    this.lastFlush = 0; this.flushT = 0;
  }
  get count(){ return this.conns.size; }
  // a connection that was already in the room (after the host woke up from hibernation)
  restore(conn){ if (conn && conn.id) this.conns.set(conn.id, conn); }

  // a new socket: q = { k: page key, d: device key }, ip = the address it came from
  async join(conn, q, ip){
    const now = this.opts.now();
    const k = typeof q.k === 'string' && HEX32.test(q.k) ? q.k : null;
    const d = typeof q.d === 'string' && HEX32.test(q.d) ? q.d : null;
    // this page reconnecting: its old socket goes first, so a link that died silently never leaves a second copy
    if (k) for (const c of [...this.conns.values()]) if (c.k === k) this.leave(c, 1000, 'replaced');
    let ipCount = 0;
    for (const c of this.conns.values()) if (ip && c.ip === ip) ipCount++;
    if (ip && ipCount >= IP_CAP){ this.refuse(conn, { t: 'full', cap: CAP, why: 'ip' }); return false; }
    if (this.conns.size >= CAP){ this.refuse(conn, { t: 'full', cap: CAP }); return false; }

    conn.id = randomId(); while (this.conns.has(conn.id)) conn.id = randomId();
    conn.k = k; conn.d = d; conn.ip = ip || ''; conn.joinedAt = now;
    conn.st = null;                 // full state arrives with the first 's' message
    conn.lastChat = 0; conn.lastText = ''; conn.lastTextAt = 0;
    conn.sk = d ? await speakerKey(this.opts.secret, d) : null;
    // the 1-minute wait before chatting counts from the first time this device showed up (not from this reconnect)
    let first = now;
    if (d && this.opts.devices){
      const h = await sha256hex(d);
      const seen = await this.opts.devices.firstSeen(h);
      if (typeof seen === 'number' && now - seen < 86400000) first = seen; else await this.opts.devices.seen(h, now);
    }
    conn.chatAt = first + this.opts.chatWaitMs;
    this.conns.set(conn.id, conn);
    conn.persist();
    const peers = [];
    for (const c of this.conns.values()) if (c !== conn && c.st) peers.push(Object.assign({ id: c.id, sk: c.sk }, c.st));
    conn.send(JSON.stringify({ t: 'hello', id: conn.id, room: this.opts.roomNo, peers, count: this.conns.size, chat: 'on', now, chatAt: conn.chatAt, canChat: !!d }));
    this.queueCount();
    return true;
  }
  refuse(conn, msg){ try { conn.send(JSON.stringify(msg)); } catch (e) {} conn.close(4001, 'full'); }

  leave(conn, code, reason){
    if (!conn || !conn.id || this.conns.get(conn.id) !== conn) { if (conn && conn.close) conn.close(code || 1000, reason || ''); return; }
    this.conns.delete(conn.id);
    this.pending.up.delete(conn.id);
    this.pending.left.push(conn.id);
    conn.close(code || 1000, reason || '');
    this.schedule();
  }

  message(conn, data){
    if (!conn || !conn.id || !this.conns.has(conn.id)) return;
    // a flood from one socket (the page sends at most ~7 state updates a second) is dropped, not relayed
    const sec = Math.floor(this.opts.now() / 1000);
    if (conn.rateSec !== sec){ conn.rateSec = sec; conn.rateN = 0; }
    if (++conn.rateN > MSG_PER_SEC){ this.leave(conn, 1008, 'flood'); return; }
    if (typeof data !== 'string'){ return; }
    if (data === 'ping'){ conn.send('pong'); return; }
    if (data.length > 2000) return;
    let m; try { m = JSON.parse(data); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    if (m.t === 's') this.onState(conn, m);
    else if (m.t === 'c') this.onChat(conn, m);
  }

  onState(conn, m){
    const up = {};
    if (Object.prototype.hasOwnProperty.call(m, 'n')) up.n = cleanName(m.n);
    if (Number.isInteger(m.c)) up.c = ((m.c % BODY_N) + BODY_N) % BODY_N;
    const x = num(m.x, ROOM.x0, ROOM.x1), z = num(m.z, ROOM.z0, ROOM.z1), r = num(m.r, -10, 10);
    if (x != null) up.x = x; if (z != null) up.z = z; if (r != null) up.r = r;
    if (m.s === 0 || m.s === 1) up.s = m.s;
    if (Object.prototype.hasOwnProperty.call(m, 'a')){
      const a = m.a;
      up.a = Array.isArray(a) && STOCKS.has(a[0]) && Number.isInteger(a[1]) && a[1] >= 1e4 && a[1] <= AVG_MAX ? [a[0], a[1]] : null;
    }
    if (!conn.st){
      // the first message must carry a whole state, or the character can't be drawn
      if (typeof up.n !== 'string' || up.c == null || up.x == null || up.z == null) return;
      conn.st = { n: up.n, c: up.c, x: up.x, z: up.z, r: up.r != null ? up.r : Math.PI, s: up.s || 0, a: up.a || null };
      conn.persist();
      this.pending.up.set(conn.id, Object.assign({ id: conn.id, sk: conn.sk }, conn.st));
      this.schedule();
      return;
    }
    const diff = {};
    for (const key of Object.keys(up)){
      if (JSON.stringify(up[key]) === JSON.stringify(conn.st[key])) continue;
      conn.st[key] = up[key]; diff[key] = up[key];
    }
    if (!Object.keys(diff).length) return;
    conn.persist();
    const cur = this.pending.up.get(conn.id) || { id: conn.id };
    this.pending.up.set(conn.id, Object.assign(cur, diff));
    this.schedule();
  }

  onChat(conn, m){
    const now = this.opts.now();
    const refuse = (why, left) => conn.send(JSON.stringify(left == null ? { t: 'cx', why } : { t: 'cx', why, left }));
    if (!conn.d) return refuse('nodev');
    if (!conn.st) return refuse('wait', 1000);
    if (now < conn.chatAt) return refuse('wait', conn.chatAt - now);
    if (now - conn.lastChat < CHAT_GAP_MS) return refuse('slow', CHAT_GAP_MS - (now - conn.lastChat));
    const chars = cleanText(m.m);
    if (!chars.length) return;
    if (chars.length > CHAT_MAX) return refuse('long');
    const text = chars.join('');
    if (LINK_RE.test(text) || BAD_RE.test(text)) return refuse('blocked');
    if (text === conn.lastText && now - conn.lastTextAt < SAME_MS) return refuse('same');
    conn.lastChat = now; conn.lastText = text; conn.lastTextAt = now;
    conn.persist();
    this.pending.chat.push({ id: conn.id, m: text });
    this.flush();   // words go out right away; positions can wait for the next tick
  }

  queueCount(){ this.pending.count = true; this.schedule(); }
  // batch state updates: flush now if the last tick is old enough, otherwise soon
  schedule(){
    const now = this.opts.now();
    if (now - this.lastFlush >= TICK_MS){ this.flush(); return; }
    if (this.flushT) return;
    this.flushT = setTimeout(() => { this.flushT = 0; this.flush(); }, TICK_MS - (now - this.lastFlush));
  }
  flush(){
    if (this.flushT){ clearTimeout(this.flushT); this.flushT = 0; }
    const p = this.pending;
    if (!p.up.size && !p.chat.length && !p.left.length && !p.count) return;
    const tick = { t: 'tick', count: this.conns.size };
    if (p.up.size) tick.up = [...p.up.values()];
    if (p.chat.length) tick.chat = p.chat;
    if (p.left.length) tick.left = p.left;
    this.pending = { up: new Map(), chat: [], left: [] };
    this.lastFlush = this.opts.now();
    const s = JSON.stringify(tick);
    for (const c of this.conns.values()) c.send(s);
  }
}
