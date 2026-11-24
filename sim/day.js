// End of day: health, breaking points, holiday leave, Friday-off requests,
// growth, call spikes and the daily report. Pure rules, no DOM.
//
// Runs once per calendar day, after the day's last interval. Health counts down
// every day; everything else only when the ending day was a workday. Rolls use
// end-of-day values; overnight recovery comes last.
import { dateOf, isWorkday, holidaysOn } from './calendar.js';
import { moraleOf, overnight } from './people.js';
import { pushEvent, expireEvents } from './events.js';
import { SHIFTS } from './schedule.js';
import { NATIONS } from '../world/nations.js';

const SICK_DAYS = [3, 6];
// Chance per workday of falling ill: a base plus more with stress and fatigue.
const SICK = { base: 0.003, perStress: 0.015, perFatigue: 0.006 };
const BURNOUT_DAYS = [5, 10];
const BURNOUT_STRESS = 80;
const BURNOUT_STREAK = 10;
const BREAKING_MORALE = 25;
const BREAKING_CHANCE = 0.08;
const BREAKING_EVENTS = ['no-show', 'argument', 'resign-notice'];
const ARGUMENT_SATISFACTION = 3;
const RESIGN_WORKDAYS = 10;
const FRIDAY = 4;
const SPIKE_CHANCE = 0.05;
const COACH = { handling: 0.05, stress: 1, morale: 2 };
const QA_SATISFACTION = 0.03;
const TRAINING_HANDLING = 0.15;
const MAX_SKILL = 10;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const nationOf = (id) => NATIONS.find((n) => n.id === id);

function nextWorkday(day) {
  let d = day + 1;
  while (!isWorkday(d)) d++;
  return d;
}

function addWorkdays(day, n) {
  let d = day;
  for (let i = 0; i < n; i++) d = nextWorkday(d);
  return d;
}

function processLeaving(state) {
  const due = (state.leaving ?? []).filter((l) => l.day <= state.day);
  if (due.length === 0) return;
  state.leaving = state.leaving.filter((l) => l.day > state.day);
  for (const l of due) {
    const person = state.people.find((p) => p.id === l.personId);
    if (!person) continue;
    if (l.withdrawIfMoraleAbove !== undefined && moraleOf(person) > l.withdrawIfMoraleAbove) continue;
    state.people = state.people.filter((p) => p !== person);
    delete state.assignment[person.id];
    delete state.roster[person.id];
    state.absences = state.absences.filter((a) => a.personId !== person.id);
    for (const e of state.inbox ?? []) {
      if (e.personId === person.id) e.resolved = true;
    }
  }
}

function countDownHealth(person) {
  if (person.health.kind === 'well') return;
  const daysLeft = person.health.daysLeft - 1;
  person.health = daysLeft <= 0 ? { kind: 'well', daysLeft: 0 } : { ...person.health, daysLeft };
}

const phoneClient = (state, person) => {
  const a = state.assignment[person.id];
  return a?.kind === 'phone' ? a.clientId : undefined;
};

function rollHealth(state, person, rng) {
  const sickChance = SICK.base + (person.stress / 100) * SICK.perStress + (person.fatigue / 100) * SICK.perFatigue;
  if (rng.chance(sickChance)) {
    const days = Math.max(1, Math.round(rng.int(...SICK_DAYS) * (state.mods?.sickDaysMul ?? 1)));
    person.health = { kind: 'sick', daysLeft: days };
    person.history.highStressDays = 0;
    pushEvent(state, { id: 'sick', personId: person.id, clientId: phoneClient(state, person), data: { days } });
    return;
  }
  person.history.highStressDays = person.stress >= BURNOUT_STRESS ? person.history.highStressDays + 1 : 0;
  if (person.history.highStressDays >= BURNOUT_STREAK) {
    const days = rng.int(...BURNOUT_DAYS);
    person.health = { kind: 'burnout', daysLeft: days };
    person.history.highStressDays = 0;
    pushEvent(state, { id: 'burnout', personId: person.id, clientId: phoneClient(state, person), data: { days } });
  }
}

const hasOpenNotice = (state, person) =>
  (state.leaving ?? []).some((l) => l.personId === person.id)
  || (state.inbox ?? []).some((e) => e.id === 'resign-notice' && e.personId === person.id && !e.resolved);

function rollBreakingPoint(state, person, rng) {
  if (moraleOf(person) >= BREAKING_MORALE || !rng.chance(BREAKING_CHANCE)) return;
  const kind = rng.pick(BREAKING_EVENTS);
  const clientId = phoneClient(state, person);
  if (kind === 'no-show') {
    state.absences.push({ personId: person.id, day: nextWorkday(state.day) });
    pushEvent(state, { id: kind, personId: person.id, clientId });
  } else if (kind === 'argument') {
    const client = state.clients.find((c) => c.id === clientId);
    if (client) client.satisfaction = clamp(client.satisfaction - ARGUMENT_SATISFACTION, 0, 100);
    // Task 11's reputation reads this as a deduction.
    state.reputationPenalty = (state.reputationPenalty ?? 0) + 1;
    pushEvent(state, { id: kind, personId: person.id, clientId });
  } else if (!hasOpenNotice(state, person)) {
    const leaveDay = addWorkdays(state.day, RESIGN_WORKDAYS);
    pushEvent(state, {
      id: kind, personId: person.id, data: { days: RESIGN_WORKDAYS, leaveDay }, deadlineDay: leaveDay,
    });
  }
}

