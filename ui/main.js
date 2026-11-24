// The page: start screen (continue / new game), the real-time loop, drawing,
// panels, inbox, autosave and the game-over screen. start() is the testable
// entry: index.html passes the browser's storage, clock and frame scheduler.
import { createGame, act, save, load, view, SAVE_KEY } from '../sim/game.js';
import { createClock } from './clock.js';
import { UI_TEXT, eventText, fill } from './text.js';
import { renderTopbar, renderMetrics } from './topbar.js';
import { TABS, renderPanel, resetPanels, selectPerson } from './panels.js';
import { renderInbox, renderAdvisor, firstRunIntro, resetInbox } from './inbox.js';
import { builder } from './dom.js';
import { EVENTS } from '../world/events.js';
import { stepActors } from '../render/actors.js';
import { createDrawer, TILE_PX, SCALE } from '../render/draw.js';

const REFRESH_MS = 250; // top bar, metrics and the open panel: at most 4 times a second
const SPARKLE_MS = 3000; // render/draw.js twinkles a sparkle this long
const MAX_WALK_MS = 1000; // a frame after a long stall moves people at most this far
const SPRITE_LIFT = 3 * SCALE; // render/draw.js draws a person 3 sprite pixels above the tile
const FORM_TAGS = new Set(['INPUT', 'SELECT', 'TEXTAREA']);

// Storage that never throws (blocked or full localStorage just means no save).
function safeStorage(storage) {
  const guard = (fn, fallback) => (...args) => {
    try { return fn(...args); } catch { return fallback; }
  };
  return {
    getItem: guard((k) => storage?.getItem(k) ?? null, null),
    setItem: guard((k, v) => { storage?.setItem(k, v); }, undefined),
    removeItem: guard((k) => { storage?.removeItem?.(k); }, undefined),
  };
}

// A selector that finds the same control after its root is rebuilt.
function focusSelector(root, el) {
  if (!el || el === root || !root.contains(el)) return null;
  const data = [...el.attributes].filter((a) => a.name.startsWith('data-'))
    .map((a) => `[${a.name}=${JSON.stringify(a.value)}]`).join('');
  const cls = el.classList[0] ? `.${el.classList[0]}` : '';
  if (!data && !cls) return null;
  const item = el.parentElement?.closest('[data-index]');
  const scope = item && root.contains(item) ? `[data-index=${JSON.stringify(item.dataset.index)}] ` : '';
  return `${scope}${el.tagName.toLowerCase()}${cls}${data}`;
}

// Rebuilds a root; a control focused from the keyboard gets its focus back.
function keepFocus(root, render, fromKeyboard) {
  const doc = root.ownerDocument;
  const sel = fromKeyboard ? focusSelector(root, doc.activeElement) : null;
  render();
  if (sel && !root.contains(doc.activeElement)) root.querySelector(sel)?.focus?.();
}

