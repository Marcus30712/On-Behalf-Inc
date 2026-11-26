// v1.6 daily break plan. Pure functions, no DOM.
//
// At the start of each day the team lead places everyone's three breaks
// (15-minute am break, 60-minute lunch, 15-minute pm break) on the 15-minute
// grid inside fixed windows counted from the person's shift start. For each
// candidate start the lead weighs the forecast calls of the person's client
// against the agents of that client still at their desks:
//
//   score = q * load + (1 - q) * noise,  q = lead planning / 10, lowest wins
//
// load = forecast calls of the client in the slot / agents of that client
// still working in it (the person included; breaks placed earlier the same
// day already take colleagues out), averaged over the quarter-hours the break
// covers, then divided by the largest such load in the person's window (0 when
// that is 0), so load is 0-1 like noise and the lead range 3-8 matters evenly
// (ruling, v1.6 Task 2). The forecast is expectedCalls (no wobble), and noise
// comes from a day-seeded rng of its own, so planning never moves the game
// rng. With no lead on shift that day q = 0 (breaks fall at random) and `by`
// is 'auto'.
//
// v1.6 Task 3: the game keeps only today's plan, state.breaks = { day, plan },
// made at the start of each day (sim/day.js startDay, after the night's
// health, absence and leave updates), or lazily by the first interval or view
// of a new game or of a save without one. Someone put on a shift after the
// plan was made (a roster change during the day) gets their breaks planned
// when first needed.
//
// Import cycle: sim/interval.js imports breakLookup from here and this file
// imports the forecast from there; both only call each other at run time.
import { createRng } from './rng.js';
import { dateOf } from './calendar.js';
import { SHIFTS, BREAK_LENGTH, onShift, shiftRunsOn } from './schedule.js';
import { planningOf } from './people.js';
import { expectedCalls, answeringClient, isOpen } from './interval.js';
import { CLIENTS } from '../world/clients.js';

const GRID = 15;
const INTERVAL = 30;

// Windows for a break's start, in minutes from the shift start (inclusive):
// am 60 to 180-15, lunch 180 to 330-60, pm (length-180) to (length-60-15).
export function windowsFor(shiftLength) {
  return {
    am: { from: 60, to: 180 - BREAK_LENGTH.am, length: BREAK_LENGTH.am },
    lunch: { from: 180, to: 330 - BREAK_LENGTH.lunch, length: BREAK_LENGTH.lunch },
    pm: { from: shiftLength - 180, to: shiftLength - 60 - BREAK_LENGTH.pm, length: BREAK_LENGTH.pm },
  };
}

// Every shift is 540 minutes (09:00-18:00, 12:00-21:00).
export const BREAK_WINDOWS = windowsFor(540);

