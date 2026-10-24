// Canvas renderer + cosmetic effects. Never mutates game state, so both the
// online host and guest can render the same snapshot.
import { STAGES, CHARS } from './data.js';
import { form, getMove, activeHits, C } from './engine.js';
import { drawSprite, drawPortrait } from './sprites.js';

const TAU = Math.PI * 2;
export const PCOLORS = ['#ff4d5e', '#3d8bff', '#ffd23d', '#3ddc84'];
const FX_COL = { fire: '#ff8a1f', pyro: '#ff4a1f', ice: '#7fe3ff', holy: '#ffe36b', bubble: '#bfefff', wind: '#e6fff4', slash: '#ffffff', phys: '#ffffff', quake: '#d9b07a', digi: '#9cf7ff' };

// ------------------------------------------------------------------ FX
export class FX {
  constructor() { this.parts = []; this.rings = []; this.texts = []; this.calls = {}; this.shake = 0; this.flash = 0; this.banner = null; this.trails = []; }
  reset() { this.parts.length = 0; this.rings.length = 0; this.texts.length = 0; this.calls = {}; this.shake = 0; this.flash = 0; }
  burst(x, y, n, col, spd = 5, size = 4, life = 26, g = 0.15) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * TAU, v = spd * (0.3 + Math.random());
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1, life, max: life, size: size * (0.5 + Math.random()), col, g });
    }
  }
  ring(x, y, col, r = 10, vr = 6, life = 18, w = 4) { this.rings.push({ x, y, r, vr, life, max: life, col, w }); }
  text(x, y, txt, col = '#fff', size = 22, life = 50) { this.texts.push({ x, y, txt, col, size, life, max: life }); }

  handle(events, s) {
    for (const e of events) {
      switch (e.k) {
        case 'hit': {
          const col = FX_COL[e.fx] || '#fff';
          this.burst(e.x, e.y, 6 + Math.min(20, e.kb), col, 3 + e.kb * 0.25, 4);
          this.ring(e.x, e.y, col, 6, 3 + e.kb * 0.25, 14, 3 + e.kb * 0.12);
          if (e.kb > 20) { this.shake = Math.max(this.shake, Math.min(18, e.kb * 0.5)); this.ring(e.x, e.y, '#fff', 10, 12, 18, 6); }
          else this.shake = Math.max(this.shake, e.kb * 0.25);
          break;
        }
        case 'block': this.ring(e.x, e.y, '#aee6ff', 8, 4, 12, 3); break;
        case 'break': this.burst(e.x, e.y, 30, '#aee6ff', 7, 5, 40); this.text(e.x, e.y - 40, 'SHIELD BREAK!', '#aee6ff', 22, 70); this.shake = 10; break;
        case 'ko': {
          const col = PCOLORS[e.i];
          this.flash = 10; this.shake = 26;
          for (let k = 0; k < 4; k++) this.ring(e.x, e.y, k % 2 ? '#fff' : col, 10, 14 + k * 6, 30 + k * 6, 10);
          this.burst(e.x, e.y, 60, col, 16, 7, 50, 0);
          this.ko = { x: e.x, y: e.y, t: 40, col };
          break;
        }
        case 'digi': this.ring(e.x, e.y - 30, '#9cf7ff', 20, 2, 60, 4); this.digi = { i: e.i, t: 0 }; break;
        case 'digidone':
          this.flash = 8; this.shake = 12;
          for (let k = 0; k < 3; k++) this.ring(e.x, e.y - 40, k ? '#ffe36b' : '#fff', 20, 10 + k * 5, 30, 8);
          this.burst(e.x, e.y - 40, 50, '#9cf7ff', 10, 6, 50, 0);
          break;
        case 'dedigi': this.burst(e.x, e.y, 30, '#9cf7ff', 5, 4, 40, -0.05); this.text(e.x, e.y - 50, 'De-Digivolve…', '#9cf7ff', 18, 60); break;
        case 'quake': this.ring(e.x, e.y, FX_COL[e.fx] || '#d9b07a', 20, 10, 20, 8); this.shake = Math.max(this.shake, 8); this.burst(e.x, e.y, 20, '#c9a070', 6, 5, 30, 0.3); break;
        case 'pickup': this.text(e.x, e.y - 20, e.kind === 'meat' ? '-25%  Yum!' : 'DATA +', e.kind === 'meat' ? '#ffb38a' : '#7dffb0', 20, 60); this.burst(e.x, e.y, 16, e.kind === 'meat' ? '#ffb38a' : '#7dffb0', 4, 4, 30, -0.05); break;
        case 'tech': this.ring(e.x, e.y - 20, '#fff', 8, 5, 12, 3); break;
        case 'counter': this.ring(e.x, e.y, '#7fe3ff', 16, 8, 20, 6); this.text(e.x, e.y - 30, 'COUNTER!', '#7fe3ff', 24, 50); break;
        case 'clash': this.ring(e.x, e.y, '#fff', 8, 8, 14, 5); this.burst(e.x, e.y, 12, '#fff', 6, 3, 20, 0); break;
        case 'djump': this.ring(e.x, e.y, 'rgba(255,255,255,0.8)', 8, 3, 12, 2); break;
        case 'bounce': this.burst(e.x, e.y, 8, '#c9a070', 4, 3, 20, 0.3); break;
        case 'grab': this.ring(e.x, e.y, '#fff', 6, 4, 10, 3); break;
        case 'call': this.calls[e.i] = { name: e.name, t: 70 }; break;
        case 'respawn': this.ring(e.x, e.y, PCOLORS[e.i], 10, 5, 24, 4); break;
      }
    }
  }

  tick(s) {
    for (const p of this.parts) { p.x += p.vx; p.y += p.vy; p.vy += p.g; p.vx *= 0.96; p.life--; }
    this.parts = this.parts.filter((p) => p.life > 0);
    for (const r of this.rings) { r.r += r.vr; r.vr *= 0.9; r.life--; }
    this.rings = this.rings.filter((r) => r.life > 0);
    for (const t of this.texts) { t.y -= 0.6; t.life--; }
    this.texts = this.texts.filter((t) => t.life > 0);
    for (const k in this.calls) if (--this.calls[k].t <= 0) delete this.calls[k];
    if (this.ko && --this.ko.t <= 0) this.ko = null;
    this.shake *= 0.85; if (this.shake < 0.3) this.shake = 0;
    if (this.flash > 0) this.flash--;
    // projectile trails
    if (s) for (const p of s.projs) {
      if (Math.random() < 0.8) {
        const col = FX_COL[p.fx] || '#fff';
        this.parts.push({ x: p.x - p.vx * 0.5 + (Math.random() - 0.5) * p.r, y: p.y + (Math.random() - 0.5) * p.r, vx: -p.vx * 0.1, vy: (Math.random() - 0.5) * 0.6 - (p.fx === 'fire' || p.fx === 'pyro' ? 0.6 : 0), life: 16, max: 16, size: p.r * 0.45, col, g: 0 });
      }
    }
    if (s) for (const f of s.fighters) {
      if (f.form === 1 && f.state !== 'dead' && f.state !== 'out' && Math.random() < 0.35) {
        const fm = form(f);
        this.parts.push({ x: f.x + (Math.random() - 0.5) * fm.w, y: f.y - Math.random() * fm.h, vx: 0, vy: -1.2, life: 24, max: 24, size: 3, col: '#ffe36b', g: 0 });
      }
    }
  }
}

