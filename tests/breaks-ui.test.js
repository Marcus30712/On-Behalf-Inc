// v1.6 Task 4 UI: today's breaks on the person card, the 스케줄링 skill,
// 점심 중, and the role tag over every head with the bubble and the channel
// marker stacked above it. Literal strings are the approved copy
// (docs/superpowers/specs/2026-11-26-v1.6-copy.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createGame, advance, view } from '../sim/game.js';
import { UI_TEXT } from '../ui/text.js';
import { renderPanel, selectPerson, resetPanels } from '../ui/panels.js';
import { createDrawer, TILE_PX, SCALE, CANVAS_W } from '../render/draw.js';
import { MAP } from '../render/map.js';

const U = SCALE;

function makeRoot() {
  resetPanels();
  return new JSDOM('<!DOCTYPE html><div id="r"></div>').window.document.getElementById('r');
}

// A plain copy of the 11:00 view of seed 11 (people can be edited freely).
function plainView() {
  const s = createGame(11);
  advance(s, 11 * 60);
  return JSON.parse(JSON.stringify(view(s)));
}

function card(v, id) {
  const root = makeRoot();
  selectPerson(id);
  renderPanel(root, v, 'people', () => ({ ok: true }));
  return root;
}

// The <dd> after the <dt> with this text.
function field(root, label) {
  const dt = [...root.querySelectorAll('dt')].find((x) => x.textContent === label);
  return dt?.nextElementSibling?.textContent ?? null;
}

// ---- copy -------------------------------------------------------------------

test('v1.6 copy is in UI_TEXT verbatim', () => {
  assert.equal(UI_TEXT.skill.planning.name, '스케줄링');
  assert.equal(UI_TEXT.skill.planning.tip, '휴식 시간을 짜는 솜씨. 팀장이 높을수록 콜이 몰리는 시간을 피해 휴식을 배정해요.');
  assert.equal(UI_TEXT.card.breaksToday, '오늘 휴식');
  assert.equal(UI_TEXT.card.breaksLine, '휴식 {am} · 점심 {lunch} · 휴식 {pm}');
  assert.equal(UI_TEXT.card.breaksNone, '오늘은 근무가 없어요.');
  assert.equal(UI_TEXT.activity.lunch, '점심 중');
  assert.equal(UI_TEXT.shift.mid, undefined, 'no mid shift copy');
});

// ---- the card -----------------------------------------------------------------

test('the card shows today\'s breaks as HH:MM', () => {
  const v = plainView();
  const p = v.people[0];
  p.breaks = { am: 10 * 60 + 15, lunch: 12 * 60 + 30, pm: 15 * 60 + 45, by: 'lead' };
  assert.equal(field(card(v, p.id), '오늘 휴식'), '휴식 10:15 · 점심 12:30 · 휴식 15:45');
  p.breaks = { am: 9 * 60 + 0, lunch: 13 * 60 + 5, pm: 20 * 60, by: 'auto' };
  assert.equal(field(card(v, p.id), '오늘 휴식'), '휴식 09:00 · 점심 13:05 · 휴식 20:00', 'zero-padded');
});

test('the card says 오늘은 근무가 없어요. on a day off', () => {
  const v = plainView();
  const p = v.people[0];
  p.breaks = null;
  assert.equal(field(card(v, p.id), '오늘 휴식'), '오늘은 근무가 없어요.');
});

test('a real view: someone at work today has a breaks line, someone off has none', () => {
  const s = createGame(11);
  advance(s, 11 * 60);
  const v = view(s);
  const at = v.people.find((p) => p.breaks);
  assert.ok(at, 'someone works today');
  assert.match(field(card(v, at.id), '오늘 휴식'), /^휴식 \d\d:\d\d · 점심 \d\d:\d\d · 휴식 \d\d:\d\d$/);
  const offView = plainView();
  offView.people[0].breaks = null;
  assert.equal(field(card(offView, offView.people[0].id), '오늘 휴식'), '오늘은 근무가 없어요.');
});