// The day's own rng: game seed and day mixed (fmix32), apart from state.rngState.
export function dayRng(state, day) {
  let h = ((state.seed >>> 0) ^ Math.imul((day + 1) >>> 0, 0x9e3779b1)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return createRng(h >>> 0);
}

// The shift a person works on `day`, or undefined when they do not work it:
// well, not absent, and rostered on a shift that runs that weekday (onShift
// at their own shift start). For the lead this is "present" (ruling): the plan
// is made at day start whatever the lead's shift, so a late-shift lead also
// plans the morning (as if made the day before).
export function workingShift(state, person, day) {
  const { weekday } = dateOf(day);
  const shiftId = state.roster[person.id]?.[weekday];
  if (!shiftRunsOn(shiftId, weekday)) return undefined;
  return onShift(state, person, day, SHIFTS[shiftId].start) ? shiftId : undefined;
}

// { [personId]: { am, lunch, pm, by } } for everyone working `day`; minutes
// since midnight; by 'lead' when a lead works that day, else 'auto'.
// Deterministic for (state, day); reads the state and changes nothing.
export function planBreaks(state, day, rngForDay = dayRng(state, day)) {
  const working = [];
  for (const p of state.people) {
    const shiftId = workingShift(state, p, day);
    if (shiftId) working.push({ person: p, shift: SHIFTS[shiftId] });
  }
  const lead = working.find((w) => w.person.role === 'lead')?.person;
  const q = lead ? Math.min(1, Math.max(0, planningOf(lead) / 10)) : 0;
  const by = lead ? 'lead' : 'auto';

  // Client each person answers at a minute (undefined off phones), and the
  // forecast per client and interval, both cached for the day.
  const clientCache = new Map();
  const clientAt = (p, minute) => {
    const key = `${p.id}/${minute}`;
    if (!clientCache.has(key)) clientCache.set(key, answeringClient(state, state.assignment[p.id], day, minute));
    return clientCache.get(key);
  };
  const forecastCache = new Map();
  const forecastAt = (clientId, minute) => {
    const slot = minute - (minute % INTERVAL);
    const key = `${clientId}/${slot}`;
    if (!forecastCache.has(key)) {
      const def = CLIENTS.find((d) => d.id === clientId);
      forecastCache.set(key, def && isOpen(def, day, slot) ? expectedCalls(def, day, slot, state) : 0);
    }
    return forecastCache.get(key);
  };

  const placed = []; // { id, from, to } breaks already placed today
  const onBreakAt = (id, minute) => placed.some((b) => b.id === id && minute >= b.from && minute < b.to);
  // Agents of the client at their desks in the quarter-hour at `minute`.
  const workersAt = (clientId, minute) => working.filter(({ person, shift }) => minute >= shift.start
    && minute < shift.end && !onBreakAt(person.id, minute) && clientAt(person, minute) === clientId).length;

  // People off phones (the lead and QA on coaching/qa) answer no client, so
  // their load is 0 and their breaks fall by noise alone: intended.
  const loadOf = (person, start, length) => {
    let sum = 0;
    for (let m = start; m < start + length; m += GRID) {
      const clientId = clientAt(person, m);
      if (clientId) sum += forecastAt(clientId, m) / Math.max(1, workersAt(clientId, m));
    }
    return sum / (length / GRID);
  };

  const plan = {};
  for (const { person, shift } of working) {
    const windows = windowsFor(shift.end - shift.start);
    const entry = {};
    for (const [kind, w] of Object.entries(windows)) {
      const starts = [];
      for (let off = w.from; off <= w.to; off += GRID) starts.push(shift.start + off);
      const loads = starts.map((start) => (q > 0 ? loadOf(person, start, w.length) : 0));
      const maxLoad = Math.max(...loads);
      let best;
      let bestScore = Infinity;
      starts.forEach((start, i) => {
        const noise = rngForDay.next(); // one draw per candidate, whatever q is
        const load = maxLoad > 0 ? loads[i] / maxLoad : 0;
        const score = q * load + (1 - q) * noise;
        if (score < bestScore) { bestScore = score; best = start; }
      });
      entry[kind] = best;
      placed.push({ id: person.id, from: best, to: best + w.length });
    }
    plan[person.id] = { ...entry, by };
  }
  return plan;
}

// True when `entry` is a well-formed plan entry whose breaks all lie inside
// the hours of `shiftId`, so a plan made before a shift change (early to late
// or back: the am break or the pm break falls outside) is not reused.
export function fitsShift(entry, shiftId) {
  const shift = SHIFTS[shiftId];
  if (!shift || !entry || typeof entry !== 'object') return false;
  return Object.entries(BREAK_LENGTH).every(([kind, length]) => Number.isFinite(entry[kind])
    && entry[kind] >= shift.start && entry[kind] + length <= shift.end);
}

// Today's stored plan, or undefined when state.breaks is missing or for another day.
const storedPlan = (state) => (state.breaks?.day === state.day ? state.breaks.plan : undefined);

// Makes and keeps today's plan when none is kept for state.day (only today's
// is kept). Returns true when it made one.
export function ensureBreakPlan(state) {
  if (storedPlan(state)) return false;
  state.breaks = { day: state.day, plan: planBreaks(state, state.day) };
  return true;
}

// A full plan for today, made at most once per day and roster: the view asks
// every animation frame, and someone moved to another shift has no kept entry
// until an interval keeps one. Cached per state object (so it is never saved)
// on the day and what planBreaks reads besides the forecast: who works which
// shift, who answers which client, which clients are active, and the lead's planning
// skill.
const freshPlans = new WeakMap();
function freshPlan(state) {
  const key = `${state.day}|${state.clients.filter((c) => c.active).map((c) => c.id).join()}|${state.people.map((p) => `${p.id}=${workingShift(state, p, state.day) ?? '-'}:${JSON.stringify(state.assignment[p.id] ?? null)}:${p.role === 'lead' ? planningOf(p) : ''}`).join()}`;
  const cached = freshPlans.get(state);
  if (cached?.key === key) return cached.plan;
  const plan = planBreaks(state, state.day);
  freshPlans.set(state, { key, plan });
  return plan;
}

// (person, shiftId) => today's { am, lunch, pm, by } for someone working
// `shiftId` today. The kept entry when it fits the shift; otherwise planned
// now (planBreaks once per lookup). keep: true (the interval) keeps today's
// plan and any entry planned now in state.breaks; keep: false (the view)
// changes nothing.
export function breakLookup(state, { keep }) {
  if (keep) ensureBreakPlan(state);
  const plan = storedPlan(state);
  let now;
  return (person, shiftId) => {
    const entry = plan?.[person.id];
    if (fitsShift(entry, shiftId)) return entry;
    now ??= freshPlan(state);
    const made = now[person.id];
    if (keep && made) plan[person.id] = made;
    return made;
  };
}

// ---- v1.9: the player moves today's breaks ---------------------------------

const BREAK_KINDS = ['am', 'lunch', 'pm'];

// Whether `person` (working `shiftId` today) may take their `kind` break at
// `start` instead of `current`: on the 15-minute grid, neither the current nor
// the new start before now (state.minute; equal is allowed), inside the
// shift's window. Returns a refusal reason or null.
function moveRefusal(state, shiftId, kind, current, start) {
  if (!Number.isInteger(start) || start % GRID !== 0) return 'bad-break';
  if (current < state.minute || start < state.minute) return 'break-started';
  const shift = SHIFTS[shiftId];
  const w = windowsFor(shift.end - shift.start)[kind];
  if (start < shift.start + w.from || start > shift.start + w.to) return 'break-window';
  return null;
}

// moveBreak(state, { personId, kind, start }) -> { ok } | { ok: false, reason }.
// Edits today's kept plan (state.breaks) and marks the entry edited (today
// only: tomorrow's plan is made new). The interval reads the kept plan, so the
// moved break takes effect from the next interval.
export function moveBreak(state, { personId, kind, start } = {}) {
  const person = state.people.find((p) => p.id === personId);
  if (!person) return { ok: false, reason: 'unknown-person' };
  const shiftId = workingShift(state, person, state.day);
  if (!shiftId) return { ok: false, reason: 'not-working' };
  if (!BREAK_KINDS.includes(kind)) return { ok: false, reason: 'bad-break' };
  const entry = breakLookup(state, { keep: true })(person, shiftId);
  if (!entry) return { ok: false, reason: 'not-working' };
  const reason = moveRefusal(state, shiftId, kind, entry[kind], start);
  if (reason) return { ok: false, reason };
  state.breaks.plan[person.id] = { ...entry, [kind]: start, edited: true };
  return { ok: true };
}

// The 휴식표 board for today (view.breakBoard): 30-minute slots over the
// hours today's phone and chat clients open, each with the forecast calls
// (unrounded), the agents on a break touching it, and busy (a top-25%
// forecast slot with two or more away); a row per person working today with
// each break's start and whether it can move 15 minutes earlier or later;
// who planned (by, the lead's name). Reads the state and changes nothing.
export function breakBoard(state) {
  const day = state.day;
  const lookup = breakLookup(state, { keep: false });
  const rows = [];
  const agentsAway = [];
  let lead = null;
  let by = 'auto';
  for (const p of state.people) {
    const shiftId = workingShift(state, p, day);
    if (!shiftId) continue;
    const entry = lookup(p, shiftId);
    if (!entry) continue;
    if (entry.by === 'lead') by = 'lead';
    if (p.role === 'lead' && !lead) lead = p.name;
    const breaks = {};
    for (const kind of BREAK_KINDS) {
      const at = entry[kind];
      breaks[kind] = {
        start: at,
        earlier: moveRefusal(state, shiftId, kind, at, at - GRID) === null,
        later: moveRefusal(state, shiftId, kind, at, at + GRID) === null,
      };
    }
    rows.push({ personId: p.id, breaks, edited: entry.edited === true });
    if (p.role === 'agent') agentsAway.push(entry);
  }
  const defs = state.clients.filter((c) => c.active)
    .map((c) => CLIENTS.find((d) => d.id === c.id))
    .filter((d) => d && d.channel !== 'email' && d.hours.days.includes(dateOf(day).weekday));
  const slots = [];
  if (defs.length > 0) {
    const open = Math.min(...defs.map((d) => d.hours.open));
    const close = Math.max(...defs.map((d) => d.hours.close));
    for (let m = open - (open % INTERVAL); m < close; m += INTERVAL) {
      const calls = defs.reduce((sum, d) => sum + (isOpen(d, day, m) ? expectedCalls(d, day, m, state) : 0), 0);
      const away = agentsAway.filter((e) => BREAK_KINDS.some((k) => e[k] < m + INTERVAL && e[k] + BREAK_LENGTH[k] > m)).length;
      slots.push({ minute: m, calls, away });
    }
  }
  const sorted = slots.map((x) => x.calls).sort((a, b) => b - a);
  const bar = sorted.length > 0 ? sorted[Math.ceil(sorted.length * 0.25) - 1] : Infinity;
  for (const x of slots) x.busy = x.calls > 0 && x.calls >= bar && x.away >= 2;
  return { slots, rows, by: lead ? by : 'auto', lead };
}
