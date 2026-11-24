// Shifts and weekly roster. Pure functions; minutes are since midnight (0-1439).
import { isWorkday, dateOf } from './calendar.js';

export const SHIFTS = {
  early: { start: 540, end: 1080 },
  late: { start: 720, end: 1260 },
};

const INTERVAL = 30;
// Automatic breaks as [offset from shift start, length], in minutes, per shift
// and break group. All breaks fall in 12:00-18:00, while both shifts are on,
// so the hours one shift covers alone (09:00-12:00, 18:00-21:00) keep every
// person. Two people on the same shift and client are put in different groups
// (sim/interval.js), so they never break at the same time.
//   early group 0: 12:00 (15), lunch 13:00, 16:00 (15)
//   early group 1: 12:30 (15), lunch 14:00, 16:30 (15)
//   late group 0:  13:00 (15), lunch 16:00, 17:30 (15)
//   late group 1:  13:30 (15), lunch 15:00, 17:00 (15)
const BREAKS = {
  early: [[[180, 15], [240, 60], [420, 15]], [[210, 15], [300, 60], [450, 15]]],
  late: [[[60, 15], [240, 60], [330, 15]], [[90, 15], [180, 60], [300, 15]]],
};

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

// Share (0, 0.5 or 1) of the 30-minute interval starting at `minute` actually
// worked, for break group 0 (default) or 1.
export function workShare(minute, shiftId, group = 0) {
  const shift = SHIFTS[shiftId];
  if (!shift) return 0;
  const end = minute + INTERVAL;
  let worked = overlap(minute, end, shift.start, shift.end);
  const plans = BREAKS[shiftId];
  for (const [offset, length] of plans[group] ?? plans[0]) {
    const b0 = shift.start + offset;
    worked -= overlap(minute, end, b0, b0 + length);
  }
  return Math.max(0, worked) / INTERVAL;
}

export function onBreak(minute, shiftId, group = 0) {
  const shift = SHIFTS[shiftId];
  if (!shift || minute < shift.start || minute >= shift.end) return false;
  return workShare(minute, shiftId, group) < 1;
}

export function onShift(state, person, day, minute) {
  if (!isWorkday(day)) return false;
  if (person.health.kind !== 'well') return false;
  if (isAbsent(state, person.id, day)) return false;
  const shiftId = state.roster[person.id]?.[dateOf(day).weekday];
  const shift = SHIFTS[shiftId];
  return !!shift && minute >= shift.start && minute < shift.end;
}
