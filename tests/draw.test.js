// v1.5 people drawing: 16x24 people stand on their tile's bottom edge, 8
// sprite pixels taller than the tile; lower rows draw later; markers follow
// the taller head. Fake canvases record every call.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as draw from '../render/draw.js';
import * as sprites from '../render/sprites.js';
import { SPRITES, personLook, personSprite } from '../render/sprites.js';
import { MAP, tileAt } from '../render/map.js';

const { createDrawer, TILE_PX, SCALE, personAt } = draw;
const U = SCALE;

function canvasFactory() {
  let made = 0;
  return function fakeCanvas(w, h) {
    const cid = `c${made++}`;
    const ops = [];
    const ctx = new Proxy({ ops }, {
      get: (t, k) => (k in t ? t[k] : (...a) => ops.push([k, ...a.map((x) => (typeof x === 'object' && x ? (x.id ?? 'obj') : x))])),
      set: (t, k, val) => { ops.push(['set', k, val]); return true; },
    });
    return { width: w, height: h, getContext: () => ctx, id: cid };
  };
}

const person = (id, role, activity, extra = {}) => ({
  id, role, activity, stress: 10, health: { kind: 'well', daysLeft: 0 }, task: null, ...extra,
});
const seated = (id, [x, y]) => ({ id, x, y, path: [], target: [x, y], gone: false });

function setup() {
  const make = canvasFactory();
  const drawer = createDrawer(make);
  const screen = make(960, 576);
  return { make, drawer, ctx: screen.getContext() };
}

const draws = (ctx, canvasId) => ctx.ops.filter((o) => o[0] === 'drawImage' && o[1] === canvasId);

test('a seated agent is drawn 16x24 with its top 8 sprite pixels above the tile', () => {
  const front = MAP.spots.seats[0]; // [3,2]: desk below, faces the viewer
  const back = MAP.spots.seats[4]; // [3,5]: desk above, back to the viewer
  assert.equal(tileAt(MAP, front[0], front[1] + 1), 'D');
  assert.equal(tileAt(MAP, back[0], back[1] - 1), 'D');
  const { drawer, ctx } = setup();
  const people = [person('p1', 'agent', 'idle'), person('p2', 'agent', 'idle')];
  drawer.drawActors(ctx, [seated('p1', front), seated('p2', back)], people, 0, []);
  for (const [p, [tx, ty], pose] of [[people[0], front, 'sit'], [people[1], back, 'sitBack']]) {
    const c = drawer.personCanvas(p, pose);
    const hits = draws(ctx, c.id);
    assert.equal(hits.length, 1, `${p.id} drawn once as ${pose}`);
    const [, , x, y, w, h] = hits[0];
    assert.deepEqual([x, y, w, h], [tx * TILE_PX, ty * TILE_PX - 8 * SCALE, 16 * U, 24 * U], pose);
    assert.equal(y + h, (ty + 1) * TILE_PX, `${pose}: bottom edge on the tile's bottom edge`);
  }
});

test('people are painted from their own look (hair, glasses, palette)', () => {
  const make = canvasFactory();
  const drawer = createDrawer(make);
  for (const id of ['p0', 'p3', 'h7', 'h12']) {
    const p = person(id, 'agent', 'idle');
    const look = personLook(p);
    const c = drawer.personCanvas(p, 'stand');
    assert.deepEqual([c.width, c.height], [16, 24]);
    const fills = c.getContext().ops.filter((o) => o[0] === 'fillRect');
    const want = personSprite('stand', look).rows.join('').replace(/\./g, '').length;
    assert.equal(fills.length, want, `${id}: one fillRect per painted pixel`);
    const colours = c.getContext().ops.filter((o) => o[0] === 'set' && o[1] === 'fillStyle').map((o) => o[2]);
    assert.ok(colours.includes(look.palette.h), `${id}: hair colour`);
    assert.ok(colours.includes(look.palette.c), `${id}: shirt colour`);
  }
});

test('the drawer takes looks from personLook: no personPalette, no flat pose aliases', () => {
  assert.equal(sprites.personPalette, undefined);
  for (const pose of ['stand', 'walkA', 'walkB', 'sit', 'sitBack']) assert.equal(SPRITES[pose], undefined, pose);
  assert.ok(SPRITES.person.stand);
});

