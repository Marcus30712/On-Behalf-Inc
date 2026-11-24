// One 30-minute interval of the whole operation: calls arrive, queues run,
// people tire or recover, client satisfaction moves. Pure rules, no DOM.
//
// Assignment = { [personId]: { kind: 'phone', clientId } | { kind: 'coaching'|'qa'|'research'|'training' } }
// A person with no assignment does no work: on shift or not, they rest.
import { intervalQueue } from './queue.js';
import { dateOf, isWorkday, holidaysOn } from './calendar.js';
import { ahtFor, applyWork, applyRest } from './people.js';
import { onShift, workShare } from './schedule.js';
import { CLIENTS } from '../world/clients.js';
import { NATIONS } from '../world/nations.js';

const INTERVAL = 30;
const CURVE_START = 540; // 09:00
const SPIKE_MUL = 1.6;
const NON_PHONE_OCCUPANCY = 0.5;
const PROGRESS_KINDS = ['coaching', 'qa', 'research', 'training'];

// Share of a day's calls per interval, 09:00-21:00 (24 intervals, sum 1).
// Late-morning peak at 11:00 (0.066), a lunch dip at 12:30 (0.034), an
// early-afternoon peak at 15:00 (0.060), then an evening tail.
export const CURVE = [
  36, 44, 52, 60, 66, 62, // 09:00-12:00
  38, 34, 36, 44,         // 12:00-14:00
  52, 58, 60, 56, 50, 44, // 14:00-17:00
  40, 36, 32, 28, 24, 20, 16, 12, // 17:00-21:00
].map((w) => w / 1000);

// Monday = weekday 0.
const WEEKDAY_MUL = [1.15, 1.0, 1.0, 1.0, 0.9];

const nationOf = (id) => NATIONS.find((n) => n.id === id);

// Product of the nation's holiday call effects for `day`: `during` while a
// holiday is on, `after` for `afterDays` days once it has ended.
function holidayMul(nation, day) {
  let mul = 1;
  for (const { holiday } of holidaysOn(day, nation)) {
    mul *= holiday.callEffect?.during ?? 1;
  }
  const maxBack = Math.max(0, ...nation.holidays.map((h) => h.callEffect?.afterDays ?? 0));
  for (let k = 1; k <= maxBack; k++) {
    for (const { holiday, dayOfHoliday } of holidaysOn(day - k, nation)) {
      const eff = holiday.callEffect;
      if (eff && dayOfHoliday === holiday.length && k <= eff.afterDays) mul *= eff.after;
    }
  }
  return mul;
}

// Expected calls for one interval: callsPerDay x curve x weekday x holiday x wobble.
// Spikes (state.spikes) are not applied here; stepInterval multiplies them in.
export function callsFor(client, day, minute, rng) {
  const slot = Math.floor((minute - CURVE_START) / INTERVAL);
  const weekMul = WEEKDAY_MUL[dateOf(day).weekday] ?? 0;
  const wobble = 0.85 + 0.3 * rng.next();
  const curve = CURVE[slot] ?? 0;
  const holiday = holidayMul(nationOf(client.nation), day);
  return client.callsPerDay * curve * weekMul * holiday * wobble;
}

// Research points per full interval of work: 0.5 + average(coaching, evaluation) / 20.
const researchSkillMul = (p) => 0.5 + (p.skills.coaching + p.skills.evaluation) / 2 / 20;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function isOpen(def, day, minute) {
  const h = def.hours;
  return isWorkday(day) && h.days.includes(dateOf(day).weekday) && minute >= h.open && minute < h.close;
}

// Capacity factor from the person's nation holidays (e.g. a quiet month).
function staffAvail(person, day) {
  const nation = nationOf(person.nation);
  if (!nation) return 1;
  return Math.min(1, ...holidaysOn(day, nation).map(({ holiday }) => holiday.staffAvail ?? 1));
}

function todayEntry(state, id) {
  state.today ??= { clients: {} };
  state.today.clients ??= {};
  return (state.today.clients[id] ??= {
    offered: 0, handled: 0, abandoned: 0, intervals: 0, intervalsMet: 0, agentShareSum: 0,
  });
}

export function stepInterval(state, rng) {
  const { day, minute } = state;
  const report = { day, minute, clients: {} };
  if (state.gameOver) return report;
  const open = [];
  for (const c of state.clients) {
    const def = CLIENTS.find((d) => d.id === c.id);
    if (c.active && def && isOpen(def, day, minute)) open.push({ state: c, def });
  }

  if (open.length > 0) {
    const openIds = new Set(open.map((o) => o.def.id));
    const shiftOf = (p) => state.roster[p.id]?.[dateOf(day).weekday];

    // Phone staff per open client.
    const staff = new Map(open.map((o) => [o.def.id, []]));
    for (const p of state.people) {
      const a = state.assignment[p.id];
      if (a?.kind !== 'phone' || !openIds.has(a.clientId) || !onShift(state, p, day, minute)) continue;
      const share = workShare(minute, shiftOf(p));
      if (share > 0) staff.get(a.clientId).push({ person: p, share });
    }

    // Queues, in state.clients order (one rng draw each).
    const results = new Map();
    for (const { state: cs, def } of open) {
      const list = staff.get(def.id);
      const agents = list.reduce((s, x) => s + x.share * staffAvail(x.person, day), 0);
      const weight = list.reduce((s, x) => s + x.share, 0);
      const ahtMin = weight > 0
        ? list.reduce((s, x) => s + x.share * ahtFor(x.person, def), 0) / weight
        : def.ahtMin;
      let calls = callsFor(def, day, minute, rng);
      if ((state.spikes ?? []).some((s) => s.clientId === def.id && s.day === day)) calls *= SPIKE_MUL;
      const q = intervalQueue({
        calls, ahtMin, agents, targetSec: def.slTarget.sec, patienceSec: def.patienceSec,
      });
      results.set(def.id, q);

      const target = def.slTarget.pct / 100;
      const met = q.serviceLevel >= target;
      const delta = (met ? 0.2 : -(target - q.serviceLevel) * 2) - 0.05 * q.abandoned;
      cs.satisfaction = clamp(cs.satisfaction + delta, 0, 100);

      const t = todayEntry(state, def.id);
      t.offered += q.offered;
      t.handled += q.handled;
      t.abandoned += q.abandoned;
      t.intervals += 1;
      if (met) t.intervalsMet += 1;
      t.agentShareSum += agents;
      report.clients[def.id] = {
        offered: q.offered, handled: q.handled, abandoned: q.abandoned,
        serviceLevel: q.serviceLevel, asaSec: q.asaSec, agents,
      };
    }

    // People: work, or rest for the time not worked.
    const mods = state.mods ?? {};
    for (const p of state.people) {
      const a = state.assignment[p.id];
      let share = 0;
      if (a && onShift(state, p, day, minute)) share = workShare(minute, shiftOf(p));
      let occupancy = NON_PHONE_OCCUPANCY;
      if (a?.kind === 'phone') {
        if (openIds.has(a.clientId)) occupancy = results.get(a.clientId).occupancy;
        else share = 0;
      } else if (a && PROGRESS_KINDS.includes(a.kind) && share > 0) {
        const gain = a.kind === 'research' ? share * researchSkillMul(p) : share;
        state.progress[a.kind] = (state.progress[a.kind] ?? 0) + gain;
      }
      const worked = INTERVAL * share;
      if (worked > 0) applyWork(p, { minutes: worked, occupancy, mods });
      if (INTERVAL - worked > 0) applyRest(p, { minutes: INTERVAL - worked, mods });
    }
  }

  state.minute += INTERVAL;
  return report;
}
