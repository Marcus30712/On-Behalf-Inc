import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAP, isWalkable, tileAt } from '../render/map.js';
import { findPath } from '../render/path.js';

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
