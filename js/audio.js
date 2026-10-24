// Tiny WebAudio synth for sound effects; no audio files needed.
let ctx = null, master = null, muted = false;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.35; master.connect(ctx.destination);
  } catch { ctx = null; }
}
export function toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.35; return muted; }

function tone(freq, dur, type = 'square', vol = 0.3, slide = 0, delay = 0) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol = 0.3, freq = 1200, delay = 0) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + delay;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let k = 0; k < len; k++) d[k] = (Math.random() * 2 - 1) * (1 - k / len);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
  const g = ctx.createGain(); g.gain.value = vol;
  src.connect(f); f.connect(g); g.connect(master); src.start(t);
}

export function playEvents(events) {
  if (!ctx) return;
  for (const e of events) {
    switch (e.k) {
      case 'hit': {
        const p = Math.min(1, e.kb / 30);
        noise(0.08 + p * 0.2, 0.25 + p * 0.3, 800 + p * 2500);
        tone(180 - p * 80, 0.1 + p * 0.15, 'square', 0.2, 0.5);
        if (e.fx === 'ice') tone(1400, 0.15, 'triangle', 0.12, 1.5);
        if (e.fx === 'holy') tone(880, 0.25, 'sine', 0.15, 1.5);
        break;
      }
      case 'block': tone(600, 0.06, 'triangle', 0.15); break;
      case 'jump': tone(300, 0.12, 'square', 0.08, 2); break;
      case 'djump': tone(420, 0.12, 'square', 0.08, 2); break;
      case 'shoot':
        if (e.fx === 'fire' || e.fx === 'pyro') noise(0.25, 0.2, 900);
        else if (e.fx === 'ice') tone(1200, 0.2, 'sawtooth', 0.08, 0.5);
        else if (e.fx === 'bubble') tone(500, 0.15, 'sine', 0.2, 2);
        else tone(700, 0.3, 'sawtooth', 0.12, 1.5);
        break;
      case 'ko': noise(0.9, 0.5, 3000); tone(90, 0.8, 'sawtooth', 0.3, 0.3); break;
      case 'digi': [523, 659, 784, 1047, 1319].forEach((f, k) => tone(f, 0.25, 'square', 0.1, 1, k * 0.09)); break;
      case 'digidone': tone(130, 0.5, 'sawtooth', 0.25, 2); noise(0.4, 0.3, 2000); break;
      case 'dedigi': [784, 659, 523].forEach((f, k) => tone(f, 0.15, 'triangle', 0.1, 1, k * 0.08)); break;
      case 'pickup': tone(880, 0.08, 'square', 0.1); tone(1320, 0.12, 'square', 0.1, 1, 0.07); break;
      case 'break': tone(300, 0.6, 'sawtooth', 0.2, 0.3); noise(0.3, 0.3, 4000); break;
      case 'quake': noise(0.35, 0.4, 300); break;
      case 'counter': tone(1500, 0.2, 'triangle', 0.15, 0.6); break;
      case 'ledge': tone(250, 0.05, 'triangle', 0.08); break;
      case 'grab': tone(220, 0.08, 'square', 0.1); break;
      case 'charge': tone(400 + Math.random() * 200, 0.05, 'triangle', 0.04); break;
      case 'clash': tone(1000, 0.1, 'square', 0.1, 0.5); break;
    }
  }
}

export function beep(kind) {
  if (!ctx) return;
  if (kind === 'count') tone(440, 0.15, 'square', 0.15);
  if (kind === 'go') tone(880, 0.4, 'square', 0.18);
  if (kind === 'select') tone(660, 0.06, 'square', 0.08);
  if (kind === 'game') [784, 659, 523, 392].forEach((f, k) => tone(f, 0.3, 'square', 0.15, 1, k * 0.15));
}
