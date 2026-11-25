// v1.2 Task 3: weekend operations. The real weekend client arrives in Task 5;
// these tests add a fake one to CLIENTS (removed again after the file).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame, advance, act, view, SHIFTS } from '../sim/game.js';
import { serialize, deserialize } from '../sim/state.js';
import { stepInterval } from '../sim/interval.js';
import { endOfDay } from '../sim/day.js';
import { onShift, isCenterOpen } from '../sim/schedule.js';
import { createRng } from '../sim/rng.js';
import { isCompanyWorkday } from '../sim/calendar.js';
import { reputation } from '../sim/economy.js';
import { CLIENTS } from '../world/clients.js';
import { NATIONS } from '../world/nations.js';
import { SCENARIOS, runScenario } from './fixtures/weekday-scenario.js';

const WEEKEND = 'test-weekend';
const FAKE = {
  id: WEEKEND, name: '주말 시험 고객사', industry: '시험', nation: 'veltora', start: false,
  slTarget: { pct: 80, sec: 20 }, monthlyFee: 10000,
  callsPerDay: 60, ahtMin: 5, patienceSec: 90, hours: { days: [5, 6], open: 540, close: 1080 },
};
CLIENTS.push(FAKE);
// Added to NATIONS only inside the test that uses it (new games pick nations
// from NATIONS by index). A nation whose only holiday is the first weekend (Sat 1/6 - Sun 1/7, days 5-6).
const WEEKEND_NATION = {
  id: 'test-weekend-nation', name: '시험국', weeklyRest: [],
  holidays: [{ id: 'test-weekend-holiday', name: '시험 주말', rule: { kind: 'fixed', month: 1, date: 6 }, length: 2, staffLeave: 1 }],
};
after(() => CLIENTS.splice(CLIENTS.indexOf(FAKE), 1));

const SAT = 5; // day 5 is the first Saturday (day 0 is a Monday)
const SUN = 6;
const MON = 7;

// A new game with the fake weekend client active and nobody on it yet.
function withWeekendClient(seed = 3) {
  const s = createGame(seed);
  s.clients.push({ id: WEEKEND, satisfaction: 70, active: true });
  return s;
}

test('without a weekend client the game is byte-identical to the pre-weekend code', () => {
  const golden = JSON.parse(readFileSync(new URL('./fixtures/weekday-golden.json', import.meta.url), 'utf8'));
  for (const sc of SCENARIOS) {
    const key = `${sc.seed}x${sc.days}`;
    assert.equal(runScenario(sc), golden[key], key);
  }
});

test('SHIFTS gains a weekend shift; early and late stay weekday shifts', () => {
  assert.deepEqual(SHIFTS.weekend, { start: 540, end: 1080, days: [5, 6] });
  assert.deepEqual(SHIFTS.early.days, [0, 1, 2, 3, 4]);
  assert.deepEqual(SHIFTS.late.days, [0, 1, 2, 3, 4]);
});

test('the center opens on a day only when an active client does', () => {
  const s = createGame(1);
  for (let d = 0; d < 14; d++) assert.equal(isCenterOpen(s, d), d % 7 < 5, `day ${d}`);
  s.clients.push({ id: WEEKEND, satisfaction: 70, active: false });
  assert.equal(isCenterOpen(s, SAT), false, 'an inactive weekend client does not open the center');
  s.clients.at(-1).active = true;
  assert.equal(isCenterOpen(s, SAT), true);
  assert.equal(isCenterOpen(s, SUN), true);
  assert.equal(view(s).flags.weekend, true);
  assert.equal(view(createGame(1)).flags.weekend, false);
});

test('without a weekend client nothing happens on Saturday and Sunday', () => {
  const s = createGame(4);
  s.day = SAT;
  s.minute = 540;
  const rng = createRng(9);
  const r = stepInterval(s, rng);
  assert.deepEqual(r.clients, {});
  assert.deepEqual(s.today.clients, {});
  s.minute = 1440;
  const before = s.history.length;
  endOfDay(s, rng);
  assert.equal(s.history.length, before, 'no history entry for a closed day');
});

