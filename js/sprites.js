// Procedurally drawn Digimon. Every sprite is drawn facing right with the
// origin at the feet, roughly 56 units tall. The caller handles flip/scale.

const TAU = Math.PI * 2;
const OUT = '#1d1420';

function ell(c, x, y, rx, ry, fill, rot = 0, stroke = true) {
  c.beginPath(); c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU);
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) c.stroke();
}
function poly(c, pts, fill, stroke = true) {
  c.beginPath(); c.moveTo(pts[0], pts[1]);
  for (let k = 2; k < pts.length; k += 2) c.lineTo(pts[k], pts[k + 1]);
  c.closePath();
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) c.stroke();
}
function limb(c, x1, y1, x2, y2, w, fill) {
  c.save();
  c.lineCap = 'round';
  c.strokeStyle = OUT; c.lineWidth = w + 3;
  c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
  c.strokeStyle = fill; c.lineWidth = w;
  c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
  c.restore();
}
function claws(c, x, y, ang, len = 4, n = 3) {
  c.save(); c.strokeStyle = '#fff'; c.lineWidth = 1.6; c.lineCap = 'round';
  for (let k = 0; k < n; k++) {
    const a = ang + (k - (n - 1) / 2) * 0.45;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); c.stroke();
  }
  c.restore();
}
function eye(c, x, y, r, iris, p, slit) {
  if (p.hurt) {
    c.save(); c.lineWidth = 2; c.strokeStyle = OUT;
    c.beginPath(); c.moveTo(x - r, y - r * 0.6); c.lineTo(x + r * 0.6, y); c.lineTo(x - r, y + r * 0.6); c.stroke();
    c.restore(); return;
  }
  ell(c, x, y, r, r * 1.15, '#fff');
  ell(c, x + r * 0.25, y + r * 0.05, r * 0.65, r * 0.85, iris, 0, false);
  if (slit) { c.fillStyle = OUT; c.fillRect(x + r * 0.15, y - r * 0.7, r * 0.22, r * 1.4); }
  else ell(c, x + r * 0.35, y + r * 0.05, r * 0.32, r * 0.42, OUT, 0, false);
  ell(c, x + r * 0.05, y - r * 0.35, r * 0.22, r * 0.22, '#fff', 0, false);
}

// arm target for the current attack pose
function armTarget(p, sx, sy, len) {
  const a = p.atk;
  if (p.ledge) return [sx + 2, sy - len];
  if (!a) return [sx + len * 0.55, sy + len * 0.55 + Math.sin(p.t * 0.12) * 1.5];
  const k = a.p;
  switch (a.pose) {
    case 'f': return [sx + len * (0.5 + 0.6 * k), sy + len * 0.4 * (1 - k)];
    case 'u': return [sx + len * 0.3 * (1 - k), sy - len * (0.2 + 0.9 * k)];
    case 'd': return [sx + len * 0.7, sy + len * (0.5 + 0.6 * k)];
    case 'b': return [sx - len * 0.6 * k, sy + len * 0.3];
    case 'breath': return [sx + len * 0.6, sy + len * 0.2];
    default: return [sx + len * 0.6, sy + len * 0.3];
  }
}

function legPhase(p) {
  if (!p.ground) return [-4, 3, -6, -3]; // tucked: back dx, back lift, front dx, front lift
  if (p.run > 0.15) {
    const ph = p.t * 0.32;
    return [Math.sin(ph) * 7 * p.run, Math.max(0, -Math.cos(ph)) * 4 * p.run, -Math.sin(ph) * 7 * p.run, Math.max(0, Math.cos(ph)) * 4 * p.run];
  }
  return [0, 0, 0, 0];
}

