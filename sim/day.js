// End of day: health, breaking points, holiday leave, Friday-off requests,
// growth, call spikes and the daily report. Pure rules, no DOM.
//
// Runs once per calendar day, after the day's last interval. Health counts down
// every day; everything else only when the center was open that day (Mon-Fri,
// and Sat-Sun with an active weekend client, v1.2; "workday" below). Rolls use
// end-of-day values; overnight recovery comes last.
import { dateOf, holidaysOn } from './calendar.js';
import { moraleOf, overnight, wearDay, WEAR } from './people.js';
import { pushEvent, expireEvents } from './events.js';
import { backlogWarnings } from './backlog.js';
import { channelOf } from './interval.js';
import { SHIFTS, isCenterOpen, shiftRunsOn } from './schedule.js';
import { ensureBreakPlan } from './breaks.js';
import { CLIENTS } from '../world/clients.js';
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
// An argument is with a caller, so only someone answering for a client has one.
const BREAKING_EVENTS_OFF_PHONE = ['no-show', 'resign-notice'];
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

// The next day the center opens (Monday after a Friday unless a weekend client is active).
function nextWorkday(state, day) {
  let d = day + 1;
  while (!isCenterOpen(state, d)) d++;
  return d;
}

// A person's own working days: Monday to Friday (as before v1.2, rostered off
// or not), plus Saturday or Sunday only when the center opens and they are
// rostered on a shift that runs that day. So a weekday-only agent's next
// working day after Friday is Monday even with a weekend client.
function isPersonWorkday(state, person, d) {
  if (!isCenterOpen(state, d)) return false;
  const { weekday } = dateOf(d);
  return weekday < 5 || shiftRunsOn(state.roster[person.id]?.[weekday], weekday);
}

function nextPersonWorkday(state, person, day) {
  let d = day + 1;
  while (!isPersonWorkday(state, person, d)) d++;
  return d;
}

function addPersonWorkdays(state, person, day, n) {
  let d = day;
  for (let i = 0; i < n; i++) d = nextPersonWorkday(state, person, d);
  return d;
}

// The next day the client itself opens (a week on if it never does).
function nextClientDay(def, day) {
  for (let d = day + 1; d <= day + 7; d++) if (def.hours.days.includes(dateOf(d).weekday)) return d;
  return day + 7;
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
    delete state.breakRules?.[person.id]; // v2.3
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
  const clientId = phoneClient(state, person);
  const kind = rng.pick(clientId === undefined ? BREAKING_EVENTS_OFF_PHONE : BREAKING_EVENTS);
  if (kind === 'no-show') {
    state.absences.push({ personId: person.id, day: nextPersonWorkday(state, person, state.day) });
    pushEvent(state, { id: kind, personId: person.id, clientId });
  } else if (kind === 'argument') {
    const client = state.clients.find((c) => c.id === clientId);
    if (client) client.satisfaction = clamp(client.satisfaction - ARGUMENT_SATISFACTION, 0, 100);
    // Task 11's reputation reads this as a deduction.
    state.reputationPenalty = (state.reputationPenalty ?? 0) + 1;
    pushEvent(state, { id: kind, personId: person.id, clientId });
  } else if (!hasOpenNotice(state, person)) {
    const leaveDay = addPersonWorkdays(state, person, state.day, RESIGN_WORKDAYS);
    pushEvent(state, {
      id: kind,
      personId: person.id,
      // v1.7: lead marks a lead's notice (Kim Miso's advice differs).
      data: { days: RESIGN_WORKDAYS, leaveDay, ...(person.role === 'lead' && { lead: true }) },
      deadlineDay: leaveDay,
    });
  }
}

