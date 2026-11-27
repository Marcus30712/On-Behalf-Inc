import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAP, isWalkable, tileAt } from '../render/map.js';
import { findPath } from '../render/path.js';
import { SPRITES } from '../render/sprites.js';

const s = MAP.spots;
const allSpots = () => [
  ...s.seats, s.leadDesk, s.qaDesk, ...s.breakRoom, ...s.taskTable, s.clinic, s.door,
];

test('map is 20x12 and every row has the right width', () => {
  assert.equal(MAP.width, 20);
  assert.equal(MAP.height, 12);
  assert.equal(MAP.tiles.length, 12);
  for (const row of MAP.tiles) assert.equal(row.length, 20);
  assert.equal(s.seats.length, 16);
  assert.equal(s.breakRoom.length, 4);
  assert.equal(s.taskTable.length, 3);
});

test('every spot is a walkable tile', () => {
  for (const [x, y] of allSpots()) assert.ok(isWalkable(MAP, x, y), `${x},${y} ${tileAt(MAP, x, y)}`);
  assert.equal(tileAt(MAP, ...s.door), 'E');
});

test('every spot is reachable from the door and from every seat', () => {
  for (const to of allSpots()) {
    assert.ok(findPath(MAP, s.door, to), `door -> ${to}`);
    for (const from of s.seats) assert.ok(findPath(MAP, from, to), `${from} -> ${to}`);
  }
});

test('no two spots share a tile', () => {
  const keys = allSpots().map((p) => p.join(','));
  assert.equal(new Set(keys).size, keys.length);
});

test('paths avoid walls and furniture, and move in four directions', () => {
  const path = findPath(MAP, s.door, s.seats[7]);
  assert.deepEqual(path[0], [...s.door]);
  assert.deepEqual(path.at(-1), [...s.seats[7]]);
  for (let i = 0; i < path.length; i++) {
    assert.ok(isWalkable(MAP, ...path[i]));
    if (i > 0) assert.equal(Math.abs(path[i][0] - path[i - 1][0]) + Math.abs(path[i][1] - path[i - 1][1]), 1);
  }
  assert.equal(findPath(MAP, s.door, [3, 3]), null); // a desk
  assert.deepEqual(findPath(MAP, s.door, s.door), [[...s.door]]);
});

test('two expansion areas of four seats each, after the eight original seats', () => {
  assert.equal(MAP.expansions.length, 2);
  assert.deepEqual(MAP.expansions.map((e) => e.level), [1, 2]);
  assert.deepEqual(MAP.expansions[0].seats, [8, 9, 10, 11]);
  assert.deepEqual(MAP.expansions[1].seats, [12, 13, 14, 15]);
  const original = new Set(s.seats.slice(0, 8).map((p) => p.join(',')));
  for (const e of MAP.expansions) {
    const area = new Set(e.tiles.map((t) => t.join(',')));
    for (const i of e.seats) {
      const [x, y] = s.seats[i];
      assert.equal(tileAt(MAP, x, y), 'C', `seat ${i}`);
      assert.ok(area.has(`${x},${y}`), `seat ${i} inside its area`);
      assert.ok(tileAt(MAP, x, y - 1) === 'D' || tileAt(MAP, x, y + 1) === 'D', `seat ${i} faces a desk`);
      assert.ok(!original.has(`${x},${y}`));
    }
    assert.ok(e.tiles.some(([x, y]) => tileAt(MAP, x, y) === 'D'), 'area has desks');
    // an area holds only its own desks and chairs and plain floor
    for (const [x, y] of e.tiles) assert.ok('.CD'.includes(tileAt(MAP, x, y)), `${x},${y}`);
  }
  const a = new Set(MAP.expansions[0].tiles.map((t) => t.join(',')));
  assert.ok(MAP.expansions[1].tiles.every((t) => !a.has(t.join(','))), 'areas do not overlap');
});

