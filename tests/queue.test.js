import { test } from 'node:test';
import assert from 'node:assert/strict';
import { intervalQueue } from '../sim/queue.js';
import { serviceLevel, trafficIntensity } from '../sim/erlang.js';

test('matches Erlang C when staffed', () => {
  const q = intervalQueue({ calls: 100, ahtMin: 4, agents: 18, targetSec: 20, patienceSec: 120 });
  const expected = serviceLevel(18, trafficIntensity(100, 4), 4, 20 / 60);
  assert.ok(Math.abs(q.serviceLevel - expected) < 5e-7);
  assert.ok(Math.abs(q.serviceLevel - 0.887664) < 5e-7);
  assert.equal(q.offered, 100);
  assert.ok(q.abandoned < q.offered * 0.05);
  assert.equal(q.handled + q.abandoned, q.offered);
});

test('queue overload', () => {
  for (const agents of [0, 5]) {
    const q = intervalQueue({ calls: 100, ahtMin: 4, agents, targetSec: 20, patienceSec: 120 });
    if (agents === 0) assert.equal(q.serviceLevel, 0);
    else assert.ok(q.serviceLevel >= 0 && q.serviceLevel < 0.2);
    assert.ok(q.abandoned > 0);
    assert.equal(q.handled + q.abandoned, q.offered);
    for (const v of Object.values(q)) assert.ok(Number.isFinite(v));
    for (const v of [q.handled, q.abandoned, q.offered]) assert.ok(Number.isInteger(v));
    assert.ok(q.occupancy >= 0 && q.occupancy <= 1);
  }
});

test('no calls', () => {
  const q = intervalQueue({ calls: 0, ahtMin: 4, agents: 8, targetSec: 20, patienceSec: 120 });
  assert.equal(q.serviceLevel, 1);
  assert.equal(q.abandoned, 0);
  assert.equal(q.occupancy, 0);
  assert.equal(q.handled, 0);
});

test('longer patience abandons less', () => {
  const run = (agents, patienceSec) => intervalQueue({ calls: 100, ahtMin: 4, agents, targetSec: 20, patienceSec });
  for (const agents of [5, 14]) {
    assert.ok(run(agents, 30).abandoned > run(agents, 120).abandoned, `agents ${agents}`);
  }
  assert.ok(run(14, 0).abandoned > run(14, 30).abandoned);
  assert.ok(run(5, 0).abandoned >= run(5, 30).abandoned);
  for (const v of Object.values(run(14, 0))) assert.ok(Number.isFinite(v));
});

test('more agents never abandon more or handle fewer', () => {
  let prev = null;
  for (let agents = 0; agents <= 25; agents += 1) {
    const q = intervalQueue({ calls: 100, ahtMin: 4, agents, targetSec: 20, patienceSec: 120 });
    assert.equal(q.handled + q.abandoned, q.offered);
    if (agents * 30 / 4 <= 100) assert.ok(q.handled <= Math.round(agents * 30 / 4), `capacity at ${agents}`);
    if (prev) {
      assert.ok(q.abandoned <= prev.abandoned, `abandoned at ${agents}`);
      assert.ok(q.handled >= prev.handled, `handled at ${agents}`);
    }
    prev = q;
  }
});

test('zero handle time is trivially served', () => {
  const q = intervalQueue({ calls: 10, ahtMin: 0, agents: 2, targetSec: 0, patienceSec: 60 });
  assert.equal(q.serviceLevel, 1);
  assert.equal(q.abandoned, 0);
});

test('staffing up always helps, even deep in overload', () => {
  let prev = null;
  for (let agents = 5; agents <= 14; agents += 1) {
    const q = intervalQueue({ calls: 100, ahtMin: 4, agents, targetSec: 20, patienceSec: 120 });
    if (prev) assert.ok(q.abandoned < prev.abandoned, `abandoned at ${agents}: ${q.abandoned} vs ${prev.abandoned}`);
    prev = q;
  }
});

test('part-time agents count in part (an agent at 60% is not nobody)', () => {
  const run = (agents) => intervalQueue({ calls: 8, ahtMin: 6, agents, targetSec: 30, patienceSec: 75 });
  const one = run(1); const part = run(1.6); const two = run(2);
  assert.ok(part.abandoned < one.abandoned, `abandoned ${part.abandoned} vs ${one.abandoned}`);
  assert.ok(part.abandoned >= two.abandoned);
  assert.ok(part.serviceLevel > one.serviceLevel && part.serviceLevel < two.serviceLevel);
  assert.equal(part.handled + part.abandoned, part.offered);
  for (const v of Object.values(part)) assert.ok(Number.isFinite(v));
});
