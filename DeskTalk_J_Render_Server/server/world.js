'use strict';
const WORLD = Object.freeze({ width: 1000, speed: 205, gravity: 1080, jump: 465, tick: 1 / 30 });
function stepPlayer(p, dt = WORLD.tick) {
  const input = p.input || {};
  const move = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  p.vx = move * WORLD.speed;
  if (move) p.face = move;
  p.x = Math.max(20, Math.min(WORLD.width - 20, p.x + p.vx * dt));
  if (input.jump && !p.jumpHeld && p.y <= 0.001) p.vy = WORLD.jump;
  p.jumpHeld = !!input.jump;
  p.y = Math.max(0, p.y + p.vy * dt);
  if (p.y > 0) p.vy -= WORLD.gravity * dt;
  else p.vy = 0;
}
function publicPlayer(p) {
  return { id: p.id, name: p.name, avatar: p.avatar, x: p.x, y: p.y, vx: p.vx, vy: p.vy, face: p.face };
}
module.exports = { WORLD, stepPlayer, publicPlayer };
