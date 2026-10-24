// Deterministic fixed-step (60 Hz) fighting-game simulation.
// The whole game state is a plain JSON-serialisable object so the online host
// can stream it to the guest verbatim.
import { CHARS, NORMALS, STAGES } from './data.js';

export const BTN = { L: 1, R: 2, U: 4, D: 8, J: 16, A: 32, S: 64, SH: 128, DG: 256 };
const NOIN = { held: 0, pressed: 0 };

export const C = {
  SHIELD_MAX: 60,
  DIGI_TIME: 900,      // 15 s as a Champion
  METER_MAX: 100,
  KB_DECAY_X: 0.977,
  KB_DECAY_Y: 0.99,
  RESPAWN_DELAY: 80,
  ITEM_MIN: 700, ITEM_MAX: 1200,
};

// ---------------------------------------------------------------- helpers
export const form = (f) => CHARS[f.char].forms[f.form];
export const getMove = (f, id) => (form(f).moves && form(f).moves[id]) || NORMALS[id];
const sign = (v) => (v < 0 ? -1 : 1);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function rand(s) {
  s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0;
  return s.seed / 4294967296;
}

const surfCache = new Map();
export function surfaces(stage) {
  let c = surfCache.get(stage);
  if (!c) {
    c = [
      ...stage.solids.map((o) => ({ x1: o.x1, x2: o.x2, y: o.y1, soft: false })),
      ...stage.plats.map((p) => ({ x1: p.x1, x2: p.x2, y: p.y, soft: true })),
    ];
    surfCache.set(stage, c);
  }
  return c;
}
const ledgeCache = new Map();
export function ledges(stage) {
  let c = ledgeCache.get(stage);
  if (!c) {
    c = [];
    for (const o of stage.solids) { c.push({ x: o.x1, y: o.y1, side: -1 }); c.push({ x: o.x2, y: o.y1, side: 1 }); }
    ledgeCache.set(stage, c);
  }
  return c;
}

const ev = (s, e) => s.events.push(e);

// ---------------------------------------------------------------- creation
export function createGame(cfg) {
  const stage = STAGES[cfg.stage];
  const s = {
    frame: 0, stageId: cfg.stage, seed: (cfg.seed ?? 1234567) >>> 0,
    fighters: [], projs: [], items: [], events: [],
    mid: 0, pid: 0, over: false, overT: 0, winner: -1,
    nextItem: C.ITEM_MIN, itemsOn: cfg.items !== false, stocks: cfg.stocks || 3,
  };
  cfg.players.forEach((p, i) => {
    const sp = stage.spawns[i];
    s.fighters.push({
      i, char: p.char, name: p.name || CHARS[p.char].forms[0].name, cpu: !!p.cpu, form: 0,
      x: sp.x, y: sp.y, vx: 0, vy: 0, face: sp.x < 0 ? 1 : -1,
      ground: false, surf: -1, jumps: 0, state: 'air', t: 0,
      move: null, mt: 0, mid: 0, charge: 0, jabN: 0,
      dmg: 0, stocks: s.stocks, hitstun: 0, hitlag: 0, inv: 0, shield: C.SHIELD_MAX, shieldLock: 0,
      meter: 0, digiT: 0, memo: {}, upUsed: false, airDodged: false, fastFall: false,
      dropT: 0, ledgeCD: 0, ledge: -1, grab: -1, grabT: 0, freeze: 0, lastHitBy: -1,
      respawnT: 0, landLag: 0, techT: 0, kb: 0, flash: 0, ko: 0, prevHeld: 0, crouch: false,
      dvx: 0, stats: { dealt: 0, kos: 0, falls: 0, digis: 0 },
    });
  });
  return s;
}

// ---------------------------------------------------------------- main step
export function step(s, inputs) {
  s.events = [];
  s.frame++;
  const stage = STAGES[s.stageId];
  for (const f of s.fighters) {
    const inp = inputs[f.i] || NOIN;
    updateFighter(s, stage, f, inp);
    f.prevHeld = inp.held;
  }
  updateGrabs(s);
  updateProjs(s, stage);
  resolveHits(s);
  updateItems(s, stage);
  pushApart(s);
  checkBlast(s, stage);
  checkOver(s);
}

// ---------------------------------------------------------------- fighter
function setState(f, st) { f.state = st; f.t = 0; }

function startMove(s, f, id) {
  f.state = 'attack'; f.t = 0;
  f.move = id; f.mt = 0; f.charge = 0; f.mid = ++s.mid;
  const m = getMove(f, id);
  if (m.name) ev(s, { k: 'call', i: f.i, name: m.name });
}

function land(s, f, lag) {
  f.jumps = form(f).airJumps; f.upUsed = false; f.airDodged = false; f.fastFall = false;
  f.move = null;
  if (lag > 0) { setState(f, 'landing'); f.landLag = lag; } else setState(f, 'ground');
}

function startDigivolve(s, f) {
  setState(f, 'digivolving');
  f.move = null; f.vx = 0; f.vy = 0; f.inv = 75; f.meter = 0;
  ev(s, { k: 'digi', i: f.i, x: f.x, y: f.y });
}