test('with a weekend client only it takes calls at the weekend, and never on weekdays', () => {
  const s = withWeekendClient();
  // Two agents work Saturday and Sunday on the weekend client.
  for (const p of s.people.slice(0, 2)) {
    s.roster[p.id] = { ...s.roster[p.id], 5: 'weekend', 6: 'weekend' };
    s.assignment[p.id] = { kind: 'phone', clientId: WEEKEND };
  }
  const calls = {}; // day -> clientId -> offered
  for (let d = 0; d < 14; d++) {
    advance(s, 1440);
    const h = s.history.find((x) => x.day === d);
    calls[d] = h ? Object.fromEntries(Object.entries(h.clients).map(([id, t]) => [id, t.offered])) : null;
  }
  for (const d of [SAT, SUN, SAT + 7, SUN + 7]) {
    assert.deepEqual(Object.keys(calls[d]), [WEEKEND], `day ${d}`);
    assert.ok(calls[d][WEEKEND] > 0);
  }
  for (const d of [0, 1, 2, 3, 4, MON, MON + 4]) {
    assert.ok(calls[d], `day ${d} recorded`);
    assert.equal(calls[d][WEEKEND], undefined, `weekend client has no calls on weekday ${d}`);
    assert.ok(calls[d]['gureum-travel'] > 0);
  }
});

test('only people on the weekend shift work at the weekend', () => {
  const s = withWeekendClient();
  const [a, b, c] = s.people;
  s.roster[a.id] = { ...s.roster[a.id], 5: 'weekend' };
  s.roster[c.id] = { ...s.roster[c.id], 5: 'early' }; // not a weekend shift: ignored
  assert.equal(onShift(s, a, SAT, 600), true);
  assert.equal(onShift(s, a, SAT, 1080), false, 'the weekend shift ends at 18:00');
  assert.equal(onShift(s, b, SAT, 600), false);
  assert.equal(onShift(s, c, SAT, 600), false);
  assert.equal(onShift(s, a, SUN, 600), false, 'not rostered on Sunday');
  // Without an active weekend client nobody works the weekend, rostered or not.
  s.clients.at(-1).active = false;
  assert.equal(onShift(s, a, SAT, 600), false);
});

test('setRoster takes 7 weekdays and only shifts that run on that weekday', () => {
  const s = createGame(2);
  const id = s.people[0].id;
  assert.deepEqual(act(s, { type: 'setRoster', personId: id, weekday: 5, shift: 'weekend' }), { ok: true });
  assert.deepEqual(act(s, { type: 'setRoster', personId: id, weekday: 6, shift: 'off' }), { ok: true });
  assert.equal(act(s, { type: 'setRoster', personId: id, weekday: 5, shift: 'early' }).ok, false);
  assert.equal(act(s, { type: 'setRoster', personId: id, weekday: 0, shift: 'weekend' }).ok, false);
  assert.equal(act(s, { type: 'setRoster', personId: id, weekday: 7, shift: 'off' }).ok, false);
  const week = view(s).people[0].week;
  assert.equal(week.length, 7);
  assert.equal(week[5], 'weekend');
  assert.equal(week[6], 'off');
});

test('a person rostered six days or more tires 1.5 times as fast that week', () => {
  const gain = (sixDays, weekendClient) => {
    const s = weekendClient ? withWeekendClient(5) : createGame(5);
    const p = s.people[0];
    const twin = s.people[2]; // same early shift, same client
    s.people = [p, twin];
    p.traits = []; twin.traits = [];
    for (const x of [p, twin]) { x.fatigue = 10; x.stress = 15; }
    s.roster[p.id] = { 0: 'early', 1: 'early', 2: 'early', 3: 'early', 4: 'early', ...(sixDays ? { 5: 'weekend' } : {}) };
    s.roster[twin.id] = { ...s.roster[p.id] };
    s.assignment = { [p.id]: { kind: 'coaching' }, [twin.id]: { kind: 'coaching' } };
    s.day = 0;
    s.minute = 540;
    const f0 = p.fatigue;
    stepInterval(s, createRng(1)); // 09:00, both shifts' first interval, no break
    return p.fatigue - f0;
  };
  const five = gain(false, true);
  assert.ok(five > 0);
  assert.ok(Math.abs(gain(true, true) - five * 1.5) < 1e-9, 'six days with the weekend client open');
  assert.equal(gain(true, false), five, 'a Saturday shift with no weekend client is not worked');
});

