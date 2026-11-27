// The public entry point for the screen (plan 2 uses only this module):
// create, advance, act, save, load and view a game. Pure rules, no DOM;
// storage is passed in (localStorage in the browser).
import { newGame, serialize, deserialize } from './state.js';
import { restoreRng } from './rng.js';
import { dateOf, upcomingHolidays, holidaysOn, DAYS_PER_MONTH, isCompanyWorkday } from './calendar.js';
import { stepInterval, answeringClient, channelOf } from './interval.js';
import { endOfDay, startDay } from './day.js';
import { breakLookup, workingShift, moveBreak, breakBoard, pinBreak, unpinBreak } from './breaks.js';
import { backlogCount } from './backlog.js';
import { advanceResearch, advanceBuild, startResearch } from './research.js';
import { dailyEconomy, monthEnd, reputation } from './economy.js';
import { advanceHiring, startHiring, needsLead } from './hiring.js';
import { advanceExpansion, startExpansion, officeView } from './office.js';
import { resolveEvent } from './events.js';
import {
  SHIFTS, isAbsent, onShift, onBreak, atLunch, isCenterOpen, isCenterOpenWeekday, shiftRunsOn,
} from './schedule.js';
import { EVENTS } from '../world/events.js';
import { CLIENTS } from '../world/clients.js';
import { RESEARCH } from '../world/research.js';
import { PLANET } from '../world/planet.js';
import { NATIONS } from '../world/nations.js';

export const SAVE_KEY = 'on-behalf-inc:save:v1';
// Agent seats and the hiring cost, for the screen.
export { SEATS, HIRE_COST, LEAD_HIRE_COST } from './hiring.js';
export { SHIFTS } from './schedule.js';
export { seatsOf, OFFICE_LEVELS } from './office.js';
// v1.6: a person's 스케줄링 (stored, or derived from id and name), for the card.
export { planningOf } from './people.js';

const INTERVAL = 30;
const DAY_MINUTES = 1440;
const WEEKDAYS = 7; // roster days, Monday (0) to Sunday (6)
const ROSTER_SHIFTS = [...Object.keys(SHIFTS), 'off'];
const TASKS = ['phone', 'coaching', 'qa', 'research', 'training'];

export function createGame(seed) {
  return newGame(seed);
}

// Moves the clock on by `minutes` in 30-minute steps; a remainder under 30 is
// kept in state.pendingMinutes and added to the next call, so many small calls
// add up. Returns the minutes actually simulated (a multiple of 30).
// Each step: the day's start if it has not run (v1.6 break plan: a new game
// or a save without one), interval, research, build. At midnight: end of day;
// on a day the center opened (Mon-Fri, and Sat-Sun with an active weekend
// client) then the daily economy, and on Mon-Fri hiring and expansion (v1.4:
// company timers skip the weekend); on a month's last day the month end.
// Nothing moves once the game is over; a game that ends at midnight stays on
// its last day (minute 1440). After midnight the next day starts (its break
// plan), so the plan sees the night's health, absence and leave updates.
export function advance(state, minutes) {
  if (state.gameOver) return 0;
  const asked = Number.isFinite(minutes) && minutes > 0 ? minutes : 0;
  const total = (state.pendingMinutes ?? 0) + asked;
  const steps = Math.floor(total / INTERVAL);
  state.pendingMinutes = total - steps * INTERVAL;
  const rng = restoreRng(state.rngState);
  let done = 0;
  for (; done < steps; done++) {
    if (state.gameOver) break; // the game is frozen (builds too)
    startDay(state);
    stepInterval(state, rng);
    advanceResearch(state);
    advanceBuild(state, INTERVAL);
    if (state.minute < DAY_MINUTES) continue;
    const opened = isCenterOpen(state, state.day);
    endOfDay(state, rng);
    if (opened) {
      // v1.4: company timers (offer streak, hiring wait, build days) count Mon-Fri only.
      const companyDay = isCompanyWorkday(state.day);
      dailyEconomy(state, { companyDay });
      if (companyDay) {
        advanceHiring(state, rng);
        advanceExpansion(state);
      }
    }
    if (state.day % DAYS_PER_MONTH === DAYS_PER_MONTH - 1) monthEnd(state);
    if (state.gameOver) { done++; break; }
    state.day += 1;
    state.minute = 0;
    startDay(state);
  }
  if (state.gameOver) state.pendingMinutes = 0;
  state.rngState = rng.state();
  return done * INTERVAL;
}

