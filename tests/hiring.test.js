import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../sim/rng.js';
import { createPerson } from '../sim/people.js';
import { defaultRoster } from '../sim/schedule.js';
import { resolveEvent, expireEvents } from '../sim/events.js';
import { SEATS, HIRE_COST, startHiring, advanceHiring } from '../sim/hiring.js';

const GUREUM = 'gureum-travel';
const MULBIT = 'mulbit-telecom';

// `agents` agents (a0..), one lead, one QA; two clients.
function makeState({ agents = 7, cash = 10000 } = {}) {
  const rng = createRng(31);
  const people = [];
  for (let i = 0; i < agents; i++) people.push(createPerson(rng, { id: `a${i}`, role: 'agent', nation: 'veltora' }));
  people.push(createPerson(rng, { id: 'l1', role: 'lead', nation: 'veltora' }));
  people.push(createPerson(rng, { id: 'q1', role: 'qa', nation: 'kamuen' }));
  const assignment = Object.fromEntries(people.filter((p) => p.role === 'agent')
    .map((p, i) => [p.id, { kind: 'phone', clientId: i % 2 === 0 ? GUREUM : MULBIT }]));
  return {
    day: 3, minute: 1260, people, roster: defaultRoster(people), absences: [], assignment,
    clients: [GUREUM, MULBIT].map((id) => ({ id, satisfaction: 70, active: true })),
    mods: {}, progress: { coaching: 0, qa: 0, research: 0, training: 0 },
    today: { clients: {} }, spikes: [], inbox: [], history: [], leaving: [], cash,
  };
}
const day = (d, gureumMet, mulbitMet) => ({
  day: d,
  clients: {
    [GUREUM]: { intervals: 24, intervalsMet: gureumMet },
    [MULBIT]: { intervals: 24, intervalsMet: mulbitMet },
  },
});
const candidates = (state) => state.inbox.filter((e) => e.id === 'candidate');

test('cannot hire without a free seat', () => {
  assert.equal(SEATS, 8);
  const full = makeState({ agents: 8 });
  assert.equal(full.people.length, 10);
  assert.deepEqual(startHiring(full), { ok: false, reason: 'no-seat' });
  assert.equal(full.cash, 10000);

  const poor = makeState({ cash: HIRE_COST - 1 });
  assert.deepEqual(startHiring(poor), { ok: false, reason: 'no-cash' });

  const s = makeState();
  assert.deepEqual(startHiring(s), { ok: true });
  assert.equal(s.cash, 10000 - HIRE_COST);
  assert.deepEqual(startHiring(s), { ok: false, reason: 'already' });
  assert.equal(s.cash, 10000 - HIRE_COST);
});

test('a sick agent still holds a seat; one who left does not', () => {
  const s = makeState({ agents: 8 });
  s.people[0].health = { kind: 'sick', daysLeft: 3 };
  assert.equal(startHiring(s).reason, 'no-seat');
  s.people = s.people.filter((p) => p.id !== 'a0');
  assert.equal(startHiring(s).ok, true);
});

test('a hire arrives on probation after a few days', () => {
  const s = makeState();
  // mulbit met fewer intervals recently, so the hire answers its phone.
  s.history = [day(0, 24, 10), day(1, 24, 12), day(2, 20, 12)];
  // The early shift has one more agent (a0, a2, a4, a6 vs a1, a3, a5).
  startHiring(s);
  const rng = createRng(8);
  let workdays = 0;
  while (candidates(s).length === 0) {
    s.day += 1;
    advanceHiring(s, rng);
    workdays += 1;
    assert.ok(workdays <= 5, 'candidates within 5 workdays');
  }
  assert.ok(workdays >= 3, `waited ${workdays}`);
  const ev = candidates(s)[0];
  assert.equal(typeof ev.data.cand1, 'string');
  assert.equal(typeof ev.data.cand2, 'string');
  assert.ok(ev.deadlineDay > s.day);

  // No second pair while the first waits for an answer.
  advanceHiring(s, rng);
  assert.equal(candidates(s).length, 1);

  const before = new Set(s.people.map((p) => p.id));
  assert.equal(resolveEvent(s, s.inbox.indexOf(ev), 'pick-2', rng), true);
  assert.equal(s.people.length, before.size + 1);
  const hire = s.people.at(-1);
  assert.ok(!before.has(hire.id));
  assert.equal(hire.name, ev.data.cand2);
  assert.equal(hire.role, 'agent');
  assert.equal(hire.probationDays, 10);
  assert.deepEqual(s.roster[hire.id], { 0: 'late', 1: 'late', 2: 'late', 3: 'late', 4: 'late' });
  assert.deepEqual(s.assignment[hire.id], { kind: 'phone', clientId: MULBIT });
  assert.equal(s.hiring, null);

  // A second hire gets a fresh id too.
  s.people = s.people.filter((p) => p.id !== 'a0');
  assert.equal(startHiring(s).ok, true);
  while (candidates(s).length === 1) {
    s.day += 1;
    advanceHiring(s, rng);
  }
  resolveEvent(s, s.inbox.length - 1, 'pick-1', rng);
  assert.equal(new Set(s.people.map((p) => p.id)).size, s.people.length);
});

test('holding, or not answering, hires nobody and ends the search', () => {
  const s = makeState();
  startHiring(s);
  const rng = createRng(2);
  while (candidates(s).length === 0) {
    s.day += 1;
    advanceHiring(s, rng);
  }
  const count = s.people.length;
  s.day = candidates(s)[0].deadlineDay;
  expireEvents(s, rng);
  assert.equal(candidates(s)[0].choice, 'hold');
  assert.equal(s.people.length, count);
  assert.equal(s.hiring, null);
  assert.equal(startHiring(s).ok, true);
});
