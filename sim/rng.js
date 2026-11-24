// Seeded RNG (mulberry32). All game randomness goes through this module.

function make(initial) {
  let s = initial >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    pick(array) {
      return array[Math.floor(next() * array.length)];
    },
    chance(p) {
      return next() < p;
    },
    state() {
      return s;
    },
  };
}

export function createRng(seed) {
  return make(seed);
}

export function restoreRng(state) {
  return make(state);
}