// ------------------------------------------------------------------ camera
export class Camera {
  constructor() { this.x = 0; this.y = -150; this.z = 1; }
  update(s, W, H, snap) {
    const stage = STAGES[s.stageId];
    let x1 = 1e9, x2 = -1e9, y1 = 1e9, y2 = -1e9, n = 0;
    for (const f of s.fighters) {
      if (f.state === 'dead' || f.state === 'out') continue;
      const fm = form(f);
      x1 = Math.min(x1, f.x); x2 = Math.max(x2, f.x); y1 = Math.min(y1, f.y - fm.h); y2 = Math.max(y2, f.y); n++;
    }
    const st = stage.solids[0];
    if (!n) { x1 = st.x1; x2 = st.x2; y1 = -200; y2 = 0; }
    // always keep part of the stage in view
    x1 = Math.min(x1, -200); x2 = Math.max(x2, 200); y2 = Math.max(y2, 40); y1 = Math.min(y1, -120);
    const b = stage.blast;
    x1 = Math.max(x1, b.x1 + 150); x2 = Math.min(x2, b.x2 - 150); y1 = Math.max(y1, b.y1 + 150); y2 = Math.min(y2, b.y2 - 100);
    const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
    const base = Math.min(W / 1400, H / 820);
    const z = Math.min(W / (x2 - x1 + 420), H / (y2 - y1 + 320), base * 1.6);
    const tz = Math.max(base * 0.62, z);
    const k = snap ? 1 : 0.08;
    this.x += (cx - this.x) * k; this.y += (cy - this.y) * k; this.z += (tz - this.z) * k;
  }
}

// ------------------------------------------------------------------ backgrounds
const bgCache = {};
function seededRand(seed) { return () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; }

