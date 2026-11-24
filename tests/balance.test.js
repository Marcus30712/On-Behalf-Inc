import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runPolicy, wornDown } from '../tools/autoplay.js';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const SL_TARGET = 0.8; // both starting clients aim for 80%

// "Worn down" (tools/autoplay.js wornDown): a game over, or two or more
// burnouts. The same rule is applied to sensible play below, which must
// mostly stay clear of it, so this test cannot pass for any policy.
test('doing nothing wears people down within a few months', () => {
  const runs = SEEDS.map((seed) => runPolicy({ seed, days: 180, policy: 'idle' }));
  const worn = runs.filter((r) => wornDown(r));
  assert.ok(worn.length >= 8, `worn down on ${worn.length}/10 seeds`);
  // Not a collapse: every idle game reaches its first month end.
  for (const r of runs) assert.ok(r.survivedDays >= 30, `idle game over on day ${r.survivedDays}`);
});

test('sensible play survives a year', () => {
  const runs = SEEDS.map((seed) => runPolicy({ seed, days: 360, policy: 'sensible' }));
  const ok = runs.filter((r) => !r.gameOver && r.avgSL >= 0.9 * SL_TARGET);
  assert.ok(ok.length >= 8, `survived on ${ok.length}/10 seeds: ${runs.map((r) => r.avgSL.toFixed(2)).join(' ')}`);
  // Taking care works: by the same rule as the idle test, at most 2 seeds
  // are worn down in the first 180 days.
  const worn = runs.filter((r) => wornDown(r, 180));
  assert.ok(worn.length <= 2, `sensible play worn down on ${worn.length}/10 seeds`);
  // The fee cut is a penalty, not the normal state.
  const full = runs.reduce((s, r) => s + r.feeMonths.full, 0);
  const total = runs.reduce((s, r) => s + r.feeMonths.total, 0);
  assert.ok(full / total >= 0.7, `full fee in ${full}/${total} client-months`);
  // Money: still positive after twelve month ends, and grown on average.
  const cash = runs.map((r) => r.monthCash[11]);
  assert.ok(cash.every((c) => c > 0), `cash after 12 months: ${cash.join(' ')}`);
  assert.ok(cash.reduce((s, c) => s + c, 0) / cash.length > 20000, `cash after 12 months: ${cash.join(' ')}`);
  // The core moment: a finished research helps someone who is worn or ill.
  const helped = runs.reduce((s, r) => s + r.helped, 0) / runs.length;
  assert.ok(helped >= 1, `research helped ${helped} times per seed`);
});