test('the card lists 스케줄링 with its tip, after the other skills', () => {
  const v = plainView();
  const p = v.people[0];
  p.skills = { ...p.skills, planning: 6.5 };
  const items = [...card(v, p.id).querySelectorAll('ul.skills li')];
  assert.equal(items.length, 5);
  const last = items.at(-1);
  assert.equal(last.textContent, '스케줄링 6.50');
  assert.equal(last.getAttribute('title'), '휴식 시간을 짜는 솜씨. 팀장이 높을수록 콜이 몰리는 시간을 피해 휴식을 배정해요.');
});

// Seed 11's people have no stored planning: the card shows the value derived
// from id and name (sim/people.js planningOf), within each role's range.
test('스케줄링 shows the derived value for people without a stored one', () => {
  const v = plainView();
  const want = { p0: ['비스 소랭', 'agent', '스케줄링 1.60'], p8: ['비스 순테', 'lead', '스케줄링 7.10'], p9: ['무알로', 'qa', '스케줄링 1.80'] };
  for (const [id, [name, role, text]] of Object.entries(want)) {
    const p = v.people.find((x) => x.id === id);
    assert.deepEqual([p.name, p.role, p.skills.planning], [name, role, undefined], id);
    const last = [...card(v, id).querySelectorAll('ul.skills li')].at(-1);
    assert.equal(last.textContent, text, `${id} ${role}`);
  }
});

test('the people list shows 점심 중 for someone at lunch', () => {
  const v = plainView();
  const p = v.people[0];
  p.activity = 'lunch';
  const root = makeRoot();
  // v1.8: 점심 중 during the person's own lunch minutes (sim/away.js).
  renderPanel(root, v, 'people', () => ({ ok: true }), { minuteNow: p.breaks?.lunch ?? v.minute });
  const row = root.querySelector(`[data-person="${p.id}"]`);
  assert.ok(row.textContent.includes('점심 중'), row.textContent);
});

// ---- the role tag -------------------------------------------------------------

function canvasFactory() {
  let made = 0;
  const canvases = [];
  const make = function fakeCanvas(w, h) {
    const cid = `c${made++}`;
    const ops = [];
    const ctx = new Proxy({ ops }, {
      get: (t, k) => (k in t ? t[k] : (...a) => ops.push([k, ...a.map((x) => (typeof x === 'object' && x ? (x.id ?? 'obj') : x))])),
      set: (t, k, val) => { ops.push(['set', k, val]); return true; },
    });
    const c = { width: w, height: h, getContext: () => ctx, id: cid };
    canvases.push(c);
    return c;
  };
  make.canvases = canvases;
  return make;
}

function setup() {
  const make = canvasFactory();
  const drawer = createDrawer(make);
  const screen = make(960, 576);
  return { make, drawer, ctx: screen.getContext() };
}

const person = (id, role, activity, extra = {}) => ({
  id, role, activity, stress: 10, health: { kind: 'well', daysLeft: 0 }, task: null, ...extra,
});
const seated = (id, [x, y]) => ({ id, x, y, path: [], target: [x, y], gone: false });
// Top of a person's 16x24 sprite standing on tile row ty.
const spriteTop = (ty) => ty * TILE_PX - 8 * U;

// Where the role tag canvas of `role` was drawn on screen: [x, y, w, h].
function tagRects(drawer, ctx, role) {
  const c = drawer.roleTag(role);
  return ctx.ops.filter((o) => o[0] === 'drawImage' && o[1] === c.id).map((o) => [o[2], o[3], c.width, c.height]);
}

test('every role gets a tag with its role.* text, above the head and centred', () => {
  const { drawer, ctx } = setup();
  const spots = { agent: MAP.spots.seats[4], lead: MAP.spots.leadDesk, qa: MAP.spots.qaDesk };
  const people = [person('a1', 'agent', 'idle'), person('l1', 'lead', 'idle'), person('q1', 'qa', 'task', { task: { kind: 'qa' } })];
  drawer.drawActors(ctx, people.map((p) => seated(p.id, spots[p.role])), people, 0, []);
  for (const [role, text] of [['agent', '상담사'], ['lead', '팀장'], ['qa', 'QA']]) {
    assert.equal(UI_TEXT.role[role], text);
    const tag = drawer.roleTag(role);
    const texts = tag.getContext().ops.filter((o) => o[0] === 'fillText').map((o) => o[1]);
    assert.deepEqual(texts, [text], `${role} tag text`);
    const rects = tagRects(drawer, ctx, role);
    assert.equal(rects.length, 1, `${role} tag drawn once`);
    const [x, y, w, h] = rects[0];
    const [tx, ty] = spots[role];
    assert.ok(y >= 0, `${role} tag on the canvas`);
    assert.ok(y + h <= spriteTop(ty), `${role} tag above the head: ${y + h} <= ${spriteTop(ty)}`);
    assert.ok(Math.abs((x + w / 2) - (tx * TILE_PX + 8 * U)) <= 1, `${role} tag centred over the sprite`);
    assert.ok(h >= 4 * U && h <= 6 * U, `${role} tag ${h}px tall`);
  }
});

