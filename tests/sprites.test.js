import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPRITES, PALETTES, TILE_SPRITES, personPalette } from '../render/sprites.js';
import { MAP } from '../render/map.js';
import { createDrawer, TILE_PX } from '../render/draw.js';

const paletteFor = (name) => (name === 'person' ? personPalette({ id: 'p0' }) : PALETTES[name]);

test('every sprite row has the declared width and only palette characters', () => {
  const names = Object.keys(SPRITES);
  assert.ok(names.length > 20, 'expected the full sprite set');
  for (const name of names) {
    const s = SPRITES[name];
    const palette = paletteFor(s.palette);
    assert.ok(palette, `${name}: unknown palette ${s.palette}`);
    assert.equal(s.rows.length, s.h, `${name}: height`);
    s.rows.forEach((row, y) => {
      assert.equal(row.length, s.w, `${name} row ${y}: width`);
      for (const ch of row) {
        assert.ok(ch === '.' || Object.hasOwn(palette, ch), `${name} row ${y}: '${ch}' not in palette ${s.palette}`);
      }
    });
  }
});

test('person palettes differ between people and do not depend on nation', () => {
  const ids = Array.from({ length: 12 }, (_, i) => `p${i}`);
  const seen = new Set(ids.map((id) => JSON.stringify(personPalette({ id, nation: 'veltora' }))));
  assert.equal(seen.size, ids.length);
  assert.deepEqual(personPalette({ id: 'p3', nation: 'veltora' }), personPalette({ id: 'p3', nation: 'veltora' }));
  assert.deepEqual(personPalette({ id: 'p3', nation: 'veltora' }), personPalette({ id: 'p3', nation: 'kamuen' }));
  assert.deepEqual(personPalette({ id: 'p3' }), personPalette({ id: 'p3', nation: 'kamuen' }));
});

test('all map tile characters have a sprite', () => {
  const chars = new Set(MAP.tiles.join(''));
  for (const ch of chars) {
    const name = TILE_SPRITES[ch];
    assert.ok(name, `no sprite for tile '${ch}'`);
    assert.ok(SPRITES[name], `tile '${ch}' names missing sprite ${name}`);
  }
});

// ---- office drawing by level (fake canvases record what is painted) ---------

function fakeCanvas(w, h) {
  const ops = [];
  const ctx = {
    fillStyle: '', imageSmoothingEnabled: true,
    fillRect: (...a) => ops.push(['fillRect', ...a]),
    drawImage: (img, ...a) => ops.push(['drawImage', img, ...a]),
  };
  return { width: w, height: h, ops, getContext: () => ctx };
}

// Paints the office and returns 'x,y' -> sprite names drawn on that tile.
function paintedTiles(drawer, office) {
  const screen = fakeCanvas(960, 576);
  if (office === undefined) drawer.drawOffice(screen.getContext(), MAP, null);
  else drawer.drawOffice(screen.getContext(), MAP, null, office);
  const officeCanvas = screen.ops.at(-1)[1];
  const nameOf = new Map(Object.keys(SPRITES).filter((n) => SPRITES[n].palette === 'office')
    .map((n) => [drawer.spriteCanvas(n), n]));
  const tiles = new Map();
  for (const op of officeCanvas.ops) {
    if (op[0] !== 'drawImage' || !nameOf.has(op[1])) continue;
    const k = `${Math.floor(op[2] / TILE_PX)},${Math.floor(op[3] / TILE_PX)}`;
    tiles.set(k, [...(tiles.get(k) ?? []), nameOf.get(op[1])]);
  }
  return tiles;
}

const FURNITURE = ['desk', 'chair', 'chairBack', 'monitorFront', 'monitorBack', 'papers'];
const areaShows = (tiles, area, names) => area.tiles.some(([x, y]) => (tiles.get(`${x},${y}`) ?? []).some((n) => names.includes(n)));
const deskTiles = (area) => area.tiles.filter(([x, y]) => MAP.tiles[y][x] === 'D');

test('expansion areas draw by office level: empty, under construction, furnished', () => {
  const [one, two] = MAP.expansions;
  const drawer = createDrawer(fakeCanvas);
  const check = (office, want) => {
    const tiles = paintedTiles(drawer, office);
    const label = JSON.stringify(office);
    assert.ok((tiles.get('3,3') ?? []).includes('desk'), `${label}: original bank always furnished`);
    for (const [area, state] of [[one, want[0]], [two, want[1]]]) {
      assert.equal(areaShows(tiles, area, FURNITURE), state === 'built', `${label} level ${area.level} furniture`);
      const cones = deskTiles(area).every(([x, y]) => (tiles.get(`${x},${y}`) ?? []).includes('construction'));
      assert.equal(cones, state === 'building', `${label} level ${area.level} construction`);
      assert.equal(areaShows(tiles, area, ['construction']), state === 'building');
      for (const [x, y] of area.tiles) assert.ok((tiles.get(`${x},${y}`) ?? []).includes('floor'));
    }
  };
  check(undefined, ['empty', 'empty']);
  check({ level: 0, build: null }, ['empty', 'empty']);
  check({ level: 0, build: { level: 1, workdaysLeft: 4 } }, ['building', 'empty']);
  check({ level: 1, build: null }, ['built', 'empty']);
  check({ level: 1, build: { level: 2, workdaysLeft: 9 } }, ['built', 'building']);
  check({ level: 2, build: null }, ['built', 'built']);
  check({ level: 0, build: null }, ['empty', 'empty']); // the cache follows the level back down
});
