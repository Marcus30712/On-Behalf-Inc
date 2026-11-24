// v1.2 Task 7: the screen for office expansion and weekend operations.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createGame, act, view, OFFICE_LEVELS, HIRE_COST } from '../sim/game.js';
import { UI_TEXT, fill } from '../ui/text.js';
import { formatMoney } from '../ui/money.js';
import { renderPanel, resetPanels, TABS } from '../ui/panels.js';
import { renderTopbar, renderMetrics } from '../ui/topbar.js';
import { createClock, gameMinutesFor } from '../ui/clock.js';

const O = UI_TEXT.office;
const WEEKEND = 'baram-delivery'; // the weekend-only client (world/clients.js)
const SAT = 5; // day 5 is the first Saturday (day 0 is a Monday)

function makeRoot() {
  resetPanels();
  const { document } = new JSDOM('<!DOCTYPE html><div id="root"></div>').window;
  return document.getElementById('root');
}

const click = (el) => el.dispatchEvent(new el.ownerDocument.defaultView.MouseEvent('click', { bubbles: true }));
const stage = (root, level) => root.querySelector(`[data-stage="${level}"]`);

function withWeekendClient(seed = 11) {
  const s = createGame(seed);
  s.clients.push({ id: WEEKEND, satisfaction: 70, active: true });
  return s;
}

// ---- office section in the hiring tab ----------------------------------------

test('the office section lives in the hiring tab; there are still seven tabs', () => {
  assert.equal(TABS.length, 7);
  assert.ok(!TABS.includes('office'));
  const state = createGame(11);
  const root = makeRoot();
  renderPanel(root, view(state), 'hiring', (a) => act(state, a));
  const office = root.querySelector('.office');
  assert.ok(office, 'office section');
  assert.ok(office.textContent.includes(O.title));
  assert.ok(office.textContent.includes(O.help));
  assert.ok(office.textContent.includes(fill(O.seatsNow, { seats: 8 })));
  const one = stage(root, 1);
  assert.ok(one.textContent.includes(O.stages[1].name));
  assert.ok(one.textContent.includes(O.stages[1].blurb));
  assert.ok(one.textContent.includes(fill(O.cost, { cost: formatMoney(30000) })));
  assert.ok(one.textContent.includes(fill(O.buildTime, { days: 10 })));
  assert.ok(one.textContent.includes(fill(O.rent, { rent: formatMoney(3000) })));
  assert.ok(one.textContent.includes(fill(O.seatsAfter, { seats: 12 })));
  assert.ok(one.querySelector('button[data-action="startExpansion"]'));
  const two = stage(root, 2);
  assert.ok(two.textContent.includes(O.locked));
  assert.equal(two.querySelector('button'), null);
  assert.ok(!office.textContent.includes(fill(O.rentTotal, { rent: formatMoney(0) })), 'no rent line before any expansion');
});

test('starting an expansion asks first; yes starts it, no changes nothing', () => {
  const state = createGame(11);
  state.cash = 100000;
  const root = makeRoot();
  const calls = [];
  const onAct = (a) => { calls.push(a); return act(state, a); };
  renderPanel(root, view(state), 'hiring', onAct);
  click(root.querySelector('button[data-action="startExpansion"]'));
  assert.equal(calls.length, 0, 'nothing happens before the answer');
  assert.ok(root.textContent.includes(fill(O.confirmTitle, { stage: O.stages[1].name })), root.textContent);
  assert.ok(root.textContent.includes(fill(O.confirmText, { cost: formatMoney(30000) })));

  click(root.querySelector('button[data-action="cancelExpansion"]'));
  assert.equal(calls.length, 0);
  assert.ok(!root.textContent.includes(fill(O.confirmTitle, { stage: O.stages[1].name })));
  assert.equal(state.office?.build ?? null, null);

  click(root.querySelector('button[data-action="startExpansion"]'));
  click(root.querySelector('button[data-action="confirmExpansion"]'));
  assert.deepEqual(calls, [{ type: 'startExpansion' }]);
  assert.deepEqual(state.office.build, { level: 1, workdaysLeft: 10 });
  renderPanel(root, view(state), 'hiring', onAct);
  assert.ok(stage(root, 1).textContent.includes(fill(O.building, { days: 10 })));
  assert.equal(root.querySelector('button[data-action="startExpansion"]'), null);
  assert.ok(!root.textContent.includes(fill(O.confirmTitle, { stage: O.stages[1].name })), 'the question is gone');
});

