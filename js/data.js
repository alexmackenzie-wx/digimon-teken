// Static game data: characters (with their Digivolved forms), moves and stages.
// Hitbox coordinates are in "rookie units" relative to the fighter's feet,
// facing right; the engine scales them by the current form's `scale`.

// Hitbox helper: active frames s..e, offset (x,y), radius r, damage,
// base knockback, knockback growth (per % damage), launch angle (deg, 0=forward, 90=up).
const H = (s, e, x, y, r, dmg, base, g, a, extra = {}) => ({ s, e, x, y, r, dmg, base, g, a, ...extra });

// ---------------------------------------------------------------- normals
export const NORMALS = {
  jab:    { total: 16, cancel: 9, hits: [H(3, 5, 26, -30, 15, 3, 4, 0.02, 40)], pose: 'f' },
  jab3:   { total: 26, hits: [H(5, 8, 30, -30, 19, 5, 7, 0.08, 40)], pose: 'f' },
  dash:   { total: 34, hits: [H(5, 13, 24, -26, 19, 9, 7, 0.10, 55)], vel: [{ f: 1, vx: 8 }], fric: 0.94, pose: 'f' },
  fsmash: { total: 46, charge: { f: 7, max: 50 }, hits: [H(13, 16, 40, -28, 22, 15, 8, 0.20, 38)], vel: [{ f: 12, vx: 3 }], pose: 'f', smash: true },
  usmash: { total: 44, charge: { f: 6, max: 50 }, hits: [H(9, 14, 4, -64, 24, 14, 8, 0.19, 88), H(9, 14, 20, -26, 20, 14, 8, 0.19, 84)], pose: 'u', smash: true },
  dsmash: { total: 44, charge: { f: 6, max: 50 }, hits: [H(9, 12, 30, -8, 20, 13, 7, 0.18, 28), H(9, 12, -30, -8, 20, 13, 7, 0.18, 152)], pose: 'd', smash: true },
  nair:   { total: 30, air: true, hits: [H(4, 16, 0, -30, 30, 8, 6, 0.08, 45, { away: true })], land: 6, pose: 'spin' },
  fair:   { total: 34, air: true, hits: [H(8, 12, 30, -30, 21, 12, 6, 0.14, 40)], land: 12, pose: 'f' },
  bair:   { total: 30, air: true, hits: [H(6, 10, -32, -28, 21, 13, 7, 0.15, 140)], land: 10, pose: 'b' },
  uair:   { total: 28, air: true, hits: [H(5, 10, 6, -64, 22, 10, 7, 0.11, 85)], land: 8, pose: 'u' },
  dair:   { total: 40, air: true, hits: [H(12, 16, 0, 4, 20, 14, 6, 0.12, -80)], land: 18, pose: 'd' },
  grab:   { total: 30, hits: [H(6, 8, 30, -28, 17, 0, 0, 0, 0, { grab: true })], pose: 'f' },
  fthrow: { total: 20, throw: { dmg: 8, base: 8, g: 0.10, a: 40 }, pose: 'f' },
  bthrow: { total: 22, throw: { dmg: 10, base: 9, g: 0.12, a: 140 }, pose: 'b' },
  uthrow: { total: 22, throw: { dmg: 7, base: 9, g: 0.09, a: 90 }, pose: 'u' },
  dthrow: { total: 22, throw: { dmg: 6, base: 6, g: 0.04, a: 72 }, pose: 'd' },
  getup:  { total: 26, hits: [H(8, 12, 30, -24, 22, 7, 7, 0.06, 30)], pose: 'f' },
  burst:  { total: 1, hits: [H(1, 1, 0, -30, 90, 2, 11, 0, 50, { away: true, fx: 'digi' })], pose: 'n' },
};

