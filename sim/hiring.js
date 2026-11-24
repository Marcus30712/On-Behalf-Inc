// Hiring: pay up front, wait a few workdays, choose one of two candidates.
// Pure rules, no DOM.
//
// state.hiring = null | { workdays, waitDays?, candidates? }; state.nextId numbers new people.
// The game calls advanceHiring once per workday, after endOfDay.
import { createPerson } from './people.js';
import { pushEvent } from './events.js';
import { neediestClient } from './economy.js';
import { NATIONS } from '../world/nations.js';

export const SEATS = 8; // agent seats; lead and QA have their own desks
export const HIRE_COST = 1500;

const WAIT_WORKDAYS = [3, 5];
const PROBATION_DAYS = 10;
const ANSWER_DAYS = 7;
const WEEKDAYS = [0, 1, 2, 3, 4];

// People who left are no longer in state.people; sick or on leave still sit.
const agentCount = (state) => state.people.filter((p) => p.role === 'agent').length;

export function startHiring(state) {
  if (state.hiring) return { ok: false, reason: 'already' };
  if (agentCount(state) >= SEATS) return { ok: false, reason: 'no-seat' };
  if ((state.cash ?? 0) < HIRE_COST) return { ok: false, reason: 'no-cash' };
  state.cash -= HIRE_COST;
  state.hiring = { workdays: 0 };
  return { ok: true };
}

function newId(state) {
  state.nextId ??= 1;
  let id;
  do id = `h${state.nextId++}`; while (state.people.some((p) => p.id === id));
  return id;
}

export function advanceHiring(state, rng) {
  const h = state.hiring;
  if (state.gameOver || !h || h.candidates) return;
  h.waitDays ??= rng.int(...WAIT_WORKDAYS);
  h.workdays += 1;
  if (h.workdays < h.waitDays) return;
  h.candidates = [0, 1].map(() => createPerson(rng, {
    id: newId(state), role: 'agent', nation: rng.pick(NATIONS).id,
  }));
  pushEvent(state, {
    id: 'candidate',
    data: { cand1: h.candidates[0].name, cand2: h.candidates[1].name },
    deadlineDay: state.day + ANSWER_DAYS,
  });
}

// The shift (early or late) with fewer agents on Monday; early on a tie.
function quieterShift(state) {
  const count = { early: 0, late: 0 };
  for (const p of state.people) {
    const shift = state.roster[p.id]?.[0];
    if (p.role === 'agent' && shift in count) count[shift] += 1;
  }
  return count.late < count.early ? 'late' : 'early';
}

// 'candidate' pick-1 / pick-2: the candidate joins on probation, answering the
// phone for the client that has done worst lately.
export function hireCandidate(state, index) {
  const candidate = state.hiring?.candidates?.[index];
  state.hiring = null;
  if (!candidate || agentCount(state) >= SEATS) return;
  candidate.probationDays = PROBATION_DAYS;
  state.people.push(candidate);
  const shift = quieterShift(state);
  state.roster[candidate.id] = Object.fromEntries(WEEKDAYS.map((d) => [d, shift]));
  const clientId = neediestClient(state);
  if (clientId) state.assignment[candidate.id] = { kind: 'phone', clientId };
}

// 'candidate' hold: nobody is hired; a new search starts from scratch.
export function dropHiring(state) {
  state.hiring = null;
}
