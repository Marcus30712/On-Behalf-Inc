import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, advance, act, save, load, view, SAVE_KEY,
} from '../sim/game.js';
import { serialize, deserialize } from '../sim/state.js';
import { SALARY } from '../sim/economy.js';
import { HIRE_COST } from '../sim/hiring.js';

const DAY = 1440;

function memoryStorage() {
  const data = new Map();
  return {
    data,
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => { data.set(k, String(v)); },
  };
}

// Plays whole days with no decisions. Ends at 00:00.
function playDays(state, days) {
  for (let d = 0; d < days; d++) advance(state, DAY - state.minute);
}

// Advances in 30-minute steps until `done(state)` or `maxDays` pass.
function advanceUntil(state, done, maxDays) {
  for (let i = 0; i < (maxDays * DAY) / 30 && !done(state); i++) advance(state, 30);
  return done(state);
}

// Saving then loading gives the same state, and both play on identically.
function assertRoundTrip(state) {
  const restored = deserialize(serialize(state));
  assert.deepEqual(restored, state);
  advance(state, 5 * DAY);
  advance(restored, 5 * DAY);
  assert.deepEqual(restored, state);
  assert.equal(serialize(restored), serialize(state));
}

test('save and load round trip mid-game', () => {
  const s = createGame(7);
  // Patched: p7 has handed in notice and leaves through the real leaving rule
  // at the end of day 10 (a resignation by play depends on luck).
  s.leaving.push({ personId: 'p7', day: 10 });
  assert.deepEqual(act(s, { type: 'assign', personId: 'p8', kind: 'research' }), { ok: true });
  assert.deepEqual(act(s, { type: 'startResearch', researchId: 'rest-room' }), { ok: true });
  playDays(s, 33);
  assert.deepEqual([s.day, s.minute], [33, 0]);
  assert.ok(s.research.done.includes('rest-room'));
  assert.equal(s.people.some((p) => p.id === 'p7'), false);
  playDays(s, 2);
  assert.deepEqual(act(s, { type: 'startHiring' }), { ok: true });
  playDays(s, 4);
  // One workday of research (day 39): the clinic is under way, not done.
  assert.deepEqual(act(s, { type: 'startResearch', researchId: 'clinic' }), { ok: true });
  playDays(s, 1);
  assert.deepEqual([s.day, s.minute], [40, 0]);
  // Patched: no holiday falls in the first 45 days, so p3 is put on leave directly.
  s.people.find((p) => p.id === 'p3').health = { kind: 'leave', daysLeft: 3 };

  assert.equal(s.research.current, 'clinic');
  assert.ok(s.research.points > 0);
  assert.equal(s.hiring.candidates.length, 2);
  assert.ok(s.inbox.some((e) => e.id === 'candidate' && !e.resolved));
  assert.ok(s.inbox.some((e) => !e.seen));
  assert.equal(s.gameOver, null);
  assertRoundTrip(s);

  // Then again while the clinic is being built.
  assert.ok(advanceUntil(s, (x) => x.research.build !== null, 30), 'clinic research finishes');
  assert.equal(s.research.build.researchId, 'clinic');
  assertRoundTrip(s);
});

test('same seed and same actions give the same game', () => {
  const play = () => {
    const s = createGame(11);
    act(s, { type: 'assign', personId: 'p8', kind: 'research' });
    act(s, { type: 'startResearch', researchId: 'stress-training' });
    advance(s, 12 * DAY);
    act(s, { type: 'setRoster', personId: 'p0', weekday: 2, shift: 'off' });
    advance(s, 20 * DAY + 90);
    return serialize(s);
  };
  assert.equal(play(), play());
});

test('advance runs intervals, ends days and settles the month', () => {
  const s = createGame(2);
  advance(s, 30);
  assert.equal(s.minute, 570);
  assert.ok(Object.values(s.today.clients).every((c) => c.intervals === 1));
  advance(s, DAY - 30); // to day 1, 09:00
  assert.deepEqual([s.day, s.minute], [1, 540]);
  assert.equal(s.lastEndedDay, 0);
  assert.equal(s.history.length, 1);
  assert.equal(s.history[0].clients['gureum-travel'].intervals, 24);

  const payroll = 8 * SALARY.agent + SALARY.lead + SALARY.qa;
  playDays(s, 28); // day 29, 00:00: no month end yet
  assert.equal(s.cash, 20000);
  playDays(s, 1);
  assert.equal(s.day, 30);
  assert.equal(s.gameOver, null);
  assert.notEqual(s.cash, 20000);
  assert.ok(s.cash > 20000 - payroll);
});

