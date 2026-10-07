'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { WebSocket } = require('ws');
const { createRoomServer } = require('../server');
const { stepPlayer, WORLD } = require('../server/world');
function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
async function client(url) {
  const ws = new WebSocket(url); const messages = [], listeners = [];
  ws.on('message', raw => { const data = JSON.parse(raw); messages.push(data); for (const item of [...listeners]) if (item.predicate(data)) { listeners.splice(listeners.indexOf(item), 1); clearTimeout(item.timer); item.resolve(data); } });
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  const wait = predicate => {
    const found = messages.find(predicate); if (found) return Promise.resolve(found);
    return new Promise((resolve, reject) => { const item = { predicate, resolve }; item.timer = setTimeout(() => { listeners.splice(listeners.indexOf(item), 1); reject(new Error('Timed out waiting for message')); }, 4000); listeners.push(item); });
  };
  return { ws, messages, wait, send: d => ws.send(JSON.stringify(d)), request: d => { const id = crypto.randomUUID(); ws.send(JSON.stringify({ ...d, requestId: id })); return wait(m => m.requestId === id); }, close: () => new Promise(resolve => { if (ws.readyState === WebSocket.CLOSED) return resolve(); ws.once('close', resolve); ws.close(); }) };
}
test('two desktops create/join, chat, synchronize movement and preserve the room after its creator leaves', async t => {
  const service = createRoomServer({ port: 0, host: '127.0.0.1' }); const address = await service.ready;
  const url = `ws://127.0.0.1:${address.port}`; const a = await client(url), b = await client(url), outsider = await client(url);
  t.after(async () => { await Promise.all([a.close(), b.close(), outsider.close()]); await service.close(); });
  const created = await a.request({ type: 'create', name: '승현', avatar: 0 });
  assert.equal(created.type, 'joined'); assert.match(created.code, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
  const missing = await b.request({ type: 'join', code: 'INVALID' }); assert.equal(missing.type, 'error');
  await delay(510);
  const joined = await b.request({ type: 'join', code: created.code.toLowerCase(), name: '친구', avatar: 1 });
  assert.equal(joined.players.length, 2); assert.equal(joined.players.find(p => p.name === '친구').avatar, 1);
  await outsider.request({ type: 'create', name: '다른 방' });
  const echo = await a.request({ type: 'chat', text: '안녕! <script>실행하지 않음</script>' });
  const received = await b.wait(m => m.type === 'chat' && m.id === echo.id); assert.equal(received.text, echo.text);
  assert.equal(outsider.messages.filter(m => m.type === 'chat').length, 0);
  a.send({ type: 'input', right: true, jump: true, x: 999999 });
  const snap = await b.wait(m => m.type === 'snapshot' && m.players.some(p => p.id === created.selfId && p.x > 170 && p.y > 0));
  assert(snap.players.find(p => p.id === created.selfId).x < 1000);
  a.send({ type: 'input', right: false, jump: false });
  await a.request({ type: 'leave' }); assert.equal(service.rooms.get(created.code).players.size, 1);
  const afterLeave = await b.request({ type: 'chat', text: '방장이 나가도 대화 가능' }); assert.equal(afterLeave.type, 'chat');
  await b.request({ type: 'leave' }); assert.equal(service.rooms.has(created.code), false);
});
test('late join receives history; profiles, room capacity, spam limits and auth work', async t => {
  const service = createRoomServer({ port: 0, host: '127.0.0.1', accessKey: 'test-only-password' }); const address = await service.ready;
  const url = `ws://127.0.0.1:${address.port}`, clients = [];
  t.after(async () => { await Promise.all(clients.map(c => c.close())); await service.close(); });
  const a = await client(url); clients.push(a);
  const blocked = await a.request({ type: 'create' }); assert.equal(blocked.type, 'error');
  const wrong = await a.request({ type: 'auth', key: 'wrong' }); assert.equal(wrong.type, 'error');
  a.send({ type: 'auth', key: 'test-only-password' }); await a.wait(m => m.type === 'authorized');
  const created = await a.request({ type: 'create', name: '첫 사용자' });
  await a.request({ type: 'chat', text: '먼저 보낸 대화' });
  for (let i = 0; i < 12; i++) {
    const c = await client(url); clients.push(c); c.send({ type: 'auth', key: 'test-only-password' }); await c.wait(m => m.type === 'authorized');
    const result = await c.request({ type: 'join', code: created.code, name: `친구${i}`, avatar: 1 });
    if (i === 0) assert.equal(result.history[0].text, '먼저 보낸 대화');
    if (i < 11) assert.equal(result.type, 'joined'); else assert.equal(result.type, 'error');
  }
  a.send({ type: 'profile', name: '새 이름', avatar: 1 });
  await clients[1].wait(m => m.type === 'players' && m.players.some(p => p.name === '새 이름' && p.avatar === 1));
  let response;
  for (let i = 0; i < 6; i++) response = await a.request({ type: 'chat', text: `연속 ${i}` });
  assert.equal(response.type, 'error');
});
test('physics stays within boundaries and holding jump does not create repeated auto-jumps', () => {
  const p = { x: 980, y: 0, vy: 0, input: { right: true, jump: true } };
  let airborne = false;
  for (let i = 0; i < 180; i++) { stepPlayer(p); airborne ||= p.y > 0; }
  assert(airborne); assert.equal(p.x, WORLD.width - 20); assert.equal(p.y, 0); assert.equal(p.vy, 0);
  p.input = { left: true, jump: false }; for (let i = 0; i < 300; i++) stepPlayer(p);
  assert.equal(p.x, 20);
  p.input.jump = true; stepPlayer(p); assert(p.y > 0);
});
test('a second app can detect an already running server without an unhandled ws error', async () => {
  const first = createRoomServer({ port: 0, host: '127.0.0.1' });
  const address = await first.ready;
  const second = createRoomServer({ port: address.port, host: '127.0.0.1' });
  await assert.rejects(second.ready, { code: 'EADDRINUSE' });
  await second.close(); await first.close();
});
