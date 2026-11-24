import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPRITES, PALETTES, TILE_SPRITES, personPalette } from '../render/sprites.js';
import { MAP } from '../render/map.js';

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