function drawBackground(c, s, cam, W, H, time) {
  const theme = STAGES[s.stageId].theme;
  const g = c.createLinearGradient(0, 0, 0, H);
  if (theme === 'island') { g.addColorStop(0, '#3aa0ff'); g.addColorStop(0.6, '#9fdcff'); g.addColorStop(1, '#e8fbff'); }
  else if (theme === 'mountain') { g.addColorStop(0, '#1d1446'); g.addColorStop(0.5, '#6b2d74'); g.addColorStop(0.85, '#ff8a5c'); g.addColorStop(1, '#ffc27a'); }
  else { g.addColorStop(0, '#ffc7e8'); g.addColorStop(0.55, '#ffe9f4'); g.addColorStop(1, '#d9f6ff'); }
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  const R = seededRand(42);
  const par = (f) => -cam.x * cam.z * f;

  if (theme === 'mountain') {
    // stars
    c.fillStyle = '#fff';
    for (let k = 0; k < 90; k++) { const x = (R() * W * 1.4 + par(0.02)) % W, y = R() * H * 0.5; c.globalAlpha = 0.3 + 0.7 * Math.abs(Math.sin(time * 0.02 + k)); c.fillRect(x, y, 2, 2); }
    c.globalAlpha = 1;
    // giant moon
    c.fillStyle = 'rgba(255,240,220,0.9)'; c.beginPath(); c.arc(W * 0.78 + par(0.03), H * 0.22, Math.min(W, H) * 0.09, 0, TAU); c.fill();
    // Infinity Mountain silhouette
    c.fillStyle = '#2b1a4a';
    const mx = W * 0.5 + par(0.08), my = H * 0.9;
    c.beginPath(); c.moveTo(mx - W * 0.7, H); c.lineTo(mx - W * 0.18, my - H * 0.35); c.lineTo(mx - W * 0.05, my - H * 0.55); c.lineTo(mx + W * 0.04, my - H * 0.5); c.lineTo(mx + W * 0.25, my - H * 0.3); c.lineTo(mx + W * 0.8, H); c.fill();
    c.fillStyle = '#3d2460';
    for (let k = -1; k < 4; k++) { const x = k * W * 0.4 + par(0.15) % (W * 0.4); c.beginPath(); c.moveTo(x - W * 0.3, H); c.lineTo(x, H * 0.66); c.lineTo(x + W * 0.3, H); c.fill(); }
  } else if (theme === 'island') {
    // sun
    c.fillStyle = 'rgba(255,250,200,0.9)'; c.beginPath(); c.arc(W * 0.2 + par(0.02), H * 0.18, Math.min(W, H) * 0.07, 0, TAU); c.fill();
    // distant islands
    c.fillStyle = '#5bb98a';
    for (let k = 0; k < 4; k++) { const x = ((k * 0.33 + 0.1) * W + par(0.06)) % (W * 1.3); c.beginPath(); c.ellipse(x, H * 0.74, W * 0.12, H * 0.07, 0, Math.PI, 0); c.fill(); }
    // sea
    c.fillStyle = '#2f8fd6'; c.fillRect(0, H * 0.74, W, H * 0.26);
    c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 2;
    for (let k = 0; k < 6; k++) { c.beginPath(); const y = H * 0.78 + k * H * 0.035; for (let x = 0; x <= W; x += 20) c.lineTo(x, y + Math.sin(x * 0.02 + time * 0.05 + k) * 3); c.stroke(); }
    // clouds
    c.fillStyle = 'rgba(255,255,255,0.85)';
    for (let k = 0; k < 6; k++) {
      const x = ((R() * W * 1.5 + time * (0.2 + k * 0.05) + par(0.04)) % (W * 1.5)) - W * 0.2, y = R() * H * 0.45 + 20, sz = 30 + R() * 40;
      c.beginPath(); c.arc(x, y, sz, 0, TAU); c.arc(x + sz, y + 8, sz * 0.8, 0, TAU); c.arc(x - sz, y + 10, sz * 0.7, 0, TAU); c.fill();
    }
  } else {
    // Primary Village: pastel hills + floating DigiEggs
    c.fillStyle = '#b8f0c8';
    for (let k = -1; k < 5; k++) { const x = k * W * 0.3 + (par(0.1) % (W * 0.3)); c.beginPath(); c.ellipse(x, H * 0.85, W * 0.22, H * 0.2, 0, Math.PI, 0); c.fill(); }
    for (let k = 0; k < 7; k++) {
      const x = (R() * W * 1.2 + par(0.05)) % W, y = H * 0.2 + R() * H * 0.4 + Math.sin(time * 0.03 + k) * 10;
      const col = ['#ffd1e8', '#d1ecff', '#fff3c1', '#d9ffd1'][k % 4];
      c.fillStyle = col; c.strokeStyle = 'rgba(0,0,0,0.15)'; c.lineWidth = 2;
      c.beginPath(); c.ellipse(x, y, 16, 21, Math.sin(time * 0.02 + k) * 0.2, 0, TAU); c.fill(); c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.7)'; c.beginPath(); c.arc(x - 3, y - 5, 4, 0, TAU); c.fill();
    }
  }
  // digital grid overlay
  c.strokeStyle = theme === 'mountain' ? 'rgba(140,220,255,0.06)' : 'rgba(0,80,160,0.05)'; c.lineWidth = 1;
  const gs = 60 * cam.z, ox = par(1) % gs, oy = (-cam.y * cam.z) % gs;
  for (let x = ox; x < W; x += gs) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
  for (let y = oy; y < H; y += gs) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
}

