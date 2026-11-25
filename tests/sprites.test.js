import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SPRITES, PALETTES, TILE_SPRITES, PERSON_SPRITES, personPalette, personLook, personSprite,
} from '../render/sprites.js';
import { MAP } from '../render/map.js';
import { createDrawer, TILE_PX } from '../render/draw.js';

const paletteFor = (name) => (name === 'person' ? personPalette({ id: 'p0' }) : PALETTES[name]);

// Every sprite, with groups (SPRITES.person) flattened as 'person.stand'.
const allSprites = () => Object.entries(SPRITES).flatMap(([name, s]) => (s.rows ? [[name, s]]
  : Object.entries(s).map(([k, v]) => [`${name}.${k}`, v])));

test('every sprite row has the declared width and only palette characters', () => {
  const entries = allSprites();
  assert.ok(entries.length > 20, 'expected the full sprite set');
  for (const [name, s] of entries) {
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

// ---- people (16x24) ---------------------------------------------------------

const POSES = ['stand', 'walkA', 'walkB', 'sit', 'sitBack'];
const HAIRS = ['short', 'long', 'curly', 'tied'];
const ids = (prefix, n) => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);

function checkGrid(name, s, palette) {
  assert.equal(s.w, 16, `${name}: width`);
  assert.equal(s.h, 24, `${name}: height`);
  assert.equal(s.rows.length, 24, `${name}: rows`);
  s.rows.forEach((row, y) => {
    assert.equal(row.length, 16, `${name} row ${y}: width`);
    for (const ch of row) assert.ok(ch === '.' || Object.hasOwn(palette, ch), `${name} row ${y}: '${ch}'`);
  });
}

test('every person, Miso and overlay sprite is 16x24 with valid palette letters', () => {
  const palette = personLook({ id: 'p0' }).palette;
  for (const pose of POSES) checkGrid(`person.${pose}`, SPRITES.person[pose], palette);
  for (const hair of HAIRS) {
    for (const glasses of [false, true]) {
      for (const pose of POSES) {
        const s = personSprite(pose, { hair, glasses });
        assert.equal(s.palette, 'person');
        checkGrid(`${hair}${glasses ? '+glasses' : ''}.${pose}`, s, palette);
      }
    }
  }
  assert.equal(personSprite('stand', { hair: 'short', glasses: false }), SPRITES.person.stand);
  assert.ok(Object.keys(PERSON_SPRITES).length >= 8);
  checkGrid('miso', SPRITES.miso, PALETTES.miso);
  for (const name of ['headset', 'headsetBack', 'lanyard']) checkGrid(name, SPRITES[name], PALETTES.office);
});

test('hair styles and glasses change the head, not the body', () => {
  const stand = (hair, glasses = false) => personSprite('stand', { hair, glasses }).rows;
  const heads = new Set(HAIRS.map((hair) => stand(hair).slice(0, 12).join('|')));
  assert.equal(heads.size, 4, 'four different heads');
  assert.notDeepEqual(stand('short', true), stand('short', false));
  assert.deepEqual(stand('short').slice(16), stand('curly', true).slice(16), 'legs shared');
  // walking keeps the head still (no flicker between frames)
  const a = personSprite('walkA', { hair: 'long', glasses: true }).rows;
  const b = personSprite('walkB', { hair: 'long', glasses: true }).rows;
  assert.deepEqual(a.slice(0, 12), b.slice(0, 12));
  assert.notDeepEqual(a, b);
});

test('personLook is deterministic and ignores nation', () => {
  for (const id of ['p0', 'p7', 'h12', 'h199']) {
    const one = personLook({ id, nation: 'veltora' });
    assert.deepEqual(one, personLook({ id, nation: 'kamuen' }));
    assert.deepEqual(one, personLook({ id }));
    assert.ok(HAIRS.includes(one.hair));
    assert.equal(typeof one.glasses, 'boolean');
    assert.deepEqual(personPalette({ id }), one.palette, 'personPalette wraps personLook');
  }
});

test('looks vary: skin tones, hair styles, glasses and distinct combinations', () => {
  for (const prefix of ['p', 'h']) {
    const looks = ids(prefix, 200).map((id) => personLook({ id }));
    assert.ok(new Set(looks.map((l) => l.palette.s)).size >= 4, `${prefix}: skin tones`);
    assert.deepEqual(new Set(looks.map((l) => l.hair)), new Set(HAIRS), `${prefix}: hair styles`);
    const glasses = looks.filter((l) => l.glasses).length;
    assert.ok(glasses >= 20, `${prefix}: glasses on ${glasses}/200`);
    const first50 = new Set(looks.slice(0, 50).map((l) => JSON.stringify(l)));
    assert.ok(first50.size >= 20, `${prefix}: ${first50.size} distinct looks in ids 1..50`);
  }
});

// Starting staff are always p0..p9 and hires h1, h2, ...: the looks players
// actually see must not clump.
test('looks are balanced in the id windows players see', () => {
  for (const window of [ids('p', 10).map((_, i) => `p${i}`), ids('h', 14)]) {
    const looks = window.map((id) => personLook({ id }));
    for (const [trait, key] of [['hair colour', (l) => l.palette.h], ['hair style', (l) => l.hair]]) {
      const counts = new Map();
      for (const l of looks) counts.set(key(l), (counts.get(key(l)) ?? 0) + 1);
      const most = Math.max(...counts.values());
      assert.ok(most / looks.length <= 0.4, `${window[0]}..: one ${trait} on ${most}/${looks.length}`);
    }
  }
});

test('glasses are two rings around the eyes, clear of the headset cups', () => {
  for (const hair of HAIRS) {
    const plain = personSprite('stand', { hair, glasses: false }).rows;
    const specs = personSprite('stand', { hair, glasses: true }).rows;
    for (let y = 0; y < 12; y++) {
      for (let x = 0; x < 16; x++) {
        if (plain[y][x] === 'e') assert.equal(specs[y][x], 'e', `${hair}: eye at ${x},${y} stays visible`);
        if (specs[y][x] === 'g') assert.ok(x >= 4 && x <= 11, `${hair}: frame at x=${x} reaches the headset cups`);
      }
    }
    for (const eyeX of [5, 10]) {
      // a ring: frame above and below the eye, and on both sides of the lens
      const col = (x) => specs.slice(0, 12).map((r) => r[x]).join('');
      assert.match(col(eyeX), /g(e|s)+g/, `${hair}: lens ring at x=${eyeX}`);
      const insideX = eyeX === 5 ? 6 : 9;
      assert.match(col(insideX), /gs+g/, `${hair}: skin inside the lens at x=${insideX}`);
    }
  }
  const deep = personLook({ id: 'x' }).palette; // any palette: the frame differs from eyes and outline
  assert.notEqual(deep.g, deep.e);
  assert.notEqual(deep.g, deep.O);
});

test('glasses frame stands out on every skin tone', () => {
  const lum = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  const seen = new Map();
  for (const id of ids('h', 400)) { const p = personLook({ id }).palette; seen.set(p.s, p); }
  assert.ok(seen.size >= 7, `skin tones: ${seen.size}`);
  assert.ok([...seen.keys()].includes('#6b4430'), 'deepest reference skin');
  for (const [skin, p] of seen) assert.ok(contrast(p.g, skin) >= 1.8, `frame ${p.g} on skin ${skin}: ${contrast(p.g, skin).toFixed(2)}`);
});

test('palettes carry the reference colours', () => {
  const pal = ids('h', 400).map((id) => personLook({ id }).palette);
  const has = (key, colour) => pal.some((p) => p[key] === colour);
  for (const hair of ['#2e2530', '#5a3a2a', '#8a4b2a', '#c8642e']) assert.ok(has('h', hair), `hair ${hair}`);
  for (const shirt of ['#6f9fd8', '#7cbf8e', '#a58bd0', '#f4f1ea']) assert.ok(has('c', shirt), `shirt ${shirt}`);
  for (const p of pal) assert.equal(p.O, '#3b2a2e', 'shared outline');
});

test('Kim Miso keeps her chestnut bob, round glasses, mustard cardigan and green skirt', () => {
  assert.equal(PALETTES.miso.h, '#6b3b2a');
  assert.equal(PALETTES.miso.q, '#b07a4a');
  assert.equal(PALETTES.miso.c, '#e2a440');
  assert.equal(PALETTES.miso.p, '#5c9a8b');
  const rows = SPRITES.miso.rows.join('');
  for (const ch of 'hqcp') assert.ok(rows.includes(ch), `miso uses '${ch}'`);
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
