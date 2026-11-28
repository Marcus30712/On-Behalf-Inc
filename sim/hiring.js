// Hiring: pay up front, wait a few workdays, choose one of two candidates.
// Pure rules, no DOM.
//
// state.hiring = null | { workdays, role?, waitDays?, candidates? }; state.nextId numbers new people.
// v1.7: role 'lead' hires a team lead (own desk, no seat); no role means an agent
// (v1.6 saves). One search runs at a time, whatever its role.
// v2.4: role 'qa' hires a QA the same way (own desk, no seat).
// The game calls advanceHiring once per Mon-Fri workday (v1.4, even with a weekend client), after endOfDay.
import { createPerson, planningOf } from './people.js';
import { TRAITS } from '../world/traits.js';
import { pushEvent } from './events.js';
import { neediestClient } from './economy.js';
import { NATIONS } from '../world/nations.js';
import { seatsOf } from './office.js';

export const SEATS = 8; // level-0 seats, kept for compatibility; use seatsOf(state)
export const HIRE_COST = 1500;
export const LEAD_HIRE_COST = 3000; // v1.7, 가상 값
export const QA_HIRE_COST = 2000; // v2.4, 가상 값

const WAIT_WORKDAYS = [3, 5];
const LEAD_WAIT_WORKDAYS = [5, 7]; // v1.7, 가상 값
const QA_WAIT_WORKDAYS = [4, 6]; // v2.4, 가상 값
// v2.4 (user rule): days from the start of a search to the join date (가상 값).
const JOIN_DAYS = [21, 42];
const STAFF_JOIN_DAYS = [42, 70];
const PROBATION_DAYS = 10;
const ANSWER_DAYS = 7;
const WEEKDAYS = [0, 1, 2, 3, 4];

// People who left are no longer in state.people; sick or on leave still sit.
const agentCount = (state) => state.people.filter((p) => p.role === 'agent').length;

// v2.4 (user rule): someone who gave notice is soon gone from the moment of
// the notice: an unanswered notice, a retention meeting, keep-trying or let-go.
export const onNotice = (state, person) =>
  (state.leaving ?? []).some((l) => l.personId === person.id)
  || (state.inbox ?? []).some((e) => e.id === 'resign-notice' && e.personId === person.id && !e.resolved);

// v2.4: people picked and waiting for their join date: state.joining = [{ person, day }].
const joiningAs = (state, role) => (state.joining ?? []).filter((j) => j.person.role === role).length;

// v1.7: true when no lead stays. v2.4: any staff role; anyone on notice counts
// as gone, and one picked and joining as there.
const needsRole = (state, role) =>
  !state.people.some((p) => p.role === role && !onNotice(state, p)) && joiningAs(state, role) === 0;
// v2.4: a seat for one more agent: agents on notice free theirs, joiners take one.
const agentRoom = (state, joinersAhead = joiningAs(state, 'agent')) =>
  agentCount(state) + joinersAhead - state.people.filter((p) => p.role === 'agent' && onNotice(state, p)).length < seatsOf(state);
export const needsLead = (state) => needsRole(state, 'lead');
export const needsQa = (state) => needsRole(state, 'qa'); // v2.4

// v2.4: the staff roles hired with their own desk (no agent seat), no
// probation, on a fixed weekday shift and task.
const STAFF = {
  lead: { cost: LEAD_HIRE_COST, wait: LEAD_WAIT_WORKDAYS, join: STAFF_JOIN_DAYS, event: 'lead-candidate', shift: 'early', task: 'coaching' },
  qa: { cost: QA_HIRE_COST, wait: QA_WAIT_WORKDAYS, join: STAFF_JOIN_DAYS, event: 'qa-candidate', shift: 'late', task: 'qa' },
};
// Own keys only: a damaged save's role 'constructor' is not a staff role.
const staffOf = (role) => (Object.hasOwn(STAFF, role) ? STAFF[role] : undefined);
const traitNames = (p) => (p.traits ?? []).map((id) => TRAITS.find((t) => t.id === id)?.name).filter(Boolean);

export function startHiring(state, role = 'agent') {
  const staff = staffOf(role);
  if (state.hiring) return { ok: false, reason: 'already' };
  if (staff && !needsRole(state, role)) return { ok: false, reason: 'no-need' };
  if (!staff && !agentRoom(state)) return { ok: false, reason: 'no-seat' };
  const cost = staff ? staff.cost : HIRE_COST;
  if ((state.cash ?? 0) < cost) return { ok: false, reason: 'no-cash' };
  state.cash -= cost;
  state.hiring = staff ? { workdays: 0, role } : { workdays: 0 };
  return { ok: true };
}

