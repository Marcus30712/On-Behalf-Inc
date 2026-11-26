// One 30-minute interval of the whole operation: calls arrive, queues run,
// people tire or recover, client satisfaction moves. Pure rules, no DOM.
//
// Assignment = { [personId]: { kind: 'phone', clientId } | { kind: 'coaching'|'qa'|'research'|'training' } }
// A person with no assignment does no work: on shift or not, they rest.
// v1.3: the kind stays 'phone' for every channel (save compatibility); the
// client's `channel` (channelOf) decides how the work runs: phone as before,
// chat with concurrent seats, email through the backlog (sim/backlog.js) in
// the same staff/satisfaction/occupancy path as a queue.
import { intervalQueue } from './queue.js';
import { stepBacklog, newBacklog } from './backlog.js';
import { dateOf, holidaysOn } from './calendar.js';
import { ahtFor, applyWork, applyRest, traitMul, traitAdd } from './people.js';
import { onShift, workShare, rosteredDays } from './schedule.js';
import { breakLookup } from './breaks.js';
import { CLIENTS } from '../world/clients.js';
import { NATIONS } from '../world/nations.js';

const INTERVAL = 30;
const CURVE_START = 540; // 09:00
const SPIKE_MUL = 1.6;
const NON_PHONE_OCCUPANCY = 0.2;
// v1.3 chat: one person holds CHAT_CONCURRENCY chats at once, each handled at
// CHAT_EFFICIENCY of a phone agent, so a seat counts for 1.5 phone agents.
export const CHAT_CONCURRENCY = 2;
export const CHAT_EFFICIENCY = 0.75;
const PROGRESS_KINDS = ['coaching', 'qa', 'research', 'training'];

// Share of a day's calls per interval, 09:00-21:00 (24 intervals, sum 1).
// A morning rise to 0.037 at 10:30-11:00, a lunch dip at 12:30 (0.035), the day's
// peak at 15:00 (0.067) and a second one at 17:00 (0.065) while both shifts
// are on, then an evening tail. Shaped to the default roster: one shift alone
// before 12:00 and after 18:00, breaks staggered over 12:00-18:00 (the fixed
// break groups before v1.6; since then the lead's day plan, sim/breaks.js).
export const CURVE = [
  28, 33, 35, 37, 37, 35, // 09:00-12:00
  48, 35, 42, 44,         // 12:00-14:00
  58, 63, 67, 61, 45, 45, // 14:00-17:00
  65, 58, 38, 33, 30, 26, 21, 16, // 17:00-21:00
].map((w) => w / 1000);

// Monday = weekday 0. Saturday and Sunday (v1.2) only reach weekend clients.
const WEEKDAY_MUL = [1.15, 1.0, 1.0, 1.0, 0.9, 1.0, 1.0];

// v1.2: someone rostered six days or more in a week tires this much faster.
export const SIX_DAY_FATIGUE_MUL = 1.5;
const SIX_DAYS = 6;

// v1.1: clients grow. Each 90-day quarter of the game adds `perQuarter` of the
// starting volume, for the first `quarters` quarters (then it holds at about
// +14%), so a roster that was enough in spring falls behind by autumn unless
// it is run. Seats are fixed until office expansion (v1.2), which resumes
// growth (below).
export const CALL_GROWTH = { perQuarter: 0.07, quarters: 2 };
const QUARTER_DAYS = 90;

// v1.2: when expansion 1 is finished (state.office.level1Day) growth resumes
// for `RESUMED_GROWTH.quarters` more quarter(s), counted from that day, on top
// of the first ones (at most x1.21). Without it, as in v1.1. One quarter, not
// two, so an office that keeps service can still pay for its expansion
// (balance record, v1.2 section).
export const RESUMED_GROWTH = { quarters: 1 };
function growthMul(day, level1Day) {
  const quarters = (from, max) => Math.min(max, Math.max(0, Math.floor((day - from) / QUARTER_DAYS)));
  const steps = quarters(0, CALL_GROWTH.quarters)
    + (level1Day === undefined ? 0 : quarters(level1Day, RESUMED_GROWTH.quarters));
  return 1 + CALL_GROWTH.perQuarter * steps;
}

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