function drawStage(c, s, time) {
  const st = STAGES[s.stageId];
  const theme = st.theme;
  const top = theme === 'island' ? '#5fd35f' : theme === 'mountain' ? '#8a7a9c' : '#9df0b0';
  const side = theme === 'island' ? '#8b5a2e' : theme === 'mountain' ? '#4a3a5c' : '#f2c6de';
  const dark = theme === 'island' ? '#5e3a1c' : theme === 'mountain' ? '#2c2240' : '#c993b8';
  for (const o of st.solids) {
    const w = o.x2 - o.x1, depth = 260;
    c.fillStyle = side;
    c.beginPath(); c.moveTo(o.x1, o.y1);
    c.lineTo(o.x2, o.y1); c.lineTo(o.x2 - 8, o.y2);
    c.quadraticCurveTo(o.x2 - w * 0.15, o.y2 + depth * 0.4, o.x1 + w * 0.6, o.y2 + depth);
    c.quadraticCurveTo(o.x1 + w * 0.2, o.y2 + depth * 0.4, o.x1 + 8, o.y2); c.closePath(); c.fill();
    c.strokeStyle = dark; c.lineWidth = 4; c.stroke();
    // circuit lines
    c.strokeStyle = theme === 'mountain' ? 'rgba(140,220,255,0.35)' : 'rgba(120,255,220,0.35)'; c.lineWidth = 2;
    for (let k = 0; k < 6; k++) {
      const x = o.x1 + w * (0.15 + k * 0.13), y = o.y1 + 30 + (k % 3) * 22;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + 30, y); c.lineTo(x + 45, y + 18); c.lineTo(x + 45, y + 50 + (k % 2) * 30); c.stroke();
      c.fillStyle = `rgba(160,255,230,${0.4 + 0.4 * Math.sin(time * 0.05 + k)})`; c.beginPath(); c.arc(x, y, 3.5, 0, TAU); c.fill();
    }
    c.fillStyle = top; c.fillRect(o.x1 - 4, o.y1 - 2, w + 8, 14);
    c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(o.x1 - 4, o.y1 - 2, w + 8, 3);
    if (theme === 'island') {
      c.fillStyle = '#3fb34a';
      for (let x = o.x1; x < o.x2; x += 14) { c.beginPath(); c.moveTo(x, o.y1 + 12); c.lineTo(x + 7, o.y1 + 20); c.lineTo(x + 14, o.y1 + 12); c.fill(); }
    }
  }
  for (const p of st.plats) {
    c.fillStyle = theme === 'mountain' ? 'rgba(160,140,200,0.95)' : theme === 'island' ? '#c9935a' : '#ffd1e8';
    c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 2;
    roundRect(c, p.x1, p.y - 2, p.x2 - p.x1, 12, 5); c.fill(); c.stroke();
    c.fillStyle = 'rgba(160,255,230,0.6)'; c.fillRect(p.x1 + 6, p.y + 12, p.x2 - p.x1 - 12, 2);
  }
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

// ------------------------------------------------------------------ fighters
function poseOf(f, s) {
  const fm = form(f);
  const p = { t: s.frame + f.i * 17, ground: f.ground, run: Math.min(1, Math.abs(f.vx) / fm.run), atk: null, hurt: false, ledge: false, crouch: f.crouch, spin: 0 };
  if (f.state === 'attack' && f.move) {
    const m = getMove(f, f.move);
    const h0 = m.hits && m.hits[0];
    const s0 = h0 ? h0.s : m.proj ? m.proj.f : m.counter ? m.counter.s : 6;
    const e0 = h0 ? h0.e : s0 + 8;
    const k = f.mt < s0 ? (f.mt / s0) * 0.5 : f.mt <= e0 ? 1 : Math.max(0, 1 - (f.mt - e0) / 10);
    p.atk = { pose: m.pose || 'f', p: k };
    if (m.pose === 'spin') p.spin = Math.min(1, f.mt / e0) * TAU;
    if (f.charge > 0) p.atk.p = 0.3;
  }
  if (f.state === 'hitstun' || f.state === 'stunned' || f.state === 'grabbed') p.hurt = true;
  if (f.state === 'hitstun' && f.kb > 14) p.spin = s.frame * 0.35;
  if (f.state === 'ledge' || f.state === 'climb') p.ledge = true;
  if (f.state === 'roll') p.spin = (f.t / 24) * TAU;
  if (f.state === 'stunned') p.spin = Math.sin(s.frame * 0.2) * 0.2;
  return p;
}