test('advance skips weekends without calls', () => {
  const s = createGame(4);
  advance(s, 5 * DAY - 540); // Saturday (day 5) 00:00
  assert.deepEqual([s.day, s.minute], [5, 0]);
  const rngBefore = s.rngState;
  const historyBefore = s.history.length;
  for (let i = 0; i < (2 * DAY) / 30; i++) {
    advance(s, 30);
    assert.deepEqual(s.today, { clients: {} });
  }
  assert.deepEqual([s.day, s.minute], [7, 0]);
  assert.equal(s.lastEndedDay, 6);
  assert.equal(s.history.length, historyBefore);
  assert.equal(s.rngState, rngBefore, 'no random draws: no calls arrive at the weekend');
});

test('act changes roster, assignment and research', () => {
  const s = createGame(5);
  assert.deepEqual(act(s, { type: 'setRoster', personId: 'p1', weekday: 4, shift: 'off' }), { ok: true });
  assert.equal(s.roster.p1[4], 'off');
  assert.deepEqual(act(s, { type: 'setRoster', personId: 'p1', weekday: 4, shift: 'early' }), { ok: true });
  assert.equal(s.roster.p1[4], 'early');
  assert.deepEqual(act(s, { type: 'assign', personId: 'p0', kind: 'phone', clientId: 'mulbit-telecom' }), { ok: true });
  assert.deepEqual(s.assignment.p0, { kind: 'phone', clientId: 'mulbit-telecom' });
  assert.deepEqual(act(s, { type: 'assign', personId: 'p9', kind: 'training' }), { ok: true });
  assert.deepEqual(s.assignment.p9, { kind: 'training' });
  assert.deepEqual(act(s, { type: 'startResearch', researchId: 'clinic' }), { ok: true });
  assert.equal(s.research.current, 'clinic');
  assert.equal(act(s, { type: 'startResearch', researchId: 'rest-room' }).ok, false);
  // Eight agents fill the eight seats.
  assert.deepEqual(act(s, { type: 'startHiring' }), { ok: false, reason: 'no-seat' });
});

test('act resolves an inbox choice with the saved random state', () => {
  const s = createGame(6);
  // Patched: hiring needs a free agent seat, so p7 is gone.
  s.people =s.people.filter((p) => p.id !== 'p7');
  delete s.assignment.p7;
  delete s.roster.p7;
  assert.deepEqual(act(s, { type: 'startHiring' }), { ok: true });
  assert.equal(s.cash, 20000 - HIRE_COST);
  assert.ok(advanceUntil(s, (x) => x.hiring?.candidates, 10));
  const index = s.inbox.findIndex((e) => e.id === 'candidate');
  const name = s.hiring.candidates[0].name;
  assert.equal(act(s, { type: 'resolve', index, choiceId: 'nope' }).ok, false);
  assert.deepEqual(act(s, { type: 'resolve', index, choiceId: 'pick-1' }), { ok: true });
  assert.ok(s.people.some((p) => p.name === name && p.probationDays === 10));
  assert.equal(s.hiring, null);
  assert.equal(act(s, { type: 'resolve', index, choiceId: 'pick-1' }).ok, false);
});

test('act rejects unknown people or clients without changing state', () => {
  const s = createGame(8);
  const before = serialize(s);
  const bad = [
    { type: 'setRoster', personId: 'ghost', weekday: 0, shift: 'early' },
    { type: 'setRoster', personId: 'p0', weekday: 5, shift: 'early' },
    { type: 'setRoster', personId: 'p0', weekday: 0, shift: 'night' },
    { type: 'assign', personId: 'ghost', kind: 'qa' },
    { type: 'assign', personId: 'p0', kind: 'phone', clientId: 'nope' },
    { type: 'assign', personId: 'p0', kind: 'phone', clientId: 'dalbit-mall' }, // not a client yet
    { type: 'assign', personId: 'p0', kind: 'phone' },
    { type: 'assign', personId: 'p0', kind: 'nap' },
    { type: 'startResearch', researchId: 'nope' },
    { type: 'resolve', index: 99, choiceId: 'grant' },
    { type: 'resolve', index: -1, choiceId: 'grant' },
    { type: 'teleport' },
    undefined,
  ];
  for (const action of bad) {
    const r = act(s, action);
    assert.equal(r.ok, false, JSON.stringify(action));
    assert.equal(typeof r.reason, 'string');
    assert.equal(serialize(s), before, JSON.stringify(action));
  }
});