test('expansion refusals use the office copy, not the hiring cost', () => {
  const state = createGame(11);
  state.cash = 0;
  const root = makeRoot();
  const onAct = (a) => act(state, a);
  renderPanel(root, view(state), 'hiring', onAct);
  click(root.querySelector('button[data-action="startExpansion"]'));
  click(root.querySelector('button[data-action="confirmExpansion"]'));
  const noCash = fill(UI_TEXT.refuse.office['no-cash'], { cost: formatMoney(30000) });
  assert.ok(root.textContent.includes(noCash), root.textContent);
  assert.ok(!root.textContent.includes(fill(UI_TEXT.refuse['no-cash'], { cost: formatMoney(HIRE_COST) })), 'not the hiring sentence');
  assert.equal(state.office?.build ?? null, null);

  for (const reason of ['building', 'max-level']) {
    renderPanel(root, view(state), 'hiring', () => ({ ok: false, reason }));
    click(root.querySelector('button[data-action="startExpansion"]'));
    click(root.querySelector('button[data-action="confirmExpansion"]'));
    assert.equal(root.querySelector('.notice').textContent, UI_TEXT.refuse[reason]);
  }
});

test('after expansions: done stages, rent this month, seats, and all done', () => {
  const state = createGame(11);
  state.office = { level: 1, build: null };
  const root = makeRoot();
  renderPanel(root, view(state), 'hiring', (a) => act(state, a));
  assert.ok(stage(root, 1).textContent.includes(O.done));
  assert.ok(root.textContent.includes(fill(O.seatsNow, { seats: 12 })));
  assert.ok(root.textContent.includes(fill(O.rentTotal, { rent: formatMoney(3000) })));
  assert.ok(stage(root, 2).querySelector('button[data-action="startExpansion"]'));
  assert.ok(stage(root, 2).textContent.includes(fill(O.seatsAfter, { seats: 16 })));
  assert.ok(root.textContent.includes(fill(UI_TEXT.hiring.seats, { n: 12 - 8 })), 'four free seats');

  state.office = { level: 2, build: null };
  renderPanel(root, view(state), 'hiring', (a) => act(state, a));
  assert.ok(root.textContent.includes(O.allDone));
  assert.ok(root.textContent.includes(fill(O.rentTotal, { rent: formatMoney(OFFICE_LEVELS[1].rent + OFFICE_LEVELS[2].rent) })));
  assert.equal(root.querySelector('button[data-action="startExpansion"]'), null);
});

test('the tasks seat counter reads the office seats', () => {
  const state = createGame(11);
  const agentsOnPhone = state.people.filter((p) => p.role === 'agent' && state.assignment[p.id]?.kind === 'phone').length;
  const root = makeRoot();
  renderPanel(root, view(state), 'tasks', (a) => act(state, a));
  assert.equal(root.querySelector('.seats').textContent.split(' · ')[0], fill(UI_TEXT.tasks.seatsOf, { n: agentsOnPhone, seats: 8 }));
  state.office = { level: 1, build: null };
  renderPanel(root, view(state), 'tasks', (a) => act(state, a));
  assert.equal(root.querySelector('.seats').textContent.split(' · ')[0], fill(UI_TEXT.tasks.seatsOf, { n: agentsOnPhone, seats: 12 }));
});

// ---- roster with a weekend client ------------------------------------------------