function drawFighter(c, f, s, fx, noTags) {
  if (f.state === 'dead' || f.state === 'out') return;
  const fm = form(f);
  const pose = poseOf(f, s);
  const col = PCOLORS[f.i];
  // shadow
  if (f.ground) { c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.ellipse(f.x, f.y + 2, fm.w * 0.6, 5, 0, 0, TAU); c.fill(); }
  // champion aura
  if (f.form === 1) {
    const r = fm.h * 0.85;
    const g = c.createRadialGradient(f.x, f.y - fm.h / 2, 4, f.x, f.y - fm.h / 2, r);
    g.addColorStop(0, 'rgba(255,230,120,0.35)'); g.addColorStop(1, 'rgba(255,230,120,0)');
    c.fillStyle = g; c.beginPath(); c.arc(f.x, f.y - fm.h / 2, r, 0, TAU); c.fill();
  }
  // digivolution light column
  if (f.state === 'digivolving') {
    const k = Math.min(1, f.t / 20);
    const g = c.createLinearGradient(f.x - 60, 0, f.x + 60, 0);
    g.addColorStop(0, 'rgba(156,247,255,0)'); g.addColorStop(0.5, `rgba(255,255,255,${0.8 * k})`); g.addColorStop(1, 'rgba(156,247,255,0)');
    c.fillStyle = g; c.fillRect(f.x - 60, f.y - 900, 120, 900);
    for (let k2 = 0; k2 < 3; k2++) {
      const rr = ((s.frame * 3 + k2 * 30) % 90);
      c.strokeStyle = `rgba(156,247,255,${1 - rr / 90})`; c.lineWidth = 3;
      c.beginPath(); c.ellipse(f.x, f.y - 10 - rr, 50 - rr * 0.2, 12, 0, 0, TAU); c.stroke();
    }
  }
  c.save();
  if (f.inv > 0 && f.state !== 'digivolving' && s.frame % 6 < 3) c.globalAlpha = 0.55;
  if (f.form === 1 && f.digiT < 150 && s.frame % 10 < 5) c.globalAlpha = 0.6;
  c.translate(f.x, f.y);
  // shake while in hitlag
  if (f.hitlag > 0 && f.state === 'hitstun') c.translate((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 3);
  c.scale(f.face * fm.scale, fm.scale);
  let filter = '';
  if (f.flash > 0 || (f.state === 'digivolving' && f.t > 16 && f.t < 44)) filter = 'brightness(2.4) saturate(0.4)';
  else if (f.freeze > 0) filter = 'hue-rotate(160deg) saturate(0.6) brightness(1.35)';
  else if (f.state === 'helpless') filter = 'brightness(0.65)';
  else if (f.state === 'attack' && f.charge > 0 && s.frame % 8 < 4) filter = 'brightness(1.5)';
  if (filter) c.filter = filter;
  drawSprite(c, fm.sprite, pose);
  c.filter = 'none';
  c.restore();
  if (f.freeze > 0) { c.strokeStyle = 'rgba(180,240,255,0.8)'; c.lineWidth = 2; c.fillStyle = 'rgba(160,230,255,0.25)'; roundRect(c, f.x - fm.w * 0.65, f.y - fm.h * 1.05, fm.w * 1.3, fm.h * 1.05, 8); c.fill(); c.stroke(); }

  // shield bubble
  if (f.state === 'shield') {
    const r = (fm.h * 0.45 + 6) * (0.4 + 0.6 * f.shield / C.SHIELD_MAX);
    c.fillStyle = hexA(col, 0.35); c.strokeStyle = hexA(col, 0.9); c.lineWidth = 3;
    c.beginPath(); c.arc(f.x, f.y - fm.h * 0.5, r, 0, TAU); c.fill(); c.stroke();
  }
  // respawn platform
  if (f.state === 'respawn') {
    c.fillStyle = hexA(col, 0.8); roundRect(c, f.x - 40, f.y, 80, 8, 4); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.6)'; c.fillRect(f.x - 34, f.y + 2, 68, 2);
  }
  // player tag
  if (noTags) return;
  const ty = f.y - fm.h - 18;
  c.fillStyle = col;
  c.beginPath(); c.moveTo(f.x - 7, ty); c.lineTo(f.x + 7, ty); c.lineTo(f.x, ty + 8); c.fill();
  c.font = 'bold 15px "Baloo 2", system-ui, sans-serif'; c.textAlign = 'center';
  c.lineWidth = 4; c.strokeStyle = 'rgba(0,0,0,0.6)';
  const tag = f.cpu ? 'CPU' : 'P' + (f.i + 1);
  c.strokeText(tag, f.x, ty - 3); c.fillText(tag, f.x, ty - 3);
  // special move callout
  const call = fx.calls[f.i];
  if (call) {
    const a = Math.min(1, call.t / 15);
    c.globalAlpha = a;
    c.font = 'italic 900 20px "Baloo 2", system-ui, sans-serif';
    c.strokeStyle = 'rgba(0,0,0,0.75)'; c.lineWidth = 5;
    c.strokeText(call.name + '!', f.x, ty - 24 - (70 - call.t) * 0.2);
    c.fillStyle = '#fff6a8'; c.fillText(call.name + '!', f.x, ty - 24 - (70 - call.t) * 0.2);
    c.globalAlpha = 1;
  }
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

function drawHitFx(c, f, s) {
  if (f.state !== 'attack' || !f.move) return;
  const m = getMove(f, f.move);
  const fm = form(f);
  if (m.beam && f.mt >= m.beam.s - 4 && f.mt <= m.beam.e + 2) {
    const sc = fm.scale;
    const y = f.y + m.beam.y * sc, x0 = f.x + f.face * 24 * sc, len = m.beam.len * sc, r = m.beam.r * sc;
    const on = f.mt >= m.beam.s;
    const col = FX_COL[m.beam.fx];
    const w = on ? r * (1.1 + Math.sin(s.frame) * 0.15) : 4;
    const g = c.createLinearGradient(0, y - w, 0, y + w);
    g.addColorStop(0, hexA(col.length === 7 ? col : '#ffffff', 0)); g.addColorStop(0.5, '#ffffff'); g.addColorStop(1, hexA(col.length === 7 ? col : '#ffffff', 0));
    c.fillStyle = col; c.globalAlpha = 0.6; c.fillRect(Math.min(x0, x0 + f.face * len), y - w, len, w * 2);
    c.globalAlpha = 1; c.fillStyle = g; c.fillRect(Math.min(x0, x0 + f.face * len), y - w * 0.5, len, w);
    return;
  }
  for (const h of activeHits(f)) {
    const fxk = h.hb.fx || 'phys';
    const col = FX_COL[fxk] || '#fff';
    if (fxk === 'fire' || fxk === 'pyro') {
      for (let k = 0; k < 3; k++) {
        c.fillStyle = k === 0 ? 'rgba(255,90,20,0.55)' : k === 1 ? 'rgba(255,170,40,0.65)' : 'rgba(255,240,150,0.8)';
        c.beginPath(); c.arc(h.x + (Math.random() - 0.5) * 6, h.y + (Math.random() - 0.5) * 6, h.r * (1 - k * 0.3), 0, TAU); c.fill();
      }
    } else if (fxk === 'ice') {
      c.fillStyle = 'rgba(160,240,255,0.55)'; c.strokeStyle = '#e8fbff'; c.lineWidth = 2;
      for (let k = 0; k < 5; k++) { const a = k / 5 * TAU + s.frame * 0.2; c.beginPath(); c.moveTo(h.x, h.y); c.lineTo(h.x + Math.cos(a) * h.r, h.y + Math.sin(a) * h.r); c.lineTo(h.x + Math.cos(a + 0.3) * h.r * 0.5, h.y + Math.sin(a + 0.3) * h.r * 0.5); c.closePath(); c.fill(); c.stroke(); }
    } else if (fxk === 'holy' || fxk === 'digi') {
      const g = c.createRadialGradient(h.x, h.y, 0, h.x, h.y, h.r);
      g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, hexA(col, 0));
      c.fillStyle = g; c.beginPath(); c.arc(h.x, h.y, h.r, 0, TAU); c.fill();
    } else if (fxk === 'quake') {
      c.strokeStyle = hexA('#d9b07a', 0.8); c.lineWidth = 5; c.beginPath(); c.ellipse(h.x, h.y + 8, h.r, h.r * 0.35, 0, Math.PI, TAU); c.stroke();
    } else {
      // generic swoosh arc
      const ang = Math.atan2(h.y - (f.y - fm.h * 0.5), h.x - f.x);
      c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = h.r * 0.35; c.lineCap = 'round';
      c.beginPath(); c.arc(f.x, f.y - fm.h * 0.5, Math.hypot(h.x - f.x, h.y - (f.y - fm.h * 0.5)) + h.r * 0.2, ang - 0.7, ang + 0.7); c.stroke();
      c.strokeStyle = hexA(PCOLORS[f.i], 0.5); c.lineWidth = h.r * 0.15;
      c.stroke(); c.lineCap = 'butt';
    }
  }
}