test('all 16 seats are reachable from the door', () => {
  for (const seat of s.seats) assert.ok(findPath(MAP, s.door, seat), `door -> ${seat}`);
});

// ---- v1.5 pin: props must not change the map ---------------------------------
// Taken from the map before any prop existed (v1.5 Task 4): which cells can be
// walked on, every spot (seats, lead and QA desks, break room, task table,
// clinic, door) and the expansion areas stay exactly as they were.

// v2.0: one deliberate change, the pantry counter at (12,10)-(13,10).
const WALKABLE_PIN = [
  '00000000000000000000',
  '00111111111111111100',
  '01111111111111111110',
  '01100000000110110110',
  '01100000000111111110',
  '01111111111111111110',
  '01111111111110000110',
  '01111111111110000010',
  '01100010000111111110',
  '01111110000111111110',
  '00111111111100000100', // v2.0: the pantry counter (12,10)-(13,10) beside the sofa
  '00000000001000000000',
];
const SPOTS_PIN = '{"seats":[[3,2],[5,2],[7,2],[9,2],[3,5],[5,5],[7,5],[9,5],[13,5],[15,5],[13,8],[15,8],[7,7],[9,7],[7,10],[9,10]],"leadDesk":[13,2],"qaDesk":[16,2],"breakRoom":[[14,9],[15,9],[16,9],[17,10]],"taskTable":[[3,7],[4,7],[5,7]],"clinic":[2,10],"door":[10,11]}';
const EXPANSIONS_PIN = '[{"level":1,"seats":[8,9,10,11],"tiles":[[13,5],[14,5],[15,5],[16,5],[13,6],[14,6],[15,6],[16,6],[13,7],[14,7],[15,7],[16,7],[13,8],[14,8],[15,8],[16,8]]},{"level":2,"seats":[12,13,14,15],"tiles":[[7,7],[8,7],[9,7],[10,7],[7,8],[8,8],[9,8],[10,8],[7,9],[8,9],[9,9],[10,9],[7,10],[8,10],[9,10],[10,10]]}]';

test('pin: walkable cells, spots, seats, desks and expansions are as before props', () => {
  const rows = [];
  for (let y = 0; y < MAP.height; y++) {
    let r = '';
    for (let x = 0; x < MAP.width; x++) r += isWalkable(MAP, x, y) ? '1' : '0';
    rows.push(r);
  }
  assert.deepEqual(rows, WALKABLE_PIN);
  assert.equal(JSON.stringify(MAP.spots), SPOTS_PIN);
  assert.equal(JSON.stringify(MAP.expansions), EXPANSIONS_PIN);
  assert.equal(MAP.width, 20);
  assert.equal(MAP.height, 12);
});

// ---- v1.5 office props --------------------------------------------------------
// MAP.props: [{ id, x, y }]. id names an office sprite; (x, y) is the left cell
// of the row the prop stands on (its footprint, w/16 cells wide). A prop taller
// than 16 pixels also covers the cells above its footprint on screen.

const PROP_IDS = ['cooler', 'pantryCounter', 'whiteboard', 'corkboard', 'clock', 'divider', 'bin', 'plantTall', 'plantBush'];
const WALL_HUNG = ['whiteboard', 'corkboard', 'clock'];

const footprint = (p) => Array.from({ length: SPRITES[p.id].w / 16 }, (_, i) => [p.x + i, p.y]);
const coveredAbove = (p) => {
  const cells = [];
  for (let up = 1; up < Math.ceil(SPRITES[p.id].h / 16); up++) for (const [x] of footprint(p)) cells.push([x, p.y - up]);
  return cells;
};
const spotKeys = () => new Set(allSpots().map((t) => t.join(',')));
const expansionKeys = () => new Set(MAP.expansions.flatMap((e) => e.tiles.map((t) => t.join(','))));

