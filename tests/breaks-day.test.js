// v1.6 Task 3: the break plan wired into the day, the interval and the view.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, advance, act, view, load, SAVE_KEY } from '../sim/game.js';
import { serialize } from '../sim/state.js';
import * as interval from '../sim/interval.js';
import { stepInterval } from '../sim/interval.js';
import { planBreaks, breakLookup } from '../sim/breaks.js';
import { workShare, onBreak } from '../sim/schedule.js';
import { createRng } from '../sim/rng.js';
import { dateOf } from '../sim/calendar.js';
import { EVENTS } from '../world/events.js';
import { ADVISOR } from '../world/advisor.js';

const H = (h, m = 0) => h * 60 + m;
const DAY = 1440;
const leadOf = (s) => s.people.find((p) => p.role === 'lead');
const autoEvents = (s) => s.inbox.filter((e) => e.id === 'breaks-auto');
const shiftOf = (s, id) => s.roster[id]?.[dateOf(s.day).weekday];

function memoryStorage(entries = {}) {
  const data = new Map(Object.entries(entries));
  return { data, getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, v) };
}

test('a new game makes today\'s plan on its first interval, and each next day\'s at day start', () => {
  const s = createGame(5);
  assert.equal(s.breaks, undefined, 'nothing stored before the game runs');
  advance(s, 30);
  assert.deepEqual(Object.keys(s.breaks).sort(), ['day', 'plan']);
  assert.equal(s.breaks.day, 0);
  assert.deepEqual(Object.keys(s.breaks.plan).sort(), s.people.map((p) => p.id).sort(), 'everyone works on Monday');
  for (const entry of Object.values(s.breaks.plan)) assert.equal(entry.by, 'lead');
  assert.deepEqual(s.breaks.plan, planBreaks(s, 0));

  // Overnight health runs first: someone sick for one more day is back the next
  // morning and gets breaks; only today's plan is kept.
  const p0 = s.people.find((p) => p.id === 'p0');
  p0.health = { kind: 'sick', daysLeft: 1 };
  advance(s, DAY - H(9, 30)); // to day 1, 00:00
  assert.equal(s.day, 1);
  assert.equal(s.minute, 0);
  assert.equal(p0.health.kind, 'well');
  assert.equal(s.breaks.day, 1, 'built at day start, before any interval of the day');
  assert.ok(s.breaks.plan.p0, 'p0 is back and has breaks');
  assert.deepEqual(s.breaks.plan, planBreaks(s, 1));
});

test('interval work shares follow the day\'s plan', () => {
  const s = createGame(5);
  s.day = 1; // Tuesday
  const plan = planBreaks(s, 1);
  const early = s.people.filter((p) => p.role === 'agent' && shiftOf(s, p.id) === 'early');
  assert.ok(early.length >= 2);
  // Every early agent takes the am break at 10:00 (the earliest start).
  for (const p of early) plan[p.id] = { am: H(10), lunch: H(12), pm: H(15), by: 'lead' };
  s.breaks = { day: 1, plan };
  const agentsAt = (minute) => {
    s.minute = minute;
    const r = stepInterval(s, createRng(1));
    return Object.values(r.clients).reduce((sum, c) => sum + c.agents, 0);
  };
  // Only the early agents are on before 12:00: half an interval each at 10:00.
  assert.equal(agentsAt(H(10)), early.length * 0.5);
  assert.equal(agentsAt(H(10, 30)), early.length);
  // At 12:00 the early agents are all at lunch; only the late ones answer.
  const late = s.people.filter((p) => p.role === 'agent' && shiftOf(s, p.id) === 'late');
  const lateShare = late.reduce((sum, p) => sum + workShare(H(12), 'late', plan[p.id]), 0);
  assert.ok(lateShare > 0);
  assert.equal(agentsAt(H(12)), lateShare);
});

test('a roster change during the day: the moved person gets breaks for their new shift, nobody else changes', () => {
  const s = createGame(5);
  advance(s, 30); // Monday 09:30, plan kept
  const before = structuredClone(s.breaks.plan);
  assert.ok(before.p0.am < H(12), 'p0 works early');
  act(s, { type: 'setRoster', personId: 'p0', weekday: 0, shift: 'late' });
  act(s, { type: 'setRoster', personId: 'p2', weekday: 0, shift: 'off' });
  const shown = view(s).people.find((p) => p.id === 'p0').breaks;
  assert.ok(shown.am >= H(13) && shown.pm + 15 <= H(21), 'the view shows late-shift breaks');
  advance(s, H(12, 30) - s.minute); // through 12:00, p0's first late interval
  const after = s.breaks.plan.p0;
  assert.deepEqual(after, shown, 'the interval keeps what the view showed');
  for (const id of Object.keys(before)) if (id !== 'p0') assert.deepEqual(s.breaks.plan[id], before[id], id);
  assert.equal(view(s).people.find((p) => p.id === 'p2').breaks, null, 'rostered off');
});