function drawProjectile(c, p, s) {
  const t = s.frame;
  switch (p.fx) {
    case 'fire': case 'pyro': {
      const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 1.4);
      g.addColorStop(0, '#fff7c2'); g.addColorStop(0.4, p.fx === 'fire' ? '#ffb02e' : '#ff6a1f'); g.addColorStop(1, 'rgba(255,60,10,0)');
      c.fillStyle = g; c.beginPath(); c.arc(p.x, p.y, p.r * 1.4, 0, TAU); c.fill();
      if (p.fx === 'pyro') { c.fillStyle = '#7a1010'; c.beginPath(); c.arc(p.x, p.y, p.r * 0.35, 0, TAU); c.fill(); }
      break;
    }
    case 'ice': {
      c.save(); c.translate(p.x, p.y); c.rotate(t * 0.3);
      c.fillStyle = '#bff4ff'; c.strokeStyle = '#2f6bd3'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(p.r * 1.3, 0); c.lineTo(0, p.r * 0.7); c.lineTo(-p.r * 1.3, 0); c.lineTo(0, -p.r * 0.7); c.closePath(); c.fill(); c.stroke();
      c.restore(); break;
    }
    case 'bubble': {
      c.fillStyle = 'rgba(200,240,255,0.35)'; c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 2.5;
      c.beginPath(); c.arc(p.x, p.y, p.r * (1 + Math.sin(t * 0.3) * 0.08), 0, TAU); c.fill(); c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.9)'; c.beginPath(); c.arc(p.x - p.r * 0.35, p.y - p.r * 0.35, p.r * 0.2, 0, TAU); c.fill();
      break;
    }
    case 'holy': {
      const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 1.6);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, 'rgba(255,227,107,0.9)'); g.addColorStop(1, 'rgba(255,227,107,0)');
      c.fillStyle = g; c.beginPath(); c.arc(p.x, p.y, p.r * 1.6, 0, TAU); c.fill();
      // fist
      c.save(); c.translate(p.x, p.y); c.scale(Math.sign(p.vx), 1);
      c.fillStyle = '#fff3c4'; c.strokeStyle = '#c9a227'; c.lineWidth = 2;
      roundRect(c, -p.r * 0.6, -p.r * 0.5, p.r * 1.2, p.r, p.r * 0.3); c.fill(); c.stroke();
      for (let k = 0; k < 3; k++) { c.beginPath(); c.moveTo(p.r * 0.2 + k * 0, -p.r * 0.5 + (k + 1) * p.r * 0.25); c.lineTo(p.r * 0.6, -p.r * 0.5 + (k + 1) * p.r * 0.25); c.stroke(); }
      c.restore(); break;
    }
    default: c.fillStyle = '#fff'; c.beginPath(); c.arc(p.x, p.y, p.r, 0, TAU); c.fill();
  }
}