test('every act is refused after game over', () => {
  const s = createGame(8);
  s.gameOver = { kind: 'game-over-cash', day: 0 };
  const before = serialize(s);
  for (const action of [
    { type: 'setRoster', personId: 'p0', weekday: 0, shift: 'late' },
    { type: 'assign', personId: 'p0', kind: 'qa' },
    { type: 'startResearch', researchId: 'clinic' },
    { type: 'startHiring' },
  ]) {
    assert.deepEqual(act(s, action), { ok: false, reason: 'game-over' });
  }
  assert.equal(serialize(s), before);
});

test('advance changes nothing after game over', () => {
  const s = createGame(8);
  act(s, { type: 'startResearch', researchId: 'rest-room' });
  s.research.points = 60;
  advance(s, 30); // research done, build under way
  assert.ok(s.research.build);
  s.gameOver = { kind: 'game-over-cash', day: 0 };
  const before = serialize(s);
  advance(s, 3 * DAY);
  assert.equal(serialize(s), before);
});

test('save and load through storage', () => {
  const s = createGame(12);
  advance(s, 3 * DAY);
  const storage = memoryStorage();
  assert.equal(save(s, storage), true);
  assert.equal(SAVE_KEY, 'on-behalf-inc:save:v1');
  assert.ok(storage.data.has(SAVE_KEY));
  assert.deepEqual(load(storage), s);
  assert.equal(load(memoryStorage()), null);
});

test('storage that throws does not crash save/load', () => {
  const s = createGame(12);
  const broken = {
    getItem() { throw new Error('denied'); },
    setItem() { throw new Error('quota'); },
  };
  assert.equal(save(s, broken), false);
  assert.equal(load(broken), null);
  assert.equal(save(s, undefined), false);
  assert.equal(load(undefined), null);
  const garbage = memoryStorage();
  garbage.setItem(SAVE_KEY, '{');
  assert.equal(load(garbage), null);
});

test('view is a plain snapshot for the screen', () => {
  const s = createGame(13);
  advance(s, 3 * DAY + 120); // day 3 (Thursday) 11:00
  s.inbox[0].resolved = true;
  const v = view(s);
  assert.equal(v.day, 3);
  assert.equal(v.minute, 660);
  assert.deepEqual(v.date, { year: 1, month: 1, date: 4, weekday: 3, weekdayLabel: '목' });
  assert.equal(v.cash, 20000);
  assert.ok(['S', 'A', 'B', 'C', 'D'].includes(v.reputation));
  assert.equal(v.gameOver, null);
  assert.deepEqual(v.milestones, []);

  assert.equal(v.clients.length, 2);
  const c = v.clients[0];
  assert.equal(c.id, 'gureum-travel');
  assert.equal(c.name, '구름다리 여행');
  assert.equal(c.active, true);
  assert.deepEqual(c.slTarget, { pct: 80, sec: 20 });
  const t = s.today.clients['gureum-travel'];
  assert.equal(c.today.offered, t.offered);
  assert.equal(c.today.handled, t.handled);
  assert.equal(c.today.abandoned, t.abandoned);
  // Call-weighted service level and average wait (ASA); the share of
  // intervals at target is kept apart.
  assert.equal(c.today.serviceLevel, t.inTarget / t.offered);
  assert.equal(c.today.asaSec, t.waitSec / t.handled);
  assert.equal(c.today.intervalsMetRate, t.intervalsMet / t.intervals);
  assert.equal(c.today.agents, t.agentShareSum / t.intervals);

  assert.equal(v.people.length, 10);
  const p0 = v.people[0];
  assert.equal(p0.id, 'p0');
  assert.equal(p0.shiftToday, 'early');
  assert.deepEqual(p0.task, { kind: 'phone', clientId: 'gureum-travel' });
  for (const key of ['name', 'role', 'nation', 'traits', 'skills', 'fatigue', 'stress', 'morale', 'health', 'probationDays']) {
    assert.ok(key in p0, key);
  }

  assert.equal(v.inbox.length, s.inbox.length);

  assert.deepEqual(v.research, { done: [], current: null, points: 0, cost: null, build: null });
  assert.equal(v.hiring, null);

  // Read-only: changing the view does not touch the state.
  assert.throws(() => { v.people[0].fatigue = 99; });
  assert.notEqual(s.people[0].fatigue, 99);
  assert.equal(view(s).date.weekdayLabel, '목');
});