test('day-end rules run on an open weekend day and plan spikes per client', () => {
  const s = withWeekendClient(6);
  s.hiring = { workdays: 0, waitDays: 5 };
  // Force spikes for every client on Friday's end of day.
  const always = { next: () => 0.5, int: (a) => a, pick: (a) => a[0], chance: (p) => p === 0.05 };
  s.day = 4;
  endOfDay(s, always);
  const spikeDay = Object.fromEntries(s.spikes.map((x) => [x.clientId, x.day]));
  assert.equal(spikeDay[WEEKEND], SAT);
  assert.equal(spikeDay['gureum-travel'], MON);
  // Saturday ends with a history entry; the hiring wait, a company timer,
  // counts Monday to Friday only (v1.4), so Saturday does not count.
  s.day = SAT;
  s.minute = 1410;
  const before = s.history.length;
  advance(s, 30);
  assert.equal(s.history.length, before + 1);
  assert.equal(s.history.at(-1).day, SAT);
  assert.equal(s.hiring.workdays, 0);
});

test('an old save with 5-day rosters loads; the weekend reads as off', () => {
  const s = createGame(11);
  for (const id of Object.keys(s.roster)) {
    assert.deepEqual(Object.keys(s.roster[id]), ['0', '1', '2', '3', '4'], 'new games keep 5-day rosters');
  }
  const old = JSON.parse(serialize(s));
  delete old.office;
  const loaded = deserialize(JSON.stringify(old));
  assert.ok(loaded);
  const v = view(loaded);
  assert.equal(v.flags.weekend, false);
  for (const p of v.people) {
    assert.equal(p.week.length, 7);
    assert.deepEqual(p.week.slice(5), ['off', 'off']);
  }
  assert.equal(advance(loaded, 7 * 1440), 7 * 1440);
});

// Friday's end of day with a weekend client: p0 works early Mon-Fri, p1 also
// the weekend shift. Both at rock-bottom morale; the rng fires only the
// breaking-point roll and picks the first (no-show) or last (resign) event.
function fridayBreakingPoint(pick) {
  const s = withWeekendClient(8);
  const [a, b] = s.people;
  s.people = [a, b];
  s.roster[b.id] = { ...s.roster[b.id], 5: 'weekend', 6: 'weekend' };
  for (const p of [a, b]) Object.assign(p, { fatigue: 100, stress: 100, moraleBoost: 0, morale: 0 });
  s.day = 4;
  s.minute = 1440;
  endOfDay(s, { next: () => 0.5, int: (lo) => lo, pick, chance: (p) => p === 0.08 });
  return { s, a, b };
}

test('a Friday no-show is missed on the person\'s own next working day', () => {
  const { s, a, b } = fridayBreakingPoint((list) => list[0]);
  assert.deepEqual(s.absences.find((x) => x.personId === a.id), { personId: a.id, day: MON }, 'weekday-only: Monday');
  assert.deepEqual(s.absences.find((x) => x.personId === b.id), { personId: b.id, day: SAT }, 'weekend shift: Saturday');
});

test('a resignation notice counts the person\'s own working days', () => {
  const { s, a, b } = fridayBreakingPoint((list) => list.at(-1));
  const leaveDay = (p) => s.inbox.find((e) => e.id === 'resign-notice' && e.personId === p.id).data.leaveDay;
  assert.equal(leaveDay(a), 18, 'ten weekdays after Friday day 4');
  assert.equal(leaveDay(b), 14, 'Sat and Sun count for a weekend worker');
});

test('only people working the weekend are asked for leave over a Sat-Sun holiday', () => {
  const s = withWeekendClient(9);
  const [a, b] = s.people;
  s.people = [a, b];
  for (const p of [a, b]) { p.nation = WEEKEND_NATION.id; p.health = { kind: 'well', daysLeft: 0 }; }
  s.roster[b.id] = { ...s.roster[b.id], 5: 'weekend' };
  s.day = 4;
  s.minute = 1440;
  NATIONS.push(WEEKEND_NATION);
  try {
    endOfDay(s, { next: () => 0.99, int: (lo) => lo, pick: (l) => l[0], chance: (p) => p === 1 });
  } finally {
    NATIONS.splice(NATIONS.indexOf(WEEKEND_NATION), 1);
  }
  const asked = s.inbox.filter((e) => e.id === 'holiday-leave').map((e) => e.personId);
  assert.deepEqual(asked, [b.id]);
});

