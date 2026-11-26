import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../sim/rng.js';
import { newGame } from '../sim/state.js';
import { TRAITS } from '../world/traits.js';
import { NAMES } from '../world/names.js';
import {
  createPerson, ahtFor, applyWork, applyRest, overnight, moraleOf, wearDay, WEAR, planningOf,
} from '../sim/people.js';

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
  assert.ok(Math.abs(p.stress - (15 + 1.55 + 1.6 + 2)) < 1e-9); // base + occupancy + overload
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

test('long-term wear builds on strained workdays, eases on others and costs morale', () => {
  const p = bare({ fatigue: 20, stress: 10 });
  p.history = { highStressDays: 0 }; // as in a v1.0 save: no wear yet
  assert.ok(Math.abs(moraleOf(p) - 86) < 1e-9);
  for (let i = 0; i < 5; i++) wearDay(p, true);
  assert.equal(p.history.wear, 5);
  assert.ok(Math.abs(p.morale - 81) < 1e-9, 'each point of wear costs a point of morale');
  wearDay(p, false);
  assert.equal(p.history.wear, 5 - WEAR.recover);
  for (let i = 0; i < 100; i++) wearDay(p, true);
  assert.equal(p.history.wear, WEAR.max);
  for (let i = 0; i < 100; i++) wearDay(p, false);
  assert.equal(p.history.wear, 0);
  assert.ok(Math.abs(p.morale - 86) < 1e-9);
});

// v1.6: 스케줄링 (planning) comes from the person's id, never from the rng.
const PLANNING = { agent: [0, 3], lead: [3, 8], qa: [1, 4] };

test('planning is in the role range, one decimal, and spread over it', () => {
  for (const [role, [lo, hi]] of Object.entries(PLANNING)) {
    const values = [];
    for (let i = 0; i < 200; i++) {
      for (const id of [`p${i}`, `h${i}`]) {
        const v = planningOf({ id, name: `${id}-name`, role, skills: { handling: 5, systems: 5, coaching: 0, evaluation: 0 } });
        assert.ok(v >= lo && v <= hi, `${role} ${id} ${v}`);
        assert.equal(v, Math.round(v * 10) / 10);
        values.push(v);
      }
    }
    assert.ok(Math.min(...values) <= lo + 0.3, `${role} min ${Math.min(...values)}`);
    assert.ok(Math.max(...values) >= hi - 0.3, `${role} max ${Math.max(...values)}`);
    assert.ok(new Set(values).size >= (hi - lo) * 10 * 0.8, `${role} distinct ${new Set(values).size}`);
  }
  // Same id, same value; a stored value wins.
  // Same id and name, same value; a stored value wins.
  const lead = { id: 'p8', name: 'Mira', role: 'lead', skills: {} };
  assert.equal(planningOf(lead), planningOf({ ...lead }));
  assert.equal(planningOf({ ...lead, skills: { planning: 7.5 } }), 7.5);
});

test('the lead\'s planning differs between games (ruling: from id and name)', () => {
  const values = [1, 2, 3, 42, 999].map((seed) => planningOf(newGame(seed).people.find((p) => p.role === 'lead')));
  assert.ok(new Set(values).size >= 3, `lead planning by seed: ${values.join(', ')}`);
});

test('a person loaded from a v1.5 save gets the planning a new game gives them', () => {
  // A v1.5 save holds the person with id and name but no skills.planning;
  // loading must give the value the live person has.
  for (const seed of [1, 2, 3]) {
    for (const p of newGame(seed).people) {
      const saved = JSON.parse(JSON.stringify(p));
      delete saved.skills.planning;
      assert.equal(planningOf(saved), planningOf(p), `${seed} ${p.id}`);
    }
  }
});

test('planning draws nothing: createPerson keeps its v1.5 draw order', () => {
  // Replay of the documented draws: trait count, trait 1, trait 2, four skills, name.
  for (const role of Object.keys(PLANNING)) {
    for (let seed = 1; seed <= 20; seed++) {
      const r = createRng(seed);
      createPerson(r, { id: 'x', role, nation: 'veltora' });
      const replay = createRng(seed);
      for (let i = 0; i < 3 + 4 + 1; i++) replay.next();
      assert.equal(r.state(), replay.state(), `${role} ${seed}`);
    }
  }
});
