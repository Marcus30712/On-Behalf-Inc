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
  assert.deepEqual(act(s, { type: 'startResearch', researchId: 'clinic' }), { ok: true });
  playDays(s, 2);
  assert.deepEqual(act(s, { type: 'startHiring' }), { ok: true });
  playDays(s, 5);
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
  assert.equal(c.today.serviceLevel, t.intervalsMet / t.intervals);
  assert.equal(c.today.agents, t.agentShareSum / t.intervals);

  assert.equal(v.people.length, 10);
  const p0 = v.people[0];
  assert.equal(p0.id, 'p0');
  assert.equal(p0.shiftToday, 'early');
  assert.deepEqual(p0.task, { kind: 'phone', clientId: 'gureum-travel' });
  for (const key of ['name', 'role', 'nation', 'traits', 'skills', 'fatigue', 'stress', 'morale', 'health', 'probationDays']) {
    assert.ok(key in p0, key);
  }

  // Unresolved first, newest first; each carries its inbox index for 'resolve'.
  const order = v.inbox.map((e) => [e.resolved, e.index]);
  const sorted = [...order].sort((a, b) => Number(a[0]) - Number(b[0]) || b[1] - a[1]);
  assert.deepEqual(order, sorted);
  assert.equal(v.inbox.length, s.inbox.length);

  assert.deepEqual(v.research, { done: [], current: null, points: 0, cost: null, build: null });
  assert.equal(v.hiring, null);

  // Read-only: changing the view does not touch the state.
  assert.throws(() => { v.people[0].fatigue = 99; });
  assert.notEqual(s.people[0].fatigue, 99);
  assert.equal(view(s).date.weekdayLabel, '목');
});

test('view shows no service level before the first interval', () => {
  const v = view(createGame(1));
  assert.equal(v.clients[0].today.serviceLevel, null);
  assert.equal(v.clients[0].today.offered, 0);
});
