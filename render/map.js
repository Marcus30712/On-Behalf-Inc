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
//   N  pantry counter (blocked; v2.0, drawn as the pantryCounter prop)
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
  '#..C.C.C.C...C.C...#',
  '#............DDDD..#',
  '#......C.C...DDDDP.#',
  '#..TTT.DDDD..C.C...#',
  '#......DDDD........#',
  '#B.....C.C..NNSSS.K#',
  '##########E#########',
];

// Expansion areas, opened by office level (sim/office.js): level 1 adds the
// window bank (seats 8-11), level 2 the inner bank (seats 12-15). `tiles` is
// the area's rectangle. Before its level is built an area draws as plain
// floor, but its desks still block walking, so routes are the same at every
// level (people walk around the empty rug until it is furnished).
const area = (x0, y0, w, h) => {
  const tiles = [];
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) tiles.push(Object.freeze([x, y]));
  return Object.freeze(tiles);
};

// Office props (v1.5), drawn with the office: { id, x, y } names a sprite and
// the left cell of the row it stands on (render/sprites.js). Props never
// change walking: wall pieces sit on the back wall row, floor pieces only on
// cells nobody walks on (plant corners, desk tops), never on a spot, the door,
// a facility or an expansion area. A prop taller than its cell reaches up over
// a wall or desk cell, so no person stands behind it.
const prop = (id, x, y) => Object.freeze({ id, x, y });
const PROPS = Object.freeze([
  // back wall, left to right
  prop('bin', 3, 0), prop('whiteboard', 4, 0), prop('clock', 8, 0), prop('corkboard', 9, 0),
  prop('bin', 14, 0),
  // plant corners and the water cooler in the back corner
  prop('plantTall', 1, 1), prop('cooler', 18, 1), prop('plantBush', 17, 7),
  // v2.0: the pantry counter beside the sofa (was on the back wall at 15,0)
  prop('pantryCounter', 12, 10),
  // cubicle dividers between the facing desks of the original bank
  prop('divider', 3, 3), prop('divider', 5, 3), prop('divider', 7, 3), prop('divider', 9, 3),
]);

export const MAP = Object.freeze({
  width: 20,
  height: 12,
  tiles: Object.freeze(ROWS),
  spots: Object.freeze({
    seats: Object.freeze([
      [3, 2], [5, 2], [7, 2], [9, 2], [3, 5], [5, 5], [7, 5], [9, 5],
      [13, 5], [15, 5], [13, 8], [15, 8], // expansion 1 (window bank)
      [7, 7], [9, 7], [7, 10], [9, 10], // expansion 2 (inner bank)
    ].map((t) => Object.freeze(t))),
    leadDesk: Object.freeze([13, 2]),
    qaDesk: Object.freeze([16, 2]),
    breakRoom: Object.freeze([[14, 9], [15, 9], [16, 9], [17, 10]]),
    taskTable: Object.freeze([[3, 7], [4, 7], [5, 7]]),
    clinic: Object.freeze([2, 10]),
    door: Object.freeze([10, 11]),
  }),
  expansions: Object.freeze([
    Object.freeze({ level: 1, seats: Object.freeze([8, 9, 10, 11]), tiles: area(13, 5, 4, 4) }),
    Object.freeze({ level: 2, seats: Object.freeze([12, 13, 14, 15]), tiles: area(7, 7, 4, 4) }),
  ]),
  props: PROPS,
});

// Seats open at level 0: every seat outside the expansion areas.
export function baseSeats(map) {
  const extra = (map.expansions ?? []).reduce((n, e) => n + e.seats.length, 0);
  return map.spots.seats.length - extra;
}

export function tileAt(map, x, y) {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return '#';
  return map.tiles[y][x];
}

export function isWalkable(map, x, y) {
  const t = tileAt(map, x, y);
  return t === '.' || t === 'C' || t === 'E';
}