// Calls expected in the interval before the day's wobble: callsPerDay x
// growth x curve x weekday x holiday. Draws nothing, so the break plan
// (sim/breaks.js) can forecast with it without moving the game rng.
export function expectedCalls(client, day, minute, state) {
  const slot = Math.floor((minute - CURVE_START) / INTERVAL);
  const { weekday } = dateOf(day);
  // No calls on a day the client does not open (a weekday client at the weekend).
  const weekMul = client.hours.days.includes(weekday) ? WEEKDAY_MUL[weekday] ?? 0 : 0;
  const curve = CURVE[slot] ?? 0;
  const holiday = holidayMul(nationOf(client.nation), day);
  return client.callsPerDay * growthMul(day, state?.office?.level1Day) * curve * weekMul * holiday;
}

// Calls for one interval: expectedCalls x wobble (one rng draw).
// Spikes (state.spikes) are not applied here; stepInterval multiplies them in.
export function callsFor(client, day, minute, rng, state) {
  const wobble = 0.85 + 0.3 * rng.next();
  return expectedCalls(client, day, minute, state) * wobble;
}

// Research points per full interval of work: 1 + average(coaching, evaluation) / 10.
const researchSkillMul = (p) => 1 + (p.skills.coaching + p.skills.evaluation) / 2 / 10;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Client satisfaction per interval, sized so it moves over days: an interval
// at target adds SAT_MET (about +1 over a good day); a miss costs up to
// SAT_MISS by how far the service level fell short, plus up to SAT_LOST by the
// share of calls lost. A wholly unanswered day costs about 8, a bad week 40.
const SAT_MET = 0.04;
const SAT_MISS = 0.15;
const SAT_LOST = 0.2;
// Traits of the people answering, averaged by how much of the interval each
// worked: csatAdd adds CSAT_POINT per point while calls are answered;
// errorMul scales the loss (a miss and dropped calls) their work causes.
const CSAT_POINT = 0.01;

function satisfactionDelta(q, target, { errorMul = 1, csatAdd = 0 } = {}) {
  const lost = q.offered > 0 ? q.abandoned / q.offered : 0;
  const met = q.serviceLevel >= target;
  const gain = met ? SAT_MET : 0;
  const loss = (met ? 0 : SAT_MISS * ((target - q.serviceLevel) / target)) + SAT_LOST * lost;
  const care = q.handled > 0 ? CSAT_POINT * csatAdd : 0;
  return gain - loss * errorMul + care;
}

// Share-weighted average of a per-person value over a client's phone staff.
function staffAverage(list, valueOf, none) {
  const weight = list.reduce((s, x) => s + x.share, 0);
  return weight > 0 ? list.reduce((s, x) => s + x.share * valueOf(x.person), 0) / weight : none;
}

// 'phone' | 'chat' | 'email' (clients saved or defined without a channel are phone).
export function channelOf(def) {
  return def.channel ?? 'phone';
}

// True on the client's own days (weekday clients Mon-Fri, weekend clients Sat-Sun).
export function isOpenDay(def, day) {
  return def.hours.days.includes(dateOf(day).weekday);
}

// The client's own days and hours.
export function isOpen(def, day, minute) {
  const h = def.hours;
  return isOpenDay(def, day) && minute >= h.open && minute < h.close;
}

// Capacity factor from the person's nation holidays (e.g. a quiet month).
function staffAvail(person, day) {
  const nation = nationOf(person.nation);
  if (!nation) return 1;
  return Math.min(1, ...holidaysOn(day, nation).map(({ holiday }) => holiday.staffAvail ?? 1));
}

// The client a phone agent answers in the interval at (day, minute): their own
// client while it is open; while it is closed (a weekday client at the
// weekend) the first open active client in state.clients order, so a weekend
// crew left on its weekday client answers the weekend client. Weekday clients
// all keep the same hours, so on a weekday this is always the person's own
// client. undefined when no client is open or the person is not on phones.
export function answeringClient(state, assignment, day, minute) {
  if (assignment?.kind !== 'phone') return undefined;
  const openNow = (id) => {
    const def = CLIENTS.find((d) => d.id === id);
    return !!def && state.clients.some((c) => c.id === id && c.active) && isOpen(def, day, minute);
  };
  if (openNow(assignment.clientId)) return assignment.clientId;
  return state.clients.find((c) => openNow(c.id))?.id;
}

