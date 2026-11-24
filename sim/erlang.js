// Erlang C (M/M/c) staffing maths. All times are in minutes.
//
// Ported from pyworkforce's ErlangC (pyworkforce/queuing/erlang.py, v0.5.4),
// MIT License, Copyright (c) 2021 Rodrigo Arenas —
// https://github.com/rodrigo-arenas/pyworkforce
// The tests compare these functions with numbers produced by pyworkforce.
//
// The model assumes contacts arrive at random, handle times vary around the
// average, and nobody hangs up while waiting.

// Traffic intensity in Erlangs: how many people the work would keep busy
// if it arrived perfectly evenly.
export function trafficIntensity(transactions, aht, interval = 30) {
  return (transactions / interval) * aht;
}

// Chance that a contact has to wait at all.
export function waitingProbability(positions, intensity) {
  if (!(positions > intensity)) {
    throw new RangeError('positions must be greater than traffic intensity');
  }
  let inverse = 1;
  for (let k = 1; k <= positions; k += 1) inverse = 1 + (inverse * k) / intensity;
  const erlangB = 1 / inverse;
  return (positions * erlangB) / (positions - intensity * (1 - erlangB));
}

// Share of contacts answered within `target` minutes.
export function serviceLevel(positions, intensity, aht, target) {
  const pw = waitingProbability(positions, intensity);
  return Math.max(0, 1 - pw * Math.exp(-(positions - intensity) * (target / aht)));
}

// Share of seated time spent handling contacts.
export function occupancy(positions, intensity) {
  if (!(positions > intensity)) {
    throw new RangeError('positions must be greater than traffic intensity');
  }
  return intensity / positions;
}

// Average wait before an answer, in minutes. Not in pyworkforce; this is the
// standard Erlang C result.
export function averageWait(positions, intensity, aht) {
  return (waitingProbability(positions, intensity) * aht) / (positions - intensity);
}

// Python's round(): ties go to the even number.
function roundHalfEven(x) {
  const floor = Math.floor(x);
  const diff = x - floor;
  if (diff < 0.5) return floor;
  if (diff > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}

// Fewest seated positions that reach the target service level (`raw`), and
// the headcount to roster once shrinkage is allowed for (`positions`).
export function requiredPositions(intensity, aht, target, { serviceLevel: goal = 0.8, shrinkage = 0 } = {}) {
  let raw = roundHalfEven(intensity + 1);
  while (!(raw > intensity) || serviceLevel(raw, intensity, aht, target) < goal) raw += 1;
  return { raw, positions: Math.ceil(raw / (1 - shrinkage)) };
}
