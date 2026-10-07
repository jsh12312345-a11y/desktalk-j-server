'use strict';
const http = require('node:http');
const crypto = require('node:crypto');
const os = require('node:os');
const { WebSocketServer, WebSocket } = require('ws');
const { WORLD, stepPlayer, publicPlayer } = require('./world');
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const MAX_ROOM = 12;
const cleanText = (value, max) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
function localAddresses(port) {
  const addresses = [];
  let interfaces;
  try { interfaces = os.networkInterfaces(); } catch { return addresses; }
  for (const list of Object.values(interfaces)) for (const a of list || []) {
    if (a.family === 'IPv4' && !a.internal) addresses.push(`ws://${a.address}:${port}`);
  }
  return addresses;
}
function createRoomServer({ port = Number(process.env.PORT || 8787), host = process.env.HOST || '0.0.0.0', accessKey = process.env.DESKTALK_ACCESS_KEY || '' } = {}) {
  const rooms = new Map();
  const clients = new Set();
  const server = http.createServer((req, res) => {
    if (req.url !== '/health' && req.url !== '/') { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ service: 'desktalk-j', version: '0.1.0', rooms: rooms.size, players: [...rooms.values()].reduce((a, r) => a + r.players.size, 0) }));
  });
  const wss = new WebSocketServer({ server, maxPayload: 4096, perMessageDeflate: false });
  // HTTP listen errors are reported by ready; ws mirrors those errors too.
  wss.on('error', () => {});
  function send(ws, data) {
    if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 128 * 1024) ws.send(JSON.stringify(data));
  }
  function broadcast(room, data) { for (const p of room.players.values()) send(p.ws, data); }
  function error(ws, request, message) { send(ws, { type: 'error', requestId: request.requestId, message }); }
  function leave(ws, announce = true) {
    if (!ws.player || !ws.room) return;
    const room = ws.room, p = ws.player;
    room.players.delete(p.id); ws.player = null; ws.room = null;
    if (announce) broadcast(room, { type: 'system', text: `${p.name}님이 나갔습니다.`, time: Date.now() });
    broadcast(room, { type: 'players', players: [...room.players.values()].map(publicPlayer) });
    if (!room.players.size) rooms.delete(room.code);
  }
  function join(ws, room, data) {
    leave(ws);
    const p = { id: crypto.randomUUID(), name: cleanText(data.name, 16) || '사용자', avatar: data.avatar === 1 ? 1 : 0,
      x: 160 + room.players.size * 58, y: 0, vx: 0, vy: 0, face: 1, input: {}, jumpHeld: false, lastInput: Date.now(), ws };
    room.players.set(p.id, p); ws.player = p; ws.room = room;
    send(ws, { type: 'joined', requestId: data.requestId, code: room.code, selfId: p.id, players: [...room.players.values()].map(publicPlayer), history: room.history, world: WORLD });
    broadcast(room, { type: 'players', players: [...room.players.values()].map(publicPlayer) });
    broadcast(room, { type: 'system', text: `${p.name}님이 들어왔습니다.`, time: Date.now() });
  }
  wss.on('connection', (ws) => {
    clients.add(ws); ws.alive = true; ws.authenticated = !accessKey; ws.chatTimes = []; ws.messageTimes = []; ws.connectedAt = Date.now();
    ws.on('pong', () => { ws.alive = true; });
    send(ws, { type: 'hello', version: '0.1.0', requiresKey: !!accessKey });
    ws.on('message', (raw) => {
      let d;
      try { d = JSON.parse(raw); } catch { return ws.close(1007, 'Invalid JSON'); }
      if (!d || typeof d !== 'object' || Array.isArray(d)) return;
      const now = Date.now();
      ws.messageTimes = ws.messageTimes.filter(t => now - t < 1000);
      if (ws.messageTimes.length > 90) return ws.close(1008, 'Too many messages');
      ws.messageTimes.push(now);
      if (d.type === 'auth') {
        const value = Buffer.from(String(d.key || '')), expected = Buffer.from(accessKey);
        if (value.length === expected.length && crypto.timingSafeEqual(value, expected)) { ws.authenticated = true; send(ws, { type: 'authorized' }); }
        else error(ws, d, '서버 접속 암호가 맞지 않습니다.');
        return;
      }
      if (!ws.authenticated) return error(ws, d, '서버 접속 암호를 입력해 주세요.');
      if (d.type === 'create' || d.type === 'join') {
        if (now - (ws.lastRoomAction || 0) < 500) return error(ws, d, '잠시 후 다시 시도해 주세요.');
        ws.lastRoomAction = now;
        let room;
        if (d.type === 'create') {
          if (rooms.size >= 1000) return error(ws, d, '서버의 방 개수 제한에 도달했습니다.');
          let code;
          do { code = Array.from(crypto.randomBytes(6), n => ALPHABET[n % ALPHABET.length]).join(''); } while (rooms.has(code));
          room = { code, players: new Map(), history: [] }; rooms.set(code, room);
        } else {
          const code = String(d.code || '').trim().toUpperCase().replace(/[ -]/g, '');
          room = rooms.get(code);
          if (!room) return error(ws, d, '해당 방이 없습니다. 서버 주소와 방 코드를 확인해 주세요.');
          if (room.players.size >= MAX_ROOM) return error(ws, d, '방이 가득 찼습니다. 최대 12명까지 입장할 수 있습니다.');
        }
        join(ws, room, d);
      } else if (d.type === 'leave') { leave(ws); send(ws, { type: 'left', requestId: d.requestId }); }
      else if (d.type === 'input' && ws.player) {
        ws.player.input = { left: d.left === true, right: d.right === true, jump: d.jump === true }; ws.player.lastInput = now;
      } else if (d.type === 'profile' && ws.player) {
        ws.player.name = cleanText(d.name, 16) || ws.player.name; ws.player.avatar = d.avatar === 1 ? 1 : 0;
        broadcast(ws.room, { type: 'players', players: [...ws.room.players.values()].map(publicPlayer) });
      } else if (d.type === 'chat' && ws.player) {
        const text = cleanText(d.text, 220);
        if (!text) return error(ws, d, '메시지를 입력해 주세요.');
        ws.chatTimes = ws.chatTimes.filter(t => now - t < 3000);
        if (ws.chatTimes.length >= 5) return error(ws, d, '메시지를 너무 빠르게 보내고 있습니다.');
        ws.chatTimes.push(now);
        const message = { type: 'chat', requestId: d.requestId, id: crypto.randomUUID(), playerId: ws.player.id, name: ws.player.name, text, time: now };
        ws.room.history.push(message); if (ws.room.history.length > 100) ws.room.history.shift();
        broadcast(ws.room, message);
      } else if (d.type === 'ping') send(ws, { type: 'pong', time: now });
    });
    ws.on('close', () => { leave(ws); clients.delete(ws); });
    ws.on('error', () => {});
  });
  let count = 0;
  const physics = setInterval(() => {
    const now = Date.now();
    for (const r of rooms.values()) {
      for (const p of r.players.values()) { if (now - p.lastInput > 700) p.input = {}; stepPlayer(p); }
      if (count % 2 === 0) broadcast(r, { type: 'snapshot', time: now, players: [...r.players.values()].map(publicPlayer) });
    }
    count++;
  }, 1000 / 30);
  const heartbeat = setInterval(() => {
    for (const ws of clients) {
      if (!ws.alive || (!ws.player && Date.now() - ws.connectedAt > 30 * 60 * 1000)) { ws.terminate(); continue; }
      ws.alive = false; ws.ping();
    }
  }, 15000);
  physics.unref(); heartbeat.unref();
  const ready = new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve(server.address()));
  });
  async function close() {
    clearInterval(physics); clearInterval(heartbeat);
    for (const ws of clients) ws.terminate();
    await new Promise(resolve => wss.close(() => server.close(resolve)));
  }
  return { ready, close, rooms, server, localAddresses: () => localAddresses(server.address()?.port || port) };
}
if (require.main === module) {
  const service = createRoomServer();
  service.ready.then(a => {
    console.log(`DeskTalk J 서버 실행 중 · 포트 ${a.port}`);
    console.log(`이 PC: ws://127.0.0.1:${a.port}`);
    for (const address of service.localAddresses()) console.log(`같은 네트워크: ${address}`);
    console.log('이 창을 닫으면 서버가 종료됩니다.');
  }).catch(e => { console.error('서버를 시작할 수 없습니다:', e.message); process.exitCode = 1; service.close(); });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => service.close().then(() => process.exit()));
}
module.exports = { createRoomServer, localAddresses };