// ---------------------------------------------------------------- special builders
const proj = (name, o) => ({
  name, total: o.total ?? 34, pose: 'breath',
  proj: { f: o.f ?? 12, ox: o.ox ?? 26, oy: o.oy ?? -38, vx: o.vx, vy: o.vy ?? 0, g: o.g ?? 0, r: o.r, life: o.life ?? 60,
    dmg: o.dmg, base: o.base, gr: o.gr, a: o.a ?? 35, fx: o.fx, max: o.max ?? 2, pierce: !!o.pierce, freeze: o.freeze ?? 0 },
});
const dashS = (name, o) => ({
  name, total: o.total ?? 36, pose: o.pose ?? 'f', fric: 0.97,
  vel: [{ f: o.s, vx: o.vx, vy: o.vy ?? 0, air: o.airVy ?? -3 }, { f: o.e + 1, vx: o.vx * 0.3 }],
  gravMul: 0.4,
  hits: [H(o.s, o.e, o.hx ?? 22, o.hy ?? -30, o.r ?? 18, o.dmg, o.base, o.g, o.a ?? 40, { fx: o.fx })],
});
const riseS = (name, o) => ({
  name, total: o.total ?? 40, pose: o.pose ?? 'u', up: true, helpless: o.helpless ?? true, landCancel: true,
  vel: [{ f: o.f ?? 6, vx: o.vx ?? 2.5, vy: -o.vy, steer: true }],
  hits: o.hits,
});
const slamS = (name, o) => ({
  name, total: o.total ?? 60, pose: 'd',
  vel: [{ f: 1, vx: 0, vy: -6 }, { f: o.f ?? 10, vx: 0, vy: o.vy ?? 16, hold: true }],
  slam: { f: o.f ?? 10, land: 'dspec_land' },
  hits: [H(o.f ?? 10, 59, 0, -4, 20, o.airDmg ?? 9, 6, 0.08, -70, { fx: o.fx })],
});
const stompS = (name, o) => ({
  name, total: o.total ?? 32, pose: 'd',
  hits: [H(o.s ?? 4, (o.s ?? 4) + 4, 34, -10, o.r ?? 26, o.dmg, o.base, o.g, 70, { fx: o.fx }),
         H(o.s ?? 4, (o.s ?? 4) + 4, -34, -10, o.r ?? 26, o.dmg, o.base, o.g, 110, { fx: o.fx })],
  quake: true,
});
const beamS = (name, o) => {
  const hits = [];
  for (let d = 30; d <= o.len; d += 26) hits.push(H(o.s, o.e, d, o.y ?? -38, o.r, o.dmg, o.base, o.g, o.a ?? 30, { fx: o.fx, freeze: o.freeze ?? 0, beam: true }));
  return { name, total: o.total ?? 46, pose: 'breath', hits, beam: { s: o.s, e: o.e, len: o.len, y: o.y ?? -38, r: o.r, fx: o.fx } };
};

