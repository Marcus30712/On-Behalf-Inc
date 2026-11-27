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

test('candidates never share a name with each other or with current staff', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const s = makeState({ agents: 7, cash: 10000 });
    const rng = createRng(seed);
    startHiring(s);
    for (let i = 0; i < 6 && !s.hiring?.candidates; i++) advanceHiring(s, rng);
    const [c1, c2] = s.hiring.candidates;
    const staff = new Set(s.people.map((p) => p.name));
    assert.notEqual(c1.name, c2.name, `seed ${seed}`);
    assert.ok(!staff.has(c1.name) && !staff.has(c2.name), `seed ${seed}: ${c1.name}, ${c2.name}`);
  }
});

// --- v1.7 lead hiring -------------------------------------------------------
import { needsLead, LEAD_HIRE_COST, hireCandidate } from '../sim/hiring.js';
import { planningOf } from '../sim/people.js';

const withoutLead = (s) => { s.people = s.people.filter((p) => p.role !== 'lead'); delete s.roster.l1; delete s.assignment.l1; return s; };
const leadOffers = (state) => state.inbox.filter((e) => e.id === 'lead-candidate');
// Advance Mon-Fri workdays until the candidates arrive; returns the workday count.
function untilCandidates(s, rng) {
  let n = 0;
  while (!s.hiring.candidates && n < 20) { advanceHiring(s, rng); n += 1; }
  return n;
}

test('v1.7 needsLead: a lead present, gone, or surely leaving', () => {
  const s = makeState();
  assert.equal(needsLead(s), false);
  s.leaving = [{ personId: 'l1', day: 10 }];
  assert.equal(needsLead(s), true, 'a lead who was let go is leaving');
  s.leaving = [{ personId: 'l1', day: 10, withdrawIfMoraleAbove: 50 }];
  assert.equal(needsLead(s), false, 'a lead being talked round may stay');
  assert.equal(needsLead(withoutLead(makeState())), true);
});

test('v1.7 starting a lead search: cost, refusals, no seat needed', () => {
  assert.equal(LEAD_HIRE_COST, 3000);
  assert.deepEqual(startHiring(makeState(), 'lead'), { ok: false, reason: 'no-need' });

  const s = withoutLead(makeState());
  assert.deepEqual(startHiring(s, 'lead'), { ok: true });
  assert.equal(s.cash, 10000 - 3000);
  assert.equal(s.hiring.role, 'lead');
  assert.deepEqual(startHiring(s), { ok: false, reason: 'already' });

  const full = withoutLead(makeState({ agents: 8 }));
  assert.deepEqual(startHiring(full, 'lead'), { ok: true }, 'the lead has their own desk');

  const busy = withoutLead(makeState());
  startHiring(busy);
  assert.deepEqual(startHiring(busy, 'lead'), { ok: false, reason: 'already' });

  const poor = withoutLead(makeState({ cash: 2999 }));
  assert.deepEqual(startHiring(poor, 'lead'), { ok: false, reason: 'no-cash' });
  assert.equal(poor.cash, 2999);
});

test('v1.7 lead candidates arrive after 5-7 workdays with their skills in the event', () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const s = withoutLead(makeState());
    startHiring(s, 'lead');
    const n = untilCandidates(s, createRng(seed));
    assert.ok(n >= 5 && n <= 7, `seed ${seed}: ${n} workdays`);
    assert.deepEqual(s.hiring.candidates.map((p) => p.role), ['lead', 'lead']);
    assert.equal(candidates(s).length, 0);
    const [e] = leadOffers(s);
    const [a, b] = s.hiring.candidates;
    assert.equal(e.data.cand1, a.name);
    assert.equal(e.data.c1, a.skills.coaching);
    assert.equal(e.data.p1, planningOf(a));
    assert.equal(e.data.c2, b.skills.coaching);
    assert.equal(e.data.p2, planningOf(b));
    for (const p of [e.data.p1, e.data.p2]) assert.ok(p >= 3 && p <= 8, `planning ${p}`);
  }
});

test('v1.7 a hired lead coaches on the early shift, with no probation', () => {
  const s = withoutLead(makeState());
  startHiring(s, 'lead');
  untilCandidates(s, createRng(4));
  const [e] = leadOffers(s);
  const chosen = s.hiring.candidates[1];
  resolveEvent(s, s.inbox.indexOf(e), 'pick-2');
  assert.ok(s.people.includes(chosen));
  assert.equal(s.hiring, null);
  assert.deepEqual(s.roster[chosen.id], { 0: 'early', 1: 'early', 2: 'early', 3: 'early', 4: 'early' });
  assert.deepEqual(s.assignment[chosen.id], { kind: 'coaching' });
  assert.equal(chosen.probationDays ?? 0, 0, 'no probation');
  assert.equal(needsLead(s), false);
});

test('v1.7 no second lead joins while one is in place', () => {
  const s = withoutLead(makeState());
  startHiring(s, 'lead');
  untilCandidates(s, createRng(4));
  s.people.push(createPerson(createRng(9), { id: 'l9', role: 'lead', nation: 'veltora' }));
  const before = s.people.length;
  hireCandidate(s, 0);
  assert.equal(s.people.length, before);
  assert.equal(s.hiring, null);
});