// view() runs every animation frame: someone whose kept entry does not fit
// (moved to another shift) must not cost a full re-plan per call.
test('a re-plan for someone who was moved is made once per day, not on every lookup', () => {
  const s = createGame(5);
  advance(s, 30);
  act(s, { type: 'setRoster', personId: 'p0', weekday: 0, shift: 'late' });
  const first = breakLookup(s, { keep: false })(s.people[0], 'late');
  assert.equal(breakLookup(s, { keep: false })(s.people[0], 'late'), first, 'same entry object: not planned again');
  assert.equal(s.breaks.plan.p0.am < H(12), true, 'the kept plan is untouched by the view');
  // Another roster change in the same day plans afresh.
  const other = s.people.find((p) => p.id !== 'p0' && shiftOf(s, p.id) === 'early');
  act(s, { type: 'setRoster', personId: other.id, weekday: 0, shift: 'late' });
  assert.notEqual(breakLookup(s, { keep: false })(s.people[0], 'late'), first);
  // And so does the next day.
  const again = breakLookup(s, { keep: false })(s.people[0], 'late');
  s.day += 1;
  assert.notEqual(breakLookup(s, { keep: false })(s.people[0], 'late'), again);
});

test('breaks move only work shares, never the game rng: a day of intervals draws the same with any plan', () => {
  const run = (shift) => {
    const s = createGame(5);
    s.day = 1;
    s.minute = 0;
    const plan = planBreaks(s, 1);
    for (const e of Object.values(plan)) for (const k of ['am', 'lunch', 'pm']) e[k] += shift;
    s.breaks = { day: 1, plan };
    const rng = createRng(77);
    const offered = [];
    for (let i = 0; i < 48; i++) offered.push(Object.values(stepInterval(s, rng).clients).map((c) => c.offered));
    return { rng: rng.state(), offered, satisfaction: s.clients.map((c) => c.satisfaction) };
  };
  const a = run(0);
  const b = run(15);
  assert.equal(a.rng, b.rng);
  assert.deepEqual(a.offered, b.offered, 'the same calls arrive');
  assert.notDeepEqual(a.satisfaction, b.satisfaction, 'the plans differ in effect');
});

test('the fixed break groups are gone: workShare and onBreak need a plan', () => {
  assert.equal('breakGroups' in interval, false);
  assert.throws(() => workShare(H(12), 'early'), TypeError);
  assert.throws(() => workShare(H(12), 'early', 1), TypeError);
  assert.throws(() => onBreak(H(12), 'early'), TypeError);
  const plan = { am: H(10), lunch: H(12), pm: H(15) };
  assert.equal(onBreak(H(12), 'early', plan), true);
  assert.equal(onBreak(H(11), 'early', plan), false);
  assert.equal(workShare(H(18), 'early', plan), 0, 'outside the shift');
});

test('lead away on weekdays: breaks by auto and one breaks-auto event a weekday, none at the weekend', () => {
  const s = createGame(5);
  // A weekend client with every agent also on its Saturday and Sunday shifts,
  // so there are weekend plans without the lead (who works Monday to Friday).
  s.clients.push({ id: 'baram-delivery', satisfaction: 70, active: true });
  const agents = s.people.filter((p) => p.role === 'agent').map((p) => p.id);
  for (const id of agents) s.roster[id] = { ...s.roster[id], 5: 'weekend', 6: 'weekend' };
  leadOf(s).health = { kind: 'leave', daysLeft: 9 };
  const plans = {};
  for (let d = 0; d < 8; d++) {
    // Small steps: the plan and its event are made once a day, however advance is called.
    for (let k = 0; k < 48; k++) { advance(s, 30); view(s); }
    plans[s.breaks.day] = s.breaks.plan;
  }
  for (let d = 1; d <= 8; d++) {
    const entries = Object.values(plans[d]);
    assert.ok(entries.length > 0, `day ${d} has a plan`);
    for (const e of entries) assert.equal(e.by, 'auto', `day ${d}`);
  }
  for (const d of [5, 6]) {
    assert.ok(Object.keys(plans[d]).every((id) => agents.includes(id)), `day ${d}: only the weekend crew`);
  }
  assert.deepEqual(autoEvents(s).map((e) => e.day), [0, 1, 2, 3, 4, 7, 8]);
  assert.equal(autoEvents(s)[0].personId, undefined);
});