const refuse = (reason) => ({ ok: false, reason });
const OK = () => ({ ok: true });

const ACTIONS = {
  setRoster(state, { personId, weekday, shift }) {
    if (!state.people.some((p) => p.id === personId)) return refuse('unknown-person');
    if (!Number.isInteger(weekday) || weekday < 0 || weekday >= WEEKDAYS) return refuse('bad-weekday');
    if (!ROSTER_SHIFTS.includes(shift)) return refuse('bad-shift');
    // A shift only on its own days: early and late Mon-Fri, weekend Sat-Sun.
    if (shift !== 'off' && !shiftRunsOn(shift, weekday)) return refuse('bad-shift');
    state.roster[personId] = { ...state.roster[personId], [weekday]: shift };
    return OK();
  },
  assign(state, { personId, kind, clientId }) {
    if (!state.people.some((p) => p.id === personId)) return refuse('unknown-person');
    if (!TASKS.includes(kind)) return refuse('bad-task');
    if (kind !== 'phone') {
      state.assignment[personId] = { kind };
      return OK();
    }
    if (!state.clients.some((c) => c.id === clientId && c.active)) return refuse('unknown-client');
    state.assignment[personId] = { kind, clientId };
    return OK();
  },
  startResearch(state, { researchId }) {
    if (!RESEARCH.some((r) => r.id === researchId)) return refuse('unknown-research');
    return startResearch(state, researchId) ? OK() : refuse('busy');
  },
  // v1.7: role 'lead' starts a lead search.
  startHiring(state, { role } = {}) {
    return startHiring(state, role === 'lead' ? 'lead' : 'agent');
  },
  startExpansion(state) {
    return startExpansion(state);
  },
  // v1.9: move one of today's breaks 15-minute step(s) (sim/breaks.js).
  moveBreak(state, { personId, kind, start }) {
    return moveBreak(state, { personId, kind, start });
  },
  // v2.3: pin a break to its time every day, or unpin it (sim/breaks.js).
  pinBreak(state, { personId, kind }) {
    return pinBreak(state, { personId, kind });
  },
  unpinBreak(state, { personId, kind }) {
    return unpinBreak(state, { personId, kind });
  },
  resolve(state, { index, choiceId }) {
    if (!Number.isInteger(index) || !state.inbox[index]) return refuse('unknown-event');
    const rng = restoreRng(state.rngState);
    if (!resolveEvent(state, index, choiceId, rng)) return refuse('bad-choice');
    state.rngState = rng.state();
    return OK();
  },
};

// action = { type, ... }; returns { ok, reason? }. A refused action changes nothing.
export function act(state, action) {
  if (state.gameOver) return refuse('game-over');
  const handler = Object.hasOwn(ACTIONS, action?.type) ? ACTIONS[action.type] : undefined;
  if (!handler) return refuse('unknown-action');
  return handler(state, action);
}

export function save(state, storage) {
  try {
    storage.setItem(SAVE_KEY, serialize(state));
    return true;
  } catch {
    return false;
  }
}

// A save without today's break plan (v1.5 and older, or a bad one) gets it
// here, as at the start of its day.
export function load(storage) {
  try {
    const text = storage.getItem(SAVE_KEY);
    const state = text === null ? null : deserialize(text);
    if (state) startDay(state);
    return state;
  } catch {
    return null;
  }
}