test('v1.7 unanswered lead candidates are held, like agent ones', () => {
  const s = withoutLead(makeState());
  startHiring(s, 'lead');
  untilCandidates(s, createRng(4));
  const [e] = leadOffers(s);
  s.day = e.deadlineDay + 1;
  expireEvents(s);
  assert.equal(e.choice, 'hold');
  assert.equal(s.hiring, null);
  assert.equal(needsLead(s), true);
});

test('v1.7 a v1.6 save mid-search (no role) still hires an agent', () => {
  const s = makeState();
  s.cash -= HIRE_COST;
  s.hiring = { workdays: 0 };
  untilCandidates(s, createRng(5));
  assert.deepEqual(s.hiring.candidates.map((p) => p.role), ['agent', 'agent']);
  assert.equal(candidates(s).length, 1);
  assert.equal(leadOffers(s).length, 0);
});

// --- v2.4 QA hiring ----------------------------------------------------------
import { needsQa, QA_HIRE_COST } from '../sim/hiring.js';
import { TRAITS } from '../world/traits.js';

const withoutQa = (s) => { const q = s.people.find((p) => p.role === 'qa'); s.people = s.people.filter((p) => p !== q); delete s.roster[q.id]; delete s.assignment[q.id]; return s; };
const qaOffers = (state) => state.inbox.filter((e) => e.id === 'qa-candidate');
const traitText = (p) => p.traits.map((id) => TRAITS.find((t) => t.id === id)?.name).filter(Boolean);

test('v2.4 needsQa: a QA present, gone, or surely leaving', () => {
  const s = makeState();
  const qa = s.people.find((p) => p.role === 'qa');
  assert.equal(needsQa(s), false);
  s.leaving = [{ personId: qa.id, day: 10 }];
  assert.equal(needsQa(s), true);
  s.leaving = [{ personId: qa.id, day: 10, withdrawIfMoraleAbove: 50 }];
  assert.equal(needsQa(s), false, 'a QA being talked round may stay');
  assert.equal(needsQa(withoutQa(makeState())), true);
});

test('v2.4 starting a QA search: cost, refusals, no seat needed', () => {
  assert.equal(QA_HIRE_COST, 2000);
  assert.deepEqual(startHiring(makeState(), 'qa'), { ok: false, reason: 'no-need' });
  const s = withoutQa(makeState());
  assert.deepEqual(startHiring(s, 'qa'), { ok: true });
  assert.equal(s.cash, 10000 - 2000);
  assert.equal(s.hiring.role, 'qa');
  assert.deepEqual(startHiring(s, 'lead'), { ok: false, reason: 'already' });
  assert.deepEqual(startHiring(withoutQa(makeState({ agents: 8 })), 'qa'), { ok: true }, 'the QA has their own desk');
  assert.deepEqual(startHiring(withoutQa(makeState({ cash: 1999 })), 'qa'), { ok: false, reason: 'no-cash' });
});

test('v2.4 QA candidates arrive after 4-6 workdays with their traits in the event', () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const s = withoutQa(makeState());
    startHiring(s, 'qa');
    const n = untilCandidates(s, createRng(seed));
    assert.ok(n >= 4 && n <= 6, `seed ${seed}: ${n} workdays`);
    assert.deepEqual(s.hiring.candidates.map((p) => p.role), ['qa', 'qa']);
    const [e] = qaOffers(s);
    const [a, b] = s.hiring.candidates;
    assert.equal(e.data.cand1, a.name);
    assert.deepEqual(e.data.t1, traitText(a));
    assert.deepEqual(e.data.t2, traitText(b));
  }
});

test('v2.4 a hired QA checks calls on the late shift, no probation; never two', () => {
  const s = withoutQa(makeState());
  startHiring(s, 'qa');
  untilCandidates(s, createRng(4));
  const [e] = qaOffers(s);
  const chosen = s.hiring.candidates[0];
  resolveEvent(s, s.inbox.indexOf(e), 'pick-1');
  assert.ok(s.people.includes(chosen));
  assert.deepEqual(s.roster[chosen.id], { 0: 'late', 1: 'late', 2: 'late', 3: 'late', 4: 'late' });
  assert.deepEqual(s.assignment[chosen.id], { kind: 'qa' });
  assert.equal(chosen.probationDays ?? 0, 0);
  assert.equal(needsQa(s), false);
  // A second QA does not join while one is in place.
  const t = withoutQa(makeState());
  startHiring(t, 'qa');
  untilCandidates(t, createRng(4));
  t.people.push(createPerson(createRng(9), { id: 'q9', role: 'qa', nation: 'veltora' }));
  const before = t.people.length;
  hireCandidate(t, 0);
  assert.equal(t.people.length, before);
});

// v2.4 (final review): a role from a damaged save that names an inherited
// property ('constructor') is not a staff role: it runs as an agent search.
test('v2.4 an unknown or inherited role name runs as an agent search', () => {
  for (const role of ['constructor', 'toString', 'boss']) {
    const s = makeState();
    s.hiring = { workdays: 0, role };
    untilCandidates(s, createRng(5));
    assert.deepEqual(s.hiring.candidates.map((p) => p.role), ['agent', 'agent'], role);
  }
});