// ------------------------------------------------------------ generic biped dino
function dino(c, p, o) {
  const big = o.big ? 1 : 0;
  const bob = p.ground && p.run < 0.15 ? Math.sin(p.t * 0.1) * 0.8 : 0;
  const [bdx, blift, fdx, flift] = legPhase(p);
  const breath = p.atk && p.atk.pose === 'breath' ? p.atk.p : 0;
  c.save();
  c.translate(0, bob);
  // tail
  const wag = Math.sin(p.t * 0.15) * 3;
  c.beginPath();
  c.moveTo(-6, -26); c.quadraticCurveTo(-26 - big * 6, -20 + wag, -36 - big * 10, -8 + wag);
  c.quadraticCurveTo(-24 - big * 4, -10, -6, -12); c.closePath();
  c.fillStyle = o.body; c.fill(); c.stroke();
  if (o.tailStripes) for (let k = 0; k < 3; k++) limb(c, -14 - k * 7, -22 + k * 3 + wag * 0.5, -12 - k * 7, -13 + k * 2 + wag * 0.3, 2, o.stripe);
  if (o.back) o.back(c, p);
  // back leg + arm
  limb(c, -6, -14, -6 + bdx, -2 - blift, 8 + big * 2, o.dark || o.body);
  ell(c, -4 + bdx, -1.5 - blift, 7, 3.2, o.dark || o.body);
  const [bax, bay] = armTarget(p, 0, -32, 13);
  limb(c, 0, -32, bax - 3, bay, 5, o.dark || o.body);
  // body
  ell(c, 0, -26, 14 + big * 2, 16 + big, o.body, -0.1);
  ell(c, 4, -24, 8.5, 12, o.belly, -0.1, false);
  if (o.bodyMark) o.bodyMark(c, p);
  // front leg
  limb(c, 6, -14, 6 + fdx, -2 - flift, 8 + big * 2, o.body);
  ell(c, 8 + fdx, -1.5 - flift, 7.5, 3.4, o.body);
  if (o.footClaws) claws(c, 14 + fdx, -1.5 - flift, 0, 3.5);
  // head
  c.save();
  c.translate(6, -44);
  c.rotate(-breath * 0.15);
  const hs = o.headScale || 1;
  c.scale(hs, hs);
  if (o.headBack) o.headBack(c, p);
  ell(c, 0, 0, 14, 12.5, o.body);
  // snout / jaw
  const open = Math.max(breath, p.atk && p.atk.pose === 'f' && o.bite ? p.atk.p * 0.6 : 0, p.hurt ? 0.4 : 0);
  ell(c, 11, 5 + open * 3, 10, 5, o.body, 0.15 + open * 0.3);
  ell(c, 11, 1, 11, 6.5, o.body, -0.05 - open * 0.15);
  if (open > 0.2) { ell(c, 12, 4, 7, 2.5 * open + 0.5, '#7a1f2a', 0.1, false); }
  c.lineWidth = 1.4; c.beginPath(); c.moveTo(4, 4); c.lineTo(20, 3 + open * 2); c.stroke(); c.lineWidth = 2.2;
  ell(c, 19, -2, 1.2, 1, OUT, 0, false);
  eye(c, 5, -4, 4.4, o.eye, p, o.slit);
  if (o.head) o.head(c, p);
  c.restore();
  // front arm
  const [ax, ay] = armTarget(p, 6, -31, 14 + big * 3);
  limb(c, 6, -31, ax, ay, 5.5 + big, o.body);
  claws(c, ax, ay, Math.atan2(ay + 31, ax - 6), 4.5);
  if (o.arm) o.arm(c, p, ax, ay);
  c.restore();
}

// ------------------------------------------------------------ feature hooks
function hazard(c, x, y, r) {
  c.save(); c.translate(x, y); c.lineWidth = 1.2;
  c.beginPath(); c.arc(0, 0, r, 0, TAU); c.stroke();
  c.fillStyle = OUT;
  for (let k = 0; k < 3; k++) {
    const a = -Math.PI / 2 + k * TAU / 3;
    c.beginPath(); c.moveTo(Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.3);
    c.lineTo(Math.cos(a - 0.35) * r * 0.95, Math.sin(a - 0.35) * r * 0.95);
    c.lineTo(Math.cos(a + 0.35) * r * 0.95, Math.sin(a + 0.35) * r * 0.95); c.fill();
  }
  c.restore();
}
function marks(c, pts) {
  c.save(); c.fillStyle = OUT;
  for (const [x, y, a, l] of pts) { c.save(); c.translate(x, y); c.rotate(a); poly(c, [0, -1.6, l, 0, 0, 1.6], OUT, false); c.restore(); }
  c.restore();
}

// Patamon's ear-wings: a scalloped bat wing sweeping back from the head
function batWing(c, x, y, rot, sc, fill) {
  c.save(); c.translate(x, y); c.rotate(rot); c.scale(sc, sc);
  c.beginPath(); c.moveTo(0, 0);
  c.quadraticCurveTo(-10, -16, -30, -14);
  c.quadraticCurveTo(-28, -6, -24, -4);
  c.quadraticCurveTo(-20, -8, -16, -2);
  c.quadraticCurveTo(-12, -6, -8, 2);
  c.quadraticCurveTo(-4, 0, 0, 0);
  c.closePath(); c.fillStyle = fill; c.fill(); c.stroke();
  c.lineWidth = 1.2; c.beginPath(); c.moveTo(-2, -2); c.lineTo(-26, -12); c.stroke();
  c.restore();
}

