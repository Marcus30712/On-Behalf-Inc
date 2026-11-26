// Shifts and weekly roster. Pure functions; minutes are since midnight (0-1439).
//
// state.roster[personId] = { [weekday 0-6]: shiftId | 'off' }; a missing
// weekday is 'off' (new games and pre-v1.2 saves hold only 0-4). A shift is
// worked only on its own `days`.
import { dateOf } from './calendar.js';
import { CLIENTS } from '../world/clients.js';

const WEEKDAYS = [0, 1, 2, 3, 4];

export const SHIFTS = {
  early: { start: 540, end: 1080, days: [...WEEKDAYS] },
  late: { start: 720, end: 1260, days: [...WEEKDAYS] },
  // v1.2: for weekend clients (Saturday, Sunday 09:00-18:00).
  weekend: { start: 540, end: 1080, days: [5, 6] },
};

// The center opens on a weekday when any active client opens that weekday.
// Monday to Friday always count, as before v1.2, so a game with only weekday
// clients runs exactly as it did; Saturday and Sunday only with an active
// weekend client.
export function isCenterOpenWeekday(state, weekday) {
  if (WEEKDAYS.includes(weekday)) return true;
  return (state.clients ?? []).some((c) => c.active
    && CLIENTS.find((d) => d.id === c.id)?.hours.days.includes(weekday));
}

export function isCenterOpen(state, day) {
  return isCenterOpenWeekday(state, dateOf(day).weekday);
}

// True when the shift id is a shift that runs on the weekday.
export const shiftRunsOn = (shiftId, weekday) => !!SHIFTS[shiftId]?.days.includes(weekday);

// Days of the week the person is rostered on a shift that runs that day while
// the center opens. Six or more tire them faster (sim/interval.js).
export function rosteredDays(state, personId) {
  const week = state.roster[personId] ?? {};
  let n = 0;
  for (let w = 0; w < 7; w++) if (shiftRunsOn(week[w], w) && isCenterOpenWeekday(state, w)) n++;
  return n;
}

const INTERVAL = 30;

const overlap = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

export function isAbsent(state, personId, day) {
  return (state.absences ?? []).some((a) => a.personId === personId && a.day === day);
}

export function defaultRoster(people) {
  const roster = {};
  let agentIndex = 0;
  for (const p of people) {
    let shift;
    if (p.role === 'agent') shift = agentIndex++ % 2 === 0 ? 'early' : 'late';
    else shift = p.role === 'qa' ? 'late' : 'early';
    roster[p.id] = { 0: shift, 1: shift, 2: shift, 3: shift, 4: shift };
  }
  return roster;
}

// v1.6 break lengths, in minutes (sim/breaks.js places them).
export const BREAK_LENGTH = { am: 15, lunch: 60, pm: 15 };

// The person's breaks as [start, length] in minutes since midnight, from
// their day plan `{ am, lunch, pm }` (sim/breaks.js; v1.6 removed the fixed
// break groups). A missing plan or break throws instead of quietly turning the
// work share into NaN.
function breaksOf(plan) {
  if (!plan || typeof plan !== 'object') throw new TypeError(`break plan: ${plan}`);
  return Object.entries(BREAK_LENGTH).map(([kind, length]) => {
    const start = plan[kind];
    if (!Number.isFinite(start)) throw new TypeError(`break plan: ${kind} is ${start}`);
    return [start, length];
  });
}

// Share (0, 0.5 or 1) of the 30-minute interval starting at `minute` actually
// worked on `shiftId`, given the person's day plan `{ am, lunch, pm }`.
export function workShare(minute, shiftId, plan) {
  const shift = SHIFTS[shiftId];
  if (!shift) return 0;
  const end = minute + INTERVAL;
  let worked = overlap(minute, end, shift.start, shift.end);
  for (const [b0, length] of breaksOf(plan)) {
    worked -= overlap(minute, end, b0, b0 + length);
  }
  return Math.max(0, worked) / INTERVAL;
}

// On a break (short or lunch) in the interval starting at `minute`, inside the shift.
export function onBreak(minute, shiftId, plan) {
  const shift = SHIFTS[shiftId];
  if (!shift || minute < shift.start || minute >= shift.end) return false;
  return workShare(minute, shiftId, plan) < 1;
}

// The interval starting at `minute` overlaps the plan's lunch hour.
export function atLunch(minute, plan) {
  return Number.isFinite(plan?.lunch)
    && overlap(minute, minute + INTERVAL, plan.lunch, plan.lunch + BREAK_LENGTH.lunch) > 0;
}

// On shift: the center opens that day, the person is well and not absent, and
// their roster shift for the weekday runs on that weekday and covers `minute`.
export function onShift(state, person, day, minute) {
  const { weekday } = dateOf(day);
  if (!isCenterOpenWeekday(state, weekday)) return false;
  if (person.health.kind !== 'well') return false;
  if (isAbsent(state, person.id, day)) return false;
  const shiftId = state.roster[person.id]?.[weekday];
  if (!shiftRunsOn(shiftId, weekday)) return false;
  const shift = SHIFTS[shiftId];
  return minute >= shift.start && minute < shift.end;
}
