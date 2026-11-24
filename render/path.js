import { isWalkable } from './map.js';

const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

// 4-direction BFS. Returns the tiles from `from` to `to` inclusive, or null
// when either end is not walkable or no route exists.
export function findPath(map, from, to) {
  const [fx, fy] = from;
  const [tx, ty] = to;
  if (!isWalkable(map, fx, fy) || !isWalkable(map, tx, ty)) return null;
  const w = map.width;
  const prev = new Map([[fy * w + fx, -1]]);
  const queue = [[fx, fy]];
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i];
    if (x === tx && y === ty) {
      const path = [];
      for (let k = y * w + x; k !== -1; k = prev.get(k)) path.push([k % w, Math.floor(k / w)]);
      return path.reverse();
    }
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      const key = ny * w + nx;
      if (!isWalkable(map, nx, ny) || prev.has(key)) continue;
      prev.set(key, y * w + x);
      queue.push([nx, ny]);
    }
  }
  return null;
}

// Walkable tiles in order of walking distance from `from` (nearest first).
export function tilesByDistance(map, from) {
  const w = map.width;
  const seen = new Set([from[1] * w + from[0]]);
  const queue = [from];
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i];
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      const key = ny * w + nx;
      if (!isWalkable(map, nx, ny) || seen.has(key)) continue;
      seen.add(key);
      queue.push([nx, ny]);
    }
  }
  return queue;
}
