// v1.3 email: a client's mail backlog. Pure rules, no DOM.
//
// state.backlog[clientId] = { openMin, items: [{ at, n }], carry, warnedAt? }
//   openMin  the client's own clock: minutes it has been open (only open
//            intervals advance it, so nights and weekends do not age mail);
//   items    waiting mail, oldest first: n mails that arrived at openMin `at`;
//   carry    the fraction of a mail's work left over from the last interval;
//   warnedAt openMin of the last backlog-warning (missing: never warned).
// Mail is answered oldest first. A mail is on time when answered within the
// client's slTarget.openMinutes of open time; an unanswered mail counts as
// missed once, in the interval its age passes that.
import { pushEvent } from './events.js';
import { dateOf } from './calendar.js';
import { CLIENTS } from '../world/clients.js';

const INTERVAL = 30;
const EPS = 1e-9;
// End of a workday with this many mails waiting: a warning, at most once per
// WARN_WORKDAYS of the client's open days (720 open minutes each).
export const BACKLOG_WARN = 120;
const WARN_WORKDAYS = 5;
const WORKDAY_OPEN_MIN = 720;

export function newBacklog() {
  return { openMin: 0, items: [], carry: 0 };
}

export function backlogCount(entry) {
  return (entry?.items ?? []).reduce((s, it) => s + it.n, 0);
}

// One open 30-minute interval of the client's mail; changes `entry`.
export function stepBacklog(entry, {
  arrivals, agents, ahtMin, targetMin,
}) {
  entry.openMin += INTERVAL;
  entry.items ??= [];
  if (arrivals > 0) entry.items.push({ at: entry.openMin, n: arrivals });

  const capacity = (agents > 0 && ahtMin > 0 ? (agents * INTERVAL) / ahtMin : 0) + (entry.carry ?? 0);
  const whole = Math.floor(capacity + EPS);
  entry.carry = Math.max(0, capacity - whole);
  let left = whole;
  let processed = 0;
  let onTime = 0;
  while (left > EPS && entry.items.length > 0) {
    const item = entry.items[0];
    const take = Math.min(item.n, left);
    processed += take;
    if (entry.openMin - item.at <= targetMin) onTime += take;
    item.n -= take;
    left -= take;
    if (item.n <= EPS) entry.items.shift();
  }

  // Waiting mail whose age passed the target in this interval.
  let overdue = 0;
  for (const item of entry.items) {
    const age = entry.openMin - item.at;
    if (age > targetMin && age - INTERVAL <= targetMin) overdue += item.n;
  }

  const offered = processed + overdue;
  return {
    offered,
    handled: processed,
    abandoned: 0,
    serviceLevel: offered > 0 ? onTime / offered : 1,
    asaSec: 0,
    occupancy: agents > 0 && ahtMin > 0 ? Math.min(1, (processed * ahtMin) / (agents * INTERVAL)) : 0,
    overdue,
  };
}

// End of day: a backlog-warning for each active client open today whose
// backlog is at BACKLOG_WARN or more, unless warned within the last
// WARN_WORKDAYS of its open days.
export function backlogWarnings(state) {
  const { weekday } = dateOf(state.day);
  for (const [clientId, entry] of Object.entries(state.backlog ?? {})) {
    const def = CLIENTS.find((d) => d.id === clientId);
    const active = state.clients.some((c) => c.id === clientId && c.active);
    if (!def || !active || !def.hours.days.includes(weekday)) continue;
    const n = backlogCount(entry);
    if (n < BACKLOG_WARN) continue;
    if (entry.warnedAt !== undefined && entry.openMin - entry.warnedAt < WARN_WORKDAYS * WORKDAY_OPEN_MIN) continue;
    entry.warnedAt = entry.openMin;
    pushEvent(state, { id: 'backlog-warning', clientId, data: { n: Math.round(n) } });
  }
}