// Final review, Critical 1: the reviewer's run. The player rosters a weekend
// crew as the accept text says (Sat/Sun on 주말, Tue/Wed off) but leaves them on
// their weekday client. On Saturday that client is closed, so they answer the
// open weekend client; on Monday they are back on their own client.
test('a weekend crew still assigned to a weekday client answers the weekend client on Saturday', () => {
  const BARAM = 'baram-delivery';
  const s = createGame(3);
  s.clients.push({ id: BARAM, satisfaction: 70, active: true });
  const crew = s.people.filter((p) => p.role === 'agent').slice(0, 3);
  for (const p of crew) {
    s.roster[p.id] = { ...s.roster[p.id], 1: 'off', 2: 'off', 5: 'weekend', 6: 'weekend' };
    assert.notEqual(s.assignment[p.id].clientId, BARAM);
  }
  const own = crew.map((p) => s.assignment[p.id].clientId);
  advance(s, SAT * 1440 + 600 - s.minute); // Saturday 10:00 (a new game starts at 09:00)
  assert.deepEqual([s.day, s.minute], [SAT, 600]);
  const v = view(s);
  for (const p of crew) {
    const pv = v.people.find((x) => x.id === p.id);
    assert.equal(pv.activity, 'phone', `${p.id} is on the phone on Saturday`);
    assert.deepEqual(pv.task, { kind: 'phone', clientId: own[crew.indexOf(p)] }, 'the assignment itself is unchanged');
  }
  advance(s, 2 * 1440); // Monday 10:00
  const sat = s.history.find((h) => h.day === SAT).clients[BARAM];
  assert.ok(sat.handled > 0, `weekend client handled calls on Saturday: ${JSON.stringify(sat)}`);
  assert.ok(sat.intervalsMet > 0);
  assert.ok(s.history.find((h) => h.day === SUN).clients[BARAM].handled > 0);
  // Monday: back on the weekday client, which the view shows as phone work.
  const vm = view(s);
  for (const p of crew) {
    const pv = vm.people.find((x) => x.id === p.id);
    assert.equal(pv.activity, pv.rosterShift === 'early' ? 'phone' : 'off', `${p.id} on Monday (${pv.rosterShift})`);
  }
  const mon = stepInterval(s, createRng(1)).clients;
  assert.equal(mon[BARAM], undefined, 'the weekend client is closed on Monday');
  for (const id of new Set(own)) assert.ok(mon[id].agents > 0);
});

// Final review, Important 4: a client's churn countdown counts only the days
// that client opens, so a weekend client's 20 workdays are 20 of its own days.
// v1.4: the warning itself is given only on an open day, so on Saturday.
test('a weekend client\'s churn countdown runs on its own days only', () => {
  const BARAM = 'baram-delivery';
  const s = createGame(3);
  s.clients.push({ id: BARAM, satisfaction: 10, active: true });
  const left = () => s.churn.find((e) => e.clientId === BARAM)?.workdaysLeft;
  advance(s, 5 * 1440); // Monday-Friday: baram is closed, no warning yet
  assert.equal(left(), undefined);
  advance(s, 1440); // Saturday ends: the warning is given
  assert.equal(left(), 20);
  advance(s, 1440); // Sunday counts
  assert.equal(left(), 19);
  advance(s, 5 * 1440); // Monday-Friday: nothing counts
  assert.equal(left(), 19);
  advance(s, 2 * 1440);
  assert.equal(left(), 17);
});

