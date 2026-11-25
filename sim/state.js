// Game state: a new game, and turning it into text and back. Pure, no DOM.
//
// Every field the sim modules read or write is set here, so a saved game holds
// all of it: R9 fields, Task 9 (absences, spikes, leaving, lastEndedDay,
// reputationPenalty, history), Task 10 (research, mods, flags) and Task 11
// (cash, hiring, nextId, churn, offerStreak, offered, milestones, gameOver),
// and the game's pendingMinutes.
import { createRng } from './rng.js';
import { createPerson } from './people.js';
import { defaultRoster } from './schedule.js';
import { CLIENTS } from '../world/clients.js';
import { RESEARCH } from '../world/research.js';
import { NATIONS } from '../world/nations.js';

export const VERSION = 1;

const START_CASH = 20000;
const START_MINUTE = 540; // 09:00
const START_SATISFACTION = 70;
const AGENTS = 8;

const REQUIRED = {
  version: 'number', seed: 'number', rngState: 'number', day: 'number', minute: 'number',
  people: 'array', roster: 'object', absences: 'array', assignment: 'object', clients: 'array',
  research: 'object', mods: 'object', flags: 'object', progress: 'object', inbox: 'array',
  today: 'object', history: 'array', spikes: 'array', leaving: 'array', cash: 'number',
  gameOver: 'object', milestones: 'array', hiring: 'object', nextId: 'number', churn: 'array',
  offerStreak: 'number', offered: 'array', reputationPenalty: 'number', lastEndedDay: 'number',
  pendingMinutes: 'number',
};
const ROLES = ['agent', 'lead', 'qa'];
const NULLABLE = new Set(['gameOver', 'hiring', 'lastEndedDay']);

export function newGame(seed) {
  const rng = createRng(seed);
  const roles = [...Array(AGENTS).fill('agent'), 'lead', 'qa'];
  const people = [];
  roles.forEach((role, i) => people.push(createPerson(rng, {
    id: `p${i}`, role, nation: NATIONS[i % NATIONS.length].id, takenNames: people.map((p) => p.name),
  })));
  const clients = CLIENTS.filter((c) => c.start).map((c) => c.id);

  // defaultRoster alternates agents early/late, so clients alternate in pairs:
  // each client gets as many early as late agents.
  const assignment = {};
  people.forEach((p, i) => {
    if (p.role === 'agent') assignment[p.id] = { kind: 'phone', clientId: clients[Math.floor(i / 2) % clients.length] };
    else assignment[p.id] = { kind: p.role === 'lead' ? 'coaching' : 'qa' };
  });

  return {
    version: VERSION,
    seed,
    rngState: rng.state(),
    day: 0,
    minute: START_MINUTE,
    pendingMinutes: 0, // minutes asked of advance() not yet simulated (under 30)
    people,
    roster: defaultRoster(people),
    absences: [],
    assignment,
    clients: clients.map((id) => ({ id, satisfaction: START_SATISFACTION, active: true })),
    research: { done: [], current: null, points: 0, build: null },
    mods: {},
    flags: {},
    progress: { coaching: 0, qa: 0, research: 0, training: 0 },
    inbox: [],
    today: { clients: {} },
    history: [],
    spikes: [],
    leaving: [],
    cash: START_CASH,
    gameOver: null,
    milestones: [],
    hiring: null,
    nextId: 1,
    churn: [],
    offerStreak: 0,
    rankSStreak: 0, // v1.1; not in REQUIRED, so v1.0 saves still load (read as 0)
    offered: [],
    office: { level: 0, build: null }, // v1.2; not in REQUIRED, so v1.1 saves load at level 0
    // v1.3 email backlogs by client id (sim/backlog.js); not in REQUIRED, so v1.2
    // saves load with none. Left out of the save while empty (weekday golden).
    backlog: {},
    reputationPenalty: 0,
    lastEndedDay: null,
  };
}

export function serialize(state) {
  if (state.backlog && Object.keys(state.backlog).length === 0) {
    const { backlog, ...rest } = state;
    return JSON.stringify(rest);
  }
  return JSON.stringify(state);
}

function hasShape(value, type) {
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return typeof value === 'object' && value !== null && !Array.isArray(value);
  return typeof value === type;
}

const knownResearch = (id) => RESEARCH.some((r) => r.id === id);
const knownClient = (id) => CLIENTS.some((c) => c.id === id);
const isPerson = (p) => hasShape(p, 'object') && typeof p.id === 'string' && ROLES.includes(p.role)
  && hasShape(p.health, 'object') && typeof p.health.kind === 'string';

function isValid(s) {
  if (!hasShape(s, 'object') || s.version !== VERSION) return false;
  for (const [key, type] of Object.entries(REQUIRED)) {
    if (!(key in s)) return false;
    if (s[key] === null ? !NULLABLE.has(key) : !hasShape(s[key], type)) return false;
  }
  const r = s.research;
  if (!Array.isArray(r.done) || !r.done.every(knownResearch)) return false;
  if (r.current !== null && !knownResearch(r.current)) return false;
  if (r.build !== null && !knownResearch(r.build?.researchId)) return false;
  return s.clients.every((c) => knownClient(c?.id)) && s.people.every(isPerson);
}

// The saved state, or null for text that is not a version-1 save.
export function deserialize(text) {
  try {
    const s = JSON.parse(text);
    if (!isValid(s)) return null;
    // v1.0 saves: a client lost before v1.1 has no lostDay; its reputation
    // mark fades from the day the save is loaded.
    for (const c of s.clients) if (!c.active && c.lostDay === undefined) c.lostDay = s.day;
    s.office ??= { level: 0, build: null };
    s.backlog ??= {}; // v1.2 saves and saves made while no mail had arrived
    // v1.4: a malformed backlog (or entry) resets to empty instead of throwing later.
    if (!hasShape(s.backlog, 'object')) s.backlog = {};
    for (const [id, e] of Object.entries(s.backlog)) {
      if (!hasShape(e, 'object') || !Array.isArray(e.items)) { s.backlog[id] = { openMin: 0, items: [], carry: 0 }; continue; }
      e.items = e.items.filter((it) => hasShape(it, 'object') && Number.isFinite(it.at) && Number.isFinite(it.n));
      if (!Number.isFinite(e.openMin)) e.openMin = 0;
      if (!Number.isFinite(e.carry)) e.carry = 0;
    }
    // v1.1 saves: offered held bare ids; they count as offered on the day the save is loaded.
    s.offered = s.offered.map((o) => (typeof o === 'string' ? { id: o, day: s.day } : o));
    return s;
  } catch {
    return null;
  }
}
