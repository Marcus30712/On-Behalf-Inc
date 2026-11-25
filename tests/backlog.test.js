import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../sim/rng.js';
import { createPerson } from '../sim/people.js';
import { defaultRoster } from '../sim/schedule.js';
import { stepInterval } from '../sim/interval.js';
import { endOfDay } from '../sim/day.js';
import {
  stepBacklog, backlogCount, backlogWarnings, BACKLOG_WARN,
} from '../sim/backlog.js';
import { CLIENTS } from '../world/clients.js';

const H = (h, m = 0) => h * 60 + m;
const BOOKS = CLIENTS.find((c) => c.id === 'solbang-books');
const flat = { next: () => 0.5 }; // wobble exactly 1
const FRIDAY = 4;
const MONDAY = 7;

// One email client (solbang-books); `staffed` agents (a0, a2 early) answer it.
function makeState({ day = 0, minute = H(9), staffed = 0 } = {}) {
  const rng = createRng(11);
  const people = [];
  for (let i = 0; i < 4; i++) people.push(createPerson(rng, { id: `a${i}`, role: 'agent', nation: 'kamuen' }));
  const assignment = {};
  people.slice(0, staffed).forEach((p) => { assignment[p.id] = { kind: 'phone', clientId: BOOKS.id }; });
  return {
    day, minute, people, roster: defaultRoster(people), absences: [], assignment,
    clients: [{ id: BOOKS.id, satisfaction: 70, active: true }],
    mods: {}, progress: { coaching: 0, qa: 0, research: 0, training: 0 },
    today: { clients: {} }, spikes: [], inbox: [], backlog: {}, history: [], leaving: [],
  };
}

test('mail arrives and is answered oldest first', () => {
  const entry = { openMin: 100, items: [{ at: 40, n: 3 }, { at: 70, n: 4 }], carry: 0 };
  const r = stepBacklog(entry, { arrivals: 5, agents: 1, ahtMin: 6, targetMin: 720 });
  // 1 agent x 30 min / 6 min = 5 mails: all 3 of the oldest batch, 2 of the next.
  assert.equal(entry.openMin, 130);
  assert.deepEqual(entry.items, [{ at: 70, n: 2 }, { at: 130, n: 5 }]);
  assert.equal(entry.carry, 0);
  assert.equal(backlogCount(entry), 7);
  assert.deepEqual(r, {
    offered: 5, handled: 5, abandoned: 0, serviceLevel: 1, asaSec: 0, occupancy: 1, overdue: 0,
  });

  // 30/8 = 3.75: 3 mails now, 0.75 carried; next time 3.75 + 0.75 = 4.5: 4 mails, 0.5 carried.
  const e2 = { openMin: 0, items: [{ at: 0, n: 10 }], carry: 0 };
  assert.equal(stepBacklog(e2, { arrivals: 0, agents: 1, ahtMin: 8, targetMin: 720 }).handled, 3);
  assert.equal(e2.carry, 0.75);
  assert.equal(stepBacklog(e2, { arrivals: 0, agents: 1, ahtMin: 8, targetMin: 720 }).handled, 4);
  assert.equal(e2.carry, 0.5);
  assert.deepEqual(e2.items, [{ at: 0, n: 3 }]);

  // Nobody answering: nothing processed, occupancy 0, the mail waits.
  const e3 = { openMin: 0, items: [], carry: 0 };
  const idle = stepBacklog(e3, { arrivals: 4, agents: 0, ahtMin: 8, targetMin: 720 });
  assert.equal(idle.handled, 0);
  assert.equal(idle.occupancy, 0);
  assert.equal(idle.serviceLevel, 1); // nothing answered or overdue yet
  assert.deepEqual(e3.items, [{ at: 30, n: 4 }]);
});

test('answered within 720 open minutes is on time', () => {
  // After the step the clock reads 730: the batch from 10 is 720 old (on time),
  // the batch from 0 is 730 old (late).
  const entry = { openMin: 700, items: [{ at: 0, n: 2 }, { at: 10, n: 2 }], carry: 0 };
  const r = stepBacklog(entry, { arrivals: 0, agents: 1, ahtMin: 7.5, targetMin: 720 });
  assert.equal(r.handled, 4);
  assert.equal(r.offered, 4);
  assert.equal(r.serviceLevel, 0.5);

  // Unanswered mail counts once, in the interval its age passes 720.
  const late = { openMin: 700, items: [{ at: 0, n: 3 }], carry: 0 };
  const first = stepBacklog(late, { arrivals: 0, agents: 0, ahtMin: 8, targetMin: 720 });
  assert.equal(first.overdue, 3);
  assert.equal(first.offered, 3);
  assert.equal(first.serviceLevel, 0);
  const second = stepBacklog(late, { arrivals: 0, agents: 0, ahtMin: 8, targetMin: 720 });
  assert.equal(second.overdue, 0);
  assert.equal(second.offered, 0);
});

