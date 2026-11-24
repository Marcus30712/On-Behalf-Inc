import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../sim/rng.js';
import { createPerson } from '../sim/people.js';
import { defaultRoster } from '../sim/schedule.js';
import { dateOf } from '../sim/calendar.js';
import { CLIENTS } from '../world/clients.js';
import { CURVE, callsFor, stepInterval } from '../sim/interval.js';

const H = (h, m = 0) => h * 60 + m;
const A = CLIENTS[0]; // veltora
const B = CLIENTS[1]; // kamuen
const flat = { next: () => 0.5 }; // wobble exactly 1

// Roster: agents alternate early/late; a0..a3 are 4 phone agents on client A.
function makeState({ day = 0, minute = H(12), phoneA = 4, phoneB = 0 } = {}) {
  const rng = createRng(7);
  const people = [];
  for (let i = 0; i < 8; i++) people.push(createPerson(rng, { id: `a${i}`, role: 'agent', nation: 'veltora' }));
  people.push(createPerson(rng, { id: 'l1', role: 'lead', nation: 'veltora' }));
  people.push(createPerson(rng, { id: 'q1', role: 'qa', nation: 'veltora' }));
  const assignment = {};
  people.forEach((p, i) => {
    if (p.role !== 'agent') return;
    if (i < phoneA) assignment[p.id] = { kind: 'phone', clientId: A.id };
    else if (i < phoneA + phoneB) assignment[p.id] = { kind: 'phone', clientId: B.id };
  });
  return {
    day, minute, people, roster: defaultRoster(people), absences: [], assignment,
    clients: [A, B].map((c) => ({ id: c.id, satisfaction: 70, active: true })),
    mods: {}, progress: { coaching: 0, qa: 0, research: 0, training: 0 },
    today: { clients: {} }, spikes: [], inbox: [],
  };
}

test('curve has 24 weights summing to 1 with a morning and an afternoon peak', () => {
  assert.equal(CURVE.length, 24);
  assert.ok(Math.abs(CURVE.reduce((a, b) => a + b) - 1) < 1e-9);
  const peak = (from, to) => from + CURVE.slice(from, to).indexOf(Math.max(...CURVE.slice(from, to)));
  assert.ok(peak(0, 6) > 0 && peak(0, 6) < 5);
  assert.ok(peak(10, 16) > 10 && peak(10, 16) < 15);
  assert.ok(CURVE[7] < CURVE[4] && CURVE[7] < CURVE[11]);
});

test('weekday multipliers and wobble range', () => {
  const at = (day) => callsFor(A, day, H(11), flat);
  const base = A.callsPerDay * CURVE[4];
  assert.ok(Math.abs(at(0) - base * 1.15) < 1e-9); // Mon
  assert.ok(Math.abs(at(1) - base) < 1e-9);
  assert.ok(Math.abs(at(4) - base * 0.9) < 1e-9); // Fri
  assert.equal(at(5), 0);
  assert.ok(Math.abs(callsFor(A, 1, H(11), { next: () => 0 }) - base * 0.85) < 1e-9);
  assert.ok(Math.abs(callsFor(A, 1, H(11), { next: () => 1 }) - base * 1.15) < 1e-9);
});

test('outside opening hours nothing happens', () => {
  for (const [day, minute] of [[0, H(8, 30)], [0, H(21)], [5, H(12)]]) {
    const s = makeState({ day, minute });
    const before = JSON.stringify({ ...s, minute: 0 });
    const report = stepInterval(s, createRng(1));
    assert.deepEqual(report.clients, {});
    assert.equal(s.minute, minute + 30);
    assert.equal(JSON.stringify({ ...s, minute: 0 }), before);
  }
});

test('agents split by client', () => {
  const s = makeState({ day: 1, minute: H(14), phoneA: 6, phoneB: 0 });
  // Make agents all work this interval regardless of early/late.
  for (const id of Object.keys(s.roster)) for (const d in s.roster[id]) s.roster[id][d] = 'early';
  s.minute = H(14);
  const r = stepInterval(s, createRng(3));
  assert.equal(r.clients[A.id].agents, 6);
  assert.equal(r.clients[B.id].agents, 0);
  assert.equal(r.clients[B.id].serviceLevel, 0);
  assert.ok(r.clients[B.id].abandoned > 0);
  assert.ok(r.clients[A.id].serviceLevel > 0.5);
  assert.ok(s.clients[1].satisfaction < 70);
  assert.equal(s.today.clients[B.id].intervals, 1);
  assert.equal(s.today.clients[B.id].abandoned, r.clients[B.id].abandoned);
});

test("holiday drops calls for that nation's client only", () => {
  // Day 74 (Fri, Mar 15): veltora's seed-day (during 0.7); kamuen has nothing.
  assert.equal(dateOf(74).weekday, 4);
  const calls = (c, day) => callsFor(c, day, H(11), flat);
  assert.ok(Math.abs(calls(A, 74) / calls(A, 67) - 0.7) < 1e-9); // 67 = Fri a week before
  assert.ok(Math.abs(calls(B, 74) / calls(B, 67) - 1) < 1e-9);
  const s = makeState({ day: 74, minute: H(11) });
  const r = stepInterval(s, flat);
  assert.equal(r.clients[A.id].offered, Math.round(A.callsPerDay * CURVE[4] * 0.9 * 0.7));
  assert.equal(r.clients[B.id].offered, Math.round(B.callsPerDay * CURVE[4] * 0.9));
});

