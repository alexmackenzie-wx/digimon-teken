// Simple CPU opponent. Produces the same {held, pressed} input a human would.
import { BTN, form, C } from './engine.js';
import { STAGES } from './data.js';

export function makeCpu(level = 2) {
  return { level, held: 0, prev: 0, wait: 0, plan: 0, planT: 0, target: -1, rnd: Math.random };
}

export function cpuInput(s, i, cpu) {
  const f = s.fighters[i];
  const stage = STAGES[s.stageId];
  let held = 0;
  const r = cpu.rnd;
  const react = [0.5, 0.25, 0.12, 0.05][cpu.level] ?? 0.12; // chance to "miss" a decision each frame

  if (['dead', 'out', 'grabbed', 'digivolving'].includes(f.state) || s.over) return out(cpu, 0);

  // pick nearest living opponent
  let tgt = null, best = 1e9;
  for (const o of s.fighters) {
    if (o === f || ['dead', 'out'].includes(o.state)) continue;
    const d = Math.abs(o.x - f.x) + Math.abs(o.y - f.y);
    if (d < best) { best = d; tgt = o; }
  }
  const main = stage.solids[0];
  const offstage = f.x < main.x1 - 5 || f.x > main.x2 + 5 || f.y > 2;

  // ---- recovery
  if (offstage && !f.ground && !['hitstun', 'ledge', 'climb', 'respawn'].includes(f.state)) {
    const edgeX = f.x < 0 ? main.x1 : main.x2;
    held |= f.x < edgeX ? BTN.R : BTN.L;
    if (f.x > main.x1 && f.x < main.x2) held &= ~(BTN.L | BTN.R);
    const below = f.y > main.y1 - 20;
    if (f.vy > 0 && below && f.jumps > 0 && cpu.planT <= 0) { held |= BTN.J; cpu.planT = 12; }
    else if (f.vy > 1 && f.y > main.y1 + 30 && f.jumps === 0 && !f.upUsed && f.state === 'air') held |= BTN.U | BTN.S;
    cpu.planT--;
    return out(cpu, held);
  }
  if (f.state === 'ledge') {
    if (f.t > 15 + r() * 30) held |= [BTN.J, BTN.A, f.face > 0 ? BTN.R : BTN.L][Math.floor(r() * 3)];
    return out(cpu, held);
  }
  if (f.state === 'respawn') return out(cpu, f.t > 40 ? BTN.D : 0);
  if (f.state === 'grabbing') return out(cpu, [BTN.U, BTN.D, BTN.L, BTN.R][Math.floor(r() * 4)]);
  if (f.state === 'hitstun') return out(cpu, (f.x < 0 ? BTN.R : BTN.L) | (r() < 0.2 ? BTN.SH : 0));
  if (!tgt) return out(cpu, 0);

  if (r() < react) return out(cpu, cpu.held & ~(BTN.A | BTN.S | BTN.J | BTN.SH));

  const dx = tgt.x - f.x, dy = tgt.y - f.y;
  const adx = Math.abs(dx);
  const reach = form(f).w * 0.5 + form(tgt).w * 0.5 + 28 * form(f).scale;
  const toward = dx > 0 ? BTN.R : BTN.L;

  // digivolve when ready
  if (f.meter >= C.METER_MAX && f.form === 0 && adx > 120 && r() < 0.1) return out(cpu, BTN.DG);

  // shield incoming attacks sometimes
  const tgtAttacking = tgt.state === 'attack' && adx < reach + 40 && Math.abs(dy) < 80;
  if (f.ground && tgtAttacking && r() < 0.06 * cpu.level) cpu.plan = 'shield', cpu.planT = 14;
  if (cpu.plan === 'shield' && cpu.planT-- > 0) {
    held = BTN.SH;
    if (r() < 0.05) held |= BTN.A;
    return out(cpu, held);
  }
  cpu.plan = 0;

  if (f.state === 'attack' || f.state === 'landing' || f.state === 'jumpsquat') {
    // keep holding attack to charge sometimes
    return out(cpu, cpu.held & BTN.A && r() < 0.8 ? cpu.held : 0);
  }

  // drop through platforms to reach a target below
  if (f.ground && f.y < main.y1 - 20 && dy > 50 && adx < 260) return out(cpu, cpu.prev & BTN.D ? 0 : BTN.D);

  // stay on stage: don't run off edges chasing
  const safeX = (x) => x > main.x1 + 40 && x < main.x2 - 40;

  if (adx > reach) {
    if (safeX(f.x + Math.sign(dx) * 30) || !f.ground) held |= toward;
    if (adx > 260 && r() < 0.03 && f.ground) return out(cpu, held | BTN.S); // projectile/beam
    if (dy < -90 && f.ground && r() < 0.06) held |= BTN.J;
    if (!f.ground && dy > 40 && r() < 0.05) held |= BTN.D;
    if (adx < reach + 80 && r() < 0.02 && f.ground) held |= toward | BTN.S; // side special approach
  } else {
    // in range
    if (Math.abs(dy) > 70 && dy < 0 && f.ground) {
      held |= r() < 0.5 ? (BTN.U | BTN.A) : BTN.J;
    } else if (f.ground) {
      const roll = r();
      if (roll < 0.25) held |= BTN.A;
      else if (roll < 0.5) held |= toward | BTN.A;
      else if (roll < 0.6) held |= BTN.D | BTN.A;
      else if (roll < 0.68) held |= BTN.SH | BTN.A;
      else if (roll < 0.75) held |= BTN.D | BTN.S;
      else if (roll < 0.85) held |= BTN.J;
      else held |= toward;
    } else {
      const roll = r();
      if (dy < -30) held |= BTN.U | BTN.A;
      else if (dy > 30) held |= BTN.D | BTN.A;
      else if (roll < 0.5) held |= toward | BTN.A;
      else held |= BTN.A;
    }
    if (f.face !== Math.sign(dx) && f.ground && !(held & BTN.A)) held |= toward;
  }
  return out(cpu, held);
}

function out(cpu, held) {
  const pressed = held & ~cpu.prev;
  cpu.prev = held; cpu.held = held;
  return { held, pressed };
}