test('view gives each client its channel, and an email client its backlog and on-time share', () => {
  const s = createGame(21);
  const v0 = view(s);
  for (const c of v0.clients) {
    assert.equal(c.channel, 'phone', c.id);
    assert.equal('backlog' in c, false, c.id);
  }
  s.clients.push({ id: 'solbang-books', satisfaction: 70, active: true });
  let books = view(s).clients.find((c) => c.id === 'solbang-books');
  assert.equal(books.channel, 'email');
  assert.equal(books.backlog, 0);
  assert.equal(books.onTime, null);
  assert.deepEqual(books.slTarget, { pct: 90, openMinutes: 720 });
  s.backlog['solbang-books'] = { openMin: 90, items: [{ at: 60, n: 3 }, { at: 90, n: 4 }], carry: 0 };
  s.today.clients['solbang-books'] = {
    offered: 8, handled: 6, abandoned: 0, intervals: 3, intervalsMet: 2, agentShareSum: 3, inTarget: 6, waitSec: 0,
  };
  books = view(s).clients.find((c) => c.id === 'solbang-books');
  assert.equal(books.backlog, 7);
  assert.equal(books.onTime, 6 / 8);
});

test('view shows no service level before the first interval', () => {
  const v = view(createGame(1));
  assert.equal(v.clients[0].today.serviceLevel, null);
  assert.equal(v.clients[0].today.asaSec, null);
  assert.equal(v.clients[0].today.intervalsMetRate, null);
  assert.equal(v.clients[0].today.offered, 0);
});

test('view inbox: open choices first, then unseen notices, then the rest, newest first', () => {
  const s = createGame(3);
  const push = (id, extra = {}) => s.inbox.push({ id, day: 0, seen: false, resolved: false, ...extra });
  push('sick', { personId: 'p0', data: { days: 3 } }); // 0 unseen notice
  push('friday-off', { personId: 'p1', deadlineDay: 4 }); // 1 open choice
  push('call-spike', { seen: true, resolved: true }); // 2 read notice
  push('no-show', { personId: 'p2' }); // 3 unseen notice
  push('holiday-leave', { personId: 'p3', deadlineDay: 4 }); // 4 open choice
  push('friday-off', { personId: 'p4', seen: true, resolved: true, choice: 'keep' }); // 5 answered
  assert.deepEqual(view(s).inbox.map((e) => e.index), [4, 1, 3, 0, 5, 2]);
  // Reading a notice resolves it.
  assert.deepEqual(act(s, { type: 'resolve', index: 3 }), { ok: true });
  assert.equal(s.inbox[3].resolved, true);
  assert.deepEqual(view(s).inbox.map((e) => e.index), [4, 1, 0, 5, 3, 2]);
});

