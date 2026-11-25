// Money, reputation, churn, client offers, milestones and game over. Pure rules, no DOM.
//
// state.cash; state.churn = [{ clientId, workdaysLeft }]; state.offerStreak (workdays at A+);
// state.offered = [{ id, day }] (the day a client was last offered; v1.1 saves held bare ids, state.js converts); state.milestones = [eventId]; state.gameOver = { kind, day } | undefined;
// state.rankSStreak (workdays in a row at S; missing in v1.0 saves, read as 0).
// The game calls dailyEconomy after endOfDay on workdays, and monthEnd after
// endOfDay on the last day of each 30-day month.
import { DAYS_PER_MONTH, dateOf } from './calendar.js';
import { pushEvent } from './events.js';
import { CLIENTS } from '../world/clients.js';
import { rentOf, officeLevel } from './office.js';

// Placeholder monthly salaries.
export const SALARY = { agent: 2400, lead: 3600, qa: 3000 };

const MET_DAY = 0.8; // share of a day's intervals at target for the day to count as met
const FEE_CUT_BELOW = 0.7; // share of met workdays in the month
const FEE_CUT = 0.8;
const RECENT_WORKDAYS = 20;
const GRADES = [['S', 90], ['A', 75], ['B', 60], ['C', 40]];
const CHURN_AT = 20;
const CHURN_RECOVER_ABOVE = 40;
const CHURN_WORKDAYS = 20;
const OFFER_STREAK = 20;
const OFFER_DEADLINE_DAYS = 7;
// v1.2: a client that was offered (declined, expired) or lost can be offered again after this many days.
const REOFFER_DAYS = 90;
const NEW_CLIENT_SATISFACTION = 70;
const BIG_CLIENT_COUNT = 3;
// v1.1: the S milestone takes six weeks (30 workdays) at S in a row, not one
// good day; and every client lost to churn (inactive in state.clients, lost on
// client.lostDay) takes LOST_CLIENT_MARK off the score for LOST_CLIENT_DAYS
// days, then nothing, so a centre does not look better for having lost one
// and putting everyone on the client that stayed, yet can earn its name back.
// (A step, not a straight-line fade: a fading mark is small enough for S
// within about 40 days.)
const RANK_S_WORKDAYS = 30;
const LOST_CLIENT_MARK = 15;
const LOST_CLIENT_DAYS = 180;

// What the lost clients still take off the score today. A lost client with no
// lostDay (a v1.0 save; state.js sets it to the load day) counts as lost today.
export function lostClientMark(state) {
  let mark = 0;
  for (const c of state.clients) {
    if (c.active) continue;
    if (state.day - (c.lostDay ?? state.day) < LOST_CLIENT_DAYS) mark += LOST_CLIENT_MARK;
  }
  return mark;
}

export const isOver = (state) => !!state.gameOver;

export function endGame(state, kind) {
  if (state.gameOver) return;
  state.gameOver = { kind, day: state.day };
  pushEvent(state, { id: kind, data: { days: state.day + 1 } });
}

// Share of intervals at target per recorded day, for the client's last `n` days
// in state.history that have data for it. Null when there are none.
function dailyMetRates(state, clientId, n = RECENT_WORKDAYS) {
  return (state.history ?? [])
    .map((h) => h.clients?.[clientId])
    .filter((c) => c?.intervals > 0)
    .slice(-n)
    .map((c) => c.intervalsMet / c.intervals);
}

export function metRate(state, clientId) {
  const rates = dailyMetRates(state, clientId);
  return rates.length === 0 ? null : rates.reduce((s, r) => s + r, 0) / rates.length;
}

const activeClients = (state) => state.clients.filter((c) => c.active);

// The active client that has done worst lately; one with no record yet counts as 0.
export function neediestClient(state) {
  let best;
  for (const c of activeClients(state)) {
    const rate = metRate(state, c.id) ?? 0;
    if (!best || rate < best.rate) best = { id: c.id, rate };
  }
  return best?.id;
}

// Score = 60 x average met-rate (last 20 workdays, active clients)
//       + 0.4 x average satisfaction (active clients) - reputationPenalty
//       - 15 per client lost in the last 180 days (v1.1).
// With no recorded workday yet the met-rate counts as 1.
export function reputationScore(state) {
  const active = activeClients(state);
  const rates = active.flatMap((c) => dailyMetRates(state, c.id));
  const met = rates.length === 0 ? 1 : rates.reduce((s, r) => s + r, 0) / rates.length;
  const sat = active.length === 0 ? 0 : active.reduce((s, c) => s + c.satisfaction, 0) / active.length;
  return 60 * met + 0.4 * sat - (state.reputationPenalty ?? 0) - lostClientMark(state);
}

export function reputation(state) {
  const score = reputationScore(state);
  return GRADES.find(([, min]) => score >= min)?.[0] ?? 'D';
}

