// One 30-minute interval of a contact-center queue: Erlang C for service
// level, average wait and occupancy, plus a simple abandonment estimate.
import { trafficIntensity, waitingProbability, serviceLevel, occupancy, averageWait } from './erlang.js';

const INTERVAL_MIN = 30;
// Overloaded queue: callers beyond capacity face a wait of roughly this long.
const OVERLOAD_WAIT_SEC = 900;

const finite = (x, fallback = 0) => (Number.isFinite(x) ? x : fallback);
const clamp01 = (x) => Math.min(1, Math.max(0, finite(x)));

// Abandonment model (an approximation, not exact queueing theory):
// - Enough agents: a caller abandons only if they have to wait AND the wait
//   outlasts their patience. In Erlang C a waiting caller's wait is
//   exponential with mean aht / (agents - intensity), so
//   P(abandon) = P(wait) * exp(-patience / mean wait). More patience, fewer
//   abandons. Erlang C's service level is reported unchanged.
// - Too few agents: only agents * 30 / aht calls fit in the interval. The
//   rest wait very long; most hang up, the share who stay falls as
//   patience rises (exp(-patience / 900s)). Those who stay are served late.
//   With no agents at all, everyone abandons.
export function intervalQueue({ calls, ahtMin, agents, targetSec, patienceSec }) {
  const offered = Math.max(0, Math.round(finite(calls)));
  const seats = Math.max(0, Math.floor(finite(agents)));
  const aht = Math.max(0, finite(ahtMin));
  const patience = Math.max(0, finite(patienceSec));
  if (offered === 0) {
    return { offered: 0, handled: 0, abandoned: 0, serviceLevel: 1, asaSec: 0, occupancy: 0 };
  }

  const intensity = trafficIntensity(offered, aht, INTERVAL_MIN);

  if (seats > intensity) {
    const pWait = intensity > 0 ? clamp01(waitingProbability(seats, intensity)) : 0;
    const meanWaitSec = intensity > 0 ? (aht / (seats - intensity)) * 60 : 0;
    const stay = meanWaitSec > 0 ? Math.exp(-patience / meanWaitSec) : 0;
    const abandoned = Math.min(offered, Math.round(offered * pWait * stay));
    return {
      offered,
      handled: offered - abandoned,
      abandoned,
      serviceLevel: clamp01(serviceLevel(seats, intensity, aht, finite(targetSec) / 60)),
      asaSec: Math.max(0, finite(averageWait(seats, intensity, aht) * 60)),
      occupancy: clamp01(occupancy(seats, intensity)),
    };
  }

  // Overloaded (seats <= intensity; Erlang C is undefined here).
  const capacity = Math.min(offered, Math.round((seats * INTERVAL_MIN) / aht) || 0);
  const excess = offered - capacity;
  const quit = seats === 0 ? 1 : Math.exp(-patience / OVERLOAD_WAIT_SEC);
  const abandoned = Math.min(offered, Math.round(excess * quit));
  return {
    offered,
    handled: offered - abandoned,
    abandoned,
    serviceLevel: clamp01((0.2 * capacity) / offered),
    asaSec: seats === 0 ? 0 : Math.round(OVERLOAD_WAIT_SEC * (excess / offered)),
    occupancy: seats === 0 ? 0 : 1,
  };
}
