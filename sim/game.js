// The public entry point for the screen (plan 2 uses only this module):
// create, advance, act, save, load and view a game. Pure rules, no DOM;
// storage is passed in (localStorage in the browser).
import { newGame, serialize, deserialize } from './state.js';
import { restoreRng } from './rng.js';
import { dateOf, isWorkday, DAYS_PER_MONTH } from './calendar.js';
import { stepInterval } from './interval.js';
import { endOfDay } from './day.js';
import { advanceResearch, advanceBuild, startResearch } from './research.js';
import { dailyEconomy, monthEnd, reputation } from './economy.js';
import { advanceHiring, startHiring } from './hiring.js';
import { resolveEvent } from './events.js';
import { SHIFTS } from './schedule.js';
import { CLIENTS } from '../world/clients.js';
import { RESEARCH } from '../world/research.js';
import { PLANET } from '../world/planet.js';

export const SAVE_KEY = 'on-behalf-inc:save:v1';

const INTERVAL = 30;
const DAY_MINUTES = 1440;
const WEEKDAYS = 5;
const ROSTER_SHIFTS = [...Object.keys(SHIFTS), 'off'];
const TASKS = ['phone', 'coaching', 'qa', 'research', 'training'];

export function createGame(seed) {
  return newGame(seed);
}

// Moves the clock on in 30-minute steps (a remainder under 30 is dropped).
// Each step: interval, research, build. At midnight: end of day; on a workday
// then the daily economy and hiring; on a month's last day the month end.
// Nothing moves once the game is over.
export function advance(state, minutes) {
  const rng = restoreRng(state.rngState);
  for (let i = 0; i < Math.floor(minutes / INTERVAL); i++) {
    if (state.gameOver) break; // the game is frozen (builds too)
    stepInterval(state, rng);
    advanceResearch(state);
    advanceBuild(state, INTERVAL);
    if (state.minute < DAY_MINUTES) continue;
    endOfDay(state, rng);
    if (isWorkday(state.day)) {
      dailyEconomy(state);
      advanceHiring(state, rng);
    }
    if (state.day % DAYS_PER_MONTH === DAYS_PER_MONTH - 1) monthEnd(state);
    state.day += 1;
    state.minute = 0;
  }
  state.rngState = rng.state();
  return state;
}

const refuse = (reason) => ({ ok: false, reason });
const OK = () => ({ ok: true });

const ACTIONS = {
  setRoster(state, { personId, weekday, shift }) {
    if (!state.people.some((p) => p.id === personId)) return refuse('unknown-person');
    if (!Number.isInteger(weekday) || weekday < 0 || weekday >= WEEKDAYS) return refuse('bad-weekday');
    if (!ROSTER_SHIFTS.includes(shift)) return refuse('bad-shift');
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
  startHiring(state) {
    return startHiring(state);
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

export function load(storage) {
  try {
    const text = storage.getItem(SAVE_KEY);
    return text === null ? null : deserialize(text);
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
  const t = state.today.clients[c.id];
  const intervals = t?.intervals ?? 0;
  return {
    id: c.id,
    name: def.name,
    active: c.active,
    satisfaction: c.satisfaction,
    slTarget: def.slTarget,
    today: {
      offered: t?.offered ?? 0,
      handled: t?.handled ?? 0,
      abandoned: t?.abandoned ?? 0,
      // Share of today's intervals at target; null before the first one.
      serviceLevel: intervals > 0 ? t.intervalsMet / intervals : null,
      // Average agents on the phone per interval so far.
      agents: intervals > 0 ? t.agentShareSum / intervals : 0,
    },
  };
}

function personView(state, p, weekday) {
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
    shiftToday: state.roster[p.id]?.[weekday] ?? 'off',
    task: state.assignment[p.id] ?? null,
  };
}

// A frozen copy of what the screen shows. Text is left to the screen.
export function view(state) {
  const date = dateOf(state.day);
  const current = RESEARCH.find((r) => r.id === state.research.current);
  const inbox = state.inbox
    .map((e, index) => ({ ...e, index }))
    .sort((a, b) => Number(a.resolved) - Number(b.resolved) || b.index - a.index);
  return freeze(structuredClone({
    day: state.day,
    minute: state.minute,
    date: { ...date, weekdayLabel: PLANET.weekdays[date.weekday] },
    clients: state.clients.map((c) => clientView(state, c)),
    people: state.people.map((p) => personView(state, p, date.weekday)),
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
    gameOver: state.gameOver,
    milestones: state.milestones,
  }));
}
