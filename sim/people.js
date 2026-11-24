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

// Stress per 30 minutes of work: a base for a working day with customers, more
// the busier the queue keeps the person, and a steep extra once occupancy
// passes overloadFrom (no breathing room between calls).
const STRESS = { base: 1.2, perOccupancy: 1.6, overload: 2, overloadFrom: 0.7 };
// A night's sleep takes off a flat amount plus a share of what is left, so
// stress settles where the week's strain and recovery balance instead of
// drifting without end.
const NIGHT_STRESS = { flat: 8, share: 0.05 };

function traitMul(person, key) {
  let m = 1;
  for (const id of person.traits) {
    const t = TRAITS.find((x) => x.id === id);
    m *= t?.effect[key] ?? 1;
  }
  return m;
}

export function moraleOf(person) {
  const boost = person.moraleBoost ?? 0;
  return clamp(100 - 0.4 * person.fatigue - 0.6 * person.stress + boost, 0, 100);
}

// Draw order is fixed and nation-independent: trait count, trait 1, trait 2,
// four skills, then the name (one draw whatever the nation).
export function createPerson(rng, { id, role, nation }) {
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

  const name = rng.pick(NAMES[nation]);

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
