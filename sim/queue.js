// One 30-minute interval of a contact-center queue: Erlang C for service
// level, average wait and occupancy, plus a simple abandonment estimate.
import { trafficIntensity, waitingProbability, serviceLevel, occupancy, averageWait } from './erlang.js';

const INTERVAL_MIN = 30;
// Overloaded queue: the wait reported for a fully backed-up queue.
const OVERLOAD_WAIT_SEC = 900;

const finite = (x, fallback = 0) => (Number.isFinite(x) ? x : fallback);
const clamp01 = (x) => Math.min(1, Math.max(0, finite(x)));

// Abandonment model (an approximation, not exact queueing theory):
// - Enough agents: a caller abandons only if they have to wait AND the wait
//   outlasts their patience. In Erlang C a waiting caller's wait is
//   exponential with mean aht / (agents - intensity), so
//   abandon share = P(wait) * exp(-patience / mean wait). More patience,
//   fewer abandons. Erlang C's service level is reported unchanged. The gap
//   (agents - intensity) is never taken below MIN_GAP, so the wait stays
//   finite right at the edge.
// - Too few agents: the queue never drains. Abandon share is at least the
//   "edge" value (P(wait) = 1, gap = MIN_GAP), which is never below any
//   staffed value, and at least the calls that do not fit in the interval
//   (agents * 30 / aht). So adding an agent never raises abandons, and
//   handled calls never exceed capacity. With no agents, everyone abandons.
const MIN_GAP = 0.5;

function abandonShare(pWait, gap, ahtMin, patienceSec) {
  const meanWaitSec = (ahtMin / Math.max(gap, MIN_GAP)) * 60;
  return pWait * Math.exp(-patienceSec / meanWaitSec);
}

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
    // No work per call: anyone seated answers instantly.
    if (!(intensity > 0)) {
      return { offered, handled: offered, abandoned: 0, serviceLevel: 1, asaSec: 0, occupancy: 0 };
    }
    const pWait = clamp01(waitingProbability(seats, intensity));
    const share = clamp01(abandonShare(pWait, seats - intensity, aht, patience));
    const abandoned = Math.min(offered, Math.round(offered * share));
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
  const edge = Math.round(offered * clamp01(abandonShare(1, 0, aht, patience)));
  const abandoned = seats === 0 ? offered : Math.min(offered, Math.max(excess, edge));
  return {
    offered,
    handled: offered - abandoned,
    abandoned,
    serviceLevel: clamp01((0.2 * capacity) / offered),
    asaSec: seats === 0 ? 0 : Math.round(OVERLOAD_WAIT_SEC * (abandoned / offered)),
    occupancy: seats === 0 ? 0 : 1,
  };
}