test('MAP.props is a frozen list of { id, x, y } naming the prop sprites, each kind placed', () => {
  assert.ok(Array.isArray(MAP.props) && Object.isFrozen(MAP.props));
  for (const p of MAP.props) {
    assert.ok(Object.isFrozen(p), JSON.stringify(p));
    assert.deepEqual(Object.keys(p).sort(), ['id', 'x', 'y']);
    assert.ok(PROP_IDS.includes(p.id), p.id);
    assert.ok(Number.isInteger(p.x) && Number.isInteger(p.y));
  }
  for (const id of PROP_IDS) assert.ok(MAP.props.some((p) => p.id === id), `${id} is placed`);
});

test('every prop cell is a wall-row cell or non-walkable furniture, never a spot, door or expansion cell', () => {
  const spots = spotKeys();
  const expansion = expansionKeys();
  const used = new Set();
  for (const p of MAP.props) {
    const label = `${p.id}@${p.x},${p.y}`;
    for (const [x, y] of footprint(p)) {
      const k = `${x},${y}`;
      const t = tileAt(MAP, x, y);
      assert.ok(x >= 0 && x < MAP.width && y >= 0 && y < MAP.height, `${label}: on the map`);
      assert.ok(!isWalkable(MAP, x, y), `${label}: ${k} is walkable`);
      assert.ok(t !== '#' || y === 0, `${label}: ${k} only the back wall row holds props`);
      assert.ok(!spots.has(k), `${label}: ${k} is a spot`);
      assert.ok(!expansion.has(k), `${label}: ${k} is an expansion cell`);
      assert.ok(!'EKSTB'.includes(t), `${label}: ${k} is the door or a facility (${t})`);
      assert.ok(t !== 'D' || p.id === 'divider', `${label}: ${k} only dividers sit on desks`);
      assert.ok(!used.has(k), `${label}: ${k} already holds a prop`);
      used.add(k);
    }
    if (WALL_HUNG.includes(p.id)) assert.equal(p.y, 0, `${label}: hangs on the back wall`);
  }
});

test('a tall prop only covers cells nobody stands on: wall or furniture, on the canvas, outside expansions', () => {
  const expansion = expansionKeys();
  for (const p of MAP.props) {
    for (const [x, y] of coveredAbove(p)) {
      const label = `${p.id}@${p.x},${p.y} covers ${x},${y}`;
      assert.ok(y >= 0, `${label}: above the canvas`);
      assert.ok(!isWalkable(MAP, x, y), `${label}: a person there would be drawn over the prop`);
      assert.ok(!expansion.has(`${x},${y}`), `${label}: expansion cell`);
    }
  }
});

test('dividers stand on the original desk bank between facing desks', () => {
  const dividers = MAP.props.filter((p) => p.id === 'divider');
  assert.ok(dividers.length >= 2);
  for (const p of dividers) {
    for (const [x, y] of footprint(p)) {
      assert.equal(tileAt(MAP, x, y), 'D', `divider ${x},${y}`);
      // a facing pair: desks above and below the divider's line
      const pair = [y - 1, y, y + 1].filter((r) => tileAt(MAP, x, r) === 'D');
      assert.ok(pair.length >= 2, `divider ${x},${y} between facing desks`);
    }
  }
});

// ---- v2.0 the pantry beside the sofa -------------------------------------------

test('v2.0 the pantry counter stands on the floor just left of the sofa', () => {
  const counter = MAP.props.find((p) => p.id === 'pantryCounter');
  assert.deepEqual([counter.x, counter.y], [12, 10]);
  assert.equal(tileAt(MAP, 12, 10), 'N');
  assert.equal(tileAt(MAP, 13, 10), 'N');
  assert.equal(tileAt(MAP, 14, 10), 'S', 'the sofa starts right after it');
  assert.ok(!MAP.props.some((p) => p.id === 'pantryCounter' && p.y === 0), 'no longer on the back wall');
});

test('v2.0 every spot is still reachable from the door', () => {
  for (const spot of allSpots()) assert.ok(findPath(MAP, MAP.spots.door, spot), `door -> ${spot}`);
});
