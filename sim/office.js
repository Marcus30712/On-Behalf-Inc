// Office levels (expansion) and seats. Pure rules, no DOM.
//
// state.office = { level, build: null | { level, workdaysLeft }, level1Day?, level2Day? } (level1Day: the day
// expansion 1 finished; call growth resumes from it, see sim/interval.js; level2Day (v1.4): the day
// expansion 2 finished; both prorate that month's rent); a state
// without it (a v1.1 save, a hand-made test state) is level 0, nothing building.
// The game calls advanceExpansion once per Mon-Fri workday (v1.4), after endOfDay.
import { pushEvent } from './events.js';
import { DAYS_PER_MONTH } from './calendar.js';

export const OFFICE_LEVELS = [
  { seats: 8, cost: 0, buildWorkdays: 0, rent: 0 },
  // v1.8: level 1 rent 3000 -> 2000 so expansion pays off (balance record, v1.8 section).
  { seats: 12, cost: 30000, buildWorkdays: 10, rent: 2000 },
  // Level 2: cost and rent set by the v1.2 balance task (balance record, v1.2 section).
  { seats: 16, cost: 36000, buildWorkdays: 15, rent: 2000 },
];

export const officeLevel = (state) => Math.min(Math.max(state.office?.level ?? 0, 0), OFFICE_LEVELS.length - 1);

// Agent seats at the current level; lead and QA have their own desks.
export const seatsOf = (state) => OFFICE_LEVELS[officeLevel(state)].seats;

// Rent of every completed level (levels 1 and 2 add up). Given the month's
// first and last day (v1.4), a level finished inside that month pays only from
// its completion day, inclusive: rent x days / 30, rounded to whole money. A
// level with no recorded completion day (a v1.3 save) pays the full month.
export function rentOf(state, monthStartDay, monthEndDay) {
  let rent = 0;
  for (let i = 1; i <= officeLevel(state); i++) {
    const full = OFFICE_LEVELS[i].rent;
    const done = state.office?.[`level${i}Day`];
    if (monthStartDay === undefined || done === undefined || done < monthStartDay || done > monthEndDay) {
      rent += full;
    } else {
      rent += Math.round(full * (monthEndDay - done + 1) / DAYS_PER_MONTH);
    }
  }
  return rent;
}

export function startExpansion(state) {
  state.office ??= { level: 0, build: null };
  const o = state.office;
  if (o.build) return { ok: false, reason: 'building' };
  const next = OFFICE_LEVELS[o.level + 1];
  if (!next) return { ok: false, reason: 'max-level' };
  if ((state.cash ?? 0) < next.cost) return { ok: false, reason: 'no-cash' };
  state.cash -= next.cost;
  o.build = { level: o.level + 1, workdaysLeft: next.buildWorkdays };
  pushEvent(state, { id: 'expansion-start', data: { stage: o.build.level, days: next.buildWorkdays } });
  return { ok: true };
}

export function advanceExpansion(state) {
  const b = state.office?.build;
  if (state.gameOver || !b) return;
  b.workdaysLeft -= 1;
  if (b.workdaysLeft > 0) return;
  state.office.level = b.level;
  if (b.level === 1) state.office.level1Day = state.day;
  if (b.level === 2) state.office.level2Day = state.day;
  state.office.build = null;
  pushEvent(state, { id: 'expansion-done', data: { level: b.level, seats: OFFICE_LEVELS[b.level].seats } });
}

// What the screen shows.
export function officeView(state) {
  const level = officeLevel(state);
  const next = OFFICE_LEVELS[level + 1];
  const day = state.day ?? 0;
  const monthStart = day - (day % DAYS_PER_MONTH);
  return {
    level,
    seats: seatsOf(state),
    build: state.office?.build ?? null,
    rentThisMonth: rentOf(state, monthStart, monthStart + DAYS_PER_MONTH - 1),
    next: next ? { cost: next.cost, buildWorkdays: next.buildWorkdays, rent: next.rent } : null,
  };
}
