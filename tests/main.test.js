import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { createGame, save, view, SAVE_KEY } from '../sim/game.js';
import { pushEvent } from '../sim/events.js';
import { CLIENTS } from '../world/clients.js';
import { UI_TEXT } from '../ui/text.js';
import { start } from '../ui/main.js';

const HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function fakeStorage(text) {
  const map = new Map(text === undefined ? [] : [[SAVE_KEY, text]]);
  const writes = [];
  return {
    writes,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem(k, v) { writes.push(k); map.set(k, String(v)); },
    removeItem: (k) => map.delete(k),
  };
}

function savedStorage(state) {
  const s = fakeStorage();
  save(state, s);
  s.writes.length = 0;
  return s;
}

// A page with fake time, frames and a no-op 2D context (jsdom has no canvas).
function boot({ storage = fakeStorage(), seed = 7 } = {}) {
  const { window } = new JSDOM(HTML);
  const { document } = window;
  const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
  window.HTMLCanvasElement.prototype.getContext = () => ctx;
  let t = 1000;
  let pending = null;
  const game = start({ document, storage, now: () => t, requestFrame: (cb) => { pending = cb; }, seedSource: () => seed });
  const frame = (ms = 16) => { t += ms; const cb = pending; pending = null; cb?.(t); };
  const $ = (sel) => document.querySelector(sel);
  const click = (sel) => { const el = $(sel); assert.ok(el, `missing ${sel}`); el.click(); };
  const key = (k) => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true }));
  return { window, document, storage, game, frame, $, click, key };
}

// Runs frames until done() or the limit; a choice event's auto-pause is undone.
function runUntil(page, done, { ms = 20000, limit = 200, speed = '3' } = {}) {
  for (let i = 0; i < limit && !done(); i++) {
    if (page.game.clock.speed === 0) page.key(speed);
    page.frame(ms);
  }
  assert.ok(done(), 'condition reached');
}

test('page has the layout roots', () => {
  const { document } = new JSDOM(HTML).window;
  for (const c of ['app', 'topbar', 'stage', 'inbox', 'metrics', 'tabs', 'panel-root']) {
    assert.ok(document.querySelector(`.${c}`), c);
  }
  assert.ok(document.querySelector('.stage canvas[width="960"][height="576"]'));
});

test('broken save starts a new game', () => {
  const page = boot({ storage: fakeStorage('{not json'), seed: 42 });
  assert.ok(page.$('.overlay').textContent.includes(UI_TEXT.start.brokenSave));
  assert.equal(page.$('.start-continue'), null);
  page.click('.start-new');
  assert.equal(page.$('.confirm'), null, 'nothing to keep: no confirmation');
  assert.equal(page.game.state.seed, 42);
  assert.equal(page.game.state.day, 0);
  assert.equal(page.game.clock.speed, 1);
  assert.ok(page.$('.overlay').hidden);
  const before = page.game.state.minute;
  page.frame(16); page.frame(2000);
  assert.ok(page.game.state.minute > before || page.game.state.pendingMinutes > 0, 'time runs');
});

test('continue loads the saved day', () => {
  const s = createGame(3);
  s.day = 12;
  const page = boot({ storage: savedStorage(s) });
  const d = view(s).date;
  assert.ok(page.$('.overlay').textContent.includes(`${d.month}월 ${d.date}일`));
  page.click('.start-continue');
  assert.equal(page.game.state.day, 12);
  assert.equal(page.game.state.seed, 3);
  assert.equal(page.game.clock.speed, 1);
  assert.ok(page.$('.overlay').hidden);
  assert.ok(page.$('.topbar').textContent.includes(`${d.month}월 ${d.date}일`));
});

test('new game over an existing save asks first', () => {
  const s = createGame(3);
  s.day = 12;
  const page = boot({ storage: savedStorage(s), seed: 9 });
  page.click('.start-new');
  assert.ok(page.$('.confirm').textContent.includes(UI_TEXT.start.overwriteTitle));
  page.click('.confirm-no');
  assert.equal(page.game.state, null);
  assert.ok(page.$('.start-continue'));
  page.click('.start-new');
  page.click('.confirm-yes');
  assert.equal(page.game.state.seed, 9);
  assert.equal(page.game.state.day, 0);
});

test('a first game shows Kim Miso and starts the clock when she is done', () => {
  const page = boot();
  page.click('.start-new');
  assert.ok(page.$('.intro'));
  assert.equal(page.game.clock.speed, 0);
  page.click('.intro-skip');
  assert.equal(page.game.clock.speed, 1);
  assert.ok(page.$('.overlay').hidden);
});

test('a day boundary saves once', () => {
  const page = boot();
  page.click('.start-new');
  page.click('.intro-skip');
  page.key('3');
  const writes = page.storage.writes.length;
  runUntil(page, () => page.game.state.day === 1);
  assert.equal(page.storage.writes.length - writes, 1);
  page.frame(16);
  assert.equal(page.storage.writes.length - writes, 1);
});