// A holiday of the person's nation that covers the next workday and has not
// started yet (so it is asked once, on the last workday before it).
function askHolidayLeave(state, person, rng) {
  const nation = nationOf(person.nation);
  if (!nation) return;
  const firstWorkday = nextWorkday(state.day);
  for (const { holiday, startDay } of holidaysOn(firstWorkday, nation)) {
    if (startDay <= state.day) continue;
    const key = `${holiday.id}@${startDay}`;
    if (person.history.lastLeaveAsk === key || !rng.chance(holiday.staffLeave)) continue;
    person.history.lastLeaveAsk = key;
    // The passive answer is "grant", so the leave starts now; refusing undoes it.
    const endDay = startDay + holiday.length - 1;
    person.health = { kind: 'leave', daysLeft: endDay - state.day };
    pushEvent(state, {
      id: 'holiday-leave',
      personId: person.id,
      data: {
        holidayId: holiday.id, nationId: nation.id, startDay, endDay, firstWorkday,
      },
      deadlineDay: firstWorkday,
    });
  }
}

function askFridayOff(state, person) {
  const nation = nationOf(person.nation);
  const { weekday } = dateOf(state.day);
  const week = state.day - weekday; // the week's Monday
  if (!nation?.weeklyRest.includes(FRIDAY) || weekday >= FRIDAY) return;
  if (!SHIFTS[state.roster[person.id]?.[FRIDAY]] || person.history.lastFridayAskWeek === week) return;
  person.history.lastFridayAskWeek = week;
  pushEvent(state, {
    id: 'friday-off', personId: person.id, data: { nationId: nation.id },
    deadlineDay: state.day - weekday + FRIDAY,
  });
}

function grow(state) {
  const progress = state.progress;
  const agents = state.people.filter((p) => p.role === 'agent' && p.health.kind === 'well');

  const coached = [...agents].sort((a, b) => moraleOf(a) - moraleOf(b));
  const sessions = Math.floor(progress.coaching ?? 0);
  for (let i = 0; i < sessions && coached.length > 0; i++) {
    const p = coached[i % coached.length];
    p.skills.handling = Math.min(MAX_SKILL, p.skills.handling + COACH.handling);
    p.stress = clamp(p.stress - COACH.stress, 0, 100);
    p.moraleBoost = (p.moraleBoost ?? 0) + COACH.morale;
    p.morale = moraleOf(p);
  }

  const qa = progress.qa ?? 0;
  for (const c of state.clients) {
    if (c.active) c.satisfaction = clamp(c.satisfaction + qa * QA_SATISFACTION, 0, 100);
  }

  const lessons = Math.floor(progress.training ?? 0);
  for (const p of state.people) {
    if (p.probationDays <= 0) continue;
    if (p.health.kind === 'well') {
      p.skills.handling = Math.min(MAX_SKILL, p.skills.handling + lessons * TRAINING_HANDLING);
    }
    p.probationDays -= 1;
  }

  progress.coaching = 0;
  progress.qa = 0;
  progress.training = 0;
}

function planSpikes(state, rng) {
  const day = nextWorkday(state.day);
  for (const c of state.clients) {
    if (!c.active || !rng.chance(SPIKE_CHANCE)) continue;
    state.spikes.push({ clientId: c.id, day });
    pushEvent(state, { id: 'call-spike', clientId: c.id, data: { day } });
  }
}

export function endOfDay(state, rng) {
  if (state.gameOver) return;
  const workday = isWorkday(state.day);
  state.spikes = (state.spikes ?? []).filter((s) => s.day >= state.day);
  state.absences ??= [];
  expireEvents(state, rng);
  processLeaving(state);

  const wellAtStart = new Set(state.people.filter((p) => p.health.kind === 'well'));
  for (const p of state.people) countDownHealth(p);

  if (workday) {
    for (const p of state.people) {
      if (!wellAtStart.has(p)) {
        p.history.highStressDays = 0;
        continue;
      }
      rollHealth(state, p, rng);
      if (p.health.kind !== 'well') continue;
      rollBreakingPoint(state, p, rng);
      askHolidayLeave(state, p, rng);
      askFridayOff(state, p);
    }
    grow(state);
    planSpikes(state, rng);
    (state.history ??= []).push({ day: state.day, clients: structuredClone(state.today?.clients ?? {}) });
  }
  state.today = { clients: {} };

  for (const p of state.people) {
    p.moraleBoost = (p.moraleBoost ?? 0) / 2;
    overnight(p);
  }
  state.lastEndedDay = state.day;
}