const SPRITES = {
  agumon(c, p) {
    dino(c, p, { body: '#f7a21b', belly: '#ffd37e', dark: '#d9861a', eye: '#2bb24c', footClaws: true, bite: true });
  },
  guilmon(c, p) {
    dino(c, p, {
      body: '#e22a2f', belly: '#f6efe2', dark: '#b81f25', eye: '#f7d21b', slit: true, footClaws: true, bite: true,
      headBack(c) { poly(c, [-8, -8, -18, -14, -10, -2], '#e22a2f'); poly(c, [-6, -11, -10, -20, -2, -11], '#e22a2f'); },
      head(c) { marks(c, [[-4, -9, -0.6, 7], [2, -11, -0.9, 6], [-9, 2, 0.3, 6]]); },
      bodyMark(c) { hazard(c, 3, -24, 5); marks(c, [[-10, -34, 0.5, 6], [-12, -22, 0.2, 6]]); },
    });
  },
  gabumon(c, p) {
    dino(c, p, {
      body: '#f0cf4a', belly: '#f8e9a4', dark: '#d9b636', eye: '#d23a3a', footClaws: false,
      back(c, p) { // fur pelt cape
        c.save(); poly(c, [-2, -50, -20, -36, -22, -10, -10, -6, 4, -20], '#e9f1fb');
        for (let k = 0; k < 3; k++) limb(c, -6 - k * 5, -42 + k * 9, -14 - k * 3, -38 + k * 10, 2.5, '#356ad8');
        c.restore();
      },
      head(c, p) { // hood over the head with horn
        c.beginPath(); c.moveTo(-14, 6); c.quadraticCurveTo(-16, -16, 2, -15); c.quadraticCurveTo(14, -14, 14, -6);
        c.lineTo(4, -8); c.quadraticCurveTo(-6, -6, -6, 8); c.closePath(); c.fillStyle = '#e9f1fb'; c.fill(); c.stroke();
        limb(c, -10, -6, -4, -12, 2.4, '#356ad8'); limb(c, 0, -13, 6, -11, 2.4, '#356ad8');
        poly(c, [2, -14, 7, -27, 9, -13], '#f4e2b0');
      },
      arm(c, p, ax, ay) { ell(c, ax, ay, 3.5, 3.5, '#e9f1fb'); },
    });
  },
  greymon(c, p) {
    dino(c, p, {
      big: true, headScale: 1.15, body: '#f08a1c', belly: '#ffdba0', dark: '#cf6f12', eye: '#2bb24c', footClaws: true, bite: true,
      tailStripes: true, stripe: '#2c5fb5',
      bodyMark(c) { for (let k = 0; k < 3; k++) limb(c, -12, -36 + k * 7, -4, -38 + k * 7, 2.4, '#2c5fb5'); },
      head(c) { // brown skull helmet with three horns
        c.beginPath(); c.moveTo(-12, -3); c.quadraticCurveTo(-8, -15, 6, -12); c.lineTo(20, -6); c.lineTo(18, -1);
        c.quadraticCurveTo(6, -6, -2, -2); c.quadraticCurveTo(-8, 4, -12, -3); c.fillStyle = '#8b5a2e'; c.fill(); c.stroke();
        poly(c, [14, -8, 22, -18, 19, -6], '#f3ecd8');
        poly(c, [-2, -12, -4, -26, 4, -12], '#f3ecd8');
        poly(c, [-9, -8, -18, -18, -6, -4], '#f3ecd8');
      },
    });
  },
  growlmon(c, p) {
    dino(c, p, {
      big: true, headScale: 1.1, body: '#d6282d', belly: '#f4ece0', dark: '#a91d22', eye: '#f7d21b', slit: true, footClaws: true, bite: true,
      headBack(c, p) { // white mane
        c.save(); c.fillStyle = '#f4f4f4';
        c.beginPath(); c.moveTo(-6, -10);
        for (let k = 0; k < 5; k++) c.lineTo(-18 - k * 4, -6 + k * 7 + Math.sin(p.t * 0.2 + k) * 2), c.lineTo(-10 - k * 3, -2 + k * 7);
        c.lineTo(-4, 20); c.closePath(); c.fill(); c.stroke(); c.restore();
      },
      head(c) { marks(c, [[-2, -9, -0.5, 8], [6, -10, -0.2, 6]]); poly(c, [-4, -10, -8, -22, 2, -11], '#f3ecd8'); },
      bodyMark(c) { hazard(c, 3, -26, 6); marks(c, [[-12, -34, 0.6, 7], [-13, -22, 0.3, 7]]); },
      arm(c, p, ax, ay) { // elbow blade
        c.save(); c.translate((6 + ax) / 2, (-31 + ay) / 2); c.rotate(Math.atan2(ay + 31, ax - 6) - 2.4);
        poly(c, [0, -2, 18, -1, 0, 3], '#d8dde6'); c.restore();
      },
    });
  },
  patamon(c, p) {
    const bob = p.ground && p.run < 0.15 ? Math.sin(p.t * 0.12) * 1 : 0;
    const flap = p.ground ? Math.sin(p.t * 0.1) * 0.15 : Math.sin(p.t * 0.6) * 0.7;
    const [bdx, blift, fdx, flift] = legPhase(p);
    const spin = p.atk && p.atk.pose === 'breath' ? p.atk.p : 0;
    c.save(); c.translate(0, bob);
    // tail
    limb(c, -14, -12, -24, -8 + Math.sin(p.t * 0.2) * 2, 3, '#f0b25a');
    ell(c, -25, -8, 3, 3, '#f8e3b0');
    limb(c, -6, -8, -6 + bdx, -1 - blift, 6, '#d8913a');
    // back wing-ear
    batWing(c, -4, -30, -0.35 - flap, 0.85, '#a8662a');
    ell(c, 0, -20, 17, 16, '#f2b357');
    ell(c, 4, -14, 10, 8, '#fbe6b8', 0, false);
    limb(c, 6, -8, 6 + fdx, -1 - flift, 6, '#f2b357');
    // face
    eye(c, 8, -24, 4.2, '#3a6ccf', p);
    eye(c, 15, -23, 3.4, '#3a6ccf', p);
    const open = Math.max(spin, p.hurt ? 0.5 : 0);
    if (open > 0.2) ell(c, 14, -14, 3, 2 + open * 2, '#7a1f2a'); else { c.beginPath(); c.arc(13, -16, 3, 0.2, Math.PI - 0.2); c.stroke(); }
    // front wing-ear
    batWing(c, 0, -31, 0.05 + flap * 0.8, 1, '#c9802f');
    const [ax, ay] = armTarget(p, 10, -16, 8);
    limb(c, 10, -16, ax, ay, 4, '#f2b357');
    c.restore();
  },
  angemon(c, p) {
    const bob = p.ground && p.run < 0.15 ? Math.sin(p.t * 0.1) * 0.8 : 0;
    const [bdx, blift, fdx, flift] = legPhase(p);
    const flap = Math.sin(p.t * (p.ground ? 0.08 : 0.3)) * 0.25;
    c.save(); c.translate(0, bob);
    // wings: three pairs
    for (let k = 0; k < 3; k++) {
      c.save(); c.translate(-4, -46 + k * 3); c.rotate(-0.9 + k * 0.45 + flap);
      poly(c, [0, 0, -26 + k * 3, -10, -34 + k * 4, -2, -28 + k * 3, 4, -20, 3, -12, 6], k === 1 ? '#ffffff' : '#eef2ff');
      c.restore();
    }
    // legs
    limb(c, -3, -24, -4 + bdx, -2 - blift, 6.5, '#5a7fd1');
    limb(c, 3, -24, 4 + fdx, -2 - flift, 6.5, '#6b8fe0');
    ell(c, -2 + bdx, -1 - blift, 5, 2.4, '#e8e8f0'); ell(c, 6 + fdx, -1 - flift, 5, 2.4, '#e8e8f0');
    // torso
    poly(c, [-7, -24, 7, -24, 9, -46, -9, -46], '#f4f4fa');
    c.fillStyle = '#4a3a7a'; c.fillRect(-8, -28, 16, 3);
    // back arm
    const [bax, bay] = armTarget(p, -2, -43, 15);
    limb(c, -2, -43, bax - 6, bay, 4.5, '#f0e2c8');
    // head
    ell(c, 0, -53, 7, 8, '#f3e1c4');
    c.save(); c.fillStyle = '#f5d76a';
    c.beginPath(); c.moveTo(-6, -58); c.quadraticCurveTo(-16, -46, -12, -32 + Math.sin(p.t * 0.15) * 1.5); c.lineTo(-4, -46); c.closePath(); c.fill(); c.stroke();
    c.restore();
    // helmet mask
    c.beginPath(); c.moveTo(-7, -54); c.quadraticCurveTo(0, -66, 8, -55); c.lineTo(8, -50); c.lineTo(-7, -50); c.closePath();
    c.fillStyle = '#c8ccd8'; c.fill(); c.stroke();
    limb(c, 4, -53, 9, -53, 1.5, '#4a3a7a');
    ell(c, 4, -45, 2, 1, '#c97b6b', 0, false);
    // front arm + Angel Rod
    const [ax, ay] = armTarget(p, 4, -43, 15);
    limb(c, 4, -43, ax, ay, 5, '#f0e2c8');
    c.save(); c.translate(ax, ay);
    const rodA = p.atk ? (p.atk.pose === 'u' ? -1.4 : p.atk.pose === 'd' ? 1.2 : p.atk.pose === 'b' ? 2.6 : 0) : -1.2;
    c.rotate(rodA);
    limb(c, -16, 0, 22, 0, 2.6, '#e8c34a');
    ell(c, 23, 0, 3, 3, '#ffe78a');
    c.restore();
    c.restore();
  },
  garurumon(c, p) {
    const run = p.ground ? p.run : 0.4;
    const ph = p.t * 0.35;
    const sw = (o) => (p.ground ? Math.sin(ph + o) * 7 * run : -3);
    const stripe = '#2f6bd3', fur = '#edf4ff';
    c.save();
    const lunge = p.atk && p.atk.pose === 'f' ? p.atk.p * 6 : 0;
    c.translate(lunge, 0);
    // tail
    c.save(); c.translate(-26, -30); c.rotate(-0.5 + Math.sin(p.t * 0.15) * 0.2);
    ell(c, -10, 0, 12, 6, fur);
    limb(c, -14, -3, -16, 3, 2, stripe); c.restore();
    // back legs (far)
    limb(c, -16, -24, -16 + sw(Math.PI), -2, 7, '#d5e2f6');
    limb(c, 14, -24, 14 + sw(0), -2, 7, '#d5e2f6');
    // body
    ell(c, 0, -28, 26, 13, fur);
    for (let k = 0; k < 4; k++) limb(c, -14 + k * 8, -40, -10 + k * 8, -30, 3, stripe);
    // near legs
    limb(c, -12, -24, -12 + sw(0), -2, 7.5, fur);
    limb(c, 18, -24, 18 + sw(Math.PI), -2, 7.5, fur);
    claws(c, -12 + sw(0) + 3, -1, 0, 3); claws(c, 18 + sw(Math.PI) + 3, -1, 0, 3);
    // head
    const breath = p.atk && p.atk.pose === 'breath' ? p.atk.p : 0;
    const up = p.atk && p.atk.pose === 'u' ? -p.atk.p * 0.5 : 0;
    c.save(); c.translate(26, -38); c.rotate(up - breath * 0.1);
    poly(c, [-6, -8, -2, -20, 4, -9], fur); // ear
    ell(c, 0, 0, 11, 10, fur);
    ell(c, 13, 3 + breath * 2, 10, 4.5, fur, 0.1 + breath * 0.3);
    ell(c, 12, -1, 11, 5.5, fur);
    if (breath > 0.2) ell(c, 14, 3, 7, 2 * breath + 0.5, '#7a1f2a', 0.1, false);
    ell(c, 22, -2, 1.5, 1.2, OUT, 0, false);
    poly(c, [4, -8, 8, -20, 10, -7], '#f6e8b8'); // horn
    limb(c, -6, -2, 0, 4, 2.4, stripe);
    eye(c, 3, -3, 3.4, '#d23a3a', p, true);
    c.restore();
    c.restore();
  },
};

export function drawSprite(c, key, p) {
  c.save();
  c.lineWidth = 2.2; c.lineJoin = 'round'; c.strokeStyle = OUT;
  if (p.crouch) c.scale(1.06, 0.8);
  if (p.spin) { c.translate(0, -26); c.rotate(p.spin); c.translate(0, 26); }
  SPRITES[key](c, p);
  c.restore();
}

// draws a portrait-sized idle sprite into a canvas (for menus)
export function drawPortrait(canvas, key, opts = {}) {
  const c = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  c.clearRect(0, 0, w, h);
  const sc = opts.scale ?? Math.min(w, h) / 78;
  c.save();
  c.translate(w / 2 - (key === 'garurumon' ? 4 * sc : 0), h * 0.86);
  c.scale(sc * (opts.flip ? -1 : 1), sc);
  drawSprite(c, key, { t: opts.t ?? 0, ground: true, run: 0, atk: opts.atk || null });
  c.restore();
}