test('game over shows once and stops the clock; new game starts fresh', () => {
  const s = createGame(4);
  s.clients.forEach((c) => { c.active = false; });
  s.minute = 1410; // the last client check runs at midnight
  const page = boot({ storage: savedStorage(s), seed: 11 });
  page.click('.start-continue');
  runUntil(page, () => page.game.state.gameOver, { ms: 1000, speed: '1' });
  assert.equal(page.document.querySelectorAll('.game-over').length, 1);
  const text = page.$('.game-over').textContent;
  assert.ok(text.includes(UI_TEXT.gameOver.reason['game-over-clients']));
  assert.ok(text.includes('버틴 날: 1일'));
  assert.equal(page.game.clock.speed, 0);
  assert.equal(page.storage.writes.length, 1, 'saved when the game ended');
  const minute = page.game.state.minute;
  page.key(' ');
  for (let i = 0; i < 5; i++) page.frame(1000);
  assert.equal(page.document.querySelectorAll('.game-over').length, 1);
  assert.equal(page.storage.writes.length, 1);
  assert.equal(page.game.state.minute, minute);
  assert.equal(page.game.clock.speed, 0);
  page.click('.game-over-new');
  assert.equal(page.game.state.gameOver, null);
  assert.equal(page.game.state.day, 0);
  assert.equal(page.game.state.seed, 11);
  assert.equal(page.game.clock.speed, 1);
  assert.ok(page.$('.overlay').hidden);
  assert.equal(page.$('.game-over'), null);
});

test('a saved game that already ended opens on the game-over screen', () => {
  const s = createGame(4);
  s.gameOver = { kind: 'game-over-cash', day: 30 };
  const page = boot({ storage: savedStorage(s) });
  page.click('.start-continue');
  assert.equal(page.document.querySelectorAll('.game-over').length, 1);
  assert.ok(page.$('.game-over').textContent.includes(UI_TEXT.gameOver.reason['game-over-cash']));
  assert.ok(page.$('.game-over').textContent.includes('버틴 날: 31일'));
  assert.equal(page.game.clock.speed, 0);
});

test('space toggles pause', () => {
  const page = boot();
  page.click('.start-new');
  page.click('.intro-skip');
  assert.equal(page.game.clock.speed, 1);
  page.key(' ');
  assert.equal(page.game.clock.speed, 0);
  assert.equal(page.$('.topbar [data-speed="0"]').getAttribute('aria-pressed'), 'true');
  page.key(' ');
  assert.equal(page.game.clock.speed, 1);
  page.key('3');
  assert.equal(page.game.clock.speed, 3);
  page.key(' ');
  page.key(' ');
  assert.equal(page.game.clock.speed, 3, 'resumes at the last speed');
  assert.equal(page.$('.topbar [data-speed="3"]').getAttribute('aria-pressed'), 'true');
});

test('a build-done event triggers sparkles for helped people', () => {
  const s = createGame(5);
  s.people[0].stress = 90;
  s.research.build = { researchId: 'rest-room', minutesLeft: 30 };
  const page = boot({ storage: savedStorage(s) });
  page.click('.start-continue');
  runUntil(page, () => page.game.state.inbox.some((e) => e.id === 'build-done'), { ms: 1000, speed: '1' });
  assert.ok(page.game.sparkles.has(s.people[0].id));
  assert.ok(!page.game.sparkles.has(s.people[1].id) || s.people[1].stress >= 80);
});

test('the inbox and an open panel refresh after an action', async () => {
  const page = boot();
  page.click('.start-new');
  page.click('.intro-skip');
  page.key(' ');
  page.click('.tabs [data-tab="research"]');
  const start = '.panel-root [data-action="startResearch"][data-id="rest-room"]';
  assert.ok(page.$(start));
  pushEvent(page.game.state, { id: 'client-offer', clientId: CLIENTS[0].id, deadlineDay: 3 });
  assert.equal(page.$('.inbox [data-id="client-offer"]'), null);
  page.click(start);
  await Promise.resolve();
  assert.ok(page.$('.inbox [data-id="client-offer"]'), 'inbox redrawn from a fresh view');
  assert.equal(page.$(start), null, 'panel redrawn: research started');
});

test('clicking the open tab closes the panel', () => {
  const page = boot();
  page.click('.start-new');
  page.click('.intro-skip');
  page.click('.tabs [data-tab="people"]');
  assert.ok(page.$('.panel-root .panel-people'));
  assert.equal(page.$('.tabs [data-tab="people"]').getAttribute('aria-selected'), 'true');
  page.click('.tabs [data-tab="people"]');
  assert.equal(page.$('.panel-root .panel'), null);
});

test('a throwing storage never crashes the page', () => {
  const bad = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  const page = boot({ storage: bad });
  page.click('.start-new');
  page.click('.intro-skip');
  page.key('3');
  runUntil(page, () => page.game.state.day === 1);
});