function todayEntry(state, id) {
  state.today ??= { clients: {} };
  state.today.clients ??= {};
  return (state.today.clients[id] ??= {
    offered: 0, handled: 0, abandoned: 0, intervals: 0, intervalsMet: 0, agentShareSum: 0,
    inTarget: 0, waitSec: 0,
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
    // The client each phone agent answers now (their own, or a stand-in while theirs is closed).
    const answering = new Map(state.people.map((p) => [p.id, answeringClient(state, state.assignment[p.id], day, minute)]));
    // v1.6: each person's breaks from today's plan (sim/breaks.js), made and
    // kept here if the day has none yet. Only asked for people on shift.
    const breaksOf = breakLookup(state, { keep: true });
    const shareOf = (p) => workShare(minute, shiftOf(p), breaksOf(p, shiftOf(p)));

    // Phone staff per open client.
    const staff = new Map(open.map((o) => [o.def.id, []]));
    for (const p of state.people) {
      const clientId = answering.get(p.id);
      if (!openIds.has(clientId) || !onShift(state, p, day, minute)) continue;
      const share = shareOf(p);
      if (share > 0) staff.get(clientId).push({ person: p, share });
    }

    // Queues (phone, chat) and backlogs (email), in state.clients order (one rng draw each).
    const results = new Map();
    for (const { state: cs, def } of open) {
      const channel = channelOf(def);
      const list = staff.get(def.id);
      const seats = channel === 'chat' ? CHAT_CONCURRENCY * CHAT_EFFICIENCY : 1;
      const agents = list.reduce((s, x) => s + x.share * staffAvail(x.person, day), 0) * seats;
      const ahtMin = staffAverage(list, (p) => ahtFor(p, def), def.ahtMin);
      let calls = callsFor(def, day, minute, rng, state);
      if ((state.spikes ?? []).some((s) => s.clientId === def.id && s.day === day)) calls *= SPIKE_MUL;
      let q;
      if (channel === 'email') {
        state.backlog ??= {};
        const entry = (state.backlog[def.id] ??= newBacklog());
        q = stepBacklog(entry, {
          arrivals: calls, agents, ahtMin, targetMin: def.slTarget.openMinutes,
        });
      } else {
        q = intervalQueue({
          calls, ahtMin, agents, targetSec: def.slTarget.sec, patienceSec: def.patienceSec,
        });
      }
      results.set(def.id, q);

      const target = def.slTarget.pct / 100;
      const met = q.serviceLevel >= target;
      const traits = {
        errorMul: staffAverage(list, (p) => traitMul(p, 'errorMul'), 1),
        csatAdd: staffAverage(list, (p) => traitAdd(p, 'csatAdd'), 0),
      };
      cs.satisfaction = clamp(cs.satisfaction + satisfactionDelta(q, target, traits), 0, 100);

      const t = todayEntry(state, def.id);
      // Email only (keeps phone-only today entries as before): mail that came
      // in today; `offered` counts mail answered or gone overdue instead.
      if (channel === 'email') t.arrived = (t.arrived ?? 0) + calls;
      t.offered += q.offered;
      t.handled += q.handled;
      t.abandoned += q.abandoned;
      t.intervals += 1;
      if (met) t.intervalsMet += 1;
      t.agentShareSum += agents;
      // Sums for the call-weighted service level (inTarget / offered) and the
      // average wait of answered calls (waitSec / handled).
      t.inTarget += q.serviceLevel * q.offered;
      t.waitSec += q.asaSec * q.handled;
      report.clients[def.id] = {
        offered: q.offered, handled: q.handled, abandoned: q.abandoned,
        serviceLevel: q.serviceLevel, asaSec: q.asaSec, agents,
      };
      if (channel === 'email') report.clients[def.id].overdue = q.overdue;
    }

    // People: work, or rest for the time not worked.
    const mods = state.mods ?? {};
    for (const p of state.people) {
      const a = state.assignment[p.id];
      let share = 0;
      if (a && onShift(state, p, day, minute)) share = shareOf(p);
      let occupancy = NON_PHONE_OCCUPANCY;
      if (a?.kind === 'phone') {
        const clientId = answering.get(p.id);
        if (openIds.has(clientId)) occupancy = results.get(clientId).occupancy;
        else share = 0;
      } else if (a && PROGRESS_KINDS.includes(a.kind) && share > 0) {
        let gain = share;
        if (a.kind === 'research') gain *= researchSkillMul(p);
        if (a.kind === 'qa') gain *= traitMul(p, 'qaMul');
        state.progress[a.kind] = (state.progress[a.kind] ?? 0) + gain;
      }
      const worked = INTERVAL * share;
      const tired = worked > 0 && rosteredDays(state, p.id) >= SIX_DAYS
        ? { ...mods, fatigueGainMul: (mods.fatigueGainMul ?? 1) * SIX_DAY_FATIGUE_MUL } : mods;
      if (worked > 0) applyWork(p, { minutes: worked, occupancy, mods: tired });
      if (INTERVAL - worked > 0) applyRest(p, { minutes: INTERVAL - worked, mods });
    }
  }

  state.minute += INTERVAL;
  return report;
}