test('the tag is painted once per role, not per person or per frame', () => {
  const { make, drawer, ctx } = setup();
  const people = [person('a1', 'agent', 'idle'), person('a2', 'agent', 'idle')];
  const actors = [seated('a1', MAP.spots.seats[0]), seated('a2', MAP.spots.seats[1])];
  drawer.drawActors(ctx, actors, people, 0, []);
  const made = make.canvases.length;
  for (let t = 1; t < 5; t++) drawer.drawActors(ctx, actors, people, t * 1000, []);
  assert.equal(make.canvases.length, made, 'no new canvases after the first frame');
  assert.equal(tagRects(drawer, ctx, 'agent').length, 2 * 5, 'one tag per person per frame');
  assert.equal(drawer.roleTag('agent'), drawer.roleTag('agent'));
  assert.equal(drawer.roleTag('agent').getContext().ops.filter((o) => o[0] === 'fillText').length, 1);
});

test('the tag stays on the canvas near the top wall and the map edges', () => {
  const { drawer, ctx } = setup();
  const people = [person('a', 'agent', 'idle'), person('b', 'lead', 'idle'), person('c', 'qa', 'idle')];
  const actors = [seated('a', [1, 1]), seated('b', [18, 1]), seated('c', [10, 1])];
  drawer.drawActors(ctx, actors, people, 0, []);
  for (const role of ['agent', 'lead', 'qa']) {
    const [[x, y, w, h]] = tagRects(drawer, ctx, role);
    assert.ok(x >= 0 && x + w <= CANVAS_W, `${role} inside left/right: ${x}..${x + w}`);
    assert.ok(y >= 0 && y + h <= spriteTop(1), `${role} row 1: ${y}..${y + h}`);
  }
});

test('tags are drawn after every person, so a lower person never covers one', () => {
  const { drawer, ctx } = setup();
  const people = [person('up', 'agent', 'idle'), person('down', 'agent', 'idle')];
  const actors = [seated('up', [11, 3]), { id: 'down', x: 11, y: 3.7, path: [[11, 4]], target: [11, 4], gone: false }];
  drawer.drawActors(ctx, actors, people, 0, []);
  const tag = drawer.roleTag('agent').id;
  const ids = ctx.ops.filter((o) => o[0] === 'drawImage').map((o) => o[1]);
  const lastSprite = Math.max(...['stand', 'walkA', 'walkB'].flatMap((pose) => people.map((p) => ids.lastIndexOf(drawer.personCanvas(p, pose).id))));
  assert.ok(ids.indexOf(tag) > lastSprite, JSON.stringify(ids));
});

// Rectangles overlap when they share any area.
const overlaps = ([ax, ay, aw, ah], [bx, by, bw, bh]) => ax < bx + bw && bx < ax + aw && ay < by + bh && by < ay + ah;

// The bubble's rectangle (box and tail) from its fillRects on screen.
function bubbleRect(ctx) {
  const rects = ctx.ops.filter((o) => o[0] === 'fillRect').map((o) => o.slice(1));
  const x0 = Math.min(...rects.map((r) => r[0]));
  const y0 = Math.min(...rects.map((r) => r[1]));
  const x1 = Math.max(...rects.map((r) => r[0] + r[2]));
  const y1 = Math.max(...rects.map((r) => r[1] + r[3]));
  return [x0, y0, x1 - x0, y1 - y0];
}

