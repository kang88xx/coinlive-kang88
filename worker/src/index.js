// Cloudflare Worker + Durable Object hosting the 객장 room (see room.js for the protocol).
// One Durable Object per room number; sockets use the hibernation API so an idle room costs nothing.
import { Room, CAP } from './room.js';

const DEV_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
function originOk(origin, env){
  if (!origin) return false;
  if (DEV_ORIGIN.test(origin)) return true;
  const allowed = (env.ALLOWED_ORIGINS || 'https://coinlive.kang88.io').split(',').map(s => s.trim()).filter(Boolean);
  return allowed.includes(origin);
}

export default {
  async fetch(req, env){
    const url = new URL(req.url);
    if (url.pathname === '/gaekjang/ws'){
      if ((req.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') return new Response('expected a websocket', { status: 426 });
      if (!originOk(req.headers.get('Origin'), env)) return new Response('origin not allowed', { status: 403 });
      const roomNo = /^\d{1,3}$/.test(url.searchParams.get('room') || '') ? url.searchParams.get('room') : '1';
      const id = env.ROOM.idFromName('gaekjang-' + roomNo);
      return env.ROOM.get(id).fetch(req);
    }
    if (url.pathname === '/health') return Response.json({ ok: true, cap: CAP });
    return new Response('coinlive chat server', { status: 404 });
  },
};

const DEV_TTL_MS = 86400000;

export class GaekjangRoom {
  constructor(state, env){
    this.state = state; this.env = env;
    this.room = null;
    this.conns = new WeakMap();   // WebSocket → conn
    // 'ping' is answered without waking the object
    this.state.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }
  ensure(roomNo){
    if (this.room) return this.room;
    const storage = this.state.storage;
    this.room = new Room({
      roomNo: roomNo || 1,
      secret: this.env.SK_SECRET || 'coinlive-dev',
      chatWaitMs: Number(this.env.CHAT_WAIT_MS) >= 0 ? Number(this.env.CHAT_WAIT_MS) : 60000,
      devices: {
        firstSeen: async h => { const v = await storage.get('dev:' + h); return typeof v === 'number' ? v : null; },
        seen: async (h, ts) => { await storage.put('dev:' + h, ts); const al = await storage.getAlarm(); if (al == null) await storage.setAlarm(Date.now() + DEV_TTL_MS); },
      },
    });
    // sockets that were open before this object went to sleep
    for (const ws of this.state.getWebSockets()){
      const a = ws.deserializeAttachment();
      if (a && a.id) this.room.restore(this.wrap(ws, a));
    }
    return this.room;
  }
  wrap(ws, a){
    const conn = Object.assign({}, a || {});
    conn.send = s => { try { ws.send(s); } catch (e) {} };
    conn.close = (code, reason) => { try { ws.close(code || 1000, reason || ''); } catch (e) {} };
    conn.persist = () => { try { ws.serializeAttachment(snapshot(conn)); } catch (e) {} };
    this.conns.set(ws, conn);
    return conn;
  }
  connOf(ws){
    let c = this.conns.get(ws);
    if (c) return c;
    const a = ws.deserializeAttachment();
    if (!a || !a.id) return null;
    c = this.wrap(ws, a);
    this.room.restore(c);
    return c;
  }
  async fetch(req){
    const url = new URL(req.url);
    const roomNo = parseInt(url.searchParams.get('room') || '1', 10) || 1;
    const room = this.ensure(roomNo);
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server);
    const conn = this.wrap(server, {});
    const ip = req.headers.get('CF-Connecting-IP') || '';
    await room.join(conn, { k: url.searchParams.get('k'), d: url.searchParams.get('d') }, ip);
    return new Response(null, { status: 101, webSocket: client });
  }
  async webSocketMessage(ws, msg){
    const room = this.ensure();
    const conn = this.connOf(ws);
    if (!conn){ try { ws.close(1011, 'unknown'); } catch (e) {} return; }
    room.message(conn, msg);
  }
  async webSocketClose(ws, code){
    const room = this.ensure();
    const conn = this.connOf(ws);
    if (conn) room.leave(conn, 1000, 'bye');
  }
  async webSocketError(ws){
    const room = this.ensure();
    const conn = this.connOf(ws);
    if (conn) room.leave(conn, 1011, 'error');
  }
  // once a day: forget devices not seen for a day
  async alarm(){
    const storage = this.state.storage, now = Date.now();
    const all = await storage.list({ prefix: 'dev:' });
    const old = [];
    for (const [k, v] of all) if (typeof v !== 'number' || now - v > DEV_TTL_MS) old.push(k);
    if (old.length) await storage.delete(old);
    if (all.size - old.length > 0) await storage.setAlarm(now + DEV_TTL_MS);
  }
}

function snapshot(c){
  return { id: c.id, k: c.k, d: c.d, ip: c.ip, st: c.st, sk: c.sk, joinedAt: c.joinedAt, chatAt: c.chatAt, lastChat: c.lastChat, lastText: c.lastText, lastTextAt: c.lastTextAt };
}