test('a weekend client in a churn warning that is well staffed can recover', () => {
  const BARAM = 'baram-delivery';
  const s = createGame(3);
  // 15, not 19: the warning waits for Saturday (v1.4), and one well-staffed
  // Saturday would lift 19 above the line before it is given.
  s.clients.push({ id: BARAM, satisfaction: 15, active: true });
  // A weekend-only crew of four on baram (the other four agents keep the weekdays).
  const crew = s.people.filter((p) => p.role === 'agent').slice(0, 4);
  for (const p of crew) {
    s.roster[p.id] = { 0: 'off', 1: 'off', 2: 'off', 3: 'off', 4: 'off', 5: 'weekend', 6: 'weekend' };
    s.assignment[p.id] = { kind: 'phone', clientId: BARAM };
  }
  let warned = false;
  for (let w = 0; w < 12; w++) {
    advance(s, 7 * 1440);
    warned ||= s.churn.some((e) => e.clientId === BARAM);
  }
  const baram = s.clients.find((c) => c.id === BARAM);
  assert.ok(warned, 'the warning was given');
  assert.equal(baram.active, true, `baram kept (satisfaction ${baram.satisfaction.toFixed(1)})`);
  assert.ok(baram.satisfaction > 40, String(baram.satisfaction));
  assert.ok(!s.churn.some((e) => e.clientId === BARAM), 'the warning is over');
});

// v1.4 Task 5: a churn warning is given only on a day the client opens; a
// weekday client that falls to the line at the weekend is warned on Monday.
test('churn warning only on an open day', () => {
  const BARAM = 'baram-delivery';
  const s = createGame(3);
  s.clients.push({ id: BARAM, satisfaction: 70, active: true });
  advance(s, 5 * 1440); // Monday-Friday
  assert.equal(s.day, SAT);
  const weekday = s.clients[0];
  weekday.satisfaction = 10;
  const warnings = () => s.inbox.filter((e) => e.id === 'churn-warning' && e.clientId === weekday.id);
  advance(s, 1440); // Saturday (the center opens for baram)
  assert.equal(warnings().length, 0, 'no warning on Saturday');
  assert.ok(!s.churn.some((e) => e.clientId === weekday.id));
  advance(s, 1440); // Sunday
  assert.equal(warnings().length, 0, 'no warning on Sunday');
  advance(s, 1440); // Monday
  assert.equal(warnings().length, 1, 'warned on Monday');
  assert.equal(warnings()[0].day, MON);
  assert.equal(s.churn.find((e) => e.clientId === weekday.id).workdaysLeft, 20);
});

// v1.4 Task 5: company timers (offer streak, hiring wait, build days) count
// Monday to Friday only, even when a weekend client opens the center.
test('company timers count Mon–Fri only', () => {
  for (let d = 0; d < 14; d++) assert.equal(isCompanyWorkday(d), d % 7 < 5, `day ${d}`);
  const BARAM = 'baram-delivery';
  const s = createGame(3);
  s.clients.push({ id: BARAM, satisfaction: 70, active: true });
  s.cash = 500000;
  s.office = { level: 1, build: null, level1Day: 0 }; // a free seat to hire into
  advance(s, 4 * 1440); // Monday-Thursday
  assert.deepEqual(act(s, { type: 'startHiring' }), { ok: true });
  assert.deepEqual(act(s, { type: 'startExpansion' }), { ok: true });
  advance(s, 1440); // Friday counts
  assert.equal(s.day, SAT);
  assert.equal(s.hiring.workdays, 1);
  assert.equal(s.office.build.workdaysLeft, 14);
  s.hiring.waitDays = 5; // no candidates yet whatever the roll
  // Grade A from here through Monday (seed 3), so a counted day adds one to the streak.
  s.clients.forEach((c) => { c.satisfaction = 100; });
  s.offerStreak = 3;
  advance(s, 2 * 1440); // Saturday and Sunday: nothing counts
  assert.equal(s.day, MON);
  assert.equal(s.offerStreak, 3, 'offer streak');
  assert.equal(s.hiring.workdays, 1, 'hiring wait');
  assert.equal(s.office.build.workdaysLeft, 14, 'build days');
  advance(s, 1440); // Monday counts again
  assert.equal(s.hiring.workdays, 2);
  assert.equal(s.office.build.workdaysLeft, 13);
  assert.equal(reputation(s), 'A');
  assert.equal(s.offerStreak, 4, 'Monday adds one at grade A');
});
