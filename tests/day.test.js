import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../sim/rng.js';
import { createPerson, moraleOf } from '../sim/people.js';
import { defaultRoster } from '../sim/schedule.js';
import { isWorkday } from '../sim/calendar.js';
import { endOfDay } from '../sim/day.js';
import { resolveEvent } from '../sim/events.js';

const GUREUM = 'gureum-travel';
const MULBIT = 'mulbit-telecom';
const never = { next: () => 0.99, int: (a) => a, pick: (a) => a[0], chance: () => false };
// Fires only chances of at least `min` (staffLeave 0.2 yes; sickness, spikes, breaking point no).
// Fires only the friday-off roll (chance 0.25).
const asking = { ...never, chance: (p) => p === 0.25 };
const above = (min) => ({ ...never, chance: (p) => p >= min });

function makeState({ day = 0, nations = ['veltora', 'kamuen'] } = {}) {
  const rng = createRng(21);
  const people = nations.map((nation, i) => createPerson(rng, { id: `p${i}`, role: 'agent', nation }));
  const assignment = Object.fromEntries(people.map((p) => [p.id, { kind: 'phone', clientId: GUREUM }]));
  return {
    day, minute: 1260, people, roster: defaultRoster(people), absences: [], assignment,
    clients: [GUREUM, MULBIT].map((id) => ({ id, satisfaction: 70, active: true })),
    mods: {}, progress: { coaching: 0, qa: 0, research: 0, training: 0 },
    today: { clients: {} }, spikes: [], inbox: [], history: [], leaving: [],
  };
}
const set = (p, fields) => { Object.assign(p, fields); p.morale = moraleOf(p); };
const ids = (state, id) => state.inbox.filter((e) => e.id === id);

test('stress raises the chance of getting sick', () => {
  const count = (stress) => {
    const state = makeState({ nations: ['veltora'] });
    const p = state.people[0];
    const rng = createRng(3);
    let sick = 0;
    for (let i = 0; i < 1000; i++) {
      set(p, { stress, fatigue: 30, health: { kind: 'well', daysLeft: 0 } });
      p.history.highStressDays = 0;
      state.day = 0;
      state.inbox = [];
      state.leaving = [];
      endOfDay(state, rng);
      if (p.health.kind === 'sick') sick++;
    }
    return sick;
  };
  const high = count(90);
  const low = count(10);
  assert.ok(high > low * 2, `high ${high} low ${low}`);
});

test('sickness lasts 3-6 days and pushes a sick event; the clinic shortens it', () => {
  const state = makeState({ nations: ['veltora'] });
  const always = { ...never, chance: (p) => p > 0 && p < 0.05, int: (a, b) => b };
  endOfDay(state, always);
  const p = state.people[0];
  assert.deepEqual(p.health, { kind: 'sick', daysLeft: 6 });
  assert.equal(ids(state, 'sick')[0].personId, 'p0');
  assert.equal(ids(state, 'sick')[0].data.days, 6);

  const clinic = makeState({ nations: ['veltora'] });
  clinic.mods.sickDaysMul = 0.6;
  endOfDay(clinic, always);
  assert.equal(clinic.people[0].health.daysLeft, 4); // round(6 x 0.6)
});

test('ten high-stress workdays in a row cause burnout', () => {
  const state = makeState({ nations: ['veltora'] });
  const p = state.people[0];
  const workdays = [0, 1, 2, 3, 4, 7, 8, 9, 10, 11]; // two weeks, Mon-Fri
  for (const day of workdays.slice(0, 9)) {
    state.day = day;
    set(p, { stress: 85 });
    endOfDay(state, never);
  }
  assert.equal(p.health.kind, 'well');
  assert.equal(p.history.highStressDays, 9);
  state.day = workdays[9];
  set(p, { stress: 85 });
  endOfDay(state, { ...never, int: (a, b) => b });
  assert.deepEqual(p.health, { kind: 'burnout', daysLeft: 10 });
  assert.equal(p.history.highStressDays, 0);
  assert.equal(ids(state, 'burnout').length, 1);
});