test('roster: a weekend client adds Sat and Sun columns that cycle weekend → off', () => {
  const state = withWeekendClient();
  const person = state.people[0];
  const root = makeRoot();
  const calls = [];
  const onAct = (a) => { calls.push(a); return act(state, a); };
  const cell = (w) => root.querySelector(`[data-person="${person.id}"][data-weekday="${w}"]`);
  renderPanel(root, view(state), 'roster', onAct);
  assert.equal(root.querySelectorAll('thead th').length, 8, 'name + Mon..Sun');
  assert.ok(root.textContent.includes(UI_TEXT.roster.weekendHelp));
  assert.equal(cell(SAT).textContent, UI_TEXT.shift.off.short);
  for (const next of ['weekend', 'off', 'weekend']) {
    click(cell(SAT));
    assert.deepEqual(calls.at(-1), { type: 'setRoster', personId: person.id, weekday: SAT, shift: next });
    assert.equal(state.roster[person.id][SAT], next, 'accepted by the sim');
    renderPanel(root, view(state), 'roster', onAct);
    assert.equal(cell(SAT).textContent, UI_TEXT.shift[next].short);
  }
  // Weekday cells still cycle early → late → off.
  const mon = state.roster[person.id][0];
  click(cell(0));
  assert.equal(calls.at(-1).shift, { early: 'late', late: 'off', off: 'early' }[mon]);
  // Weekend head count under Saturday and Sunday.
  renderPanel(root, view(state), 'roster', onAct);
  const counts = [...root.querySelectorAll('tfoot [data-weekend-count]')].map((c) => c.textContent);
  assert.deepEqual(counts, [fill(UI_TEXT.roster.weekendCount, { n: 1 }), fill(UI_TEXT.roster.weekendCount, { n: 0 })]);
});

test('roster: six or more days in a week warn on that person’s row', () => {
  const state = withWeekendClient();
  const [busy, calm] = state.people.filter((p) => p.role === 'agent');
  for (let w = 0; w < 5; w++) state.roster[busy.id][w] = 'early';
  state.roster[busy.id][SAT] = 'weekend';
  state.roster[calm.id][SAT] = 'weekend'; // calm keeps a weekday off below
  state.roster[calm.id][0] = 'off';
  const root = makeRoot();
  renderPanel(root, view(state), 'roster', (a) => act(state, a));
  const row = (p) => root.querySelector(`tr[data-person="${p.id}"]`);
  assert.ok(row(busy).classList.contains('six-days'));
  assert.ok(row(busy).textContent.includes(fill(UI_TEXT.roster.sixDaysShort, { n: 6 })));
  assert.ok(row(busy).textContent.includes(UI_TEXT.roster.sixDays));
  assert.ok(!row(calm).classList.contains('six-days'));
  assert.ok(!row(calm).textContent.includes(UI_TEXT.roster.sixDays));

  // Without a weekend client the center is shut at the weekend: no Sat/Sun, no warning.
  state.clients.find((c) => c.id === WEEKEND).active = false;
  renderPanel(root, view(state), 'roster', (a) => act(state, a));
  assert.equal(root.querySelectorAll('thead th').length, 6);
  assert.ok(!root.textContent.includes(UI_TEXT.roster.sixDays));
  assert.ok(!root.textContent.includes(UI_TEXT.roster.weekendHelp));
});

// ---- metrics strip, top bar, clock ------------------------------------------------

test('metrics: a weekend-only client shows 주말 운영 on weekdays and numbers at the weekend', () => {
  const state = withWeekendClient();
  const root = makeRoot();
  renderMetrics(root, view(state));
  const item = () => root.querySelector(`[data-client="${WEEKEND}"]`);
  assert.ok(item().textContent.includes(UI_TEXT.metrics.weekendOnly));
  assert.equal(item().getAttribute('title'), UI_TEXT.metrics.weekendOnlyTip);
  assert.ok(!item().textContent.includes(UI_TEXT.metrics.serviceLevel));
  const weekday = root.querySelector('[data-client="gureum-travel"]');
  assert.ok(weekday.textContent.includes(UI_TEXT.metrics.serviceLevel), 'weekday clients unchanged');

  state.day = SAT;
  renderMetrics(root, view(state));
  assert.ok(item().textContent.includes(UI_TEXT.metrics.serviceLevel));
  assert.ok(!item().textContent.includes(UI_TEXT.metrics.weekendOnly));
});

