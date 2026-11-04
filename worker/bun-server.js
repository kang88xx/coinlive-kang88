// Local dev server for the 객장 room, same Room class as the Cloudflare worker.
//   bun worker/bun-server.js            → ws://127.0.0.1:8787/gaekjang/ws
//   CHAT_WAIT_MS=0 PORT=8787 bun worker/bun-server.js
// Open the page as http://localhost:4200/?ws=ws://127.0.0.1:8787
import { Room, CAP } from './src/room.js';

const PORT = Number(process.env.PORT) || 8787;
const devices = new Map();
const rooms = new Map();
function roomOf(no){
  let r = rooms.get(no);
  if (!r){
    r = new Room({
      roomNo: no, secret: process.env.SK_SECRET || 'coinlive-dev',
      chatWaitMs: process.env.CHAT_WAIT_MS != null ? Number(process.env.CHAT_WAIT_MS) : 60000,
      devices: { firstSeen: async h => devices.get(h) ?? null, seen: async (h, ts) => { devices.set(h, ts); } },
    });
    rooms.set(no, r);
  }
  return r;
}

Bun.serve({
  port: PORT,
  fetch(req, server){
    const url = new URL(req.url);
    if (url.pathname === '/health') return Response.json({ ok: true, cap: CAP, rooms: [...rooms].map(([n, r]) => [n, r.count]) });
    if (url.pathname !== '/gaekjang/ws') return new Response('coinlive chat server (dev)', { status: 404 });
    const roomNo = parseInt(url.searchParams.get('room') || '1', 10) || 1;
    const ip = server.requestIP(req)?.address || '';
    const ok = server.upgrade(req, { data: { roomNo, ip, k: url.searchParams.get('k'), d: url.searchParams.get('d'), conn: null } });
    return ok ? undefined : new Response('expected a websocket', { status: 426 });
  },
  websocket: {
    async open(ws){
      const d = ws.data, room = roomOf(d.roomNo);
      const conn = {
        send: s => { try { ws.send(s); } catch (e) {} },
        close: (code, reason) => { try { ws.close(code || 1000, reason || ''); } catch (e) {} },
        persist: () => {},
      };
      d.conn = conn;
      const joined = await room.join(conn, { k: d.k, d: d.d }, d.ip);
      if (process.env.LOG) console.log(new Date().toISOString(), joined ? 'join' : 'refused', conn.id || '-', 'count', room.count);
    },
    message(ws, msg){
      const d = ws.data; if (!d.conn || !d.conn.id) return;
      if (process.env.LOG && typeof msg === 'string' && msg !== 'ping') console.log(new Date().toISOString(), d.conn.id, msg);
      roomOf(d.roomNo).message(d.conn, typeof msg === 'string' ? msg : '');
    },
    close(ws){
      const d = ws.data; if (!d.conn || !d.conn.id) return;
      roomOf(d.roomNo).leave(d.conn, 1000, 'bye');
      if (process.env.LOG) console.log(new Date().toISOString(), 'leave', d.conn.id, 'count', roomOf(d.roomNo).count);
    },
  },
});
console.log('coinlive chat dev server on ws://127.0.0.1:' + PORT + '/gaekjang/ws');