test('a calm workday breaks the high-stress streak', () => {
  const state = makeState({ nations: ['veltora'] });
  const p = state.people[0];
  for (let day = 0; day < 6; day++) {
    state.day = day === 5 ? 7 : day; // Mon-Fri, then next Monday
    set(p, { stress: day === 2 ? 50 : 85 });
    endOfDay(state, never);
  }
  assert.equal(p.health.kind, 'well');
  assert.equal(p.history.highStressDays, 3);
});

test('sick person comes back when days run out', () => {
  const state = makeState({ day: 4, nations: ['veltora'] }); // Friday
  const p = state.people[0];
  p.health = { kind: 'sick', daysLeft: 2 };
  endOfDay(state, never);
  assert.deepEqual(p.health, { kind: 'sick', daysLeft: 1 });
  state.day = 5; // Saturday: countdown still runs
  endOfDay(state, never);
  assert.deepEqual(p.health, { kind: 'well', daysLeft: 0 });
});

test('low morale can cause a breaking-point event, high morale never does', () => {
  const run = (stress, fatigue) => {
    const state = makeState({ nations: ['veltora'] });
    const p = state.people[0];
    const rng = createRng(9);
    const seen = [];
    for (let i = 0; i < 300; i++) {
      set(p, { stress, fatigue, health: { kind: 'well', daysLeft: 0 } });
      p.history.highStressDays = 0;
      state.day = 0;
      state.inbox = [];
      state.leaving = [];
      endOfDay(state, rng);
      for (const e of state.inbox) {
        if (['no-show', 'argument', 'resign-notice'].includes(e.id)) seen.push(e.id);
      }
    }
    return seen;
  };
  const low = run(100, 100); // morale 0
  assert.ok(low.length > 10, `low ${low.length}`);
  for (const id of ['no-show', 'argument', 'resign-notice']) assert.ok(low.includes(id), id);
  assert.equal(run(0, 0).length, 0);
});

test('breaking-point effects: no-show absence, argument costs satisfaction, resign-notice sets a deadline', () => {
  const pickAt = (i) => ({ ...never, chance: (p) => p === 0.08, pick: (a) => a[i] });
  const s0 = makeState({ day: 4, nations: ['veltora'] }); // Friday
  set(s0.people[0], { stress: 100, fatigue: 100 });
  endOfDay(s0, pickAt(0));
  assert.equal(ids(s0, 'no-show').length, 1);
  assert.deepEqual(s0.absences, [{ personId: 'p0', day: 7 }]); // next workday, Monday

  const s1 = makeState({ day: 4, nations: ['veltora'] });
  set(s1.people[0], { stress: 100, fatigue: 100 });
  endOfDay(s1, pickAt(1));
  assert.equal(ids(s1, 'argument')[0].clientId, GUREUM);
  assert.deepEqual(ids(s1, 'argument')[0].data, { name: s1.people[0].name, client: '구름다리 여행' });
  assert.equal(s1.clients[0].satisfaction, 67);
  assert.equal(s1.clients[1].satisfaction, 70);
  assert.equal(s1.reputationPenalty, 1);

  const s2 = makeState({ day: 4, nations: ['veltora'] });
  set(s2.people[0], { stress: 100, fatigue: 100 });
  endOfDay(s2, pickAt(2));
  const notice = ids(s2, 'resign-notice')[0];
  assert.deepEqual(notice.data, { days: 10, leaveDay: 18, name: s2.people[0].name }); // 10 workdays after Friday day 4
  assert.equal(notice.deadlineDay, 18);
  s2.day = 7;
  endOfDay(s2, pickAt(2));
  assert.equal(ids(s2, 'resign-notice').length, 1, 'no second notice while one is open');
});

test('someone not on the phone has no argument, and their events name no client', () => {
  // Breaking point always fires and would pick 'argument' whenever it is offered.
  const rng = { ...never, chance: (p) => p === 0.08, pick: (a) => (a.includes('argument') ? 'argument' : a[0]) };
  const s = makeState({ day: 4, nations: ['veltora'] });
  s.assignment.p0 = { kind: 'coaching' };
  set(s.people[0], { stress: 100, fatigue: 100 });
  endOfDay(s, rng);
  assert.equal(ids(s, 'argument').length, 0);
  assert.equal(ids(s, 'no-show').length, 1);
  assert.equal(s.reputationPenalty, undefined);

  const sick = makeState({ nations: ['veltora'] });
  sick.assignment.p0 = { kind: 'qa' };
  endOfDay(sick, { ...never, chance: (p) => p > 0 && p < 0.05, int: (a, b) => b });
  const e = ids(sick, 'sick')[0];
  assert.equal(e.clientId, undefined);
  assert.deepEqual(e.data, { days: 6, name: sick.people[0].name });
});

