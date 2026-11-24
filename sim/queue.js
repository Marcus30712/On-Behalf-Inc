// One 30-minute interval of a contact-center queue: Erlang C for service
// level, average wait and occupancy, Erlang A for abandoned calls.
import { trafficIntensity, serviceLevel, occupancy, averageWait } from './erlang.js';

const INTERVAL_MIN = 30;
// Overloaded queue: the wait reported for a fully backed-up queue.
const OVERLOAD_WAIT_SEC = 900;

const finite = (x, fallback = 0) => (Number.isFinite(x) ? x : fallback);
const clamp01 = (x) => Math.min(1, Math.max(0, finite(x)));

// Abandonment model: Erlang A (M/M/n+M), the queue where waiting callers hang
// up after an exponentially distributed patience (mean = patienceSec). The
// steady-state chance of each number of callers in the system comes from a
// birth-death chain (arrivals lambda; departures min(k, n) / aht served plus
// max(0, k - n) / patience hanging up), and the abandon share is the hang-up
// rate over the arrival rate. Unlike Erlang C it is defined when the agents
// are too few, falls with every added agent (deep overload included), rises
// as patience shortens, and never lets handled calls exceed capacity.
// Patience 0 is the loss system (Erlang B): anyone who would wait hangs up.
// Service level is Erlang C's while it is defined.
const TAIL_EPS = 1e-12;

function abandonShare(seats, lambda, ahtMin, patienceSec) {
  const mu = 1 / ahtMin;
  let term = 1;
  if (!(patienceSec > 0)) {
    // Erlang B: the share of callers who find every agent busy.
    let total = 1;
    for (let k = 1; k <= seats; k += 1) {
      term *= lambda / (k * mu);
      total += term;
      if (total > 1e250) { term /= total; total = 1; }
    }
    return term / total;
  }
  const theta = 60 / patienceSec;
  let total = 1;
  let abandonRate = 0;
  for (let k = 1; ; k += 1) {
    const out = Math.min(k, seats) * mu + (k > seats ? (k - seats) * theta : 0);
    term *= lambda / out;
    if (!(term > 0)) break;
    total += term;
    if (k > seats) abandonRate += term * (k - seats) * theta;
    if (total > 1e250) { term /= total; abandonRate /= total; total = 1; }
    if (k > seats && term < TAIL_EPS * total) break;
  }
  return abandonRate / total / lambda;
}

// Agents may be fractional (breaks, part shifts, reduced hours): the result
// is the blend of the whole numbers either side, weighted by the fraction.
export function intervalQueue({ calls, ahtMin, agents, targetSec, patienceSec }) {
  const offered = Math.max(0, Math.round(finite(calls)));
  const raw = Math.max(0, finite(agents));
  const aht = Math.max(0, finite(ahtMin));
  const patience = Math.max(0, finite(patienceSec));
  const target = finite(targetSec);
  if (offered === 0) {
    return { offered: 0, handled: 0, abandoned: 0, serviceLevel: 1, asaSec: 0, occupancy: 0 };
  }
  const seats = Math.floor(raw);
  const frac = raw - seats;
  const lo = wholeQueue(offered, seats, aht, target, patience);
  if (frac < 1e-9) return lo;
  const hi = wholeQueue(offered, seats + 1, aht, target, patience);
  const mix = (key) => lo[key] + frac * (hi[key] - lo[key]);
  const abandoned = Math.round(mix('abandoned'));
  return {
    offered,
    handled: offered - abandoned,
    abandoned,
    serviceLevel: mix('serviceLevel'),
    asaSec: mix('asaSec'),
    occupancy: mix('occupancy'),
  };
}

// The queue with a whole number of agents.
function wholeQueue(offered, seats, aht, targetSec, patience) {
  const intensity = trafficIntensity(offered, aht, INTERVAL_MIN);

  if (seats > intensity) {
    // No work per call: anyone seated answers instantly.
    if (!(intensity > 0)) {
      return { offered, handled: offered, abandoned: 0, serviceLevel: 1, asaSec: 0, occupancy: 0 };
    }
    const share = clamp01(abandonShare(seats, offered / INTERVAL_MIN, aht, patience));
    const abandoned = Math.min(offered, Math.round(offered * share));
    return {
      offered,
      handled: offered - abandoned,
      abandoned,
      serviceLevel: clamp01(serviceLevel(seats, intensity, aht, targetSec / 60)),
      asaSec: Math.max(0, finite(averageWait(seats, intensity, aht) * 60)),
      occupancy: clamp01(occupancy(seats, intensity)),
    };
  }

  // Overloaded (seats <= intensity; Erlang C is undefined here).
  const capacity = Math.min(offered, Math.round((seats * INTERVAL_MIN) / aht) || 0);
  // Erlang A keeps handled calls under capacity; the max guards rounding.
  const share = seats === 0 ? 1 : clamp01(abandonShare(seats, offered / INTERVAL_MIN, aht, patience));
  const abandoned = Math.min(offered, Math.max(offered - capacity, Math.round(offered * share)));
  return {
    offered,
    handled: offered - abandoned,
    abandoned,
    serviceLevel: clamp01((0.2 * capacity) / offered),
    asaSec: seats === 0 ? 0 : Math.round(OVERLOAD_WAIT_SEC * (abandoned / offered)),
    occupancy: seats === 0 ? 0 : 1,
  };
}