function drawItem(c, it, s) {
  if (it.life < 120 && s.frame % 10 < 5) return;
  const bob = it.ground ? Math.sin(s.frame * 0.08 + it.id) * 3 : 0;
  const x = it.x, y = it.y - 16 + bob;
  if (it.kind === 'chip') {
    const g = c.createRadialGradient(x, y, 0, x, y, 26);
    g.addColorStop(0, 'rgba(125,255,176,0.6)'); g.addColorStop(1, 'rgba(125,255,176,0)');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, 26, 0, TAU); c.fill();
    c.save(); c.translate(x, y); c.rotate(s.frame * 0.03);
    c.fillStyle = '#1c6e48'; c.strokeStyle = '#7dffb0'; c.lineWidth = 2.5;
    c.beginPath(); for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; c.lineTo(Math.cos(a) * 13, Math.sin(a) * 13); } c.closePath(); c.fill(); c.stroke();
    c.restore();
    c.fillStyle = '#7dffb0'; c.font = 'bold 13px system-ui'; c.textAlign = 'center'; c.fillText('D', x, y + 5);
  } else {
    // Digimon meat on the bone
    c.save(); c.translate(x, y); c.rotate(-0.4);
    c.strokeStyle = '#3b1d10'; c.lineWidth = 2;
    c.fillStyle = '#f4ead8'; roundRect(c, -18, -3, 36, 6, 3); c.fill(); c.stroke();
    for (const sx of [-18, 18]) { c.beginPath(); c.arc(sx, -3, 3.5, 0, TAU); c.arc(sx, 3, 3.5, 0, TAU); c.fill(); c.stroke(); }
    c.fillStyle = '#b5532c'; c.beginPath(); c.ellipse(0, 0, 12, 10, 0, 0, TAU); c.fill(); c.stroke();
    c.fillStyle = 'rgba(255,200,160,0.6)'; c.beginPath(); c.ellipse(-3, -3, 4, 3, 0, 0, TAU); c.fill();
    c.restore();
  }
}

// ------------------------------------------------------------------ HUD
const portraitCache = {};
function portrait(key) {
  if (!portraitCache[key]) {
    const cv = document.createElement('canvas'); cv.width = 96; cv.height = 96;
    drawPortrait(cv, key, { scale: key === 'garurumon' ? 1.2 : key === 'patamon' ? 1.7 : 1.35 });
    portraitCache[key] = cv;
  }
  return portraitCache[key];
}

function dmgColor(d) {
  const k = Math.min(1, d / 160);
  const r = 255, g = Math.round(255 - 200 * k), b = Math.round(255 - 255 * Math.min(1, k * 2));
  return `rgb(${Math.round(r - 90 * Math.max(0, k - 0.75) * 4)},${g},${b})`;
}

function drawHUD(c, s, W, H, keys, fx) {
  const n = s.fighters.length;
  const pw = Math.min(250, W / n - 16), ph = 92;
  const total = n * pw + (n - 1) * 16;
  const sx = (W - total) / 2, y = H - ph - 12;
  s.fighters.forEach((f, idx) => {
    const x = sx + idx * (pw + 16);
    const col = PCOLORS[f.i];
    const fm = form(f);
    c.save();
    c.fillStyle = 'rgba(15,10,30,0.72)'; roundRect(c, x, y, pw, ph, 14); c.fill();
    c.strokeStyle = col; c.lineWidth = 3; c.stroke();
    // portrait
    c.save(); roundRect(c, x + 6, y + 6, 70, 70, 10); c.clip();
    c.fillStyle = hexA(col, 0.35); c.fillRect(x + 6, y + 6, 70, 70);
    c.drawImage(portrait(fm.sprite), x - 7, y - 5, 96, 96);
    c.restore();
    // name
    c.fillStyle = '#fff'; c.font = 'bold 14px "Baloo 2", system-ui, sans-serif'; c.textAlign = 'left';
    c.fillText(`${f.cpu ? 'CPU' : 'P' + (f.i + 1)} · ${fm.name}`, x + 84, y + 20);
    // damage
    if (f.state === 'out') {
      c.fillStyle = '#888'; c.font = '900 30px "Baloo 2", system-ui, sans-serif'; c.fillText('OUT', x + 84, y + 54);
    } else {
      const shake = f.flash > 0 ? (Math.random() - 0.5) * 6 : 0;
      c.font = '900 38px "Baloo 2", system-ui, sans-serif';
      c.lineWidth = 6; c.strokeStyle = 'rgba(0,0,0,0.8)';
      const txt = Math.floor(f.dmg) + '%';
      c.strokeText(txt, x + 84 + shake, y + 56 + shake); c.fillStyle = dmgColor(f.dmg); c.fillText(txt, x + 84 + shake, y + 56 + shake);
    }
    // stocks
    for (let k = 0; k < f.stocks; k++) {
      c.fillStyle = col; c.beginPath(); c.arc(x + pw - 14 - k * 14, y + 16, 5, 0, TAU); c.fill();
      c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.stroke();
    }
    // digi meter / champion timer
    const bx = x + 84, bw = pw - 94, by = y + 66, bh = 12;
    c.fillStyle = 'rgba(255,255,255,0.15)'; roundRect(c, bx, by, bw, bh, 6); c.fill();
    let k, fill;
    if (f.form === 1) { k = f.digiT / C.DIGI_TIME; fill = '#ffd23d'; }
    else { k = f.meter / C.METER_MAX; fill = k >= 1 ? (s.frame % 20 < 10 ? '#9cf7ff' : '#ffffff') : '#3dc5ff'; }
    if (k > 0) { c.fillStyle = fill; roundRect(c, bx, by, Math.max(bh, bw * Math.min(1, k)), bh, 6); c.fill(); }
    c.font = 'bold 10px system-ui, sans-serif'; c.fillStyle = '#0d0a1a'; c.textAlign = 'center';
    let label = 'DIGI';
    if (f.form === 1) label = 'CHAMPION';
    else if (k >= 1) label = keys?.[f.i] ? `DIGIVOLVE! [${keys[f.i]}]` : 'DIGIVOLVE!';
    c.fillStyle = k >= 0.5 || f.form === 1 ? '#0d0a1a' : '#fff';
    c.fillText(label, bx + bw / 2, by + 10);
    c.restore();
  });
}

