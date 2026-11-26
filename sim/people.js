// People: generation, handling time, fatigue / stress / morale. Pure functions, no DOM.
import { TRAITS } from '../world/traits.js';
import { NAMES } from '../world/names.js';

const SKILL_RANGES = {
  agent: { handling: [2, 7], systems: [2, 7], coaching: [0, 3], evaluation: [0, 3] },
  lead: { handling: [4, 8], systems: [4, 8], coaching: [5, 8], evaluation: [3, 6] },
  qa: { handling: [4, 8], systems: [4, 8], coaching: [2, 5], evaluation: [5, 8] },
};
const SKILL_ORDER = ['handling', 'systems', 'coaching', 'evaluation'];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// v1.6 스케줄링 (planning): how well a lead places the day's breaks
// (sim/breaks.js). Not drawn from the rng, so every other draw keeps its
// order: it comes from the person's id and name (ruling: the id alone made
// every game's lead p8 the same), within the role's range, one decimal. The
// name is drawn at creation, kept in saves and never changed. Planning is not
// stored on new people, so a saved person (v1.5 and earlier) gets the value
// they would have now; a stored skills.planning (tests, tools) wins.
const PLANNING_RANGES = { agent: [0, 3], lead: [3, 8], qa: [1, 4] };

// 32-bit FNV-1a with an fmix32 finish, so ids in sequence (p0.., h1..) spread.
function hashString(text) {
  let h = 0x811c9dc5;
  for (const ch of text) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export function planningOf(person) {
  const stored = person.skills?.planning;
  if (Number.isFinite(stored)) return stored;
  const [lo, hi] = PLANNING_RANGES[person.role] ?? PLANNING_RANGES.agent;
  const steps = Math.round((hi - lo) * 10) + 1;
  return (lo * 10 + (hashString(`planning:${person.id}:${person.name ?? ''}`) % steps)) / 10;
}

// Stress per 30 minutes of work: a base for a working day with customers, more
// the busier the queue keeps the person, and a steep extra once occupancy
// passes overloadFrom (no breathing room between calls).
const STRESS = { base: 1.55, perOccupancy: 1.6, overload: 2, overloadFrom: 0.7 };
// A night's sleep takes off a flat amount plus a share of what is left, so
// stress settles where the week's strain and recovery balance instead of
// drifting without end.
const NIGHT_STRESS = { flat: 4, share: 0.12 };

// Product of the person's trait multipliers for `key` (1 when none).
export function traitMul(person, key) {
  let m = 1;
  for (const id of person.traits) {
    const t = TRAITS.find((x) => x.id === id);
    m *= t?.effect[key] ?? 1;
  }
  return m;
}

// Sum of the person's trait additions for `key` (0 when none).
export function traitAdd(person, key) {
  let a = 0;
  for (const id of person.traits) {
    const t = TRAITS.find((x) => x.id === id);
    a += t?.effect[key] ?? 0;
  }
  return a;
}

// Long-term wear (v1.1): each workday that ends at `from` stress or more adds
// a point, any other workday (also one off, sick or on leave) takes `recover`
// off, up to `max`. Each point costs a point of morale, so weeks of strain wear
// a person down even when every night's sleep looks fine. Saves without
// history.wear read it as 0.
export const WEAR = { from: 75, recover: 3, max: 30 };

export function moraleOf(person) {
  const boost = person.moraleBoost ?? 0;
  const wear = person.history?.wear ?? 0;
  return clamp(100 - 0.4 * person.fatigue - 0.6 * person.stress - wear + boost, 0, 100);
}

// End of a workday: `strained` when the person ends it well and at WEAR.from stress or more.
export function wearDay(person, strained) {
  const wear = person.history.wear ?? 0;
  person.history.wear = strained ? Math.min(WEAR.max, wear + 1) : Math.max(0, wear - WEAR.recover);
  person.morale = moraleOf(person);
}

// Draw order is fixed and nation-independent: trait count, trait 1, trait 2,
// four skills, then the name (one draw whatever the nation). A name in
// `takenNames` (colleagues') is drawn again from the names still free, so the
// extra draw only happens on a clash and never touches traits or skills.
export function createPerson(rng, { id, role, nation, takenNames = [] }) {
  const count = rng.int(1, 2);
  const first = rng.int(0, TRAITS.length - 1);
  const second = rng.int(0, TRAITS.length - 2);
  const picked = [TRAITS[first].id];
  if (count === 2) picked.push(TRAITS[second >= first ? second + 1 : second].id);

  const skills = {};
  for (const key of SKILL_ORDER) {
    const [lo, hi] = SKILL_RANGES[role][key];
    skills[key] = rng.int(lo * 10, hi * 10) / 10;
  }

  let name = rng.pick(NAMES[nation]);
  const taken = new Set(takenNames);
  if (taken.has(name)) {
    const free = NAMES[nation].filter((n) => !taken.has(n));
    if (free.length > 0) name = rng.pick(free);
  }

  const person = {
    id, name, role, nation,
    traits: picked,
    skills,
    fatigue: 10,
    stress: 15,
    morale: 0,
    health: { kind: 'well', daysLeft: 0 },
    probationDays: 0,
    history: { highStressDays: 0 },
  };
  person.morale = moraleOf(person);
  return person;
}

export function ahtFor(person, client) {
  const { handling, systems } = person.skills;
  const base = client.ahtMin * (1.3 - handling * 0.03 - systems * 0.02);
  const aht = base * traitMul(person, 'ahtMul') * (1 + person.fatigue / 200);
  return person.probationDays > 0 ? aht * 1.25 : aht;
}

export function applyWork(person, { minutes, occupancy, mods = {} }) {
  const slots = minutes / 30;
  const fMul = (mods.fatigueGainMul ?? 1) * traitMul(person, 'fatigueGainMul');
  const sMul = (mods.stressGainMul ?? 1) * traitMul(person, 'stressGainMul');
  person.fatigue = clamp(person.fatigue + slots * (1.5 + 2.5 * occupancy) * fMul, 0, 100);
  const strain = STRESS.base + STRESS.perOccupancy * occupancy
    + (STRESS.overload * Math.max(0, occupancy - STRESS.overloadFrom)) / (1 - STRESS.overloadFrom);
  person.stress = clamp(person.stress + slots * strain * sMul, 0, 100);
  person.morale = moraleOf(person);
}

export function applyRest(person, { minutes, mods = {} }) {
  const slots = minutes / 30;
  const mul = mods.restRecoveryMul ?? 1;
  person.fatigue = clamp(person.fatigue - 2 * slots * mul, 0, 100);
  person.stress = clamp(person.stress - 1 * slots * mul, 0, 100);
  person.morale = moraleOf(person);
}

export function overnight(person) {
  person.fatigue = clamp(person.fatigue - 40, 0, 100);
  person.stress = clamp(person.stress - NIGHT_STRESS.flat - NIGHT_STRESS.share * person.stress, 0, 100);
  person.morale = moraleOf(person);
}
