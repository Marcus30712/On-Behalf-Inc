// Office levels (expansion) and seats. Pure rules, no DOM.
//
// state.office = { level, build: null | { level, workdaysLeft } }; a state
// without it (a v1.1 save, a hand-made test state) is level 0, nothing building.
// The game calls advanceExpansion once per workday, after endOfDay.
import { pushEvent } from './events.js';

export const OFFICE_LEVELS = [
  { seats: 8, cost: 0, buildWorkdays: 0, rent: 0 },
  { seats: 12, cost: 30000, buildWorkdays: 10, rent: 3000 },
  { seats: 16, cost: 45000, buildWorkdays: 15, rent: 4500 },
];

const levelOf = (state) => Math.min(Math.max(state.office?.level ?? 0, 0), OFFICE_LEVELS.length - 1);

// Agent seats at the current level; lead and QA have their own desks.
export const seatsOf = (state) => OFFICE_LEVELS[levelOf(state)].seats;

// Monthly rent of every completed level (levels 1 and 2 add up).
export function rentOf(state) {
  let rent = 0;
  for (let i = 1; i <= levelOf(state); i++) rent += OFFICE_LEVELS[i].rent;
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
  return { ok: true };
}

export function advanceExpansion(state) {
  const b = state.office?.build;
  if (state.gameOver || !b) return;
  b.workdaysLeft -= 1;
  if (b.workdaysLeft > 0) return;
  state.office.level = b.level;
  state.office.build = null;
  pushEvent(state, { id: 'expansion-done', data: { level: b.level, seats: OFFICE_LEVELS[b.level].seats } });
}

// What the screen shows.
export function officeView(state) {
  const level = levelOf(state);
  const next = OFFICE_LEVELS[level + 1];
  return {
    level,
    seats: seatsOf(state),
    build: state.office?.build ?? null,
    next: next ? { cost: next.cost, buildWorkdays: next.buildWorkdays, rent: next.rent } : null,
  };
}