test('top bar: 주말 운영 instead of 주말 휴무 on an open weekend', () => {
  const state = withWeekendClient();
  state.day = SAT;
  state.minute = 600;
  const clock = createClock({ state });
  const root = makeRoot();
  renderTopbar(root, view(state), clock);
  assert.ok(root.textContent.includes(UI_TEXT.topbar.weekendOpen));
  assert.ok(!root.textContent.includes(UI_TEXT.topbar.weekend));
  state.minute = 1100; // after the weekend shift
  renderTopbar(root, view(state), clock);
  assert.ok(root.querySelector('.shut').textContent.includes(UI_TEXT.topbar.closed));

  const plain = createGame(11);
  plain.day = SAT;
  plain.minute = 600;
  renderTopbar(root, view(plain), createClock({ state: plain }));
  assert.equal(root.querySelector('.shut').textContent, UI_TEXT.topbar.weekend);
});

test('clock: an open weekend runs at the opening-hours rate', () => {
  const open = { day: SAT, minute: 600, flags: { weekend: true } };
  assert.equal(gameMinutesFor(1000, 1, open), 6);
  assert.equal(gameMinutesFor(1000, 1, { ...open, minute: 1100 }), 120, 'after 18:00');
  assert.equal(gameMinutesFor(1000, 1, { ...open, flags: { weekend: false } }), 120);
  assert.equal(gameMinutesFor(1000, 1, { day: SAT, minute: 600 }), 120, 'no flags: shut as before');
});

// ---- fix round 1: keyboard focus in the expansion question -------------------------

test('the expansion question takes focus and gives it back', () => {
  const state = createGame(11);
  state.cash = 0; // the first 네 is refused
  const root = makeRoot();
  const doc = root.ownerDocument;
  const onAct = (a) => act(state, a);
  const btn = (a) => root.querySelector(`button[data-action="${a}"]`);
  renderPanel(root, view(state), 'hiring', onAct);

  btn('startExpansion').focus();
  click(btn('startExpansion'));
  assert.equal(doc.activeElement, btn('confirmExpansion'), 'opening the question focuses 네');
  assert.ok(doc.activeElement.closest('[role="alertdialog"]'));

  click(btn('cancelExpansion'));
  assert.equal(doc.activeElement, btn('startExpansion'), '아니요 goes back to 공사 시작');

  click(btn('startExpansion'));
  click(btn('confirmExpansion'));
  assert.ok(root.textContent.includes(fill(UI_TEXT.refuse.office['no-cash'], { cost: formatMoney(30000) })));
  assert.equal(doc.activeElement, btn('startExpansion'), 'a refused 네 goes back to 공사 시작');

  state.cash = 100000;
  renderPanel(root, view(state), 'hiring', onAct);
  click(btn('startExpansion'));
  click(btn('confirmExpansion'));
  assert.deepEqual(state.office.build, { level: 1, workdaysLeft: 10 });
  assert.equal(doc.activeElement, stage(root, 1), 'an ok 네 focuses the stage card');
  assert.equal(btn('startExpansion'), null, 'no start button flashes back from the stale view');
  assert.equal(root.querySelector('[role="alertdialog"]'), null, 'the question is gone');
});

test('the expansion question closes when another tab renders', () => {
  const state = createGame(11);
  const root = makeRoot();
  const onAct = (a) => act(state, a);
  renderPanel(root, view(state), 'hiring', onAct);
  click(root.querySelector('button[data-action="startExpansion"]'));
  assert.ok(root.querySelector('[role="alertdialog"]'));
  renderPanel(root, view(state), 'roster', onAct);
  renderPanel(root, view(state), 'hiring', onAct);
  assert.equal(root.querySelector('[role="alertdialog"]'), null);
});