export function start({ document, storage, now, requestFrame, seedSource: pickSeed = () => Date.now() }) {
  // ?seed=N fixes the new-game seed. Only for the browser check; not documented.
  const fixed = Number(new URLSearchParams(document.defaultView?.location?.search ?? '').get('seed'));
  const seedSource = Number.isInteger(fixed) && fixed > 0 ? () => fixed : pickSeed;
  const h = builder(document);
  const store = safeStorage(storage);
  const $ = (sel) => document.querySelector(sel);
  const roots = {
    topbar: $('.topbar'),
    canvas: $('.stage canvas'),
    advisor: $('.advisor-root'),
    inbox: $('.inbox-root'),
    metrics: $('.metrics'),
    tabs: $('.tabs'),
    panel: $('.panel-root'),
    overlay: $('.overlay'),
  };
  const ctx = roots.canvas.getContext?.('2d') ?? null;
  const drawer = createDrawer((w, hgt) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = hgt;
    return c;
  });

  let game = null; // sim state
  let clock = null;
  let tab = null; // open tab or null
  let actors = [];
  let sparkles = new Map(); // person id -> time the sparkle started
  let overShown = false;
  let lastFrame = null;
  let lastRefresh = -Infinity;
  let keys = {}; // what each root was last drawn from
  let refreshQueued = false;
  let keyboardFocus = false; // the last input was a key, not a pointer
  let held = null; // the root a pointer is pressed in: not rebuilt until released

  // ---- overlay screens -------------------------------------------------------

  function showOverlay(...content) {
    roots.overlay.hidden = false;
    roots.overlay.replaceChildren(...content);
    roots.overlay.querySelector('button')?.focus?.();
  }

  function hideOverlay() {
    roots.overlay.replaceChildren();
    roots.overlay.hidden = true;
  }

  function readSave() {
    const raw = store.getItem(SAVE_KEY);
    const saved = raw === null ? null : load(store);
    return { raw, saved, broken: raw !== null && !saved };
  }

  function showStart() {
    const S = UI_TEXT.start;
    const { raw, saved, broken } = readSave();
    // An unreadable save: a new game starts at once (it replaces the save) and the
    // screen says so; the clock waits for the player's go.
    if (broken) { begin(createGame(seedSource()), { fresh: true, brokenSave: true }); return; }
    const date = saved && view(saved).date;
    const onNew = () => {
      if (saved) showConfirm();
      else begin(createGame(seedSource()), { intro: raw === null, fresh: true });
    };
    showOverlay(h('section', { class: 'screen start', role: 'dialog', 'aria-label': S.title },
      h('h1', {}, S.title),
      h('p', { class: 'subtitle' }, S.subtitle),
      h('p', {}, S.intro),
      h('div', { class: 'screen-actions' },
        saved && h('button', { type: 'button', class: 'start-continue', onclick: () => begin(saved) },
          S.continue, h('small', {}, fill(S.continueInfo, { year: date.year, month: date.month, day: date.date }))),
        h('button', { type: 'button', class: 'start-new', onclick: onNew }, S.newGame)),
      h('p', { class: 'help' }, S.autosave),
      h('p', { class: 'help' }, S.keys)));
  }

  function showConfirm() {
    const S = UI_TEXT.start;
    showOverlay(h('section', { class: 'screen confirm', role: 'alertdialog', 'aria-label': S.overwriteTitle },
      h('h2', {}, S.overwriteTitle),
      h('p', {}, S.overwriteText),
      h('div', { class: 'screen-actions' },
        h('button', { type: 'button', class: 'confirm-no', onclick: showStart }, S.overwriteNo),
        h('button', { type: 'button', class: 'confirm-yes', onclick: () => begin(createGame(seedSource()), { fresh: true }) }, S.overwriteYes))));
  }

  function showGameOver(v) {
    overShown = true;
    const G = UI_TEXT.gameOver;
    showOverlay(h('section', { class: 'screen game-over', role: 'dialog', 'aria-label': G.title },
      h('h2', {}, G.title),
      h('p', {}, G.reason[v.gameOver.kind] ?? ''),
      h('p', {}, fill(G.days, { days: v.gameOver.day + 1 })),
      h('p', {}, fill(G.lastDate, { year: v.date.year, month: v.date.month, day: v.date.date })),
      v.milestones.length > 0 && h('p', {}, fill(G.milestones, { n: v.milestones.length })),
      h('p', { class: 'help' }, G.thanks),
      h('div', { class: 'screen-actions' },
        h('button', { type: 'button', class: 'game-over-new', onclick: () => begin(createGame(seedSource()), { fresh: true }) }, G.newGame))));
  }

  // ---- game lifecycle --------------------------------------------------------

  function showBrokenSave() {
    const S = UI_TEXT.start;
    showOverlay(h('section', { class: 'screen start', role: 'dialog', 'aria-label': S.title },
      h('h1', {}, S.title),
      h('p', { class: 'subtitle' }, S.subtitle),
      h('p', { class: 'warn' }, S.brokenSave),
      h('div', { class: 'screen-actions' },
        h('button', { type: 'button', class: 'start-play', onclick: () => { hideOverlay(); play(); } }, UI_TEXT.intro.done)),
      h('p', { class: 'help' }, S.autosave),
      h('p', { class: 'help' }, S.keys)));
  }

  function begin(state, { intro = false, fresh = false, brokenSave = false } = {}) {
    game = state;
    clock = createClock({ state });
    resetPanels();
    resetInbox();
    actors = [];
    sparkles = new Map();
    overShown = false;
    keys = {};
    roots.advisor.replaceChildren();
    openTab(null);
    if (fresh) save(game, store);
    const v = view(game);
    refreshAll(v);
    if (v.gameOver) { showGameOver(v); return; }
    if (brokenSave) { showBrokenSave(); return; }
    if (intro) {
      roots.overlay.hidden = false;
      firstRunIntro(roots.overlay, () => { hideOverlay(); play(); });
      return;
    }
    hideOverlay();
    play();
  }

  function play() {
    clock.setSpeed(1);
    renderTopbar(roots.topbar, view(game), clock);
  }

  // ---- panels, bars and inbox -----------------------------------------------

  // Every action goes through here; after an ok action the open panel and the
  // inbox are redrawn from a fresh view once the caller's handler has finished.
  function onAct(action) {
    const r = act(game, action);
    if (r?.ok && !refreshQueued) {
      refreshQueued = true;
      queueMicrotask(() => {
        refreshQueued = false;
        if (game) refreshAll(view(game));
      });
    }
    return r;
  }

  const getView = () => view(game);

  function onOpen(event) {
    renderAdvisor(roots.advisor, event, { drawer });
  }

  function drawPanel(v) {
    if (!tab) { roots.panel.replaceChildren(); return; }
    keepFocus(roots.panel, () => renderPanel(roots.panel, v, tab, onAct, { onClose: () => openTab(null) }), keyboardFocus);
    keys.panel = `${tab}|${v.day}:${v.minute}`;
  }

  function drawInbox(v) {
    keepFocus(roots.inbox, () => renderInbox(roots.inbox, v, onAct, { onOpen, getView }), keyboardFocus);
    keys.inbox = inboxKey(v);
  }

  // Day (deadlines) and every item's read/answered state.
  const inboxKey = (v) => `${v.day}|${v.inbox.map((e) => `${e.index}${e.seen ? 's' : ''}${e.resolved ? 'r' : ''}`).join(',')}`;

  const waiting = (v) => v.inbox.some((e) => !e.resolved && EVENTS[e.id]?.choices);
  const barsKey = (v) => `${v.day}:${v.minute}|${clock.speed}|${clock.autoPaused}|${waiting(v)}`;

  function drawBars(v) {
    renderTopbar(roots.topbar, v, clock);
    renderMetrics(roots.metrics, v);
    keys.bars = barsKey(v);
  }

  function refreshAll(v) {
    drawBars(v);
    drawInbox(v);
    drawPanel(v);
  }

  const selectOpen = () => {
    const el = document.activeElement;
    return el?.tagName === 'SELECT' && roots.panel.contains(el);
  };

  // A press in progress would lose its click if its button were replaced.
  const free = (root) => held !== root;

  function refresh(v, t) {
    if (keys.inbox !== inboxKey(v) && free(roots.inbox)) drawInbox(v);
    if (t - lastRefresh < REFRESH_MS) return;
    lastRefresh = t;
    if (keys.bars !== barsKey(v) && free(roots.topbar) && free(roots.metrics)) drawBars(v);
    if (tab && keys.panel !== `${tab}|${v.day}:${v.minute}` && !selectOpen() && free(roots.panel)) drawPanel(v);
  }

  for (const root of [roots.topbar, roots.metrics, roots.inbox, roots.panel]) {
    root.addEventListener('pointerdown', () => { held = root; });
    root.addEventListener('pointerleave', () => { if (held === root) held = null; });
  }
  const release = () => { held = null; };
  document.addEventListener('pointerup', release);
  document.addEventListener('pointercancel', release);
  document.addEventListener('pointerdown', () => { keyboardFocus = false; }, true);

  function openTab(name) {
    tab = name;
    for (const b of roots.tabs.querySelectorAll('[data-tab]')) {
      b.setAttribute('aria-selected', String(b.dataset.tab === tab));
    }
    if (game) drawPanel(view(game));
    else roots.panel.replaceChildren();
  }

  roots.tabs.replaceChildren(...TABS.map((name) => h('button', {
    type: 'button', role: 'tab', 'data-tab': name, 'aria-selected': 'false', title: UI_TEXT.tabs[name].tip,
    onclick: () => openTab(tab === name ? null : name),
  }, UI_TEXT.tabs[name].name)));

  // ---- canvas ----------------------------------------------------------------

  function collectSparkles(v, newEvents, t) {
    for (const index of newEvents) {
      const e = v.inbox.find((x) => x.index === index);
      if (e?.id !== 'build-done') continue;
      for (const helped of e.data?.helped ?? []) sparkles.set(helped.personId, t);
    }
    for (const [id, since] of sparkles) if (t - since >= SPARKLE_MS) sparkles.delete(id);
  }

  function showNewAdvice(v, newEvents) {
    const fresh = newEvents.map((i) => v.inbox.find((x) => x.index === i)).filter((e) => e && eventText(e).advisor);
    if (fresh.length > 0) renderAdvisor(roots.advisor, fresh.at(-1), { drawer });
  }

  function draw(v, t) {
    if (!ctx) return;
    drawer.drawOffice(ctx, undefined, v.research, v.office);
    drawer.drawActors(ctx, actors, v.people, t);
    drawer.drawBubbles(ctx, actors, v.people, { sparkles, timeMs: t });
  }

  roots.canvas.addEventListener('click', (e) => {
    if (!game) return;
    const rect = roots.canvas.getBoundingClientRect();
    const sx = rect.width ? roots.canvas.width / rect.width : 1;
    const sy = rect.height ? roots.canvas.height / rect.height : 1;
    const x = (e.clientX - rect.left) * sx;
    const y = (e.clientY - rect.top) * sy + SPRITE_LIFT;
    const hit = actors
      .filter((a) => !a.gone && x >= a.x * TILE_PX && x < (a.x + 1) * TILE_PX && y >= a.y * TILE_PX && y < (a.y + 1) * TILE_PX)
      .sort((l, r) => r.y - l.y)[0]; // the one drawn on top
    if (!hit) return;
    selectPerson(hit.id);
    if (tab === 'people') drawPanel(view(game));
    else openTab('people');
  });

  // ---- keyboard --------------------------------------------------------------

  // Space pauses everywhere but in form fields; a focused button must not
  // also take it as a click (buttons activate on Space's keyup).
  const spaceIsPause = (e) => e.key === ' ' && game && roots.overlay.hidden && !FORM_TAGS.has(e.target?.tagName)
    && !e.ctrlKey && !e.metaKey && !e.altKey;
  document.addEventListener('keyup', (e) => { if (spaceIsPause(e)) e.preventDefault(); });

  document.addEventListener('keydown', (e) => {
    keyboardFocus = true;
    if (!game || !roots.overlay.hidden || e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = e.target?.tagName;
    if (FORM_TAGS.has(tag)) return;
    if (e.key === ' ') {
      e.preventDefault();
      if (e.repeat) return;
      if (clock.speed > 0) clock.setSpeed(0);
      else clock.resume();
    } else if (e.key === '1' || e.key === '2' || e.key === '3') {
      clock.setSpeed(Number(e.key));
    } else {
      return;
    }
    drawBars(view(game));
  });

  // ---- loop ------------------------------------------------------------------

  function frame() {
    const t = now();
    const dt = lastFrame === null ? 0 : Math.min(MAX_WALK_MS, Math.max(0, t - lastFrame));
    lastFrame = t;
    if (game) {
      const r = clock.tick(t);
      if (r.dayEnded) save(game, store);
      const v = view(game);
      if (v.gameOver && !overShown) {
        clock.setSpeed(0);
        save(game, store); // the game-over day never ends, so save it here
        showGameOver(v);
      }
      collectSparkles(v, r.newEvents, t);
      if (r.newEvents.length > 0) showNewAdvice(v, r.newEvents);
      actors = stepActors(actors, v.people, dt, undefined, v.office?.seats);
      draw(v, t);
      refresh(v, t);
    }
    requestFrame(frame);
  }

  if (ctx) drawer.drawOffice(ctx);
  showStart();
  requestFrame(frame);

  return {
    get state() { return game; },
    get clock() { return clock; },
    get sparkles() { return sparkles; },
  };
}