// ------------------------------------------------------------------ main draw
export function render(c, s, cam, fx, W, H, opts = {}) {
  const time = s.frame;
  c.save();
  drawBackground(c, s, cam, W, H, time);
  const sh = fx.shake;
  c.translate(W / 2 + (Math.random() - 0.5) * sh, H / 2 + (Math.random() - 0.5) * sh);
  c.scale(cam.z, cam.z);
  c.translate(-cam.x, -cam.y);
  drawStage(c, s, time);
  for (const it of s.items) drawItem(c, it, s);
  // fighters (champions drawn behind rookies so small ones stay visible)
  const order = [...s.fighters].sort((a, b) => b.form - a.form);
  for (const f of order) drawFighter(c, f, s, fx, opts.noTags);
  for (const f of s.fighters) drawHitFx(c, f, s);
  for (const p of s.projs) drawProjectile(c, p, s);
  // particles
  for (const p of fx.parts) {
    c.globalAlpha = Math.max(0, p.life / p.max);
    c.fillStyle = p.col; c.beginPath(); c.arc(p.x, p.y, p.size * (0.4 + 0.6 * p.life / p.max), 0, TAU); c.fill();
  }
  c.globalAlpha = 1;
  for (const r of fx.rings) {
    c.globalAlpha = Math.max(0, r.life / r.max); c.strokeStyle = r.col; c.lineWidth = r.w;
    c.beginPath(); c.arc(r.x, r.y, r.r, 0, TAU); c.stroke();
  }
  c.globalAlpha = 1;
  c.textAlign = 'center';
  for (const t of fx.texts) {
    c.globalAlpha = Math.min(1, t.life / 15);
    c.font = `900 ${t.size}px "Baloo 2", system-ui, sans-serif`;
    c.lineWidth = 5; c.strokeStyle = 'rgba(0,0,0,0.7)'; c.strokeText(t.txt, t.x, t.y); c.fillStyle = t.col; c.fillText(t.txt, t.x, t.y);
  }
  c.globalAlpha = 1;
  if (opts.debug) {
    for (const f of s.fighters) {
      const fm = form(f); c.strokeStyle = 'yellow'; c.lineWidth = 1; c.strokeRect(f.x - fm.w / 2, f.y - fm.h, fm.w, fm.h);
      for (const h of activeHits(f)) { c.strokeStyle = 'red'; c.beginPath(); c.arc(h.x, h.y, h.r, 0, TAU); c.stroke(); }
    }
  }
  c.restore();

  // off-screen indicators
  for (const f of s.fighters) {
    if (f.state === 'dead' || f.state === 'out') continue;
    const sx = (f.x - cam.x) * cam.z + W / 2, sy = (f.y - form(f).h / 2 - cam.y) * cam.z + H / 2;
    if (sx < 0 || sx > W || sy < 0 || sy > H) {
      const cx = Math.max(36, Math.min(W - 36, sx)), cy = Math.max(36, Math.min(H - 140, sy));
      c.fillStyle = 'rgba(0,0,0,0.6)'; c.beginPath(); c.arc(cx, cy, 30, 0, TAU); c.fill();
      c.strokeStyle = PCOLORS[f.i]; c.lineWidth = 3; c.stroke();
      c.save(); c.beginPath(); c.arc(cx, cy, 27, 0, TAU); c.clip();
      c.drawImage(portrait(form(f).sprite), cx - 34, cy - 34, 68, 68); c.restore();
    }
  }
  if (fx.flash > 0) { c.fillStyle = `rgba(255,255,255,${fx.flash / 14})`; c.fillRect(0, 0, W, H); }
  if (opts.noHud) return;
  drawHUD(c, s, W, H, opts.digiKeys, fx);
  if (fx.banner) {
    const b = fx.banner;
    c.save(); c.textAlign = 'center';
    const sz = Math.min(W, H) * 0.16 * (b.pop ? 1 + Math.max(0, b.pop) * 0.03 : 1);
    c.font = `italic 900 ${sz}px "Baloo 2", system-ui, sans-serif`;
    c.lineWidth = sz * 0.12; c.strokeStyle = '#1b0f33'; c.strokeText(b.text, W / 2, H * 0.45);
    c.fillStyle = b.col || '#ffd23d'; c.fillText(b.text, W / 2, H * 0.45);
    if (b.sub) { c.font = `900 ${sz * 0.3}px "Baloo 2", system-ui, sans-serif`; c.lineWidth = 6; c.strokeText(b.sub, W / 2, H * 0.45 + sz * 0.45); c.fillStyle = '#fff'; c.fillText(b.sub, W / 2, H * 0.45 + sz * 0.45); }
    c.restore();
  }
}