// ---------------------------------------------------------------- characters
// w/h are the hurtbox size in world pixels; scale multiplies sprite and hitboxes.
export const CHARS = {
  agumon: {
    color: '#ff9a1f', desc: 'All-rounder. Fiery projectiles and a strong recovery.',
    forms: [
      {
        name: 'Agumon', sprite: 'agumon', w: 40, h: 56, scale: 1, weight: 100,
        run: 6.2, air: 4.0, jump: 13, djump: 12, airJumps: 1, grav: 0.6, fall: 10.5, dmgMul: 1,
        moves: {
          nspec: proj('Pepper Breath', { vx: 8, r: 12, dmg: 6, base: 4, gr: 0.05, fx: 'fire' }),
          sspec: dashS('Claw Attack', { s: 8, e: 20, vx: 10, dmg: 9, base: 7, g: 0.11, fx: 'slash' }),
          uspec: riseS('Spitfire Climb', { vy: 15, hits: [H(6, 22, 0, -30, 26, 2, 3, 0, 80, { rehit: 5, fx: 'fire' }), H(23, 27, 0, -40, 28, 5, 8, 0.09, 80, { fx: 'fire' })] }),
          dspec: { name: 'Baby Flame', total: 40, pose: 'breath', hits: [H(12, 28, 40, -14, 22, 2.5, 3, 0.01, 85, { rehit: 5, fx: 'fire' }), H(12, 28, 40, -50, 22, 2.5, 4, 0.02, 85, { rehit: 5, fx: 'fire' })], geyser: true },
        },
      },
      {
        name: 'Greymon', sprite: 'greymon', w: 62, h: 86, scale: 1.5, weight: 145,
        run: 6.0, air: 3.6, jump: 14, djump: 12.5, airJumps: 1, grav: 0.68, fall: 12, dmgMul: 1.3,
        moves: {
          nspec: proj('Nova Blast', { f: 16, total: 46, vx: 10, r: 26, dmg: 15, base: 9, gr: 0.14, life: 70, fx: 'fire', max: 1 }),
          sspec: dashS('Great Horn Attack', { s: 10, e: 26, vx: 13, dmg: 14, base: 8, g: 0.16, a: 35, hx: 26, hy: -40, r: 22, total: 44 }),
          uspec: riseS('Horn Uppercut', { vy: 16, hits: [H(6, 18, 14, -64, 26, 12, 8, 0.14, 82)] }),
          dspec: slamS('Mega Stomp', { airDmg: 12 }),
          dspec_land: stompS('Mega Stomp', { dmg: 13, base: 9, g: 0.14, r: 30, fx: 'quake' }),
        },
      },
    ],
  },
  gabumon: {
    color: '#5aa8ff', desc: 'Fast and slippery. Freezing ice shots and a counter.',
    forms: [
      {
        name: 'Gabumon', sprite: 'gabumon', w: 40, h: 56, scale: 1, weight: 95,
        run: 7.0, air: 4.4, jump: 13.5, djump: 12, airJumps: 1, grav: 0.62, fall: 11, dmgMul: 1,
        moves: {
          nspec: proj('Blue Blaster', { vx: 11, r: 11, life: 45, dmg: 5, base: 3, gr: 0.04, a: 20, fx: 'ice', freeze: 14 }),
          sspec: dashS('Little Horn', { s: 6, e: 18, vx: 11, dmg: 8, base: 6, g: 0.10, a: 30, hy: -40 }),
          uspec: riseS('Fur Coat Twister', { vy: 14, pose: 'spin', hits: [H(6, 24, 0, -30, 26, 2, 3, 0, 75, { rehit: 6, fx: 'ice' }), H(25, 28, 0, -36, 28, 4, 7, 0.08, 80, { fx: 'ice' })] }),
          dspec: { name: 'Pelt Counter', total: 40, pose: 'n', counter: { s: 4, e: 26, move: 'dspec_hit' } },
          dspec_hit: { name: 'Pelt Counter', total: 28, pose: 'f', hits: [H(4, 8, 32, -30, 28, 10, 9, 0.13, 35, { fx: 'ice', freeze: 10 })] },
        },
      },
      {
        name: 'Garurumon', sprite: 'garurumon', w: 80, h: 64, scale: 1.45, weight: 125,
        run: 9.0, air: 4.8, jump: 15, djump: 13, airJumps: 1, grav: 0.65, fall: 12, dmgMul: 1.2,
        moves: {
          nspec: beamS('Howling Blaster', { s: 14, e: 22, len: 300, r: 18, dmg: 12, base: 8, g: 0.13, fx: 'ice', freeze: 18, y: -34 }),
          sspec: dashS('Slamming Attack', { s: 6, e: 22, vx: 15, dmg: 12, base: 8, g: 0.15, a: 32, hy: -30, r: 24 }),
          uspec: riseS('Wolf Claw', { vy: 17, vx: 4, hits: [H(6, 16, 20, -40, 26, 11, 8, 0.12, 75, { fx: 'slash' })] }),
          dspec: slamS('Fox Fire Fang', { fx: 'ice' }),
          dspec_land: stompS('Fox Fire Fang', { dmg: 11, base: 8, g: 0.13, fx: 'ice' }),
        },
      },
    ],
  },
  patamon: {
    color: '#f2b35c', desc: 'Light and floaty with five jumps. Hard to KO off the side.',
    forms: [
      {
        name: 'Patamon', sprite: 'patamon', w: 44, h: 44, scale: 1, weight: 78,
        run: 5.4, air: 4.6, jump: 11.5, djump: 10, airJumps: 4, grav: 0.42, fall: 7.5, dmgMul: 0.95,
        moves: {
          nspec: proj('Boom Bubble', { vx: 6, r: 15, life: 55, dmg: 4, base: 10, gr: 0.035, a: 30, fx: 'bubble', oy: -24 }),
          sspec: dashS('Sparking Air Shot', { s: 6, e: 24, vx: 9, airVy: -2, dmg: 8, base: 6, g: 0.10, hy: -22, r: 20 }),
          uspec: riseS('Wing Lift', { vy: 12, helpless: false, hits: [H(6, 14, 0, -24, 22, 4, 6, 0.04, 80, { fx: 'wind' })] }),
          dspec: slamS('Body Drop', { airDmg: 8 }),
          dspec_land: stompS('Body Drop', { dmg: 8, base: 7, g: 0.10, r: 22 }),
        },
      },
      {
        name: 'Angemon', sprite: 'angemon', w: 50, h: 86, scale: 1.4, weight: 110,
        run: 6.4, air: 5.0, jump: 13.5, djump: 12, airJumps: 2, grav: 0.5, fall: 9, dmgMul: 1.25,
        moves: {
          nspec: proj('Hand of Fate', { f: 14, total: 40, vx: 16, r: 20, dmg: 13, base: 9, gr: 0.14, life: 50, fx: 'holy', max: 1, pierce: true, oy: -44 }),
          sspec: dashS('Angel Rod', { s: 8, e: 18, vx: 9, dmg: 13, base: 8, g: 0.15, hx: 40, r: 22, fx: 'holy' }),
          uspec: riseS("Heaven's Ascent", { vy: 18, hits: [H(6, 18, 0, -50, 26, 9, 8, 0.11, 85, { fx: 'holy' })] }),
          dspec: slamS('Holy Rod Slam', { fx: 'holy' }),
          dspec_land: stompS('Holy Rod Slam', { dmg: 12, base: 8, g: 0.14, fx: 'holy' }),
        },
      },
    ],
  },
  guilmon: {
    color: '#e8343a', desc: 'Heavy hitter. Slower, but every claw hurts.',
    forms: [
      {
        name: 'Guilmon', sprite: 'guilmon', w: 42, h: 58, scale: 1, weight: 112,
        run: 5.8, air: 3.8, jump: 12.5, djump: 11.5, airJumps: 1, grav: 0.65, fall: 11.5, dmgMul: 1.1,
        moves: {
          nspec: proj('Pyro Sphere', { vx: 9, vy: -2.5, g: 0.15, r: 13, dmg: 8, base: 5, gr: 0.07, fx: 'pyro' }),
          sspec: dashS('Rock Breaker', { s: 8, e: 20, vx: 10, dmg: 10, base: 7, g: 0.12, fx: 'slash' }),
          uspec: riseS('Rising Claw', { vy: 14.5, hits: [H(6, 16, 12, -56, 24, 8, 7, 0.10, 82, { fx: 'slash' })] }),
          dspec: slamS('Rock Crusher', { airDmg: 10 }),
          dspec_land: stompS('Rock Crusher', { dmg: 11, base: 8, g: 0.13, fx: 'quake' }),
        },
      },
      {
        name: 'Growlmon', sprite: 'growlmon', w: 64, h: 90, scale: 1.55, weight: 150,
        run: 6.0, air: 3.6, jump: 14, djump: 12.5, airJumps: 1, grav: 0.7, fall: 12.5, dmgMul: 1.35,
        moves: {
          nspec: beamS('Pyro Blaster', { s: 16, e: 26, len: 280, r: 20, dmg: 14, base: 9, g: 0.14, fx: 'fire', a: 35 }),
          sspec: dashS('Dragon Slash', { s: 10, e: 20, vx: 11, dmg: 15, base: 9, g: 0.17, hx: 32, r: 26, fx: 'slash', total: 42 }),
          uspec: riseS('Exhaust Flame', { vy: 16, hits: [H(6, 20, 0, -40, 28, 3, 4, 0, 80, { rehit: 5, fx: 'fire' }), H(21, 24, 0, -50, 30, 6, 8, 0.10, 80, { fx: 'fire' })] }),
          dspec: slamS('Plasma Blade Quake', { airDmg: 13 }),
          dspec_land: stompS('Plasma Blade Quake', { dmg: 14, base: 9, g: 0.15, r: 32, fx: 'quake' }),
        },
      },
    ],
  },
};