function dedigivolve(s, f, silent) {
  if (f.form === 0) return;
  f.form = 0; f.digiT = 0;
  if (f.ground) f.y = f.y; // feet stay planted
  if (!silent) ev(s, { k: 'dedigi', i: f.i, x: f.x, y: f.y - 30 });
  if (f.jumps > form(f).airJumps) f.jumps = form(f).airJumps;
}

function updateFighter(s, stage, f, inp) {
  const held = inp.held, pr = inp.pressed;
  if (f.flash > 0) f.flash--;
  if (f.state === 'out') return;
  if (f.state === 'dead') {
    if (--f.respawnT <= 0) respawn(s, stage, f);
    return;
  }
  if (f.hitlag > 0) { f.hitlag--; if (pr & BTN.SH) f.techT = 12; return; }
  if (f.state === 'grabbed') return; // positioned by the grabber
  if (f.inv > 0) f.inv--;
  if (f.ledgeCD > 0) f.ledgeCD--;
  if (f.dropT > 0) f.dropT--;
  if (f.techT > 0) f.techT--;
  if (f.freeze > 0) f.freeze--;
  if (pr & BTN.SH) f.techT = 12;
  if (f.state !== 'shield' && f.shield < C.SHIELD_MAX) f.shield = Math.min(C.SHIELD_MAX, f.shield + 0.12);
  if (f.form === 1 && f.state !== 'digivolving' && --f.digiT <= 0) dedigivolve(s, f);
  f.t++;

  const fm = form(f);
  const dirX = ((held & BTN.R) ? 1 : 0) - ((held & BTN.L) ? 1 : 0);
  const pDirX = ((pr & BTN.R) ? 1 : 0) - ((pr & BTN.L) ? 1 : 0);
  const up = held & BTN.U, down = held & BTN.D;
  const jumpPressed = (pr & BTN.J) || (pr & BTN.U);
  f.crouch = false;

  // keep grounded fighters glued to their surface
  if (f.ground) {
    const sf = surfaces(stage)[f.surf];
    if (!sf || f.x < sf.x1 - fm.w * 0.3 || f.x > sf.x2 + fm.w * 0.3) { f.ground = false; f.surf = -1; f.jumps = fm.airJumps; }
    else f.y = sf.y;
  }

  switch (f.state) {
    case 'ground': {
      if (!f.ground) { setState(f, 'air'); break; }
      if ((pr & BTN.DG) && f.form === 0 && f.meter >= C.METER_MAX) { startDigivolve(s, f); break; }
      if (held & BTN.SH) {
        if (pr & BTN.A) { startMove(s, f, 'grab'); break; }
        setState(f, 'shield'); f.shieldLock = 0; break;
      }
      if (pr & BTN.S) { special(s, f, held); break; }
      if (pr & BTN.A) {
        if (up) startMove(s, f, 'usmash');
        else if (down) startMove(s, f, 'dsmash');
        else if (dirX && Math.abs(f.vx) > fm.run * 0.75 && f.t > 6 && !(pr & (BTN.L | BTN.R))) startMove(s, f, 'dash');
        else if (dirX) { f.face = dirX; startMove(s, f, 'fsmash'); }
        else { f.jabN = 0; startMove(s, f, 'jab'); }
        break;
      }
      if (jumpPressed) { setState(f, 'jumpsquat'); break; }
      if ((pr & BTN.D) && surfaces(stage)[f.surf]?.soft) {
        f.ground = false; f.surf = -1; f.dropT = 14; f.y += 2; f.jumps = fm.airJumps; setState(f, 'air'); break;
      }
      if (dirX) {
        if (dirX !== f.face) { f.face = dirX; f.t = 0; }
        f.vx += (dirX * fm.run - f.vx) * 0.25;
      } else {
        f.vx *= 0.78; if (Math.abs(f.vx) < 0.1) f.vx = 0;
        if (down) f.crouch = true;
      }
      physics(s, stage, f);
      break;
    }
    case 'jumpsquat': {
      if ((pr & BTN.A) && up) { startMove(s, f, 'usmash'); break; }
      if ((pr & BTN.S) && up) { f.ground = false; special(s, f, held); break; }
      if (f.t >= 4) {
        const full = held & (BTN.J | BTN.U);
        f.vy = -fm.jump * (full ? 1 : 0.72);
        f.ground = false; f.surf = -1; f.jumps = fm.airJumps;
        if (dirX) f.vx = dirX * Math.max(Math.abs(f.vx), fm.air);
        setState(f, 'air');
        ev(s, { k: 'jump', i: f.i, x: f.x, y: f.y });
      }
      f.vx *= 0.9;
      physics(s, stage, f);
      break;
    }
    case 'air': {
      if ((pr & BTN.DG) && f.form === 0 && f.meter >= C.METER_MAX) { startDigivolve(s, f); break; }
      if ((pr & BTN.SH) && !f.airDodged) { airDodge(s, f, held); break; }
      if (pr & BTN.S) { if (special(s, f, held)) break; }
      if (pr & BTN.A) {
        let id = 'nair';
        if (up) id = 'uair'; else if (down) id = 'dair';
        else if (dirX === f.face) id = 'fair'; else if (dirX === -f.face) id = 'bair';
        startMove(s, f, id); break;
      }
      if (jumpPressed && f.jumps > 0) {
        f.jumps--; f.vy = -fm.djump; f.fastFall = false;
        if (dirX) { f.face = dirX; f.vx = dirX * fm.air; } else f.vx *= 0.5;
        ev(s, { k: 'djump', i: f.i, x: f.x, y: f.y });
        f.t = 0;
      }
      if ((pr & BTN.D) && f.vy > -2) f.fastFall = true;
      airDrift(f, fm, dirX);
      if (tryLedge(s, stage, f)) break;
      if (physics(s, stage, f)) land(s, f, 2);
      break;
    }
    case 'helpless': {
      airDrift(f, fm, dirX, 0.6);
      if (tryLedge(s, stage, f)) break;
      if (physics(s, stage, f)) land(s, f, 14);
      break;
    }
    case 'landing': {
      f.vx *= 0.8;
      physics(s, stage, f);
      if (--f.landLag <= 0) setState(f, f.ground ? 'ground' : 'air');
      break;
    }
    case 'attack': updateAttack(s, stage, f, held, pr, dirX); break;
    case 'shield': {
      f.vx *= 0.8;
      f.shield -= 0.22;
      if (f.shieldLock > 0) f.shieldLock--;
      if (f.shield <= 0) { shieldBreak(s, f); break; }
      if (f.shieldLock <= 0) {
        if (pr & BTN.A) { startMove(s, f, 'grab'); break; }
        if (jumpPressed && (pr & BTN.J)) { setState(f, 'jumpsquat'); break; }
        if (pDirX) { roll(s, f, pDirX); break; }
        if (pr & BTN.D) { setState(f, 'spot'); f.inv = 16; break; }
        if (!(held & BTN.SH)) { setState(f, 'landing'); f.landLag = 6; break; }
      }
      physics(s, stage, f);
      if (!f.ground) setState(f, 'air');
      break;
    }
    case 'roll': {
      f.vx = f.t < 18 ? f.dvx * 7 : f.vx * 0.6;
      physics(s, stage, f);
      if (f.t >= 24) setState(f, f.ground ? 'ground' : 'air');
      break;
    }
    case 'spot': {
      f.vx *= 0.7;
      physics(s, stage, f);
      if (f.t >= 22) setState(f, f.ground ? 'ground' : 'air');
      break;
    }
    case 'airdodge': {
      if (f.t < 16) { f.vx *= 0.9; f.vy *= 0.9; if (f.vx === 0 && f.vy === 0) f.vy += 0; }
      else { f.vy = Math.min(f.vy + fm.grav, fm.fall); airDrift(f, fm, dirX, 0.4); }
      if (f.t > 4 && tryLedge(s, stage, f)) break;
      if (moveAndCollide(stage, f)) { land(s, f, 10); break; }
      if (f.t >= 30) setState(f, 'air');
      break;
    }
    case 'hitstun': {
      f.vx *= C.KB_DECAY_X;
      if (f.vy < 0) f.vy *= C.KB_DECAY_Y;
      f.vy = Math.min(f.vy + fm.grav, fm.fall * 1.3);
      // small directional influence
      f.vx += dirX * 0.08;
      if (--f.hitstun <= 0) { setState(f, 'air'); f.jumps = Math.max(f.jumps, 0); }
      const vyBefore = f.vy;
      if (moveAndCollide(stage, f)) {
        if (f.techT > 0) {
          f.vx = 0; f.inv = 20; land(s, f, 0); setState(f, 'tech');
          ev(s, { k: 'tech', i: f.i, x: f.x, y: f.y });
        } else if (vyBefore > 9 && f.kb > 12) {
          f.vy = -vyBefore * 0.45; f.ground = false; f.surf = -1;
          ev(s, { k: 'bounce', x: f.x, y: f.y });
        } else {
          f.vx *= 0.4; land(s, f, f.kb > 12 ? 26 : 8);
        }
      } else if (f.hitstun < 6 && tryLedge(s, stage, f)) { /* grabbed */ }
      break;
    }
    case 'tech': {
      f.vx = 0;
      physics(s, stage, f);
      if (f.t >= 14) setState(f, 'ground');
      break;
    }
    case 'stunned': { // shield break
      f.vx *= 0.9;
      if (physics(s, stage, f)) { f.ground = true; }
      if (f.t >= 170 - Math.min(80, f.dmg * 0.3)) setState(f, f.ground ? 'ground' : 'air');
      break;
    }
    case 'ledge': updateLedge(s, stage, f, held, pr, dirX); break;
    case 'climb': {
      if (f.t >= 14) {
        const L = ledges(stage)[f.ledge];
        f.x = L.x - L.side * form(f).w * 0.7; f.y = L.y; f.ledge = -1;
        snapGround(stage, f); land(s, f, 0);
      }
      break;
    }
    case 'digivolving': {
      f.vx = 0; f.vy = 0;
      if (f.t === 36) {
        f.form = 1; f.digiT = C.DIGI_TIME; f.inv = 40; f.stats.digis++;
        f.jumps = form(f).airJumps;
        ev(s, { k: 'digidone', i: f.i, x: f.x, y: f.y });
        // shockwave that clears space
        const m = getMove(f, 'burst');
        f.move = 'burst'; f.mid = ++s.mid; f.mt = 1;
        for (const o of s.fighters) if (o !== f) tryHitbox(s, f, o, m.hits[0], f.x, f.y - 30 * form(f).scale, 90 * form(f).scale, f.face, false);
        f.move = null;
      }
      if (f.t >= 60) { setState(f, f.ground ? 'ground' : 'air'); }
      break;
    }
    case 'respawn': {
      f.vx = 0; f.vy = 0;
      if (f.t > 180 || (f.t > 20 && (pr || held & (BTN.L | BTN.R | BTN.D)))) { setState(f, 'air'); f.inv = Math.max(f.inv, 90); }
      break;
    }
    case 'grabbing': {
      f.grabT++;
      const tgt = s.fighters[f.grab];
      if (!tgt || tgt.state !== 'grabbed') { f.grab = -1; setState(f, 'ground'); break; }
      let th = null;
      if (up) th = 'uthrow'; else if (down) th = 'dthrow';
      else if (dirX === f.face) th = 'fthrow'; else if (dirX === -f.face) th = 'bthrow';
      else if (f.grabT > 50) th = 'fthrow';
      if (th && f.grabT > 6) doThrow(s, f, tgt, th);
      break;
    }
  }
}