function freeze(value) {
  if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

function clientView(state, c) {
  const def = CLIENTS.find((d) => d.id === c.id);
  const weekday = dateOf(state.day).weekday;
  const t = state.today.clients[c.id];
  const intervals = t?.intervals ?? 0;
  const offered = t?.offered ?? 0;
  const handled = t?.handled ?? 0;
  const channel = channelOf(def);
  // Email (v1.3): mails waiting now, and today's share answered on time
  // (on time over mails counted, each mail once: answered, or gone overdue);
  // null before the first.
  const email = channel === 'email' ? {
    backlog: Math.round(backlogCount(state.backlog?.[c.id])),
    onTime: offered > 0 ? (t.inTarget ?? 0) / offered : null,
  } : {};
  // Email: mail that came in today (today.offered counts answered or overdue mail).
  const arrived = channel === 'email' ? { arrived: t?.arrived ?? 0 } : {};
  return {
    id: c.id,
    name: def.name,
    active: c.active,
    satisfaction: c.satisfaction,
    slTarget: def.slTarget,
    channel,
    // The client opens at some hour today (its own days; a weekday client is closed at the weekend).
    openToday: def.hours.days.includes(weekday),
    ...email,
    // Workdays left before a warned client leaves; null without a warning.
    churnWorkdaysLeft: state.churn?.find((e) => e.clientId === c.id)?.workdaysLeft ?? null,
    today: {
      offered,
      handled,
      abandoned: t?.abandoned ?? 0,
      ...arrived,
      // Service level so far today: calls answered within the target over
      // calls offered. Null before the first call.
      serviceLevel: offered > 0 ? (t.inTarget ?? 0) / offered : null,
      // Average wait of answered calls, in seconds (ASA). Null before the first.
      asaSec: handled > 0 ? (t.waitSec ?? 0) / handled : null,
      // Share of today's intervals at target (the fee's met-day rule); null
      // before the first interval.
      intervalsMetRate: intervals > 0 ? t.intervalsMet / intervals : null,
      // Average agents on the phone per interval so far.
      agents: intervals > 0 ? t.agentShareSum / intervals : 0,
    },
  };
}

const HOLIDAY_DAYS_AHEAD = 14;
const PROGRESS_TASKS = new Set(TASKS.filter((t) => t !== 'phone'));

// Why someone on the roster is not in today: their health ('sick', 'burnout',
// 'leave') or 'absent'; otherwise the roster shift ('early', 'late', 'off').
function shiftToday(state, p, rosterShift) {
  if (p.health.kind !== 'well') return p.health.kind;
  if (SHIFTS[rosterShift] && isAbsent(state, p.id, state.day)) return 'absent';
  return rosterShift;
}

// What the person does in the interval starting now: 'phone' (answering
// calls), 'task' (coaching, QA, research or training), 'lunch' (the interval
// touches their lunch hour, v1.6), 'break' (a short break), 'idle' (on shift
// with nothing to do) or 'off' (not at work). `breaks` is their plan today.
// v1.8: without breaks (null) it is what the person does at the desk; the
// view passes that as deskActivity so the card and the sprite can tell a
// break's own minutes from the rest of a 30-minute break interval.
function activity(state, p, rosterShift, breaks) {
  if (!onShift(state, p, state.day, state.minute)) return 'off';
  if (breaks && atLunch(state.minute, breaks)) return 'lunch';
  if (breaks && onBreak(state.minute, rosterShift, breaks)) return 'break';
  const a = state.assignment[p.id];
  if (a?.kind === 'phone') {
    // Their own client, or an open one while theirs is closed (sim/interval.js).
    return answeringClient(state, a, state.day, state.minute) ? 'phone' : 'idle';
  }
  return PROGRESS_TASKS.has(a?.kind) ? 'task' : 'idle';
}

// Holidays of the person's nation that start within the next 14 days.
function holidaysAhead(state, p) {
  const nation = NATIONS.find((n) => n.id === p.nation);
  if (!nation) return [];
  return upcomingHolidays(state.day, nation, HOLIDAY_DAYS_AHEAD).map(({ holiday, startDay }) => ({
    id: holiday.id, name: holiday.name, startDay, length: holiday.length,
  }));
}

// Only someone on the phone now answers another client; a person on a phone
// assignment who is off, on break or away keeps their assigned client.
function answeringNow(state, p, activityNow) {
  const a = state.assignment[p.id];
  if (a?.kind !== 'phone') return null;
  if (activityNow !== 'phone') return a.clientId;
  return answeringClient(state, a, state.day, state.minute) ?? a.clientId;
}

function personView(state, p, weekday, breaksOf) {
  const rosterShift = state.roster[p.id]?.[weekday] ?? 'off';
  // v1.6: today's breaks { am, lunch, pm, by } (minutes since midnight) for
  // someone who works today; null when they do not.
  const working = workingShift(state, p, state.day);
  const breaks = working ? breaksOf(p, working) ?? null : null;
  const personActivity = activity(state, p, rosterShift, breaks);
  return {
    id: p.id,
    name: p.name,
    role: p.role,
    nation: p.nation,
    traits: p.traits,
    skills: p.skills,
    fatigue: p.fatigue,
    stress: p.stress,
    morale: p.morale,
    health: p.health,
    probationDays: p.probationDays,
    rosterShift,
    // Monday to Sunday; days missing from the roster (old saves) are 'off'.
    week: Array.from({ length: WEEKDAYS }, (_, w) => state.roster[p.id]?.[w] ?? 'off'),
    shiftToday: shiftToday(state, p, rosterShift),
    activity: personActivity,
    deskActivity: activity(state, p, rosterShift, null),
    // v1.8.1: the client answered in a break interval's desk minutes (a
    // covered open client, like answering for someone on the phone now).
    deskAnswering: answeringNow(state, p, activity(state, p, rosterShift, null)),
    breaks,
    task: state.assignment[p.id] ?? null,
    // The client the person answers now: their own, or an open one they cover
    // while theirs is closed (sim/interval.js), only while they are on the
    // phone now; their assigned client when not on the phone now; null off
    // phone assignments.
    answering: answeringNow(state, p, personActivity),
    holidays: holidaysAhead(state, p),
  };
}

const CALENDAR_DAYS = 30;

// Both nations' holidays running today or starting within the next 30 days.
function calendarAhead(state) {
  const out = [];
  for (const nation of NATIONS) {
    const running = holidaysOn(state.day, nation).filter((h) => h.startDay < state.day);
    for (const { holiday, startDay } of [...running, ...upcomingHolidays(state.day, nation, CALENDAR_DAYS - 1)]) {
      const date = dateOf(startDay);
      out.push({
        nation: nation.id, id: holiday.id, name: holiday.name, startDay, length: holiday.length,
        date: { ...date, weekdayLabel: PLANET.weekdays[date.weekday] },
      });
    }
  }
  return out.sort((a, b) => a.startDay - b.startDay || a.nation.localeCompare(b.nation));
}

// Inbox order: unanswered choices first, then unread notices, then the rest;
// newest first within each.
function inboxRank(e) {
  if (e.resolved) return 2;
  return EVENTS[e.id]?.choices ? 0 : 1;
}

// A frozen copy of what the screen shows. Text is left to the screen.
// v2.0.1: the 휴식표 board is a lazy getter (computed on first read, then
// kept on that view): the view is built every animation frame and only the
// 휴식표 tab reads it.
function withBreakBoard(v, state) {
  let board;
  Object.defineProperty(v, 'breakBoard', {
    enumerable: true,
    get() { board ??= freeze(breakBoard(state)); return board; },
  });
  return v;
}

export function view(state) {
  const date = dateOf(state.day);
  const leadNeeded = needsLead(state); // v1.7; computed once (v1.8.1)
  const current = RESEARCH.find((r) => r.id === state.research.current);
  const inbox = state.inbox
    .map((e, index) => ({ ...e, index }))
    .sort((a, b) => inboxRank(a) - inboxRank(b) || b.index - a.index);
  // Today's kept plan, or one planned for the view alone (nothing is changed).
  const breaksOf = breakLookup(state, { keep: false });
  const v = structuredClone({
    day: state.day,
    minute: state.minute,
    date: { ...date, weekdayLabel: PLANET.weekdays[date.weekday] },
    clients: state.clients.map((c) => clientView(state, c)),
    people: state.people.map((p) => personView(state, p, date.weekday, breaksOf)),
    inbox,
    cash: state.cash,
    reputation: reputation(state),
    research: {
      done: state.research.done,
      current: state.research.current,
      points: state.research.points,
      cost: current?.cost ?? null,
      build: state.research.build,
    },

    hiring: state.hiring,
    // v1.7: needsLead opens lead hiring; leadLeaving says why while a lead still works.
    needsLead: leadNeeded,
    leadLeaving: leadNeeded && state.people.some((p) => p.role === 'lead'),
    office: officeView(state),
    // weekend: an active client opens on Saturday or Sunday (roster shows those days).
    flags: { weekend: isCenterOpenWeekday(state, 5) || isCenterOpenWeekday(state, 6) },
    calendar: calendarAhead(state),
    gameOver: state.gameOver,
    milestones: state.milestones,
  });
  // v2.0.1: frozen like the rest, with the board added lazily (withBreakBoard).
  for (const x of Object.values(v)) freeze(x);
  return Object.freeze(withBreakBoard(v, state));
}