export const CHAR_ORDER = ['agumon', 'gabumon', 'patamon', 'guilmon'];

// ---------------------------------------------------------------- stages
export const STAGES = {
  file_island: {
    name: 'File Island', theme: 'island',
    solids: [{ x1: -380, x2: 380, y1: 0, y2: 70 }],
    plats: [{ x1: -270, x2: -110, y: -125 }, { x1: 110, x2: 270, y: -125 }, { x1: -80, x2: 80, y: -235 }],
    blast: { x1: -940, x2: 940, y1: -780, y2: 620 },
    spawns: [{ x: -200, y: -10 }, { x: 200, y: -10 }, { x: -80, y: -10 }, { x: 80, y: -10 }],
  },
  infinity_mountain: {
    name: 'Infinity Mountain', theme: 'mountain',
    solids: [{ x1: -300, x2: 300, y1: 0, y2: 90 }],
    plats: [{ x1: -210, x2: -70, y: -140 }, { x1: 70, x2: 210, y: -140 }],
    blast: { x1: -840, x2: 840, y1: -740, y2: 580 },
    spawns: [{ x: -170, y: -10 }, { x: 170, y: -10 }, { x: -60, y: -10 }, { x: 60, y: -10 }],
  },
  primary_village: {
    name: 'Primary Village', theme: 'village',
    solids: [{ x1: -460, x2: 460, y1: 0, y2: 70 }],
    plats: [],
    blast: { x1: -1020, x2: 1020, y1: -780, y2: 620 },
    spawns: [{ x: -240, y: -10 }, { x: 240, y: -10 }, { x: -90, y: -10 }, { x: 90, y: -10 }],
  },
};

export const STAGE_ORDER = ['file_island', 'infinity_mountain', 'primary_village'];
