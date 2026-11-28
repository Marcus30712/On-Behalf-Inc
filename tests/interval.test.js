import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../sim/rng.js';
import { createPerson, ahtFor } from '../sim/people.js';
import { defaultRoster } from '../sim/schedule.js';
import { dateOf } from '../sim/calendar.js';
import { CLIENTS } from '../world/clients.js';
import { CURVE, CALL_GROWTH, callsFor, stepInterval, CHAT_CONCURRENCY, CHAT_EFFICIENCY } from '../sim/interval.js';
import { intervalQueue } from '../sim/queue.js';

const H = (h, m = 0) => h * 60 + m;
const A = CLIENTS[0]; // veltora
const B = CLIENTS[1]; // kamuen
const flat = { next: () => 0.5 }; // wobble exactly 1

// v1.6: breaks come from the day plan (state.breaks). These tests keep the
// pre-v1.6 fixed break times as an explicit plan: group 0 or 1 by client and
// shift in people order (phone agents alternate), everyone else group 0.
const OLD_BREAKS = {
  early: [[H(12), H(13), H(16)], [H(12, 30), H(14), H(16, 30)]],
  late: [[H(13), H(16), H(17, 30)], [H(13, 30), H(15), H(17)]],
};
function oldPlan(s) {
  const seen = new Map();
  const plan = {};
  const weekday = dateOf(s.day).weekday;
  for (const p of s.people) {
    const shift = s.roster[p.id]?.[weekday];
    if (!OLD_BREAKS[shift]) continue;
    const a = s.assignment[p.id];
    let group = 0;
    if (a?.kind === 'phone') {
      const key = `${a.clientId}/${shift}`;
      group = (seen.get(key) ?? 0) % 2;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    const [am, lunch, pm] = OLD_BREAKS[shift][group];
    plan[p.id] = { am, lunch, pm, by: 'lead' };
  }
  return { day: s.day, plan };
}

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
  const s = {
    day, minute, people, roster: defaultRoster(people), absences: [], assignment,
    clients: [A, B].map((c) => ({ id: c.id, satisfaction: 70, active: true })),
    mods: {}, progress: { coaching: 0, qa: 0, research: 0, training: 0 },
    today: { clients: {} }, spikes: [], inbox: [],
  };
  s.breaks = oldPlan(s);
  return s;
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

test('calls grow a little every 90-day quarter, then hold after two quarters', () => {
  const at = (day) => callsFor(A, day, H(11), flat) / (A.callsPerDay * CURVE[4]);
  const step = CALL_GROWTH.perQuarter;
  assert.ok(step > 0 && step <= 0.1, 'a little');
  // Tuesdays (weekday 1): day 1, then the first Tuesday of each quarter.
  const tuesday = (from) => from + ((8 - (from % 7)) % 7);
  assert.ok(Math.abs(at(1) - 1) < 1e-9);
  assert.ok(Math.abs(at(tuesday(84)) - 1) < 1e-9, 'day 85: still the first quarter');
  assert.equal(CALL_GROWTH.quarters, 2, 'seats are fixed until v1.2: growth stops at two quarters');
  assert.ok(Math.abs(at(tuesday(90)) - (1 + step)) < 1e-9);
  assert.ok(Math.abs(at(tuesday(180)) - (1 + 2 * step)) < 1e-9);
  assert.ok(Math.abs(at(tuesday(270)) - (1 + 2 * step)) < 1e-9, 'holds');
  assert.ok(Math.abs(at(tuesday(900)) - (1 + 2 * step)) < 1e-9, 'holds');
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
  const s = makeState({ day: 1, minute: H(11), phoneA: 6, phoneB: 0 });
  // Make agents all work this interval regardless of early/late (no breaks
  // before 12:00).
  for (const id of Object.keys(s.roster)) for (const d in s.roster[id]) s.roster[id][d] = 'early';
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
  // and the first break only starts at 12:00.
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
  const perInterval = 1 + (lead.skills.coaching + lead.skills.evaluation) / 2 / 10;
  assert.ok(Math.abs(s.progress.research - perInterval) < 1e-9);
  assert.equal(s.progress.qa, 0); // QA is on the late shift, not on at 10:00
  assert.ok(lead.fatigue > fatigue);
  s.minute = H(15);
  stepInterval(s, flat);
  assert.equal(s.progress.qa, 1);
  assert.ok(Math.abs(s.progress.research - 2 * perInterval) < 1e-9);
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
  const s = makeState({ day: 154, minute: H(11), phoneA: 4 });
  assert.equal(dateOf(154).weekday, 0);
  for (const id of Object.keys(s.roster)) for (const d in s.roster[id]) s.roster[id][d] = 'early';
  s.people.forEach((p) => { p.nation = 'kamuen'; });
  const r = stepInterval(s, flat);
  assert.ok(Math.abs(r.clients[A.id].agents - 3.2) < 1e-9);
});

test('client satisfaction moves over days, not single intervals', () => {
  // Nobody on client A's phone: every interval misses and calls are lost.
  const s = makeState({ day: 0, minute: H(11), phoneA: 0 });
  stepInterval(s, flat);
  assert.ok(70 - s.clients[0].satisfaction <= 1, `one bad interval: ${s.clients[0].satisfaction}`);

  const t = makeState({ day: 0, minute: H(9), phoneA: 0 });
  const afterDay = [];
  for (let day = 0; day < 5; day++) {
    t.day = day;
    t.minute = H(9);
    for (let i = 0; i < 24; i++) stepInterval(t, flat);
    afterDay.push(t.clients[0].satisfaction);
  }
  assert.ok(70 - afterDay[0] >= 3 && 70 - afterDay[0] <= 15, `one bad day: ${afterDay[0]}`);
  assert.ok(70 - afterDay[4] >= 25, `one bad week: ${afterDay[4]}`);
});

test('two agents on the same client and shift with different plans break at different times', () => {
  // Client A: a0 (old group 0) and a2 (group 1) early, a1 (group 0) and a3 (group 1) late.
  const at = (minute) => {
    const s = makeState({ day: 1, minute, phoneA: 4 });
    return stepInterval(s, flat).clients[A.id].agents;
  };
  assert.equal(at(H(12)), 3.5); // a0 on a short break
  assert.equal(at(H(13)), 2.5); // a0 at lunch, a1 on a short break
  assert.equal(at(H(14) + 30), 3); // a2 at lunch
  assert.equal(at(H(10)), 2); // only the early pair, both working
});

test("today keeps calls answered within target and total wait, for a call-weighted service level and ASA", () => {
  const s = makeState({ minute: H(10), phoneA: 1 });
  const r1 = stepInterval(s, flat).clients[A.id];
  const r2 = stepInterval(s, flat).clients[A.id];
  const t = s.today.clients[A.id];
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  assert.ok(near(t.inTarget, r1.serviceLevel * r1.offered + r2.serviceLevel * r2.offered));
  assert.ok(near(t.waitSec, r1.asaSec * r1.handled + r2.asaSec * r2.handled));
  assert.ok(t.waitSec > 0);
});

// Satisfaction after one interval for client A, with every person's traits set.
function satisfactionWith(traits, { minute = H(10), phoneA = 4 } = {}) {
  const s = makeState({ minute, phoneA });
  for (const p of s.people) p.traits = traits;
  stepInterval(s, flat);
  return s.clients[0].satisfaction;
}

test('trait csatAdd lifts the satisfaction of the client the person answers for', () => {
  const plain = satisfactionWith([]);
  const warm = satisfactionWith(['warm']); // csatAdd 3, no handling-time change
  assert.ok(plain > 70, 'a met interval');
  assert.ok(Math.abs(warm - plain - 3 * 0.01) < 1e-9, `warm ${warm} plain ${plain}`);
});

test('trait errorMul scales the satisfaction lost from that person\'s work', () => {
  // One agent at the afternoon peak misses the target.
  const plain = satisfactionWith([], { minute: H(15), phoneA: 1 });
  const careful = satisfactionWith(['worrier'], { minute: H(15), phoneA: 1 }); // errorMul 0.9
  assert.ok(plain < 70, 'a missed interval');
  assert.ok(Math.abs((70 - careful) - 0.9 * (70 - plain)) < 1e-9, `careful ${careful} plain ${plain}`);
});

test('trait qaMul scales the QA points that person earns', () => {
  const qaPoints = (traits) => {
    const s = makeState({ minute: H(14), phoneA: 0 });
    s.assignment.q1 = { kind: 'qa' };
    s.people.find((p) => p.id === 'q1').traits = traits;
    stepInterval(s, flat);
    return s.progress.qa;
  };
  assert.equal(qaPoints([]), 1);
  assert.ok(Math.abs(qaPoints(['meticulous']) - 1.2) < 1e-9);
});

test('chat uses concurrent seats', () => {
  assert.equal(CHAT_CONCURRENCY, 2);
  assert.equal(CHAT_EFFICIENCY, 0.75);
  const chat = CLIENTS.find((c) => c.id === 'saebyeol-bank');
  const s = makeState({ minute: H(10), phoneA: 0 });
  s.clients = [{ id: chat.id, satisfaction: 70, active: true }];
  for (const id of ['a0', 'a2']) s.assignment[id] = { kind: 'phone', clientId: chat.id };
  const byId = (id) => s.people.find((p) => p.id === id);
  const aht = (ahtFor(byId('a0'), chat) + ahtFor(byId('a2'), chat)) / 2; // before the step tires them
  const r = stepInterval(s, flat).clients[chat.id];
  assert.ok(r.agents > 0);
  const calls = callsFor(chat, 0, H(10), flat, s);
  // Effective seats: raw agents x 2 x 0.75 (raw is 2 here: two people at full share).
  const expected = intervalQueue({
    calls, ahtMin: aht, agents: 2 * 2 * 0.75,
    targetSec: chat.slTarget.sec, patienceSec: chat.patienceSec,
  });
  assert.equal(r.agents, 2 * 2 * 0.75);
  assert.equal(r.handled, expected.handled);
  assert.equal(r.serviceLevel, expected.serviceLevel);
});

test('email clients run their backlog, not the call queue', () => {
  const books = CLIENTS.find((c) => c.id === 'solbang-books');
  const s = makeState({ minute: H(10), phoneA: 0 });
  s.clients = [{ id: books.id, satisfaction: 70, active: true }];
  s.assignment.a0 = { kind: 'phone', clientId: books.id };
  const report = stepInterval(s, flat);
  const r = report.clients[books.id];
  assert.equal(r.abandoned, 0);
  assert.equal(r.asaSec, 0);
  assert.equal(r.overdue, 0);
  assert.equal(s.backlog[books.id].openMin, 30);
});

// v2.4: agents cannot do QA; while there is no QA at all, a lead on coaching
// spends half of it on QA (scaled by the lead's own QA traits).
test('v2.4 lead covers QA by halves only while no QA is on staff', () => {
  const s = makeState({ day: 1, minute: H(10), phoneA: 4 });
  s.assignment.l1 = { kind: 'coaching' };
  const lead = s.people.find((p) => p.id === 'l1');
  lead.traits = [];
  stepInterval(s, flat);
  assert.equal(s.progress.coaching, 1, 'QA on staff: full coaching');
  assert.equal(s.progress.qa, 0);
  const gone = makeState({ day: 1, minute: H(10), phoneA: 4 });
  gone.people = gone.people.filter((p) => p.role !== 'qa');
  gone.assignment.l1 = { kind: 'coaching' };
  gone.people.find((p) => p.id === 'l1').traits = [];
  stepInterval(gone, flat);
  assert.equal(gone.progress.coaching, 0.5);
  assert.equal(gone.progress.qa, 0.5);
  const research = makeState({ day: 1, minute: H(10), phoneA: 4 });
  research.people = research.people.filter((p) => p.role !== 'qa');
  research.assignment.l1 = { kind: 'research' };
  stepInterval(research, flat);
  assert.equal(research.progress.qa, 0, 'a lead on research covers no QA');
});
