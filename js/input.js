// Keyboard + gamepad input mapped to button bitmasks per player slot.
import { BTN } from './engine.js';

// e.code → button, per layout
export const LAYOUTS = {
  // one player on the keyboard (online / vs CPU)
  solo: {
    KeyA: BTN.L, ArrowLeft: BTN.L, KeyD: BTN.R, ArrowRight: BTN.R,
    KeyW: BTN.U, ArrowUp: BTN.U, KeyS: BTN.D, ArrowDown: BTN.D,
    Space: BTN.J, KeyJ: BTN.A, KeyZ: BTN.A, KeyK: BTN.S, KeyX: BTN.S,
    KeyL: BTN.SH, KeyC: BTN.SH, ShiftLeft: BTN.SH, ShiftRight: BTN.SH, KeyI: BTN.DG, KeyV: BTN.DG,
  },
  // two players sharing one keyboard
  p1: {
    KeyA: BTN.L, KeyD: BTN.R, KeyW: BTN.U, KeyS: BTN.D, Space: BTN.J,
    KeyF: BTN.A, KeyG: BTN.S, KeyH: BTN.SH, KeyT: BTN.DG,
  },
  p2: {
    ArrowLeft: BTN.L, ArrowRight: BTN.R, ArrowUp: BTN.U, ArrowDown: BTN.D,
    Period: BTN.A, Numpad1: BTN.A, Slash: BTN.S, Numpad2: BTN.S,
    ShiftRight: BTN.SH, Numpad3: BTN.SH, Enter: BTN.DG, Numpad0: BTN.DG,
  },
};
export const DIGI_KEY_LABEL = { solo: 'I', p1: 'T', p2: 'Enter' };

export class Input {
  constructor() {
    this.down = new Set();
    this.slots = []; // [{layout, pad}]
    this.pending = []; // pressed bits accumulated since last poll, per slot
    this.padPrev = [];
    this.enabled = false;
    addEventListener('keydown', (e) => {
      if (!this.enabled || e.repeat) { if (this.enabled && this.isGameKey(e.code)) e.preventDefault(); return; }
      if (this.isGameKey(e.code)) e.preventDefault();
      this.down.add(e.code);
      this.slots.forEach((sl, i) => { const b = LAYOUTS[sl.layout]?.[e.code]; if (b) this.pending[i] |= b; });
    });
    addEventListener('keyup', (e) => this.down.delete(e.code));
    addEventListener('blur', () => this.down.clear());
  }
  isGameKey(code) { return this.slots.some((sl) => LAYOUTS[sl.layout]?.[code]); }
  // slots: e.g. [{layout:'p1', pad:0}, {layout:'p2', pad:1}]
  setSlots(slots) { this.slots = slots; this.pending = slots.map(() => 0); this.padPrev = slots.map(() => 0); this.down.clear(); }

  padBits(idx) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads && pads[idx];
    if (!gp) return 0;
    const b = (k) => gp.buttons[k] && gp.buttons[k].pressed;
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    let m = 0;
    if (ax < -0.45 || b(14)) m |= BTN.L;
    if (ax > 0.45 || b(15)) m |= BTN.R;
    if (ay < -0.6 || b(12)) m |= BTN.U;
    if (ay > 0.6 || b(13)) m |= BTN.D;
    if (b(0)) m |= BTN.A;           // A / Cross: attack
    if (b(1)) m |= BTN.S;           // B / Circle: special
    if (b(2) || b(3)) m |= BTN.J;   // X / Y: jump
    if (b(5) || b(6) || b(7)) m |= BTN.SH; // RB / triggers: shield
    if (b(4) || b(11)) m |= BTN.DG; // LB / R3: digivolve
    // right stick → smash attack in that direction (like a C-stick)
    const rx = gp.axes[2] || 0, ry = gp.axes[3] || 0;
    if (Math.abs(rx) > 0.6 || Math.abs(ry) > 0.6) {
      m |= BTN.A;
      if (Math.abs(rx) > Math.abs(ry)) { m &= ~(BTN.L | BTN.R | BTN.U | BTN.D); m |= rx < 0 ? BTN.L : BTN.R; }
      else { m &= ~(BTN.L | BTN.R | BTN.U | BTN.D); m |= ry < 0 ? BTN.U : BTN.D; }
    }
    return m;
  }

  // Returns {held, pressed} for a slot and clears its pressed buffer.
  poll(i) {
    const sl = this.slots[i];
    if (!sl) return { held: 0, pressed: 0 };
    let held = 0;
    const map = LAYOUTS[sl.layout] || {};
    for (const code of this.down) if (map[code]) held |= map[code];
    let pressed = this.pending[i];
    this.pending[i] = 0;
    if (sl.pad !== undefined && sl.pad !== null) {
      const pb = this.padBits(sl.pad);
      pressed |= pb & ~this.padPrev[i];
      this.padPrev[i] = pb;
      held |= pb;
    }
    // opposite directions cancel
    if ((held & BTN.L) && (held & BTN.R)) held &= ~(BTN.L | BTN.R);
    return { held, pressed };
  }
}
