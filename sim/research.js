// Research and construction: points accumulate into the current research; once
// paid for it is built over buildHours; the finished build changes state.mods
// and, at once, the people it helps. Pure rules, no DOM.
//
// state.research = { done: string[], current: string|null, points, build: null | { researchId, minutesLeft } }
import { RESEARCH } from '../world/research.js';
import { pushEvent } from './events.js';
import { moraleOf } from './people.js';

const REST_ROOM_RELIEF = 10;
const TRAINING_RELIEF = 15;
const HIGH_STRESS = 40;
const MUL_KEYS = ['restRecoveryMul', 'stressGainMul', 'sickDaysMul', 'fatigueGainMul'];

const defOf = (id) => RESEARCH.find((r) => r.id === id);

function researchOf(state) {
  state.research ??= { done: [], current: null, points: 0, build: null };
  return state.research;
}

// Multipliers in force (1 when none).
export function mods(state) {
  const out = {};
  for (const key of MUL_KEYS) out[key] = state.mods?.[key] ?? 1;
  return out;
}

export function startResearch(state, researchId) {
  const r = researchOf(state);
  if (!defOf(researchId) || r.done.includes(researchId) || r.current || r.build) return false;
  r.current = researchId;
  r.points = 0;
  return true;
}

const namesOfWorkers = (state) => state.people
  .filter((p) => state.assignment?.[p.id]?.kind === 'research')
  .map((p) => p.name);

// Moves the points earned this interval (state.progress.research) into the
// current research. With nothing being researched they are not banked.
export function advanceResearch(state) {
  const r = researchOf(state);
  const earned = state.progress?.research ?? 0;
  if (state.progress) state.progress.research = 0;
  if (!r.current || r.build) return;
  r.points += earned;
  const def = defOf(r.current);
  if (r.points < def.cost) return;
  r.build = { researchId: def.id, minutesLeft: def.buildHours * 60 };
  r.current = null;
  r.points = 0;
  pushEvent(state, { id: 'research-done', data: { researchId: def.id, names: namesOfWorkers(state) } });
}

function refresh(person) {
  person.morale = moraleOf(person);
}

// Applies the finished build to the people; returns those it changed as
// [{ personId, name, daysLeft? }] (daysLeft: the shortened sick leave, the clinic's {days}).
function applyNow(state, researchId) {
  const helped = [];
  const eff = defOf(researchId).effect;
  if (eff.sickDaysMul !== undefined) {
    for (const p of state.people) {
      if (p.health.kind !== 'sick' && p.health.kind !== 'burnout') continue;
      const daysLeft = Math.max(1, Math.ceil(p.health.daysLeft * eff.sickDaysMul));
      if (daysLeft < p.health.daysLeft) {
        p.health = { ...p.health, daysLeft };
        helped.push({ personId: p.id, name: p.name, daysLeft });
      }
    }
  }
  const relief = researchId === 'rest-room' ? REST_ROOM_RELIEF : researchId === 'stress-training' ? TRAINING_RELIEF : 0;
  if (relief > 0) {
    for (const p of state.people) {
      if (p.stress >= HIGH_STRESS) helped.push({ personId: p.id, name: p.name });
      p.stress = Math.max(0, p.stress - relief);
      if (researchId === 'rest-room') p.fatigue = Math.max(0, p.fatigue - REST_ROOM_RELIEF);
      refresh(p);
    }
  }
  return helped;
}

// Runs for all elapsed time (nights and weekends too). One build at a time.
export function advanceBuild(state, minutes) {
  const build = state.research?.build;
  if (!build) return;
  build.minutesLeft -= minutes;
  if (build.minutesLeft > 0) return;
  const r = state.research;
  const eff = defOf(build.researchId).effect;
  r.build = null;
  r.done.push(build.researchId);
  state.mods ??= {};
  for (const key of MUL_KEYS) {
    if (eff[key] !== undefined) state.mods[key] = (state.mods[key] ?? 1) * eff[key];
  }
  if (eff.flexibleShifts) (state.flags ??= {}).flexibleShifts = true;
  const helped = applyNow(state, build.researchId);
  const data = { researchId: build.researchId, names: helped.map((h) => h.name), helped };
  // A build with no effect (the chat and mail desks) helps nobody, yet its done text has {name}:
  // it names the first agent in state.people (else the first person), a fixed choice.
  const rd = defOf(build.researchId);
  if (helped.length === 0 && Object.keys(rd.effect).length === 0 && rd.doneText?.includes('{name}')) {
    const who = state.people.find((p) => p.role === 'agent') ?? state.people[0];
    if (who) data.featured = { personId: who.id, name: who.name };
  }
  pushEvent(state, { id: 'build-done', data });
}
