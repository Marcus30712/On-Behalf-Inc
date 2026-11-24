import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng, restoreRng } from '../sim/rng.js';

test('same seed gives the same sequence', () => {
  const a = createRng(42);
  const b = createRng(42);
  const seqA = Array.from({ length: 5 }, () => a.next());
  const seqB = Array.from({ length: 5 }, () => b.next());
  assert.deepEqual(seqA, seqB);
  for (const v of seqA) assert.ok(v >= 0 && v < 1);
});

test('int stays in range', () => {
  const rng = createRng(7);
  const seen = new Set();
  for (let i = 0; i < 1000; i++) {
    const v = rng.int(3, 5);
    assert.ok(Number.isInteger(v) && v >= 3 && v <= 5);
    seen.add(v);
  }
  assert.deepEqual([...seen].sort(), [3, 4, 5]);
});

test('restore continues the sequence', () => {
  const rng = createRng(123);
  const first = Array.from({ length: 5 }, () => rng.next());
  const rng2 = createRng(123);
  for (let i = 0; i < 3; i++) rng2.next();
  const saved = rng2.state();
  const restored = restoreRng(saved);
  assert.equal(restored.next(), first[3]);
  assert.equal(restored.next(), first[4]);
});

test('pick and chance behave', () => {
  const rng = createRng(1);
  const arr = ['a', 'b', 'c'];
  for (let i = 0; i < 50; i++) assert.ok(arr.includes(rng.pick(arr)));
  assert.equal(rng.chance(0), false);
  assert.equal(rng.chance(1), true);
});