// Each person's tag rectangle as drawActors places it.
function tagOf(drawer, role, actor) {
  const make = canvasFactory();
  const screen = make(960, 576);
  const p = person(actor.id, role, 'idle');
  drawer.drawActors(screen.getContext(), [actor], [p], 0, []);
  return tagRects(drawer, screen.getContext(), role)[0];
}

test('the status bubble sits above the tag without touching it', () => {
  for (const spot of [MAP.spots.seats[0], MAP.spots.seats[4], [11, 6], [1, 1], [18, 1], [10, 1]]) {
    const { drawer, ctx } = setup();
    const actor = seated('a1', spot);
    const tag = tagOf(drawer, 'agent', actor);
    drawer.drawBubbles(ctx, [actor], [person('a1', 'agent', 'idle', { stress: 95 })], {});
    const b = bubbleRect(ctx);
    assert.ok(b[1] >= 0, `${spot}: bubble on the canvas (${b[1]})`);
    assert.ok(b[0] >= 0 && b[0] + b[2] <= CANVAS_W, `${spot}: bubble inside left/right`);
    assert.ok(!overlaps(b, tag), `${spot}: bubble ${b} clear of tag ${tag}`);
    const icon = drawer.spriteCanvas('iconStress').id;
    const [iconOp] = ctx.ops.filter((o) => o[0] === 'drawImage' && o[1] === icon);
    assert.ok(iconOp, 'icon drawn');
    if (spot[1] > 1) assert.ok(b[1] + b[3] <= tag[1], `${spot}: bubble stacked above the tag`);
  }
});

test('the 💬/✉️ marker sits above the tag, clear of it and of the bubble', () => {
  for (const spot of [MAP.spots.seats[0], MAP.spots.seats[4], MAP.spots.seats[10]]) {
    for (const [channel, mark] of [['chat', '💬'], ['email', '✉️']]) {
      const { drawer, ctx } = setup();
      const p = person('a1', 'agent', 'phone', { stress: 95, task: { kind: 'phone', clientId: channel }, answering: channel });
      const actor = seated('a1', spot);
      drawer.drawActors(ctx, [actor], [p], 0, [{ id: channel, channel }]);
      const tag = tagRects(drawer, ctx, 'agent')[0];
      const marks = ctx.ops.filter((o) => o[0] === 'fillText');
      assert.equal(marks.length, 1);
      const [, text, x, y] = marks[0];
      assert.equal(text, mark);
      const size = 7 * U; // the marker is drawn 7 sprite pixels tall, centred on (x, y)
      const box = [x - size / 2, y - size / 2, size, size];
      assert.ok(box[1] >= 0, `${spot}: marker on the canvas`);
      assert.ok(box[1] + box[3] <= tag[1], `${spot}: marker ${box} above tag ${tag}`);
      const { drawer: d2, ctx: c2 } = setup();
      d2.drawBubbles(c2, [actor], [p], {});
      assert.ok(!overlaps(bubbleRect(c2), box), `${spot}: bubble ${bubbleRect(c2)} clear of marker ${box}`);
    }
  }
});

// ---- fix round 1 -----------------------------------------------------------------

test('every role plate is the same width, so a tag on top hides the one under it', () => {
  const { drawer } = setup();
  const widths = ['agent', 'lead', 'qa'].map((r) => drawer.roleTag(r).width);
  assert.equal(new Set(widths).size, 1, `widths ${widths}`);
  assert.equal(new Set(['agent', 'lead', 'qa'].map((r) => drawer.roleTag(r).height)).size, 1);
});