test('lead present: by lead and no event; a lead back from sick leave plans again', () => {
  const s = createGame(5);
  leadOf(s).health = { kind: 'sick', daysLeft: 1 };
  advance(s, 30);
  assert.equal(Object.values(s.breaks.plan)[0].by, 'auto');
  assert.deepEqual(autoEvents(s).map((e) => e.day), [0]);
  advance(s, DAY);
  assert.equal(s.day, 1);
  assert.equal(leadOf(s).health.kind, 'well');
  for (const e of Object.values(s.breaks.plan)) assert.equal(e.by, 'lead');
  assert.deepEqual(autoEvents(s).map((e) => e.day), [0], 'no event on day 1');
});

test('a v1.5 save (no plan, no planning skill) loads with a plan for today; the next day start makes a new one', () => {
  const s = createGame(9);
  advance(s, 3 * DAY); // day 3, 09:00
  const old = JSON.parse(serialize(s));
  delete old.breaks;
  for (const p of old.people) delete p.skills.planning;
  const g = load(memoryStorage({ [SAVE_KEY]: JSON.stringify(old) }));
  assert.ok(g);
  assert.equal(g.breaks.day, 3);
  assert.deepEqual(g.breaks.plan, s.breaks.plan, 'same plan as the game that never left');
  advance(g, DAY);
  assert.equal(g.breaks.day, 4);
  assert.deepEqual(g.breaks.plan, planBreaks(g, 4));

  // A malformed or stale plan is rebuilt instead of breaking the interval.
  for (const bad of [{ day: 3, plan: { p0: { am: 'x', lunch: 1, pm: 2, by: 'lead' } } }, { day: 2, plan: {} }, 'x', { day: 3 }]) {
    const b = load(memoryStorage({ [SAVE_KEY]: JSON.stringify({ ...old, breaks: bad }) }));
    assert.ok(b, JSON.stringify(bad));
    assert.equal(b.breaks.day, 3);
    assert.deepEqual(b.breaks.plan, s.breaks.plan, JSON.stringify(bad));
  }
});

test('view: each person\'s breaks today, lunch during the lunch hour, break during short breaks', () => {
  const fresh = createGame(5);
  const v0 = view(fresh);
  assert.deepEqual(v0.people.find((p) => p.id === 'p0').breaks, planBreaks(fresh, 0).p0, 'built for the view');
  assert.equal(fresh.breaks, undefined, 'view changes nothing');
  assert.equal('breakGroup' in v0.people[0], false);

  const s = createGame(5);
  s.day = 1;
  const plan = planBreaks(s, 1);
  plan.p0 = { am: H(10, 15), lunch: H(12), pm: H(15, 30), by: 'lead' };
  s.breaks = { day: 1, plan };
  s.absences.push({ personId: 'p6', day: 1 });
  const at = (minute, id = 'p0') => { s.minute = minute; return view(s).people.find((p) => p.id === id); };
  assert.deepEqual(at(H(9)).breaks, { am: H(10, 15), lunch: H(12), pm: H(15, 30), by: 'lead' });
  assert.equal(at(H(9)).activity, 'phone');
  assert.equal(at(H(10)).activity, 'break');
  assert.equal(at(H(10, 30)).activity, 'phone');
  assert.equal(at(H(12)).activity, 'lunch');
  assert.equal(at(H(12, 30)).activity, 'lunch');
  assert.equal(at(H(13)).activity, 'phone');
  assert.equal(at(H(15, 30)).activity, 'break');
  assert.equal(at(H(10), 'p6').breaks, null, 'absent today');
  assert.equal(at(H(10), 'p6').activity, 'off');
  s.day = 5; // Saturday, no weekend client: nobody works
  for (const p of view(s).people) assert.equal(p.breaks, null, p.id);
});

test('breaks-auto copy is the approved copy', () => {
  assert.deepEqual(EVENTS['breaks-auto'], {
    title: '휴식 자동 배정',
    text: '오늘은 팀장이 자리에 없어 휴식 시간이 무작위로 정해졌어요. 콜이 몰리는 시간에 자리가 빌 수 있어요.',
  });
  assert.deepEqual(ADVISOR['breaks-auto'], ['팀장이 없는 날엔 휴식표가 엉성해져요. 오늘은 서비스 레벨을 자주 봐 주세요.']);
});