function airDrift(f, fm, dirX, mul = 1) {
  if (dirX) f.vx += (dirX * fm.air * mul - f.vx) * 0.12;
  else f.vx *= 0.985;
}

function physics(s, stage, f) {
  const fm = form(f);
  if (!f.ground) {
    const cap = f.fastFall ? fm.fall * 1.5 : fm.fall;
    f.vy = Math.min(f.vy + fm.grav * (f.fastFall ? 1.6 : 1), cap);
  }
  return moveAndCollide(stage, f);
}

// Moves the fighter and resolves collisions; returns true on landing.
function moveAndCollide(stage, f) {
  const fm = form(f);
  const px = f.x, py = f.y;
  f.x += f.vx; f.y += f.vy;
  let landed = false;
  if (!f.ground && f.vy >= 0) {
    const ss = surfaces(stage);
    for (let k = 0; k < ss.length; k++) {
      const sf = ss[k];
      if (sf.soft && f.dropT > 0) continue;
      if (py <= sf.y + 0.01 && f.y >= sf.y && f.x >= sf.x1 - fm.w * 0.3 && f.x <= sf.x2 + fm.w * 0.3) {
        f.y = sf.y; f.vy = 0; f.ground = true; f.surf = k; landed = true; break;
      }
    }
  }
  const hw = fm.w / 2;
  for (const o of stage.solids) {
    if (f.x + hw > o.x1 && f.x - hw < o.x2 && f.y > o.y1 + 0.5 && f.y - fm.h < o.y2) {
      if (py - fm.h >= o.y2 - 1) { f.y = o.y2 + fm.h; if (f.vy < 0) f.vy = 0; }
      else if (px <= (o.x1 + o.x2) / 2) { f.x = o.x1 - hw; if (f.vx > 0) f.vx = 0; }
      else { f.x = o.x2 + hw; if (f.vx < 0) f.vx = 0; }
    }
  }
  return landed;
}