// A holiday of the person's nation that covers their next working day and has
// not started yet (so it is asked once, on the last workday before it). A
// weekday-only agent is not asked about a holiday that covers only Sat-Sun.
function askHolidayLeave(state, person, rng) {
  const nation = nationOf(person.nation);
  if (!nation) return;
  const firstWorkday = nextPersonWorkday(state, person, state.day);
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

const FRIDAY_ASK_GAP = 28; // days between friday-off asks of one person
export const FRIDAY_ASK_CHANCE = 0.25;

function askFridayOff(state, person, rng) {
  const nation = nationOf(person.nation);
  const { weekday } = dateOf(state.day);
  const week = state.day - weekday; // the week's Monday
  if (!nation?.weeklyRest.includes(FRIDAY) || weekday >= FRIDAY) return;
  if (!SHIFTS[state.roster[person.id]?.[FRIDAY]] || person.history.lastFridayAskWeek === week) return;
  // lastFridayAskDay is missing in old saves: treated as never asked.
  if (state.day - (person.history.lastFridayAskDay ?? -Infinity) < FRIDAY_ASK_GAP) return;
  person.history.lastFridayAskWeek = week; // one roll per person per week
  if (!rng.chance(FRIDAY_ASK_CHANCE)) return; // rolled only for otherwise eligible people
  person.history.lastFridayAskDay = state.day;
  const fridayDay = week + FRIDAY;
  pushEvent(state, {
    id: 'friday-off', personId: person.id, data: { nationId: nation.id, fridayDay },
    deadlineDay: fridayDay,
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

// A spike lands on the client's own next open day. v1.3: only phone clients
// spike (the event's copy is about calls); chat and email clients still take
// their roll, so the rng draws stay as before, but never spike.
function planSpikes(state, rng) {
  for (const c of state.clients) {
    if (!c.active || !rng.chance(SPIKE_CHANCE)) continue;
    const def = CLIENTS.find((d) => d.id === c.id);
    if (def && channelOf(def) !== 'phone') continue;
    const day = def ? nextClientDay(def, state.day) : nextWorkday(state, state.day);
    state.spikes.push({ clientId: c.id, day });
    pushEvent(state, { id: 'call-spike', clientId: c.id, data: { day } });
  }
}

// v1.6 start of a day: today's break plan (sim/breaks.js), made after the
// night's health, absence and leave updates (endOfDay), or lazily for a new
// game or a save without one. On a weekday when the team has a lead who is
// away (sick, absent, on leave or off) the breaks fall at random (by 'auto'):
// one breaks-auto notice that day. With no lead at all the breaks are random
// too, but there is no notice: it would repeat for ever with nothing to do
// about it. Never at the weekend, and nothing when the day already has its plan.
const BREAKS_AUTO = 'breaks-auto';
export function startDay(state) {
  if (state.gameOver || !ensureBreakPlan(state)) return;
  const entries = Object.values(state.breaks.plan);
  if (dateOf(state.day).weekday >= 5 || entries.length === 0) return;
  if (!entries.every((e) => e.by === 'auto')) return;
  if (!state.people.some((p) => p.role === 'lead')) return;
  if ((state.inbox ?? []).some((e) => e.id === BREAKS_AUTO && e.day === state.day)) return;
  pushEvent(state, { id: BREAKS_AUTO });
}

export function endOfDay(state, rng) {
  if (state.gameOver) return;
  const workday = isCenterOpen(state, state.day);
  state.spikes = (state.spikes ?? []).filter((s) => s.day >= state.day);
  state.absences ??= [];
  expireEvents(state, rng);
  processLeaving(state);

  const wellAtStart = new Set(state.people.filter((p) => p.health.kind === 'well'));
  for (const p of state.people) countDownHealth(p);

  if (workday) {
    for (const p of state.people) {
      wearDay(p, wellAtStart.has(p) && p.stress >= WEAR.from);
      if (!wellAtStart.has(p)) {
        p.history.highStressDays = 0;
        continue;
      }
      rollHealth(state, p, rng);
      if (p.health.kind !== 'well') continue;
      rollBreakingPoint(state, p, rng);
      askHolidayLeave(state, p, rng);
      askFridayOff(state, p, rng);
    }
    grow(state);
    planSpikes(state, rng);
    backlogWarnings(state);
    (state.history ??= []).push({ day: state.day, clients: structuredClone(state.today?.clients ?? {}) });
  }
  state.today = { clients: {} };

  for (const p of state.people) {
    p.moraleBoost = (p.moraleBoost ?? 0) / 2;
    overnight(p);
  }
  state.lastEndedDay = state.day;
}