test('headset and lanyard overlays line up with the taller sprite; the lead wears neither', () => {
  const { drawer, ctx } = setup();
  const seat = MAP.spots.seats[0];
  const people = [
    person('a1', 'agent', 'phone', { task: { kind: 'phone', clientId: 'x' }, answering: 'x' }),
    person('lead', 'lead', 'idle'),
    person('qa', 'qa', 'task', { task: { kind: 'qa' } }),
  ];
  const actors = [seated('a1', seat), seated('lead', MAP.spots.leadDesk), seated('qa', MAP.spots.qaDesk)];
  drawer.drawActors(ctx, actors, people, 0, [{ id: 'x', channel: 'phone' }]);
  const top = ([x, y]) => [x * TILE_PX, y * TILE_PX - 8 * U, 16 * U, 24 * U];
  const headset = [drawer.spriteCanvas('headset').id, drawer.spriteCanvas('headsetBack').id];
  const lanyard = drawer.spriteCanvas('lanyard').id;
  const at = (ids) => ctx.ops.filter((o) => o[0] === 'drawImage' && ids.includes(o[1])).map((o) => o.slice(2));
  assert.deepEqual(at(headset), [top(seat)], 'only the phone agent wears the headset');
  assert.deepEqual(at([lanyard]), [top(MAP.spots.qaDesk)], 'only QA wears the lanyard');
});

// v1.6 Task 4: the marker and the bubble moved up again, above the role tag
// (tag: 5 sprite pixels tall, 1 above the sprite's top; 1 more clear above it).
const SPRITE_TOP = (ty) => ty * TILE_PX - 8 * U;

test('the 💬/✉️ channel marker sits above the role tag, right of the bubble', () => {
  const { drawer, ctx } = setup();
  const seat = MAP.spots.seats[4]; // [3,5]
  const people = [person('a1', 'agent', 'phone', { task: { kind: 'phone', clientId: 'chat' }, answering: 'chat' })];
  drawer.drawActors(ctx, [seated('a1', seat)], people, 0, [{ id: 'chat', channel: 'chat' }]);
  const marks = ctx.ops.filter((o) => o[0] === 'fillText');
  assert.equal(marks.length, 1);
  const [, text, x, y] = marks[0];
  assert.equal(text, '💬');
  assert.equal(x, seat[0] * TILE_PX + 16 * U);
  assert.equal(y, SPRITE_TOP(seat[1]) - 7 * U - 3.5 * U);
});

test('the status bubble sits above the role tag', () => {
  const { drawer, ctx } = setup();
  const seat = MAP.spots.seats[4]; // [3,5]
  const people = [person('a1', 'agent', 'idle', { stress: 95 })];
  drawer.drawBubbles(ctx, [seated('a1', seat)], people, {});
  const rects = ctx.ops.filter((o) => o[0] === 'fillRect');
  const top = Math.min(...rects.map((o) => o[2]));
  assert.equal(top, SPRITE_TOP(seat[1]) - 7 * U - 12 * U);
  const icon = drawer.spriteCanvas('iconStress').id;
  const [iconOp] = draws(ctx, icon);
  assert.equal(iconOp[3], SPRITE_TOP(seat[1]) - 7 * U - 11 * U);
});

test('a bubble near the top wall stays on the canvas', () => {
  const { drawer, ctx } = setup();
  const people = [person('a1', 'agent', 'idle', { stress: 95 })];
  drawer.drawBubbles(ctx, [seated('a1', [5, 1])], people, {});
  const ys = ctx.ops.filter((o) => o[0] === 'fillRect' || o[0] === 'drawImage').map((o) => (o[0] === 'fillRect' ? o[2] : o[3]));
  assert.ok(Math.min(...ys) >= 0, `bubble top ${Math.min(...ys)}`);
});

test('a person in a lower row is drawn after a person in the row above', () => {
  const { drawer, ctx } = setup();
  // 'z' stands in row 4 right under 'a' in row 3; ids and list order both
  // favour the wrong order, so only the feet decide.
  const people = [person('z', 'agent', 'idle'), person('a', 'agent', 'idle')];
  const actors = [
    { id: 'z', x: 11, y: 4, path: [], target: [11, 4], gone: false },
    { id: 'a', x: 11, y: 3, path: [], target: [11, 3], gone: false },
  ];
  drawer.drawActors(ctx, actors, people, 0, []);
  const order = ctx.ops.filter((o) => o[0] === 'drawImage').map((o) => o[1]);
  const upper = drawer.personCanvas(people[1], 'stand').id;
  const lower = drawer.personCanvas(people[0], 'stand').id;
  assert.ok(order.indexOf(upper) >= 0 && order.indexOf(lower) > order.indexOf(upper), JSON.stringify(order));
  // Walking between rows: whoever's feet are lower draws later.
  const { drawer: d2, ctx: c2 } = setup();
  const walking = [
    { id: 'z', x: 11, y: 3.4, path: [[11, 4]], target: [11, 4], gone: false },
    { id: 'a', x: 11, y: 3.6, path: [[11, 4]], target: [11, 4], gone: false },
  ];
  d2.drawActors(c2, walking, people, 0, []);
  const ids = c2.ops.filter((o) => o[0] === 'drawImage').map((o) => o[1]);
  const za = ['walkA', 'walkB'].map((pose) => d2.personCanvas(people[0], pose).id);
  const aa = ['walkA', 'walkB'].map((pose) => d2.personCanvas(people[1], pose).id);
  assert.ok(ids.findIndex((i) => aa.includes(i)) > ids.findIndex((i) => za.includes(i)), JSON.stringify(ids));
});