function snapGround(stage, f) {
  const ss = surfaces(stage);
  for (let k = 0; k < ss.length; k++) {
    const sf = ss[k];
    if (Math.abs(f.y - sf.y) < 2 && f.x >= sf.x1 - 20 && f.x <= sf.x2 + 20) { f.ground = true; f.surf = k; f.y = sf.y; f.vy = 0; return; }
  }
}

function special(s, f, held) {
  const up = held & BTN.U, down = held & BTN.D;
  const dirX = ((held & BTN.R) ? 1 : 0) - ((held & BTN.L) ? 1 : 0);
  if (up) {
    if (f.upUsed) return false;
    f.upUsed = true; if (dirX) f.face = dirX;
    startMove(s, f, 'uspec'); return true;
  }
  if (down) {
    const m = getMove(f, 'dspec');
    if (m.slam && f.ground) startMove(s, f, 'dspec_land');
    else startMove(s, f, 'dspec');
    return true;
  }
  if (dirX) { f.face = dirX; startMove(s, f, 'sspec'); return true; }
  startMove(s, f, 'nspec');
  return true;
}

function airDodge(s, f, held) {
  const dx = ((held & BTN.R) ? 1 : 0) - ((held & BTN.L) ? 1 : 0);
  const dy = ((held & BTN.D) ? 1 : 0) - ((held & BTN.U) ? 1 : 0);
  setState(f, 'airdodge');
  f.airDodged = true; f.inv = 20; f.fastFall = false;
  if (dx || dy) { const n = Math.hypot(dx, dy); f.vx = (dx / n) * 10; f.vy = (dy / n) * 10; }
  else { f.vx *= 0.3; f.vy = Math.min(f.vy, 1) * 0.3; }
  ev(s, { k: 'dodge', i: f.i, x: f.x, y: f.y });
}