test('view shows what each person is doing now and why someone is not in', () => {
  const s = createGame(13);
  const at = (minute) => { s.minute = minute; return Object.fromEntries(view(s).people.map((p) => [p.id, p])); };
  s.people.find((p) => p.id === 'p2').health = { kind: 'sick', daysLeft: 2 };
  s.people.find((p) => p.id === 'p4').health = { kind: 'leave', daysLeft: 2 };
  s.absences.push({ personId: 'p6', day: 0 });
  let v = at(540); // Monday 09:00 (v1.6: no break starts before 10:00)
  assert.equal(v.p0.shiftToday, 'early');
  assert.equal(v.p0.rosterShift, 'early');
  assert.equal(v.p0.activity, 'phone');
  assert.equal(v.p1.activity, 'off'); // late shift starts at 12:00
  assert.equal(v.p2.shiftToday, 'sick');
  assert.equal(v.p2.rosterShift, 'early');
  assert.equal(v.p2.activity, 'off');
  assert.equal(v.p4.shiftToday, 'leave');
  assert.equal(v.p6.shiftToday, 'absent');
  assert.equal(v.p8.activity, 'task'); // the lead coaches
  // v1.6: breaks follow today's plan; p0's first break (lunch is 'lunch').
  v = at(v.p0.breaks.am - (v.p0.breaks.am % 30));
  assert.equal(v.p0.activity, 'break');
  assert.equal(v.p2.activity, 'off'); // sick
  delete s.assignment.p0;
  assert.equal(at(540).p0.activity, 'idle'); // on shift with nothing to do
  s.day = 5; // Saturday
  assert.equal(at(600).p1.shiftToday, 'off');
  assert.equal(at(600).p1.activity, 'off');
});

test('view lists each person\'s holidays starting within 14 days', () => {
  const s = createGame(13);
  s.day = 62; // seed-day (veltora) starts on day 74
  const v = view(s);
  const veltoran = v.people.find((p) => p.nation === 'veltora');
  const kamuen = v.people.find((p) => p.nation === 'kamuen');
  assert.deepEqual(veltoran.holidays, [{ id: 'seed-day', name: '씨앗날', startDay: 74, length: 1 }]);
  assert.equal(kamuen.holidays.some((h) => h.id === 'seed-day'), false);
  s.day = 59; // 15 days before
  assert.equal(view(s).people.find((p) => p.nation === 'veltora').holidays.length, 0);
});

test('advance carries minutes under 30 to the next call and returns minutes simulated', () => {
  const s = createGame(2);
  assert.equal(advance(s, 10), 0);
  assert.equal(advance(s, 10), 0);
  assert.equal(s.minute, 540);
  assert.equal(advance(s, 10), 30);
  assert.equal(s.minute, 570);
  assert.equal(s.pendingMinutes, 0);
  assert.equal(advance(s, 45), 30);
  assert.equal(s.pendingMinutes, 15);
  assert.deepEqual(deserialize(serialize(s)), s);
  assert.equal(advance(s, 15), 30);
  assert.equal(s.minute, 630);
  for (const bad of [-30, NaN, undefined]) assert.equal(advance(s, bad), 0);
  assert.equal(s.minute, 630);
  s.gameOver = { kind: 'game-over-cash', day: 0 };
  assert.equal(advance(s, 60), 0);
});

test('a game over at month end leaves the clock on the last day', () => {
  const s = createGame(2);
  s.cash = -1e6; // the first month end cannot pay salaries
  advance(s, 31 * DAY);
  assert.deepEqual(s.gameOver, { kind: 'game-over-cash', day: 29 });
  assert.equal(s.day, 29);
  assert.equal(view(s).day, 29);
});

test('package.json asks for Node 22 or later', async () => {
  const { readFile } = await import('node:fs/promises');
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.engines?.node, '>=22');
});

test('view gives the screen the week roster, churn countdown and 30-day holidays', () => {
  const s = createGame(7);
  const p = s.people[0];
  s.roster[p.id] = { 0: 'late', 2: 'early' };
  const c = s.clients[0];
  s.churn = [{ clientId: c.id, workdaysLeft: 12 }];
  s.day = 360 + 2 * 30 + 2; // year 2, 3 Mar (veltora seed-day is 3/15)
  const v = view(s);
  assert.deepEqual(v.people[0].week, ['late', 'off', 'early', 'off', 'off', 'off', 'off']); // Mon-Sun (v1.2)
  assert.equal(v.clients.find((x) => x.id === c.id).churnWorkdaysLeft, 12);
  assert.equal(v.clients.find((x) => x.id !== c.id).churnWorkdaysLeft, null);
  const seed = v.calendar.find((h) => h.id === 'seed-day');
  assert.equal(seed.nation, 'veltora');
  assert.equal(seed.startDay, 360 + 2 * 30 + 14);
  assert.deepEqual({ ...seed.date }, { year: 2, month: 3, date: 15, weekday: (360 + 74) % 7, weekdayLabel: '월화수목금토일'[(360 + 74) % 7] });
  assert.ok(v.calendar.every((h) => h.startDay + h.length > s.day && h.startDay < s.day + 30));
});

