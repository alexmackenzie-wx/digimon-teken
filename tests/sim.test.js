// Headless smoke tests: CPU vs CPU matches on every stage/character must run
// without throwing, keep the state JSON-serialisable and eventually finish.
import test from 'node:test';
import assert from 'node:assert';
import { createGame, step } from '../js/engine.js';
import { makeCpu, cpuInput } from '../js/ai.js';
import { CHAR_ORDER, STAGE_ORDER } from '../js/data.js';

function seeded(seed) {
  return () => { seed = (Math.imul(seed, 48271) + 1) >>> 0; return seed / 4294967296; };
}

for (const stage of STAGE_ORDER) {
  for (let k = 0; k < CHAR_ORDER.length; k++) {
    const a = CHAR_ORDER[k], b = CHAR_ORDER[(k + 1) % CHAR_ORDER.length];
    test(`${a} vs ${b} on ${stage}`, () => {
      const s = createGame({ stage, players: [{ char: a, cpu: true }, { char: b, cpu: true }], stocks: 2, seed: k + 1 });
      const cpus = [makeCpu(3), makeCpu(3)];
      cpus.forEach((c, i) => (c.rnd = seeded(100 + i + k)));
      const seen = new Set();
      let frames = 0;
      while (!s.over && frames < 60 * 60 * 6) {
        step(s, cpus.map((c, i) => cpuInput(s, i, c)));
        for (const f of s.fighters) {
          seen.add(f.state);
          assert.ok(Number.isFinite(f.x) && Number.isFinite(f.y), `bad position ${f.state}`);
        }
        frames++;
      }
      JSON.parse(JSON.stringify(s));
      console.log(`  ${a} vs ${b} @${stage}: ${s.over ? 'winner P' + (s.winner + 1) : 'timeout'} after ${(frames / 60).toFixed(0)}s; states: ${[...seen].join(',')}`);
      assert.ok(s.over, 'match should finish');
    });
  }
}