test('a person who leaves is removed on the leave day unless morale recovered', () => {
  const state = makeState({ day: 18 });
  state.leaving = [
    { personId: 'p0', day: 18 },
    { personId: 'p1', day: 18, withdrawIfMoraleAbove: 50 },
  ];
  set(state.people[1], { stress: 0, fatigue: 0 });
  state.absences = [{ personId: 'p0', day: 21 }, { personId: 'p1', day: 21 }];
  state.inbox = [
    { id: 'friday-off', personId: 'p0', day: 14, deadlineDay: 25, seen: false, resolved: false },
    { id: 'sick', personId: 'p0', day: 14, seen: false, resolved: false },
  ];
  endOfDay(state, never);
  assert.deepEqual(state.absences, [{ personId: 'p1', day: 21 }]);
  assert.ok(state.inbox.every((e) => e.resolved), 'their open events are closed');
  assert.equal(state.inbox[0].choice, undefined, 'closed without a choice effect');
  assert.deepEqual(state.people.map((p) => p.id), ['p1']);
  assert.equal(state.assignment.p0, undefined);
  assert.equal(state.roster.p0, undefined);
  assert.deepEqual(state.leaving, []);
});

test('holiday leave asked only for the person\'s own nation, only before a workday', () => {
  // Veltora seed-day starts day 74 (Friday). Asked on Thursday 73, only of the Veltora person.
  const state = makeState({ day: 73 });
  endOfDay(state, above(0.15));
  const asks = ids(state, 'holiday-leave');
  assert.equal(asks.length, 1);
  assert.equal(asks[0].personId, 'p0');
  assert.deepEqual(asks[0].data, {
    holidayId: 'seed-day', nationId: 'veltora', startDay: 74, endDay: 74, firstWorkday: 74,
    name: state.people[0].name,
  });
  assert.equal(asks[0].deadlineDay, 74);

  // Veltora thanks-day starts day 307, a Sunday: nothing on Friday 305, Saturday has no rolls.
  for (const day of [305, 306]) {
    const s = makeState({ day });
    endOfDay(s, above(0.15));
    assert.equal(ids(s, 'holiday-leave').length, 0, `day ${day}`);
  }
  assert.equal(isWorkday(306), false);
});

test('a holiday starting on the weekend and running into Monday is asked on Friday', () => {
  // Veltora harvest: day 264 (Saturday), 3 days -> covers Monday 266.
  const state = makeState({ day: 263, nations: ['veltora'] });
  endOfDay(state, above(0.15));
  const ask = ids(state, 'holiday-leave')[0];
  assert.equal(ask.data.firstWorkday, 266);
  assert.equal(ask.data.endDay, 266);
  state.day = 266;
  state.inbox = [];
  endOfDay(state, above(0.15));
  assert.equal(ids(state, 'holiday-leave').length, 0, 'not asked again once started');
});

test('granted leave keeps the person off until the holiday ends', () => {
  const state = makeState({ day: 263, nations: ['veltora'] });
  endOfDay(state, above(0.15)); // Friday: asked about harvest Sat-Mon
  resolveEvent(state, state.inbox.findIndex((e) => e.id === 'holiday-leave'), 'grant', never);
  const p = state.people[0];
  for (const day of [264, 265, 266]) {
    assert.equal(p.health.kind, 'leave', `day ${day}`);
    state.day = day;
    endOfDay(state, never);
  }
  assert.equal(p.health.kind, 'well');
});

