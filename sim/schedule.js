// Shifts and weekly roster. Pure functions; minutes are since midnight (0-1439).
import { isWorkday, dateOf } from './calendar.js';

export const SHIFTS = {
  early: { start: 540, end: 1080 },
  late: { start: 720, end: 1260 },
};

const INTERVAL = 30;
// Automatic breaks as [offset from shift start, length], in minutes.
const BREAKS = [[120, 15], [240, 60], [420, 15]];

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

// Share (0, 0.5 or 1) of the 30-minute interval starting at `minute` actually worked.
export function workShare(minute, shiftId) {
  const shift = SHIFTS[shiftId];
  if (!shift) return 0;
  const end = minute + INTERVAL;
  let worked = overlap(minute, end, shift.start, shift.end);
  for (const [offset, length] of BREAKS) {
    const b0 = shift.start + offset;
    worked -= overlap(minute, end, b0, b0 + length);
  }
  return Math.max(0, worked) / INTERVAL;
}

export function onBreak(minute, shiftId) {
  const shift = SHIFTS[shiftId];
  if (!shift || minute < shift.start || minute >= shift.end) return false;
  return workShare(minute, shiftId) < 1;
}

export function onShift(state, person, day, minute) {
  if (!isWorkday(day)) return false;
  if (person.health.kind !== 'well') return false;
  if (isAbsent(state, person.id, day)) return false;
  const shiftId = state.roster[person.id]?.[dateOf(day).weekday];
  const shift = SHIFTS[shiftId];
  return !!shift && minute >= shift.start && minute < shift.end;
}
