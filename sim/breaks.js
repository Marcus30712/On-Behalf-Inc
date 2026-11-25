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

// The shift a person works on `day`, or undefined when they do not work it
// (off, sick, absent, center closed): on shift at their own shift start.
function shiftToday(state, person, day) {
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
    const shiftId = shiftToday(state, p, day);
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
