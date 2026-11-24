// Money, reputation, churn, client offers, milestones and game over. Pure rules, no DOM.
//
// state.cash; state.churn = [{ clientId, workdaysLeft }]; state.offerStreak (workdays at A+);
// state.offered = [clientId]; state.milestones = [eventId]; state.gameOver = { kind, day } | undefined.
// The game calls dailyEconomy after endOfDay on workdays, and monthEnd after
// endOfDay on the last day of each 30-day month.
import { DAYS_PER_MONTH } from './calendar.js';
import { pushEvent } from './events.js';
import { CLIENTS } from '../world/clients.js';

// Placeholder monthly salaries.
export const SALARY = { agent: 2400, lead: 3600, qa: 3000 };

const MET_DAY = 0.8; // share of a day's intervals at target for the day to count as met
const FEE_CUT_BELOW = 0.8; // share of met workdays in the month
const FEE_CUT = 0.8;
const RECENT_WORKDAYS = 20;
const GRADES = [['S', 90], ['A', 75], ['B', 60], ['C', 40]];
const CHURN_AT = 20;
const CHURN_RECOVER_ABOVE = 40;
const CHURN_WORKDAYS = 20;
const OFFER_STREAK = 20;
const OFFER_DEADLINE_DAYS = 7;
const NEW_CLIENT_SATISFACTION = 70;
const BIG_CLIENT_COUNT = 3;

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
//       + 0.4 x average satisfaction (active clients) - reputationPenalty.
// With no recorded workday yet the met-rate counts as 1.
export function reputationScore(state) {
  const active = activeClients(state);
  const rates = active.flatMap((c) => dailyMetRates(state, c.id));
  const met = rates.length === 0 ? 1 : rates.reduce((s, r) => s + r, 0) / rates.length;
  const sat = active.length === 0 ? 0 : active.reduce((s, c) => s + c.satisfaction, 0) / active.length;
  return 60 * met + 0.4 * sat - (state.reputationPenalty ?? 0);
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
  state.cash = (state.cash ?? 0) + income - salaries;
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
  const def = CLIENTS.find((d) => !d.start && !state.offered.includes(d.id)
    && !state.clients.some((c) => c.id === d.id && c.active));
  if (!def) return;
  state.offered.push(def.id);
  state.offerStreak = 0;
  pushEvent(state, { id: 'client-offer', clientId: def.id, deadlineDay: state.day + OFFER_DEADLINE_DAYS });
}

// Once per workday, after endOfDay.
export function dailyEconomy(state) {
  if (state.gameOver) return;
  runChurn(state);
  if (state.gameOver) return;
  const grade = reputation(state);
  if (grade === 'S') milestone(state, 'milestone-rank-s');
  checkBigClient(state);
  runOffers(state, grade);
}

// 'client-offer' accept: the client joins (or returns) at satisfaction 70.
// Seats stay 8: the player splits the agents among the clients.
export function acceptClient(state, clientId) {
  const existing = state.clients.find((c) => c.id === clientId);
  if (existing) Object.assign(existing, { satisfaction: NEW_CLIENT_SATISFACTION, active: true });
  else state.clients.push({ id: clientId, satisfaction: NEW_CLIENT_SATISFACTION, active: true });
  checkBigClient(state);
}