function roll(s, f, dir) {
  setState(f, 'roll'); f.dvx = dir; f.inv = 16; f.face = -dir;
  ev(s, { k: 'dodge', i: f.i, x: f.x, y: f.y });
}

function shieldBreak(s, f) {
  setState(f, 'stunned'); f.shield = C.SHIELD_MAX * 0.4;
  f.vy = -11; f.ground = false; f.surf = -1;
  ev(s, { k: 'break', i: f.i, x: f.x, y: f.y - 30 });
}

// ---------------------------------------------------------------- attacks
function updateAttack(s, stage, f, held, pr, dirX) {
  const fm = form(f);
  const m = getMove(f, f.move);
  f.mt++;
  // charging smash attacks
  if (m.charge && f.mt === m.charge.f && (held & BTN.A) && f.charge < m.charge.max) {
    f.charge++; f.mt--;
    if (f.charge % 8 === 1) ev(s, { k: 'charge', i: f.i, x: f.x, y: f.y });
  }
  // jab chaining
  if ((f.move === 'jab') && f.mt >= m.cancel && (pr & BTN.A)) {
    f.jabN++;
    startMove(s, f, f.jabN >= 2 ? 'jab3' : 'jab');
    return;
  }
  // scripted velocity
  if (m.vel) for (const v of m.vel) {
    if (v.hold && f.mt >= v.f) { f.vx = v.vx ?? f.vx; f.vy = v.vy; }
    else if (f.mt === v.f) {
      if (v.steer) { f.vx = (dirX || 0) * v.vx; if (dirX) f.face = dirX; }
      else if (v.vx !== undefined) f.vx = f.face * v.vx;
      if (v.vy !== undefined && (v.vy !== 0 || !f.ground)) { f.vy = v.vy; if (v.vy < 0) { f.ground = false; f.surf = -1; } }
      if (v.air !== undefined && !f.ground) f.vy = v.air;
    }
  }
  if (m.proj && f.mt === m.proj.f) spawnProj(s, f, m.proj);
  if (m.quake && f.mt === m.hits[0].s) ev(s, { k: 'quake', x: f.x, y: f.y, fx: m.hits[0].fx });

  // movement
  const counterActive = m.counter && f.mt >= m.counter.s && f.mt <= m.counter.e;
  if (f.ground) {
    f.vx *= m.fric ?? 0.82;
    if (counterActive) f.vx = 0;
  } else {
    if (m.air || m.up) airDrift(f, fm, dirX, m.up ? 0.5 : 1);
    if ((pr & BTN.D) && m.air && f.vy > -2) f.fastFall = true;
  }
  const gm = m.gravMul && f.mt < (m.hits?.[0]?.e ?? 0) + 2 ? m.gravMul : 1;
  let landed;
  if (!f.ground) {
    const holding = m.vel && m.vel.some((v) => v.hold && f.mt >= v.f);
    if (!holding) {
      const cap = f.fastFall ? fm.fall * 1.5 : fm.fall;
      f.vy = Math.min(f.vy + fm.grav * gm, cap);
    }
    landed = moveAndCollide(stage, f);
  } else landed = moveAndCollide(stage, f);

  if (landed) {
    if (m.slam) { startMove(s, f, m.slam.land); f.vx = 0; return; }
    if (m.air) { land(s, f, m.land || 4); return; }
    if (m.up && m.landCancel && f.mt > 10) { land(s, f, 12); return; }
    f.jumps = fm.airJumps; f.upUsed = false; f.airDodged = false; f.fastFall = false;
  }
  if (!f.ground && m.up && f.mt > 12 && tryLedge(s, stage, f)) return;
  if (!f.ground && m.slam && f.mt > 60) { setState(f, 'helpless'); f.move = null; return; }

  if (f.mt >= m.total + (m.slam ? 999 : 0)) {
    f.move = null;
    if (!f.ground && m.helpless) setState(f, 'helpless');
    else setState(f, f.ground ? 'ground' : 'air');
  }
}

export function activeHits(f) {
  if (f.state !== 'attack' || !f.move) return [];
  const m = getMove(f, f.move);
  if (!m.hits) return [];
  const sc = form(f).scale;
  const out = [];
  for (const hb of m.hits) {
    if (f.mt >= hb.s && f.mt <= hb.e) out.push({ hb, x: f.x + f.face * hb.x * sc, y: f.y + hb.y * sc, r: hb.r * sc });
  }
  return out;
}

function spawnProj(s, f, p) {
  const mine = s.projs.filter((q) => q.owner === f.i && q.fx === p.fx);
  if (mine.length >= p.max) return;
  const sc = form(f).scale;
  s.projs.push({
    id: ++s.pid, owner: f.i, x: f.x + f.face * p.ox * sc, y: f.y + p.oy * sc,
    vx: f.face * p.vx, vy: p.vy, g: p.g, r: p.r, life: p.life, t: 0,
    dmg: p.dmg * form(f).dmgMul, base: p.base, gr: p.gr, a: p.a, fx: p.fx, pierce: p.pierce, freeze: p.freeze,
  });
  ev(s, { k: 'shoot', i: f.i, fx: p.fx, x: f.x, y: f.y });
}

