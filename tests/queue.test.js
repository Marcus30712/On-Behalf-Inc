import { test } from 'node:test';
import assert from 'node:assert/strict';
import { intervalQueue } from '../sim/queue.js';
import { serviceLevel, trafficIntensity } from '../sim/erlang.js';

test('matches Erlang C when staffed', () => {
  const q = intervalQueue({ calls: 100, ahtMin: 4, agents: 18, targetSec: 20, patienceSec: 120 });
  const expected = serviceLevel(18, trafficIntensity(100, 4), 4, 20 / 60);
  assert.ok(Math.abs(q.serviceLevel - expected) < 5e-7);
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
  const run = (patienceSec) => intervalQueue({ calls: 100, ahtMin: 4, agents: 5, targetSec: 20, patienceSec });
  assert.ok(run(30).abandoned > run(120).abandoned);
  const staffed = (patienceSec) => intervalQueue({ calls: 100, ahtMin: 4, agents: 15, targetSec: 20, patienceSec });
  assert.ok(staffed(30).abandoned >= staffed(120).abandoned);
});
