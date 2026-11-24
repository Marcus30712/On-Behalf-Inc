import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, serialize, deserialize } from '../sim/state.js';
import { CLIENTS } from '../world/clients.js';

test('new game has 8 agents, 1 lead, 1 QA from both nations, two clients, opening at day 0 09:00', () => {
  const s = newGame(3);
  assert.equal(s.version, 1);
  assert.equal(s.seed, 3);
  assert.equal(typeof s.rngState, 'number');
  assert.equal(s.day, 0);
  assert.equal(s.minute, 540);
  assert.equal(s.cash, 20000);
  assert.equal(s.gameOver, null);

  const ids = s.people.map((p) => p.id);
  assert.deepEqual(ids, ['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9']);
  const roles = s.people.map((p) => p.role);
  assert.deepEqual(roles, [...Array(8).fill('agent'), 'lead', 'qa']);
  const nations = s.people.map((p) => p.nation);
  assert.equal(nations.filter((n) => n === 'veltora').length, 5);
  assert.equal(nations.filter((n) => n === 'kamuen').length, 5);

  const start = CLIENTS.filter((c) => c.start).map((c) => c.id);
  assert.equal(start.length, 2);
  assert.deepEqual(s.clients, start.map((id) => ({ id, satisfaction: 70, active: true })));

  // Every agent answers the phone; each client gets two early and two late agents.
  for (const id of start) {
    const agents = s.people.filter((p) => s.assignment[p.id]?.kind === 'phone' && s.assignment[p.id].clientId === id);
    assert.equal(agents.length, 4);
    assert.deepEqual(agents.map((p) => s.roster[p.id][0]).sort(), ['early', 'early', 'late', 'late']);
  }
  assert.deepEqual(s.assignment.p8, { kind: 'coaching' });
  assert.deepEqual(s.assignment.p9, { kind: 'qa' });
  assert.equal(Object.keys(s.roster).length, 10);

  assert.deepEqual(s.research, { done: [], current: null, points: 0, build: null });
  assert.deepEqual(s.progress, { coaching: 0, qa: 0, research: 0, training: 0 });
  assert.deepEqual(s.today, { clients: {} });
  for (const key of ['inbox', 'history', 'milestones', 'absences', 'spikes', 'leaving', 'churn', 'offered']) {
    assert.deepEqual(s[key], [], key);
  }
  assert.deepEqual(s.mods, {});
  assert.deepEqual(s.flags, {});
  assert.equal(s.hiring, null);
  assert.equal(s.nextId, 1);
  assert.equal(s.offerStreak, 0);
  assert.equal(s.reputationPenalty, 0);
  assert.equal(s.lastEndedDay, null);
});

test('same seed gives the same new game; another seed differs', () => {
  assert.equal(serialize(newGame(5)), serialize(newGame(5)));
  assert.notEqual(serialize(newGame(5)), serialize(newGame(6)));
});

test('serialize and deserialize a fresh game', () => {
  const s = newGame(9);
  assert.deepEqual(deserialize(serialize(s)), s);
});

test('a v1.0 save without the v1.1 fields still loads', () => {
  const old = JSON.parse(serialize(newGame(3)));
  delete old.rankSStreak;
  for (const p of old.people) delete p.history.wear;
  const s = deserialize(JSON.stringify(old));
  assert.ok(s);
  assert.equal(s.rankSStreak, undefined);
});

test('broken or old saves load as null', () => {
  const good = JSON.parse(serialize(newGame(1)));
  const without = (key) => {
    const copy = structuredClone(good);
    delete copy[key];
    return JSON.stringify(copy);
  };
  const cases = {
    'bad json': '{',
    empty: '',
    'json null': 'null',
    'json array': '[]',
    'version 0': JSON.stringify({ ...good, version: 0 }),
    'version 2': JSON.stringify({ ...good, version: 2 }),
    'no people': without('people'),
    'no research': without('research'),
    'no hiring': without('hiring'),
    'people not a list': JSON.stringify({ ...good, people: {} }),
    'unknown client': JSON.stringify({ ...good, clients: [{ id: 'nope', satisfaction: 70, active: true }] }),
    'unknown research done': JSON.stringify({ ...good, research: { ...good.research, done: ['nope'] } }),
    'unknown research current': JSON.stringify({ ...good, research: { ...good.research, current: 'nope' } }),
    'unknown build': JSON.stringify({ ...good, research: { ...good.research, build: { researchId: 'nope', minutesLeft: 5 } } }),
    'no pending minutes': without('pendingMinutes'),
    'person not an object': JSON.stringify({ ...good, people: [...good.people.slice(1), null] }),
    'person without id': JSON.stringify({ ...good, people: good.people.map((p, i) => (i === 0 ? { ...p, id: 7 } : p)) }),
    'person with unknown role': JSON.stringify({ ...good, people: good.people.map((p, i) => (i === 0 ? { ...p, role: 'boss' } : p)) }),
    'person without health': JSON.stringify({ ...good, people: good.people.map((p, i) => (i === 0 ? { ...p, health: null } : p)) }),
    'person with bad health': JSON.stringify({ ...good, people: good.people.map((p, i) => (i === 0 ? { ...p, health: { kind: 3 } } : p)) }),
  };
  for (const [name, text] of Object.entries(cases)) {
    assert.equal(deserialize(text), null, name);
  }
  assert.equal(deserialize(undefined), null);
});

test('nobody in a new game shares a name with a colleague', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const names = newGame(seed).people.map((p) => p.name);
    assert.equal(new Set(names).size, names.length, `seed ${seed}: ${names.join(', ')}`);
  }
});