test('an unanswered holiday-leave request still gives the whole holiday off', () => {
  // Seed-day, 1 day, Friday 74: asked Thursday 73.
  const one = makeState({ day: 73, nations: ['veltora'] });
  endOfDay(one, above(0.15));
  const p = one.people[0];
  assert.deepEqual(p.health, { kind: 'leave', daysLeft: 1 }, 'off on the holiday itself');
  one.day = 74;
  endOfDay(one, never); // deadline: passive grant
  const ask = ids(one, 'holiday-leave')[0];
  assert.equal(ask.choice, 'grant');
  assert.equal(ask.auto, true);
  assert.equal(p.health.kind, 'well', 'back after the holiday');

  // Harvest Sat-Mon asked Friday 263: off on 264, 265, 266.
  const multi = makeState({ day: 263, nations: ['veltora'] });
  endOfDay(multi, above(0.15));
  const q = multi.people[0];
  for (const day of [264, 265, 266]) {
    assert.equal(q.health.kind, 'leave', `day ${day}`);
    multi.day = day;
    endOfDay(multi, never);
  }
  assert.equal(q.health.kind, 'well');
});

test('someone who comes back today gets no new rolls until tomorrow', () => {
  const state = makeState({ nations: ['veltora', 'kamuen'] });
  for (const p of state.people) p.health = { kind: 'sick', daysLeft: 1 };
  endOfDay(state, { ...never, chance: () => true });
  assert.deepEqual(state.people.map((p) => p.health.kind), ['well', 'well']);
  assert.deepEqual(state.inbox.filter((e) => e.personId), []);
});

test('friday-off asked only for nations that rest on Friday', () => {
  const state = makeState({ day: 0 }); // Monday; p0 veltora, p1 kamuen
  endOfDay(state, asking);
  const asks = ids(state, 'friday-off');
  assert.equal(asks.length, 1);
  assert.equal(asks[0].personId, 'p1');
  assert.equal(asks[0].deadlineDay, 4);
  assert.deepEqual(asks[0].data, { nationId: 'kamuen', fridayDay: 4, name: state.people[1].name });
  state.day = 1;
  endOfDay(state, asking);
  assert.equal(ids(state, 'friday-off').length, 1, 'once in 4 weeks');
  state.day = 7;
  endOfDay(state, asking);
  assert.equal(ids(state, 'friday-off').length, 1, 'not next week');
  state.day = 28; // 4 weeks later
  endOfDay(state, asking);
  assert.equal(ids(state, 'friday-off').length, 2, 'again after 4 weeks');

  const off = makeState({ day: 0 });
  off.roster.p1[4] = 'off';
  endOfDay(off, asking);
  assert.equal(ids(off, 'friday-off').length, 0, 'not when Friday is already off');
});

test('expired events are auto-resolved at end of day', () => {
  const state = makeState({ day: 0 });
  endOfDay(state, asking); // friday-off for p1, deadline Friday 4
  for (const day of [1, 2, 3, 4]) {
    state.day = day;
    endOfDay(state, asking);
  }
  const ask = ids(state, 'friday-off')[0];
  assert.equal(ask.choice, 'keep');
  assert.equal(ask.auto, true);
});

test('friday-off is asked at most once per person per 4 weeks', () => {
  const state = makeState({ day: 0 });
  const days = [];
  for (let d = 0; d < 120; d++) {
    state.day = d;
    const before = ids(state, 'friday-off').length;
    endOfDay(state, asking);
    if (ids(state, 'friday-off').length > before) days.push(d);
  }
  assert.ok(days.length >= 2);
  for (let i = 1; i < days.length; i++) assert.ok(days[i] - days[i - 1] >= 28, `${days}`);
});

test('friday-off is still asked sometimes', () => {
  const rng = createRng(5);
  const state = makeState({ day: 0 });
  for (let d = 0; d < 360; d++) {
    state.day = d;
    endOfDay(state, rng);
  }
  const n = ids(state, 'friday-off').filter((e) => e.personId === 'p1').length;
  assert.ok(n >= 2 && n <= 8, `asked ${n} times`);
  assert.equal(ids(state, 'friday-off').filter((e) => e.personId === 'p0').length, 0);
});

test('old saves without the new history field still work', () => {
  const state = makeState({ day: 0 });
  delete state.people[1].history.lastFridayAskDay;
  state.people[1].history.lastFridayAskWeek = -7; // old field only
  endOfDay(state, asking);
  assert.equal(ids(state, 'friday-off').length, 1);
});