function newId(state) {
  state.nextId ??= 1;
  let id;
  do id = `h${state.nextId++}`; while (state.people.some((p) => p.id === id));
  return id;
}

export function advanceHiring(state, rng) {
  // v2.4: people whose join date has come join first (in the order picked).
  const due = (state.joining ?? []).filter((j) => j.day <= state.day);
  if (due.length > 0) state.joining = state.joining.filter((j) => !due.includes(j));
  for (const j of due) join(state, j.person);
  const h = state.hiring;
  if (state.gameOver || !h) return;
  const staff = staffOf(h.role);
  // v2.4: the join date, counted from about the start (a save from before v2.4: from now).
  h.joinDay ??= state.day + rng.int(...(staff ? staff.join : JOIN_DAYS));
  if (h.candidates) return;
  h.waitDays ??= rng.int(...(staff ? staff.wait : WAIT_WORKDAYS));
  h.workdays += 1;
  if (h.workdays < h.waitDays) return;
  h.candidates = [];
  for (let i = 0; i < 2; i++) {
    const takenNames = [...state.people, ...h.candidates].map((p) => p.name);
    h.candidates.push(createPerson(rng, {
      id: newId(state), role: staff ? h.role : 'agent', nation: rng.pick(NATIONS).id, takenNames,
    }));
  }
  const [a, b] = h.candidates;
  const data = { cand1: a.name, cand2: b.name, joinDay: h.joinDay };
  if (h.role === 'lead') Object.assign(data, { c1: a.skills.coaching, c2: b.skills.coaching, p1: planningOf(a), p2: planningOf(b) });
  if (h.role === 'qa') Object.assign(data, { t1: traitNames(a), t2: traitNames(b) }); // v2.4
  pushEvent(state, {
    id: staff ? staff.event : 'candidate',
    data,
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

// 'candidate' pick-1 / pick-2 (and the lead / QA choices): the candidate is
// picked; the search ends and they join on its join date (v2.4), at once if
// it has passed. Another search can start meanwhile.
export function hireCandidate(state, index) {
  const h = state.hiring;
  const candidate = h?.candidates?.[index];
  if (!candidate) {
    state.hiring = null;
    return;
  }
  // The search ends here; a save from before v2.4 picked before any join date: from today.
  state.hiring = null;
  const day = h.joinDay ?? state.day;
  if (day <= state.day) join(state, candidate);
  else (state.joining ??= []).push({ person: candidate, day });
}

// v2.4: the picked candidate joins if there is still room (a withdrawn notice
// can take it back); otherwise the hire is cancelled and the cost is gone.
// An agent joins on probation answering the client that has done worst
// lately, or, beyond the seats (handover), trains until a seat frees.
// v1.7: a lead joins without probation, coaching on the early shift. v2.4: a
// QA likewise, checking calls late. A second lead or QA works beside the one
// working out notice.
function join(state, candidate) {
  const staff = staffOf(candidate.role);
  const room = staff
    ? needsRole(state, candidate.role)
    : agentRoom(state, 0); // joiners still waiting come later
  if (!room) {
    pushEvent(state, { id: 'hire-cancelled', data: { name: candidate.name } });
    return;
  }
  if (staff) {
    state.people.push(candidate);
    state.roster[candidate.id] = Object.fromEntries(WEEKDAYS.map((d) => [d, staff.shift]));
    state.assignment[candidate.id] = { kind: staff.task };
    return;
  }
  candidate.probationDays = PROBATION_DAYS;
  state.people.push(candidate);
  const shift = quieterShift(state);
  state.roster[candidate.id] = Object.fromEntries(WEEKDAYS.map((d) => [d, shift]));
  if (agentCount(state) > seatsOf(state)) {
    candidate.seatWait = true;
    state.assignment[candidate.id] = { kind: 'training' };
    return;
  }
  const clientId = neediestClient(state);
  if (clientId) state.assignment[candidate.id] = { kind: 'phone', clientId };
}

// v2.4: agents waiting for a seat take free ones in people order; one still
// training moves to the phone for the client that has done worst lately.
export function seatWaiters(state) {
  for (const p of state.people) {
    if (!p.seatWait) continue;
    const seated = state.people.filter((x) => x.role === 'agent' && !x.seatWait).length;
    if (seated >= seatsOf(state)) return;
    delete p.seatWait;
    const clientId = neediestClient(state);
    if (state.assignment[p.id]?.kind === 'training' && clientId) state.assignment[p.id] = { kind: 'phone', clientId };
  }
}

// 'candidate' hold: nobody is hired; a new search starts from scratch.
export function dropHiring(state) {
  state.hiring = null;
}
