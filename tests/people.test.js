import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../sim/rng.js';
import { TRAITS } from '../world/traits.js';
import { NAMES } from '../world/names.js';
import { createPerson, ahtFor, applyWork, applyRest, overnight, moraleOf } from '../sim/people.js';

const client = { ahtMin: 6 };
const make = (seed, over = {}) => createPerson(createRng(seed), { id: 'p1', role: 'agent', nation: 'veltora', ...over });
const bare = (over = {}) => ({
  role: 'agent', traits: [], skills: { handling: 5, systems: 5, coaching: 0, evaluation: 0 },
  fatigue: 10, stress: 15, morale: 70, health: { kind: 'well', daysLeft: 0 },
  probationDays: 0, history: { highStressDays: 0 }, ...over,
});

test('nation does not change traits or skills', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const a = createPerson(createRng(seed), { id: 'x', role: 'agent', nation: 'veltora' });
    const b = createPerson(createRng(seed), { id: 'x', role: 'agent', nation: 'kamuen' });
    assert.deepEqual(a.traits, b.traits);
    assert.deepEqual(a.skills, b.skills);
    assert.ok(NAMES.veltora.includes(a.name));
    assert.ok(NAMES.kamuen.includes(b.name));
    assert.notEqual(a.name, b.name);
  }
});

test('nation does not shift the rng sequence for later draws', () => {
  const r1 = createRng(9); const r2 = createRng(9);
  createPerson(r1, { id: 'x', role: 'lead', nation: 'veltora' });
  createPerson(r2, { id: 'x', role: 'lead', nation: 'kamuen' });
  assert.equal(r1.state(), r2.state());
});

test('created people have valid starting values', () => {
  const ranges = {
    agent: { handling: [2, 7], systems: [2, 7], coaching: [0, 3], evaluation: [0, 3] },
    lead: { handling: [4, 8], systems: [4, 8], coaching: [5, 8], evaluation: [3, 6] },
    qa: { handling: [4, 8], systems: [4, 8], coaching: [2, 5], evaluation: [5, 8] },
  };
  const ids = TRAITS.map((t) => t.id);
  for (const role of Object.keys(ranges)) {
    for (let seed = 1; seed <= 50; seed++) {
      const p = createPerson(createRng(seed), { id: 'x', role, nation: 'kamuen' });
      assert.ok(p.traits.length >= 1 && p.traits.length <= 2);
      assert.equal(new Set(p.traits).size, p.traits.length);
      for (const t of p.traits) assert.ok(ids.includes(t));
      for (const [k, [lo, hi]] of Object.entries(ranges[role])) {
        assert.ok(p.skills[k] >= lo && p.skills[k] <= hi, `${role} ${k} ${p.skills[k]}`);
        assert.equal(p.skills[k], Math.round(p.skills[k] * 10) / 10);
      }
      assert.equal(p.fatigue, 10);
      assert.equal(p.stress, 15);
      assert.equal(p.morale, moraleOf(p));
      assert.deepEqual(p.health, { kind: 'well', daysLeft: 0 });
      assert.equal(p.probationDays, 0);
      assert.deepEqual(p.history, { highStressDays: 0 });
    }
  }
});

test('same seed gives the same person', () => {
  assert.deepEqual(make(5), make(5));
});

test('skilled people handle faster', () => {
  const fast = bare({ skills: { handling: 9, systems: 5, coaching: 0, evaluation: 0 } });
  const slow = bare({ skills: { handling: 2, systems: 5, coaching: 0, evaluation: 0 } });
  assert.ok(ahtFor(fast, client) < ahtFor(slow, client));
});

test('ahtFor follows the formula, with trait multipliers', () => {
  const p = bare({ fatigue: 0 });
  assert.ok(Math.abs(ahtFor(p, client) - 6 * (1.3 - 0.15 - 0.1)) < 1e-9);
  const hasty = bare({ fatigue: 0, traits: ['hasty', 'keyboard-whiz'] });
  assert.ok(Math.abs(ahtFor(hasty, client) - 6 * 1.05 * 0.81) < 1e-9);
  const tired = bare({ fatigue: 20 });
  assert.ok(Math.abs(ahtFor(tired, client) - 6 * 1.05 * 1.1) < 1e-9);
});