export function monthEnd(state) {
  if (state.gameOver) return;
  const monthStart = state.day - (state.day % DAYS_PER_MONTH);
  const month = (state.history ?? []).filter((h) => h.day >= monthStart && h.day <= state.day);
  let income = 0;
  for (const c of activeClients(state)) {
    const def = CLIENTS.find((d) => d.id === c.id);
    const days = month.map((h) => h.clients?.[c.id]).filter((t) => t?.intervals > 0);
    if (!def || days.length === 0) continue; // no workday served, no fee
    const metDays = days.filter((t) => t.intervalsMet / t.intervals >= MET_DAY).length;
    income += def.monthlyFee * (metDays / days.length < FEE_CUT_BELOW ? FEE_CUT : 1);
  }
  const salaries = state.people.reduce((s, p) => s + (SALARY[p.role] ?? 0), 0);
  state.cash = (state.cash ?? 0) + income - salaries - rentOf(state);
  state.reputationPenalty = (state.reputationPenalty ?? 0) / 2;
  if (state.cash < 0) endGame(state, 'game-over-cash');
}

function milestone(state, id) {
  state.milestones ??= [];
  if (state.milestones.includes(id)) return;
  state.milestones.push(id);
  pushEvent(state, { id });
}

function checkBigClient(state) {
  if (activeClients(state).length >= BIG_CLIENT_COUNT) milestone(state, 'milestone-big-client');
}

function loseClient(state, client) {
  client.active = false;
  client.lostDay = state.day;
  // v1.3: a lost email client's mail goes with it (a re-taken client starts fresh).
  if (state.backlog) delete state.backlog[client.id];
  const to = neediestClient(state);
  for (const [personId, a] of Object.entries(state.assignment)) {
    if (a.kind !== 'phone' || a.clientId !== client.id) continue;
    if (to) state.assignment[personId] = { kind: 'phone', clientId: to };
    else delete state.assignment[personId];
  }
}

function runChurn(state) {
  state.churn ??= [];
  const kept = [];
  for (const entry of state.churn) {
    const client = state.clients.find((c) => c.id === entry.clientId);
    if (!client?.active || client.satisfaction > CHURN_RECOVER_ABOVE) continue;
    // Only the client's own open days count (a weekend client's Sat/Sun); weekday
    // clients open every weekday, so for them nothing changes.
    const def = CLIENTS.find((d) => d.id === client.id);
    if (def && !def.hours.days.includes(dateOf(state.day).weekday)) {
      kept.push(entry);
      continue;
    }
    entry.workdaysLeft -= 1;
    if (entry.workdaysLeft <= 0) loseClient(state, client);
    else kept.push(entry);
  }
  state.churn = kept;
  for (const c of activeClients(state)) {
    if (c.satisfaction > CHURN_AT || state.churn.some((e) => e.clientId === c.id)) continue;
    state.churn.push({ clientId: c.id, workdaysLeft: CHURN_WORKDAYS });
    pushEvent(state, { id: 'churn-warning', clientId: c.id, data: { days: CHURN_WORKDAYS } });
  }
  if (activeClients(state).length === 0) endGame(state, 'game-over-clients');
}

function runOffers(state, grade) {
  state.offerStreak = grade === 'S' || grade === 'A' ? (state.offerStreak ?? 0) + 1 : 0;
  if (state.offerStreak < OFFER_STREAK) return;
  state.offered ??= [];
  const level = officeLevel(state);
  const eligible = (d) => {
    if (d.start || (d.requiresOfficeLevel ?? 0) > level) return false;
    if (d.requiresResearch && !state.research?.done?.includes(d.requiresResearch)) return false;
    const client = state.clients.find((c) => c.id === d.id);
    if (client?.active) return false;
    const record = state.offered.find((o) => o.id === d.id);
    if (!record) return true;
    // 90 days after the offer, or after the client was lost, whichever is later.
    return state.day - Math.max(record.day, client?.lostDay ?? record.day) >= REOFFER_DAYS;
  };
  // Never-offered clients first; a cooled-down re-offer only when nothing new is eligible.
  const def = CLIENTS.find((d) => eligible(d) && !state.offered.some((o) => o.id === d.id)) ?? CLIENTS.find(eligible);
  if (!def) return;
  const record = state.offered.find((o) => o.id === def.id);
  if (record) record.day = state.day;
  else state.offered.push({ id: def.id, day: state.day });
  state.offerStreak = 0;
  // data only where it differs from v1.1 (keeps weekday-only games byte-identical): the office level
  // picks the offer text, `again` marks a re-offer.
  const data = {};
  if (level > 0) data.officeLevel = level;
  if (record) data.again = true;
  pushEvent(state, { id: 'client-offer', clientId: def.id, deadlineDay: state.day + OFFER_DEADLINE_DAYS, ...(Object.keys(data).length ? { data } : {}) });
}

// Once per workday, after endOfDay.
export function dailyEconomy(state) {
  if (state.gameOver) return;
  runChurn(state);
  if (state.gameOver) return;
  const grade = reputation(state);
  state.rankSStreak = grade === 'S' ? (state.rankSStreak ?? 0) + 1 : 0;
  if (state.rankSStreak >= RANK_S_WORKDAYS) milestone(state, 'milestone-rank-s');
  checkBigClient(state);
  runOffers(state, grade);
}

// 'client-offer' accept: the client joins (or returns) at satisfaction 70.
// Seats stay 8: the player splits the agents among the clients.
export function acceptClient(state, clientId) {
  const existing = state.clients.find((c) => c.id === clientId);
  if (existing) {
    Object.assign(existing, { satisfaction: NEW_CLIENT_SATISFACTION, active: true });
    delete existing.lostDay;
  }
  else state.clients.push({ id: clientId, satisfaction: NEW_CLIENT_SATISFACTION, active: true });
  checkBigClient(state);
}