function updateProjs(s, stage) {
  for (const p of s.projs) {
    p.t++; p.life--;
    p.x += p.vx; p.y += p.vy; p.vy += p.g;
    if (p.fx === 'bubble') p.vy = Math.sin(p.t * 0.2) * 0.8;
    for (const o of stage.solids) if (p.x > o.x1 && p.x < o.x2 && p.y > o.y1 && p.y < o.y2) p.life = 0;
  }
  // projectiles from different owners cancel each other out
  for (let a = 0; a < s.projs.length; a++) for (let b = a + 1; b < s.projs.length; b++) {
    const p = s.projs[a], q = s.projs[b];
    if (p.owner === q.owner || p.life <= 0 || q.life <= 0) continue;
    if (Math.hypot(p.x - q.x, p.y - q.y) < p.r + q.r) {
      if (p.dmg <= q.dmg + 3) p.life = 0;
      if (q.dmg <= p.dmg + 3) q.life = 0;
      ev(s, { k: 'clash', x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
    }
  }
  s.projs = s.projs.filter((p) => p.life > 0);
}

function hurt(f) {
  const fm = form(f);
  return { x1: f.x - fm.w / 2, x2: f.x + fm.w / 2, y1: f.y - fm.h, y2: f.y };
}
function circleRect(cx, cy, r, b) {
  const nx = clamp(cx, b.x1, b.x2), ny = clamp(cy, b.y1, b.y2);
  return (cx - nx) ** 2 + (cy - ny) ** 2 <= r * r;
}
const hittable = (f) => !['dead', 'out', 'respawn', 'digivolving', 'grabbed'].includes(f.state) && f.inv <= 0;

function resolveHits(s) {
  for (const a of s.fighters) {
    if (a.hitlag > 0) continue;
    for (const h of activeHits(a)) {
      for (const t of s.fighters) {
        if (t === a) continue;
        tryHitbox(s, a, t, h.hb, h.x, h.y, h.r, a.face, false);
      }
    }
  }
  for (const p of s.projs) {
    const owner = s.fighters[p.owner];
    for (const t of s.fighters) {
      if (t.i === p.owner || p.life <= 0) continue;
      const hb = { dmg: p.dmg, base: p.base, g: p.gr, a: p.a, fx: p.fx, freeze: p.freeze, raw: true };
      if (tryHitbox(s, owner, t, hb, p.x, p.y, p.r, sign(p.vx), true, p.id) && !p.pierce) p.life = 0;
    }
  }
}

// Returns true if the hitbox connected (hit or shield).
function tryHitbox(s, a, t, hb, x, y, r, dir, isProj, projId) {
  if (!hittable(t)) return false;
  if (!circleRect(x, y, r, hurt(t))) return false;
  const key = isProj ? 'p' + projId : a.i + ':' + a.mid;
  const prev = t.memo[a.i];
  if (prev && prev.k === key && (!hb.rehit || s.frame - prev.f < hb.rehit)) return false;
  t.memo[a.i] = { k: key, f: s.frame };

  if (hb.grab) {
    if (!t.ground || t.state === 'ledge') return false;
    a.state = 'grabbing'; a.grab = t.i; a.grabT = 0; a.move = null; a.vx = 0;
    t.state = 'grabbed'; t.move = null; t.vx = 0; t.vy = 0; t.t = 0;
    t.x = a.x + a.face * (form(a).w * 0.5 + form(t).w * 0.35); t.y = a.y;
    ev(s, { k: 'grab', x: t.x, y: t.y - 30 });
    return true;
  }

  // counter
  if (t.state === 'attack' && t.move) {
    const tm = getMove(t, t.move);
    if (tm.counter && t.mt >= tm.counter.s && t.mt <= tm.counter.e) {
      t.face = sign(a.x - t.x);
      startMove(s, t, tm.counter.move);
      t.inv = 10; if (!isProj) a.hitlag = 18;
      ev(s, { k: 'counter', x: t.x, y: t.y - 40 });
      return true;
    }
  }

  const mul = isProj || hb.raw ? 1 : form(a).dmgMul * (1 + (a.charge || 0) / 100);
  const dmg = hb.dmg * mul;

  if (t.state === 'shield') {
    t.shield -= dmg * 1.3 + 2;
    t.shieldLock = Math.floor(dmg * 0.7) + 3;
    t.vx = dir * Math.min(9, 1.5 + dmg * 0.35);
    if (!isProj) { a.hitlag = 4; a.vx = -dir * 1.5; }
    t.hitlag = 4;
    ev(s, { k: 'block', x, y, i: t.i });
    if (t.shield <= 0) shieldBreak(s, t);
    return true;
  }

  t.dmg = Math.min(999, t.dmg + dmg);
  const weightMul = 2 / (1 + form(t).weight / 100);
  let kb = (hb.base + t.dmg * hb.g) * weightMul;
  if (!isProj && !hb.raw) kb *= 1 + (form(a).dmgMul - 1) * 0.6;
  if (t.state === 'attack' && t.move && getMove(t, t.move).smash && t.charge > 0) kb *= 1.2;
  let ang = hb.a;
  let d = dir;
  if (hb.away) d = sign(t.x - (isProj ? x : a.x));
  const rad = (ang * Math.PI) / 180;
  t.vx = Math.cos(rad) * kb * d;
  t.vy = -Math.sin(rad) * kb;
  if (t.ground) {
    if (t.vy > 0) t.vy = -t.vy * 0.4;
    if (kb > 8 || t.vy < -2) { t.ground = false; t.surf = -1; t.y -= 1; }
  }
  if (t.state === 'grabbing') { const g = s.fighters[t.grab]; if (g && g.state === 'grabbed') { setState(g, 'air'); g.ground = false; } t.grab = -1; }
  if (t.state === 'ledge') { t.ledge = -1; t.ledgeCD = 30; }
  t.state = 'hitstun'; t.t = 0; t.move = null; t.kb = kb;
  t.hitstun = Math.floor(kb * 1.55 + (hb.freeze || 0));
  t.freeze = hb.freeze || 0;
  t.fastFall = false; t.upUsed = false; t.lastHitBy = a.i; t.flash = 8;
  const lag = Math.min(14, Math.floor(3 + dmg * 0.35));
  t.hitlag = lag; if (!isProj) a.hitlag = lag;
  if (a.form === 0) a.meter = Math.min(C.METER_MAX, a.meter + dmg * 1.1);
  if (t.form === 0) t.meter = Math.min(C.METER_MAX, t.meter + dmg * 0.7);
  a.stats.dealt += dmg;
  ev(s, { k: 'hit', x, y, kb, fx: hb.fx || 'phys', dmg, i: t.i, a: a.i });
  return true;
}

function updateGrabs(s) {
  for (const a of s.fighters) {
    if (a.state !== 'grabbing') continue;
    const t = s.fighters[a.grab];
    if (!t || t.state !== 'grabbed') continue;
    t.x = a.x + a.face * (form(a).w * 0.5 + form(t).w * 0.35);
    t.y = a.y; t.face = -a.face;
  }
}

function doThrow(s, a, t, id) {
  const m = getMove(a, id);
  if (id === 'bthrow') { a.face = -a.face; }
  startMove(s, a, id);
  a.grab = -1;
  setState(t, 'air'); t.inv = 0; t.memo[a.i] = null;
  const th = m.throw;
  const hb = { dmg: th.dmg, base: th.base, g: th.g, a: id === 'bthrow' ? 180 - th.a : th.a, fx: 'phys' };
  const dir = id === 'bthrow' ? -a.face : a.face;
  t.ground = false;
  tryHitbox(s, a, t, hb, t.x, t.y - 20, 60, id === 'bthrow' ? a.face : dir, false);
  ev(s, { k: 'throw', x: t.x, y: t.y });
}

// ---------------------------------------------------------------- ledges
function tryLedge(s, stage, f) {
  if (f.ledgeCD > 0 || f.vy < -3) return false;
  const fm = form(f);
  const ls = ledges(stage);
  for (let k = 0; k < ls.length; k++) {
    const L = ls[k];
    const hx = L.x + L.side * fm.w * 0.5;
    const top = f.y - fm.h;
    if (Math.abs(f.x - hx) < fm.w * 0.5 + 16 && top > L.y - 34 && top < L.y + 30 && L.side * (f.x - L.x) > -fm.w * 0.2) {
      if (s.fighters.some((o) => o !== f && o.state === 'ledge' && o.ledge === k)) continue;
      setState(f, 'ledge'); f.move = null;
      f.ledge = k; f.x = hx; f.y = L.y + fm.h * 0.82; f.vx = 0; f.vy = 0; f.face = -L.side;
      f.inv = Math.max(f.inv, 30); f.jumps = fm.airJumps; f.upUsed = false; f.airDodged = false; f.fastFall = false;
      f.ground = false; f.surf = -1;
      ev(s, { k: 'ledge', i: f.i, x: L.x, y: L.y });
      return true;
    }
  }
  return false;
}

function updateLedge(s, stage, f, held, pr, dirX) {
  const L = ledges(stage)[f.ledge];
  const fm = form(f);
  f.vx = 0; f.vy = 0;
  if (f.t < 8) return;
  const leave = () => { f.ledgeCD = 30; f.ledge = -1; };
  if ((pr & BTN.J) || (pr & BTN.U)) {
    f.x = L.x - L.side * fm.w * 0.3; f.y = L.y - 2; f.vy = -fm.jump; leave(); setState(f, 'air');
    ev(s, { k: 'jump', i: f.i, x: f.x, y: f.y });
  } else if (pr & BTN.A) {
    f.x = L.x - L.side * fm.w * 0.7; f.y = L.y; leave(); snapGround(stage, f); f.inv = 10;
    startMove(s, f, 'getup');
  } else if (dirX === f.face && (pr & (BTN.L | BTN.R))) {
    setState(f, 'climb'); f.inv = 16;
  } else if ((pr & BTN.D) || (dirX === -f.face && (pr & (BTN.L | BTN.R)))) {
    leave(); f.x += L.side * 6; setState(f, 'air');
  } else if (f.t > 300) {
    leave(); setState(f, 'air');
  }
}

// ---------------------------------------------------------------- items
function updateItems(s, stage) {
  if (s.itemsOn && !s.over && --s.nextItem <= 0) {
    s.nextItem = C.ITEM_MIN + Math.floor(rand(s) * (C.ITEM_MAX - C.ITEM_MIN));
    const ss = surfaces(stage);
    const sf = ss[Math.floor(rand(s) * ss.length)];
    const x = sf.x1 + 30 + rand(s) * (sf.x2 - sf.x1 - 60);
    s.items.push({ id: ++s.pid, kind: rand(s) < 0.55 ? 'chip' : 'meat', x, y: -520, vy: 0, life: 900, ground: false });
  }
  for (const it of s.items) {
    it.life--;
    if (!it.ground) {
      const py = it.y;
      it.vy = Math.min(it.vy + 0.35, 8); it.y += it.vy;
      for (const sf of surfaces(stage)) if (py <= sf.y && it.y >= sf.y && it.x >= sf.x1 && it.x <= sf.x2) { it.y = sf.y; it.ground = true; }
      if (it.y > stage.blast.y2) it.life = 0;
    }
    for (const f of s.fighters) {
      if (it.life <= 0 || ['dead', 'out', 'respawn', 'grabbed'].includes(f.state)) continue;
      const b = hurt(f);
      if (it.x > b.x1 - 12 && it.x < b.x2 + 12 && it.y > b.y1 - 12 && it.y - 20 < b.y2) {
        it.life = 0;
        if (it.kind === 'meat') f.dmg = Math.max(0, f.dmg - 25);
        else if (f.form === 0) f.meter = Math.min(C.METER_MAX, f.meter + 45);
        else f.digiT += 300;
        ev(s, { k: 'pickup', kind: it.kind, i: f.i, x: it.x, y: it.y - 20 });
      }
    }
  }
  s.items = s.items.filter((it) => it.life > 0);
}

// ---------------------------------------------------------------- misc
function pushApart(s) {
  const fs = s.fighters;
  for (let a = 0; a < fs.length; a++) for (let b = a + 1; b < fs.length; b++) {
    const p = fs[a], q = fs[b];
    if (!p.ground || !q.ground || p.surf !== q.surf) continue;
    if (['grabbed', 'grabbing', 'dead', 'out'].includes(p.state) || ['grabbed', 'grabbing', 'dead', 'out'].includes(q.state)) continue;
    const min = (form(p).w + form(q).w) * 0.35;
    const dx = q.x - p.x;
    if (Math.abs(dx) < min) {
      const push = (min - Math.abs(dx)) * 0.15 * (dx === 0 ? 1 : sign(dx));
      p.x -= push; q.x += push;
    }
  }
}

function checkBlast(s, stage) {
  const b = stage.blast;
  for (const f of s.fighters) {
    if (['dead', 'out', 'respawn'].includes(f.state)) continue;
    const topOut = f.y < b.y1 && f.state === 'hitstun';
    if (f.x < b.x1 || f.x > b.x2 || f.y > b.y2 || topOut) {
      ev(s, { k: 'ko', i: f.i, x: clamp(f.x, b.x1, b.x2), y: clamp(f.y, b.y1, b.y2) });
      if (f.lastHitBy >= 0 && f.lastHitBy !== f.i) s.fighters[f.lastHitBy].stats.kos++;
      f.stats.falls++;
      for (const o of s.fighters) {
        if (o.grab === f.i) { o.grab = -1; setState(o, 'air'); }
        if (f.state === 'grabbing' && o.i === f.grab) setState(o, 'air');
      }
      f.grab = -1;
      dedigivolve(s, f, true);
      f.stocks--;
      f.move = null; f.vx = 0; f.vy = 0;
      f.meter = Math.min(C.METER_MAX, f.meter + 30); // comeback data
      f.ko = s.frame;
      if (f.stocks > 0) { setState(f, 'dead'); f.respawnT = C.RESPAWN_DELAY; }
      else setState(f, 'out');
    }
  }
}

function respawn(s, stage, f) {
  const sp = stage.spawns[f.i];
  setState(f, 'respawn');
  f.x = sp.x * 0.5; f.y = -260; f.vx = 0; f.vy = 0; f.dmg = 0; f.inv = 120;
  f.ground = false; f.surf = -1; f.jumps = form(f).airJumps; f.upUsed = false; f.airDodged = false;
  f.shield = C.SHIELD_MAX; f.hitstun = 0; f.lastHitBy = -1; f.memo = {};
  f.face = sp.x < 0 ? 1 : -1;
  ev(s, { k: 'respawn', i: f.i, x: f.x, y: f.y });
}

function checkOver(s) {
  if (s.over) { s.overT++; return; }
  const alive = s.fighters.filter((f) => f.stocks > 0);
  if (alive.length <= 1) {
    s.over = true; s.overT = 0;
    s.winner = alive.length ? alive[0].i : -1;
    ev(s, { k: 'game', winner: s.winner });
  }
}