// v1.4 Task 3: who each person answers now, and which clients open today.
test('view gives each person the client they answer and each client whether it opens today', () => {
  const BARAM = 'baram-delivery'; // the weekend-only client (world/clients.js)
  const s = createGame(3);
  s.clients.push({ id: BARAM, satisfaction: 70, active: true });
  const crew = s.people.filter((p) => p.role === 'agent').slice(0, 2);
  for (const p of crew) s.roster[p.id] = { ...s.roster[p.id], 1: 'off', 2: 'off', 5: 'weekend', 6: 'weekend' };
  const own = crew.map((p) => s.assignment[p.id].clientId);
  const other = s.people.find((p) => s.assignment[p.id]?.kind !== 'phone');
  assert.ok(other, 'someone is not on phones');
  const open = (v) => Object.fromEntries(v.clients.map((c) => [c.id, c.openToday]));

  advance(s, 5 * DAY + 540 - s.minute); // Saturday 09:00 (v1.6: no break starts before 10:00)
  const sat = view(s);
  for (const p of crew) assert.equal(sat.people.find((x) => x.id === p.id).answering, BARAM, `${p.id} covers on Saturday`);
  assert.equal(sat.people.find((x) => x.id === other.id).answering, null);
  assert.deepEqual(open(sat), { 'gureum-travel': false, 'mulbit-telecom': false, [BARAM]: true });

  advance(s, 2 * DAY); // Monday 09:00
  const mon = view(s);
  crew.forEach((p, i) => assert.equal(mon.people.find((x) => x.id === p.id).answering, own[i], `${p.id} on Monday`));
  assert.deepEqual(open(mon), { 'gureum-travel': true, 'mulbit-telecom': true, [BARAM]: false });
});

test('v1.7 lead hiring through the game: action role, view flags', () => {
  const s = createGame(42);
  assert.deepEqual(act(s, { type: 'startHiring', role: 'lead' }), { ok: false, reason: 'no-need' });
  assert.equal(view(s).needsLead, false);
  assert.equal(view(s).leadLeaving, false);
  const lead = s.people.find((p) => p.role === 'lead');
  s.leaving.push({ personId: lead.id, day: s.day + 10 });
  assert.equal(view(s).needsLead, true);
  assert.equal(view(s).leadLeaving, true);
  assert.deepEqual(act(s, { type: 'startHiring', role: 'lead' }), { ok: true });
  assert.equal(view(s).hiring.role, 'lead');
  s.people = s.people.filter((p) => p !== lead);
  s.leaving = [];
  assert.equal(view(s).needsLead, true);
  assert.equal(view(s).leadLeaving, false);
});

// v1.7 (final review): the let-go lead overlaps the new one, then leaves; one
// lead stays, and that lead plans the breaks.
test('v1.7 a lead hired while the old one works out notice is the only lead after', () => {
  const s = createGame(7);
  const old = s.people.find((p) => p.role === 'lead');
  s.leaving.push({ personId: old.id, day: s.day + 14 });
  assert.deepEqual(act(s, { type: 'startHiring', role: 'lead' }), { ok: true });
  const offer = () => s.inbox.findIndex((e) => e.id === 'lead-candidate' && !e.resolved);
  assert.ok(advanceUntil(s, () => offer() >= 0, 20), 'candidates arrive');
  const chosen = s.hiring.candidates[0];
  assert.deepEqual(act(s, { type: 'resolve', index: offer(), choiceId: 'pick-1' }), { ok: true });
  assert.equal(view(s).needsLead, false);
  playDays(s, 20);
  const leads = s.people.filter((p) => p.role === 'lead');
  assert.deepEqual(leads.map((p) => p.id), [chosen.id]);
  assert.equal(view(s).needsLead, false);
  advanceUntil(s, () => s.minute >= 600 && view(s).date.weekday < 5, 3);
  const plan = Object.values(s.breaks?.plan ?? {});
  assert.ok(plan.length > 0, 'a plan exists');
  assert.ok(plan.every((e) => e.by === 'lead'), 'planned by the lead');
});