test('post-holiday spike', () => {
  // Holiday covers days 358..362; afterDays 2 -> Sun 363 (non-workday) and Mon 364.
  const calls = (day) => callsFor(A, day, H(11), flat);
  const mon = (d) => calls(d);
  assert.ok(Math.abs(mon(364) / mon(371) - 1.4) < 1e-9); // 371 = next Monday
  assert.ok(Math.abs(mon(371) / mon(378) - 1) < 1e-9);
});

test('spike for the day multiplies that client only', () => {
  const s = makeState({ day: 1, minute: H(11) });
  s.spikes = [{ clientId: A.id, day: 1 }];
  const r = stepInterval(s, flat);
  assert.equal(r.clients[A.id].offered, Math.round(A.callsPerDay * CURVE[4] * 1.6));
  assert.equal(r.clients[B.id].offered, Math.round(B.callsPerDay * CURVE[4]));
  const other = makeState({ day: 1, minute: H(11) });
  other.spikes = [{ clientId: A.id, day: 2 }];
  assert.equal(stepInterval(other, flat).clients[A.id].offered, Math.round(A.callsPerDay * CURVE[4]));
});

test('people working get tired, people on break recover', () => {
  const s = makeState({ day: 1, minute: H(12), phoneA: 8 });
  const early = s.people[0]; // a0 early shift
  const late = s.people[1]; // a1 late shift
  early.fatigue = 50; late.fatigue = 50;
  // 10:00-10:30 is a full work interval for the early agent: on shift (09:00-18:00)
  // and the first break only starts at 11:00 (shift start + 120 min).
  s.minute = H(10);
  stepInterval(s, flat);
  assert.ok(early.fatigue > 50, 'working agent tires');
  assert.equal(late.fatigue, 48, 'off-shift agent recovers');
  // Early agent's lunch break: 13:00-14:00; interval 13:00 is a full break.
  early.fatigue = 50;
  s.minute = H(13);
  stepInterval(s, flat);
  assert.equal(early.fatigue, 48);
});

test('research assignment adds research progress, not phone capacity', () => {
  const s = makeState({ day: 1, minute: H(10), phoneA: 4 });
  s.assignment.l1 = { kind: 'research' };
  s.assignment.q1 = { kind: 'qa' };
  const lead = s.people.find((p) => p.id === 'l1');
  const fatigue = lead.fatigue;
  // Baseline: same state without the lead/QA assignments.
  const base = structuredClone(s);
  delete base.assignment.l1;
  delete base.assignment.q1;
  const baseline = stepInterval(base, flat).clients[A.id].agents;
  const r = stepInterval(s, flat);
  // At 10:00 only the early phone agents (a0, a2) are on; late ones start at 12:00.
  assert.equal(baseline, 2);
  assert.equal(r.clients[A.id].agents, 2);
  assert.equal(s.progress.research, 1);
  assert.equal(s.progress.qa, 0); // QA is on the late shift, not on at 10:00
  assert.ok(lead.fatigue > fatigue);
  s.minute = H(15);
  stepInterval(s, flat);
  assert.equal(s.progress.qa, 1);
  assert.equal(s.progress.research, 2);
});

test('same seed, same report', () => {
  const run = () => {
    const s = makeState({ day: 2, minute: H(11), phoneA: 5, phoneB: 3 });
    const rng = createRng(99);
    const reports = [];
    for (let i = 0; i < 6; i++) reports.push(stepInterval(s, rng));
    return { reports, s };
  };
  assert.deepEqual(run(), run());
});

test('satisfaction stays within 0-100', () => {
  const s = makeState({ day: 1, minute: H(11), phoneA: 0 });
  s.clients[0].satisfaction = 0.1;
  stepInterval(s, flat);
  assert.equal(s.clients[0].satisfaction, 0);
  const t = makeState({ day: 1, minute: H(14), phoneA: 8 });
  for (const id of Object.keys(t.roster)) for (const d in t.roster[id]) t.roster[id][d] = 'early';
  t.clients[0].satisfaction = 99.95;
  stepInterval(t, flat);
  assert.ok(t.clients[0].satisfaction <= 100);
});

test('quiet-month staffAvail scales capacity for that nation\'s staff', () => {
  const s = makeState({ day: 154, minute: H(14), phoneA: 4 });
  assert.equal(dateOf(154).weekday, 0);
  for (const id of Object.keys(s.roster)) for (const d in s.roster[id]) s.roster[id][d] = 'early';
  s.people.forEach((p) => { p.nation = 'kamuen'; });
  const r = stepInterval(s, flat);
  assert.ok(Math.abs(r.clients[A.id].agents - 3.2) < 1e-9);
});