test('people stacked on one tile get one tag: the person drawn last', () => {
  const { drawer, ctx } = setup();
  // At the door on load: an agent and the lead on the same tile, the lead's
  // feet a little lower (drawn last); a QA on the next tile keeps her own tag.
  const people = [person('a1', 'agent', 'off'), person('l1', 'lead', 'off'), person('q1', 'qa', 'off')];
  const actors = [
    { id: 'a1', x: 10, y: 10.9, path: [[10, 10]], target: [10, 10], gone: false },
    { id: 'l1', x: 10, y: 11, path: [[10, 10]], target: [10, 10], gone: false },
    { id: 'q1', x: 11, y: 10, path: [], target: [11, 10], gone: false },
  ];
  drawer.drawActors(ctx, actors, people, 0, []);
  const tagIds = new Map(['agent', 'lead', 'qa'].map((r) => [drawer.roleTag(r).id, r]));
  const drawn = ctx.ops.filter((o) => o[0] === 'drawImage' && tagIds.has(o[1])).map((o) => [tagIds.get(o[1]), o[2], o[3]]);
  assert.equal(drawn.filter(([, x]) => x < 11 * TILE_PX).length, 1, `one tag on the door tile: ${JSON.stringify(drawn)}`);
  assert.deepEqual(drawn.map(([r]) => r).sort(), ['lead', 'qa']);
});

test('row 1: tag, status bubble and 💬/✉️ marker never overlap (plan Review Focus 5)', () => {
  for (const [x, y] of [[1, 1], [6, 1], [11, 1], [18, 1], [6, 1.5], [6, 1.9]]) {
    for (const [channel, mark] of [['chat', '💬'], ['email', '✉️']]) {
      const p = person('a1', 'agent', 'phone', { stress: 95, task: { kind: 'phone', clientId: channel }, answering: channel });
      const actor = { id: 'a1', x, y, path: [], target: [x, y], gone: false };
      const { drawer, ctx } = setup();
      drawer.drawActors(ctx, [actor], [p], 0, [{ id: channel, channel }]);
      const tag = tagRects(drawer, ctx, 'agent')[0];
      const [[, text, mx, my]] = ctx.ops.filter((o) => o[0] === 'fillText');
      assert.equal(text, mark);
      const size = 7 * U;
      const marker = [mx - size / 2, my - size / 2, size, size];
      const { drawer: d2, ctx: c2 } = setup();
      d2.drawBubbles(c2, [actor], [p], {});
      const b = bubbleRect(c2);
      const where = `(${x},${y}) ${channel}: tag ${tag} marker ${marker} bubble ${b}`;
      for (const r of [tag, marker, b]) assert.ok(r[0] >= 0 && r[1] >= 0 && r[0] + r[2] <= CANVAS_W, `on canvas ${where}`);
      assert.ok(!overlaps(tag, marker), `tag/marker ${where}`);
      assert.ok(!overlaps(tag, b), `tag/bubble ${where}`);
      assert.ok(!overlaps(marker, b), `marker/bubble ${where}`);
    }
  }
});

// Review check: the view's breaks follow today's health, so someone who
// falls sick during the day loses their breaks line at once.
test('someone who goes home sick mid-day has no breaks: the card says 오늘은 근무가 없어요.', () => {
  const s = createGame(11);
  advance(s, 11 * 60);
  const id = view(s).people.find((p) => p.breaks).id;
  s.people.find((p) => p.id === id).health = { kind: 'sick', daysLeft: 2 };
  const v = view(s);
  const p = v.people.find((x) => x.id === id);
  assert.equal(p.breaks, null);
  assert.equal(field(card(v, id), '오늘 휴식'), '오늘은 근무가 없어요.');
});

// v1.8 (final review): before their lunch minutes inside a lunch interval, an
// agent at the desk on the phone wears the headset, as the list says 전화 중.
test('v1.8 headset during the desk minutes of a lunch interval', () => {
  const { drawer, ctx } = setup();
  const headsets = [drawer.spriteCanvas('headset').id, drawer.spriteCanvas('headsetBack').id];
  const p = person('a1', 'agent', 'lunch', { deskActivity: 'phone', task: { kind: 'phone', clientId: 'gureum-travel' }, breaks: { am: 600, lunch: 735, pm: 900 } });
  const wearing = (minute) => {
    ctx.ops.length = 0;
    drawer.drawActors(ctx, [seated('a1', MAP.spots.seats[4])], [p], 0, [], minute);
    return ctx.ops.some((o) => o[0] === 'drawImage' && headsets.includes(o[1]));
  };
  assert.equal(wearing(725), true, 'at the desk before lunch');
  assert.equal(wearing(740), false, 'at lunch');
  assert.equal(wearing(undefined), false, 'no minute: as the sim says (lunch)');
});