test('probation is slower', () => {
  const a = bare();
  const b = bare({ probationDays: 5 });
  assert.ok(Math.abs(ahtFor(b, client) - ahtFor(a, client) * 1.25) < 1e-9);
});

test('busy work raises stress more than quiet work', () => {
  const busy = bare(); const quiet = bare();
  applyWork(busy, { minutes: 240, occupancy: 0.95 });
  applyWork(quiet, { minutes: 240, occupancy: 0.5 });
  assert.ok(busy.stress - quiet.stress > 0);
  assert.ok(busy.fatigue > quiet.fatigue);
  assert.equal(busy.morale, moraleOf(busy));
});

test('applyWork matches the formula', () => {
  const p = bare();
  applyWork(p, { minutes: 30, occupancy: 1 });
  assert.ok(Math.abs(p.fatigue - (10 + 4)) < 1e-9);
  assert.ok(Math.abs(p.stress - (15 + 1.45 + 1.6 + 2)) < 1e-9); // base + occupancy + overload
});

test('values stay within 0-100', () => {
  const p = bare();
  for (let i = 0; i < 100; i++) applyWork(p, { minutes: 30, occupancy: 1 });
  assert.ok(p.fatigue <= 100 && p.stress <= 100);
  assert.ok(p.morale >= 0 && p.morale <= 100);
  for (let i = 0; i < 400; i++) applyRest(p, { minutes: 30 });
  assert.ok(p.fatigue >= 0 && p.stress >= 0);
  p.fatigue = 5; p.stress = 3;
  overnight(p);
  assert.equal(p.fatigue, 0);
  assert.equal(p.stress, 0);
  assert.ok(p.morale >= 0 && p.morale <= 100);
});

test('rest and overnight recover', () => {
  const p = bare({ fatigue: 50, stress: 50 });
  applyRest(p, { minutes: 60 });
  assert.ok(Math.abs(p.fatigue - 46) < 1e-9);
  assert.ok(Math.abs(p.stress - 48) < 1e-9);
  applyRest(p, { minutes: 30, mods: { restRecoveryMul: 2 } });
  assert.ok(Math.abs(p.fatigue - 42) < 1e-9);
  overnight(p);
  assert.ok(Math.abs(p.fatigue - 2) < 1e-9);
  assert.ok(Math.abs(p.stress - (46 - 4 - 0.12 * 46)) < 1e-9);
});

test('steel-nerves trait lowers stress gain', () => {
  const steady = bare({ traits: ['steel-nerves'] });
  const plain = bare();
  applyWork(steady, { minutes: 240, occupancy: 0.95 });
  applyWork(plain, { minutes: 240, occupancy: 0.95 });
  assert.ok(steady.stress < plain.stress);
});

test('facility mods multiply with trait multipliers', () => {
  const a = bare({ traits: ['steel-nerves'] }); const b = bare({ traits: ['steel-nerves'] });
  applyWork(a, { minutes: 30, occupancy: 1 });
  applyWork(b, { minutes: 30, occupancy: 1, mods: { stressGainMul: 0.5, fatigueGainMul: 0.5 } });
  assert.ok(Math.abs((b.stress - 15) - (a.stress - 15) * 0.5) < 1e-9);
  assert.ok(Math.abs((b.fatigue - 10) - (a.fatigue - 10) * 0.5) < 1e-9);
});

test('moraleOf uses moraleBoost', () => {
  const p = bare({ fatigue: 20, stress: 10 });
  assert.ok(Math.abs(moraleOf(p) - (100 - 8 - 6)) < 1e-9);
  p.moraleBoost = 10;
  assert.ok(Math.abs(moraleOf(p) - 96) < 1e-9);
  p.moraleBoost = 50;
  assert.equal(moraleOf(p), 100);
});