test('coaching progress raises the coached agent\'s skill', () => {
  const state = makeState({ nations: ['veltora', 'veltora', 'veltora'] });
  const [a, b, c] = state.people;
  set(a, { stress: 30 });
  set(b, { stress: 70 }); // lowest morale: coached first
  set(c, { stress: 50 });
  const before = state.people.map((p) => p.skills.handling);
  state.progress = { coaching: 2.6, qa: 0, research: 4, training: 0 };
  endOfDay(state, never);
  assert.ok(Math.abs(b.skills.handling - (before[1] + 0.05)) < 1e-9);
  assert.ok(Math.abs(c.skills.handling - (before[2] + 0.05)) < 1e-9);
  assert.equal(a.skills.handling, before[0]);
  assert.equal(b.moraleBoost, 1); // +2, halved overnight
  assert.equal(state.progress.coaching, 0);
  assert.equal(state.progress.research, 4);
});

test('QA progress lifts every active client, training lifts probationers', () => {
  const state = makeState({ nations: ['veltora', 'veltora'] });
  state.clients[1].active = false;
  const [rookie, vet] = state.people;
  rookie.probationDays = 10;
  const h = [rookie.skills.handling, vet.skills.handling];
  state.progress = { coaching: 0, qa: 5, research: 0, training: 2 };
  endOfDay(state, never);
  assert.ok(Math.abs(state.clients[0].satisfaction - 70.15) < 1e-9); // 5 x 0.03
  assert.equal(state.clients[1].satisfaction, 70);
  assert.ok(Math.abs(rookie.skills.handling - (h[0] + 0.3)) < 1e-9);
  assert.equal(vet.skills.handling, h[1]);
  assert.equal(rookie.probationDays, 9);
  assert.deepEqual(state.progress, { coaching: 0, qa: 0, research: 0, training: 0 });
});

test('call spikes are planned for the next workday per active client', () => {
  const state = makeState({ day: 4 });
  state.spikes = [{ clientId: GUREUM, day: 3 }];
  endOfDay(state, { ...never, chance: (p) => p === 0.05 });
  assert.deepEqual(state.spikes, [
    { clientId: GUREUM, day: 7 }, { clientId: MULBIT, day: 7 },
  ]);
  assert.deepEqual(ids(state, 'call-spike').map((e) => e.clientId), [GUREUM, MULBIT]);
  assert.deepEqual(ids(state, 'call-spike').map((e) => e.data), [
    { day: 7, client: '구름다리 여행' }, { day: 7, client: '물빛 통신' },
  ]);
});

test('workday report goes to history and today is cleared; weekends only count down', () => {
  const state = makeState({ day: 0 });
  state.today = { clients: { [GUREUM]: { offered: 300, handled: 290 } } };
  endOfDay(state, never);
  assert.deepEqual(state.history, [{ day: 0, clients: { [GUREUM]: { offered: 300, handled: 290 } } }]);
  assert.deepEqual(state.today, { clients: {} });

  const weekend = makeState({ day: 5 });
  weekend.progress.coaching = 3;
  endOfDay(weekend, { ...never, chance: () => true });
  assert.deepEqual(weekend.inbox, []);
  assert.deepEqual(weekend.history, []);
  assert.equal(weekend.progress.coaching, 3);
});

test('overnight recovery comes after the rolls and the morale boost halves each night', () => {
  const state = makeState({ nations: ['veltora'] });
  const p = state.people[0];
  set(p, { stress: 60, fatigue: 60, moraleBoost: 8 });
  endOfDay(state, never);
  assert.equal(p.fatigue, 20);
  assert.ok(Math.abs(p.stress - (60 - 4 - 0.12 * 60)) < 1e-9); // flat 4 + 12% of 60
  assert.equal(p.moraleBoost, 4);
  assert.equal(p.morale, moraleOf(p));
  assert.equal(state.lastEndedDay, 0);
});

test('same seed, same day', () => {
  const run = () => {
    const state = makeState({ nations: ['veltora', 'kamuen', 'kamuen'] });
    const rng = createRng(42);
    for (let day = 0; day < 60; day++) {
      state.day = day;
      for (const p of state.people) set(p, { stress: Math.min(100, p.stress + 30), fatigue: Math.min(100, p.fatigue + 40) });
      endOfDay(state, rng);
    }
    return state;
  };
  assert.deepEqual(run(), run());
});
