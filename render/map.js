// Office tile map: 20x12 tiles (16px each), seen from above. Pure data.
//
// Legend
//   #  wall (blocked)
//   .  floor (walkable)
//   D  desk (blocked)
//   C  chair / seat (walkable destination)
//   S  sofa (blocked)
//   K  coffee machine (blocked)
//   T  task table (blocked)
//   B  clinic bed (blocked)
//   P  plant (blocked)
//   E  door in the outer wall (walkable)
//
// Spots are walkable tiles: seats and desk chairs are 'C'; break-room, task
// table and clinic spots are floor tiles next to their furniture.

const ROWS = [
  '####################',
  '#P................P#',
  '#..C.C.C.C...C..C..#',
  '#..DDDDDDDD..D..D..#',
  '#..DDDDDDDD........#',
  '#..C.C.C.C.........#',
  '#..................#',
  '#................P.#',
  '#..TTT.............#',
  '#..................#',
  '#B............SSS.K#',
  '##########E#########',
];

export const MAP = Object.freeze({
  width: 20,
  height: 12,
  tiles: Object.freeze(ROWS),
  spots: Object.freeze({
    seats: Object.freeze([[3, 2], [5, 2], [7, 2], [9, 2], [3, 5], [5, 5], [7, 5], [9, 5]]),
    leadDesk: Object.freeze([13, 2]),
    qaDesk: Object.freeze([16, 2]),
    breakRoom: Object.freeze([[14, 9], [15, 9], [16, 9], [17, 10]]),
    taskTable: Object.freeze([[3, 7], [4, 7], [5, 7]]),
    clinic: Object.freeze([2, 10]),
    door: Object.freeze([10, 11]),
  }),
});

export function tileAt(map, x, y) {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return '#';
  return map.tiles[y][x];
}

export function isWalkable(map, x, y) {
  const t = tileAt(map, x, y);
  return t === '.' || t === 'C' || t === 'E';
}