// v1.6 fix: the walk frame follows the distance walked, one swap per tile, so
// a fast walk does not slide (and a standing-still clock never changes it).
test('the walking frame depends on distance travelled, not on time', () => {
  const { drawer, ctx } = setup();
  const people = [person('p1', 'agent', 'idle')];
  const frameAt = (x, timeMs) => {
    ctx.ops.length = 0;
    drawer.drawActors(ctx, [{ id: 'p1', x, y: 5, path: [[x + 3, 5]], target: [x + 3, 5], gone: false }], people, timeMs, []);
    const drawn = ctx.ops.filter((o) => o[0] === 'drawImage').map((o) => o[1]);
    return ['walkA', 'walkB'].findIndex((pose) => drawn.includes(drawer.personCanvas(people[0], pose).id));
  };
  const same = frameAt(4.1, 0);
  assert.ok(same >= 0, 'a walking pose is drawn');
  for (const t of [160, 320, 1000, 5000]) assert.equal(frameAt(4.1, t), same, `time ${t}`);
  assert.equal(frameAt(4.9, 777), same, 'same tile, same frame');
  const next = frameAt(5.1, 0);
  assert.notEqual(next, same, 'one tile on: the other frame');
  assert.equal(frameAt(5.1, 9999), next);
  assert.equal(frameAt(6.1, 0), same, 'two tiles on: back again');
});

test('a click on the head (above the tile) picks the person; above the head does not', () => {
  const actors = [seated('back', [3, 5]), seated('front', [3, 6])];
  const x = 3 * TILE_PX + 8 * U;
  assert.equal(personAt(actors, x, 5 * TILE_PX + 4 * U), 'back');
  assert.equal(personAt(actors, x, 5 * TILE_PX - 6 * U), 'back', 'head above the tile');
  assert.equal(personAt(actors, x, 5 * TILE_PX - 9 * U), null, 'above the head');
  assert.equal(personAt(actors, x, 6 * TILE_PX - 4 * U), 'front', 'the lower person is in front');
  assert.equal(personAt([{ ...seated('gone', [3, 5]), gone: true }], x, 5 * TILE_PX), null);
});

// v1.5 Task 4: the chair back shows in front of a person sitting with their
// back to the viewer (it was hidden under them); nobody else gets it.
test('a back-facing sitter has the chair back drawn over them; front sitters and walkers do not', () => {
  const { drawer, ctx } = setup();
  const back = MAP.spots.seats[4]; // [3,5]
  const front = MAP.spots.seats[0]; // [3,2]
  const people = [person('p1', 'agent', 'phone', { task: { kind: 'phone', clientId: 'x' }, answering: 'x' }),
    person('p2', 'agent', 'idle'), person('p3', 'agent', 'idle')];
  const walker = { id: 'p3', x: 5, y: 5, path: [[5, 6]], target: [5, 6], gone: false }; // on a chair tile, walking
  drawer.drawActors(ctx, [seated('p1', back), seated('p2', front), walker], people, 0, [{ id: 'x', channel: 'phone' }]);
  const rest = drawer.spriteCanvas('chairRest').id;
  const rests = ctx.ops.map((o, i) => [o, i]).filter(([o]) => o[0] === 'drawImage' && o[1] === rest);
  assert.equal(rests.length, 1, 'one chair back');
  const [[op, at]] = rests;
  assert.deepEqual(op.slice(2), [back[0] * TILE_PX, back[1] * TILE_PX, TILE_PX, TILE_PX], 'on the seat tile');
  const sitter = ctx.ops.findIndex((o) => o[0] === 'drawImage' && o[1] === drawer.personCanvas(people[0], 'sitBack').id);
  const headset = ctx.ops.findIndex((o) => o[0] === 'drawImage' && o[1] === drawer.spriteCanvas('headsetBack').id);
  assert.ok(sitter >= 0 && sitter < at, 'after the sitter');
  assert.ok(headset > at, 'the headset still goes on last');
  // only the backrest: the top 10 rows (seat and legs, under the sitter) are clear
  assert.ok(SPRITES.chairRest.rows.slice(0, 10).every((r) => /^\.+$/.test(r)));
  assert.deepEqual(SPRITES.chairRest.rows.slice(10), SPRITES.chairBack.rows.slice(10));
});