// Runs stepInterval from (day, minute) for `n` intervals, rolling over midnight.
function run(s, n) {
  const reports = [];
  for (let i = 0; i < n; i++) {
    reports.push(stepInterval(s, flat));
    if (s.minute >= 1440) { s.day += 1; s.minute = 0; }
  }
  return reports;
}

test('open minutes stop while closed', () => {
  const s = makeState({ day: FRIDAY, minute: H(20, 30) });
  run(s, 1); // Friday 20:30-21:00: the day's last mail arrives
  const entry = s.backlog[BOOKS.id];
  assert.equal(entry.items.length, 1);
  const batch = entry.items[0];
  const openMin = entry.openMin;
  assert.equal(openMin - batch.at, 0);
  // Through Friday night, Saturday and Sunday to Monday 09:00.
  run(s, (1440 - H(21)) / 30 + 2 * 48 + H(9) / 30);
  assert.equal(s.day, MONDAY);
  assert.equal(s.minute, H(9));
  assert.equal(s.backlog[BOOKS.id].openMin, openMin);
  run(s, 1); // Monday 09:00-09:30
  assert.equal(s.backlog[BOOKS.id].openMin - batch.at, 30);
});

test('closed email client gets no processing', () => {
  for (const [day, minute] of [[FRIDAY, H(21)], [5, H(12)], [0, H(8, 30)]]) {
    const s = makeState({ day, minute, staffed: 4 });
    s.backlog[BOOKS.id] = { openMin: 300, items: [{ at: 0, n: 10 }], carry: 0.5 };
    const before = structuredClone(s.backlog);
    const report = stepInterval(s, flat);
    assert.deepEqual(s.backlog, before, `${day} ${minute}`);
    assert.equal(report.clients[BOOKS.id], undefined);
    assert.equal(s.clients[0].satisfaction, 70);
  }
});

test('staffed email client answers mail through the interval path', () => {
  const s = makeState({ day: 0, minute: H(10), staffed: 4 });
  s.backlog[BOOKS.id] = { openMin: 30, items: [{ at: 30, n: 10 }], carry: 0 };
  const r = stepInterval(s, flat).clients[BOOKS.id];
  assert.ok(r.agents > 0);
  assert.ok(r.handled > 0);
  assert.equal(r.abandoned, 0);
  const t = s.today.clients[BOOKS.id];
  assert.equal(t.handled, r.handled);
  assert.equal(t.offered, r.offered);
  assert.equal(t.intervals, 1);
  // Someone answering email works at the email occupancy, not the off-phone 0.2.
  const worker = s.people.find((p) => p.id === 'a0');
  assert.ok(worker.fatigue > 0);
});

test('unstaffed email client loses satisfaction', () => {
  const s = makeState({ day: 0, minute: H(9) });
  const reports = [];
  for (let d = 0; d < 3; d++) {
    s.day = d;
    s.minute = H(9);
    reports.push(...run(s, 24));
  }
  const ours = reports.map((r) => r.clients[BOOKS.id]);
  assert.ok(ours.every(Boolean));
  const overdue = ours.filter((r) => r.overdue > 0);
  assert.ok(overdue.length > 0);
  for (const r of overdue) assert.equal(r.serviceLevel, 0);
  assert.ok(s.clients[0].satisfaction < 70, String(s.clients[0].satisfaction));
});

test('backlog warning fires once per five workdays', () => {
  assert.equal(BACKLOG_WARN, 120);
  const s = makeState({ day: 0 });
  s.backlog[BOOKS.id] = { openMin: 720, items: [{ at: 0, n: BACKLOG_WARN }], carry: 0 };
  const warned = [];
  // Two weeks of days; the client's clock moves 720 open minutes per weekday.
  for (let day = 0; day < 14; day++) {
    s.day = day;
    if (day > 0 && day % 7 < 5) s.backlog[BOOKS.id].openMin += 720;
    const before = s.inbox.length;
    backlogWarnings(s);
    if (s.inbox.length > before) warned.push(day);
  }
  // Workdays 0..4 are Mon-Fri; the next five-workday mark is Monday day 7, then Monday 14 (not reached).
  assert.deepEqual(warned, [0, 7]);
  const e = s.inbox[0];
  assert.equal(e.id, 'backlog-warning');
  assert.equal(e.clientId, BOOKS.id);
  assert.equal(e.data.n, BACKLOG_WARN);

  // Under the line: no warning.
  const quiet = makeState({ day: 0 });
  quiet.backlog[BOOKS.id] = { openMin: 720, items: [{ at: 0, n: BACKLOG_WARN - 1 }], carry: 0 };
  backlogWarnings(quiet);
  assert.equal(quiet.inbox.length, 0);
});

test('end of day pushes the backlog warning', () => {
  const s = makeState({ day: 0, minute: 1440 });
  s.backlog[BOOKS.id] = { openMin: 720, items: [{ at: 0, n: 130 }], carry: 0 };
  endOfDay(s, createRng(3));
  assert.ok(s.inbox.some((e) => e.id === 'backlog-warning' && e.clientId === BOOKS.id));
});
