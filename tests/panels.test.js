import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createGame, act, view, advance, HIRE_COST } from '../sim/game.js';
import { UI_TEXT, fill } from '../ui/text.js';
import { formatMoney } from '../ui/money.js';
import { renderPanel, selectPerson, resetPanels, TABS } from '../ui/panels.js';
import { renderTopbar, renderMetrics } from '../ui/topbar.js';
import { createClock } from '../ui/clock.js';
import { pushEvent } from '../sim/events.js';
import { CLIENTS } from '../world/clients.js';

function makeRoot() {
  resetPanels(); // no panel state carries over between tests
  const { document } = new JSDOM('<!DOCTYPE html><div id="root"></div>').window;
  return document.getElementById('root');
}

const click = (el) => el.dispatchEvent(new el.ownerDocument.defaultView.MouseEvent('click', { bubbles: true }));

test('roster cell cycles early → late → off and calls setRoster', () => {
  const state = createGame(11);
  const person = state.people.find((p) => state.roster[p.id]?.[0] === 'early');
  assert.ok(person, 'someone works early on Monday');
  const root = makeRoot();
  const calls = [];
  const onAct = (a) => { calls.push(a); return act(state, a); };
  const cell = () => root.querySelector(`[data-person="${person.id}"][data-weekday="0"]`);

  renderPanel(root, view(state), 'roster', onAct);
  assert.equal(cell().textContent, UI_TEXT.shift.early.short);
  for (const next of ['late', 'off', 'early']) {
    click(cell());
    assert.deepEqual(calls.at(-1), { type: 'setRoster', personId: person.id, weekday: 0, shift: next });
    assert.equal(state.roster[person.id][0], next);
    renderPanel(root, view(state), 'roster', onAct);
    assert.equal(cell().textContent, UI_TEXT.shift[next].short);
  }
  assert.equal(root.querySelectorAll('thead th').length, 6, 'name + Mon..Fri');
});

test('refused action shows the reason text and changes nothing', () => {
  const state = createGame(11);
  state.cash = 0;
  state.people.splice(state.people.findIndex((p) => p.role === 'agent'), 1); // a free seat
  const before = JSON.stringify(state);
  const root = makeRoot();
  const onAct = (a) => act(state, a);
  renderPanel(root, view(state), 'hiring', onAct);
  click(root.querySelector('button[data-action="startHiring"]'));
  assert.equal(JSON.stringify(state), before);
  const msg = fill(UI_TEXT.refuse['no-cash'], { cost: formatMoney(HIRE_COST) });
  assert.ok(root.textContent.includes(msg), root.textContent);

  // An unknown reason falls back to the default refusal.
  renderPanel(root, view(state), 'research', () => ({ ok: false, reason: 'no-such-reason' }));
  click(root.querySelector('button[data-action="startResearch"]'));
  assert.ok(root.textContent.includes(UI_TEXT.refuse.default));
});

test('research panel warns when nobody is assigned to research', () => {
  const state = createGame(11);
  const root = makeRoot();
  const onAct = (a) => act(state, a);
  renderPanel(root, view(state), 'research', onAct);
  assert.ok(root.textContent.includes(UI_TEXT.research.nobody));
  assert.equal(root.querySelectorAll('[data-research]').length, 4);

  const lead = state.people.find((p) => p.role === 'lead');
  assert.equal(act(state, { type: 'assign', personId: lead.id, kind: 'research' }).ok, true);
  renderPanel(root, view(state), 'research', onAct);
  assert.ok(!root.textContent.includes(UI_TEXT.research.nobody));
  assert.ok(root.textContent.includes(fill(UI_TEXT.research.assigned, { n: 1 })));
});

test('people panel survives a person who left and an inactive client', () => {
  const state = createGame(11);
  const gone = state.people.pop();
  const phoneAgent = state.people.find((p) => state.assignment[p.id]?.kind === 'phone');
  const ended = state.clients.find((c) => c.id === state.assignment[phoneAgent.id].clientId);
  ended.active = false;
  const v = view(state);
  const root = makeRoot();
  const onAct = (a) => act(state, a);

  for (const tab of TABS) assert.doesNotThrow(() => renderPanel(root, v, tab, onAct), tab);

  renderPanel(root, v, 'people', onAct);
  click(root.querySelector(`[data-person="${phoneAgent.id}"]`));
  assert.ok(root.textContent.includes(UI_TEXT.card.traits), 'card opened from the list');

  selectPerson(gone.id);
  renderPanel(root, v, 'people', onAct);
  assert.ok(root.textContent.includes(UI_TEXT.people.leftNote));

  renderPanel(root, v, 'tasks', onAct);
  assert.ok(root.textContent.includes(UI_TEXT.tasks.clientEnded));
  renderPanel(root, v, 'clients', onAct);
  assert.ok(root.textContent.includes(UI_TEXT.clients.ended));
  selectPerson(null);
});

test('metrics show — when nothing has happened today', () => {
  const state = createGame(11);
  const root = makeRoot();
  const v = view(state);
  renderMetrics(root, v);
  const items = root.querySelectorAll('[data-client]');
  assert.equal(items.length, v.clients.filter((c) => c.active).length);
  for (const item of items) {
    assert.ok(item.textContent.includes(UI_TEXT.metrics.serviceLevel));
    assert.ok(item.textContent.includes(UI_TEXT.metrics.none));
  }
});

test('top bar shows date, speed buttons with aria-pressed, cash and grade tip', () => {
  const state = createGame(11);
  const clock = createClock({ state });
  const root = makeRoot();
  const v = view(state);
  renderTopbar(root, v, clock);
  assert.ok(root.textContent.includes(formatMoney(v.cash)));
  const pressed = () => [...root.querySelectorAll('button[data-speed]')].map((b) => b.getAttribute('aria-pressed'));
  assert.deepEqual(pressed(), ['true', 'false', 'false', 'false']);
  click(root.querySelector('button[data-speed="2"]'));
  assert.equal(clock.speed, 2);
  assert.deepEqual(pressed(), ['false', 'false', 'true', 'false']);
  const grade = root.querySelector('[data-grade]');
  assert.equal(grade.getAttribute('title'), UI_TEXT.grade[v.reputation].text);
});

test('seat counter counts agents on the phone only', () => {
  const state = createGame(11);
  const lead = state.people.find((p) => p.role === 'lead');
  assert.equal(act(state, { type: 'assign', personId: lead.id, kind: 'phone', clientId: state.clients[0].id }).ok, true);
  const agentsOnPhone = state.people.filter((p) => p.role === 'agent' && state.assignment[p.id]?.kind === 'phone').length;
  const root = makeRoot();
  renderPanel(root, view(state), 'tasks', (a) => act(state, a));
  assert.equal(root.querySelector('.seats').textContent.split(' · ')[0], fill(UI_TEXT.tasks.seatsOf, { n: agentsOnPhone, seats: view(state).office.seats }));
});

test('a refusal notice clears once time passes or an action succeeds', () => {
  const state = createGame(11);
  const root = makeRoot();
  const onAct = (a) => act(state, a);
  const refused = () => renderPanel(root, view(state), 'research', () => ({ ok: false, reason: 'busy' }));
  refused();
  click(root.querySelector('button[data-action="startResearch"]'));
  renderPanel(root, view(state), 'research', onAct);
  assert.ok(root.textContent.includes(UI_TEXT.refuse.busy), 'kept while the clock has not moved');
  advance(state, 30);
  renderPanel(root, view(state), 'research', onAct);
  assert.ok(!root.textContent.includes(UI_TEXT.refuse.busy), 'cleared after time passed');

  refused();
  click(root.querySelector('button[data-action="startResearch"]'));
  renderPanel(root, view(state), 'roster', onAct);
  click(root.querySelector('[data-weekday="0"]')); // a successful action on another tab
  renderPanel(root, view(state), 'research', onAct);
  assert.ok(!root.textContent.includes(UI_TEXT.refuse.busy), 'cleared after any ok action');
});

test('resetPanels closes the open card and forgets notices', () => {
  const state = createGame(11);
  state.people.splice(state.people.findLastIndex((p) => p.role === 'agent'), 1); // a free seat: the start button shows
  const root = makeRoot();
  const onAct = (a) => act(state, a);
  selectPerson(state.people[0].id);
  renderPanel(root, view(state), 'hiring', () => ({ ok: false, reason: 'already' }));
  click(root.querySelector('button[data-action="startHiring"]'));
  resetPanels();
  renderPanel(root, view(state), 'people', onAct);
  assert.ok(root.querySelector('.person-list'), 'list, not a card');
  renderPanel(root, view(state), 'hiring', onAct);
  assert.ok(!root.textContent.includes(UI_TEXT.refuse.already));
});

test('style.css lets the canvas set the stage row height and hides no overflow', async () => {
  const { readFile } = await import('node:fs/promises');
  const css = await readFile(new URL('../style.css', import.meta.url), 'utf8');
  const inbox = css.match(/\.inbox\s*\{([^}]*)\}/)[1];
  assert.match(inbox, /height:\s*0/);
  assert.match(inbox, /min-height:\s*100%/);
  assert.match(inbox, /overflow-y:\s*auto/);
  assert.doesNotMatch(css, /overflow-x:\s*hidden/);
});

test('hiring with no free seat shows the no-seats state and no start button', () => {
  const state = createGame(11);
  const root = makeRoot();
  const v = view(state);
  assert.equal(v.people.filter((p) => p.role === 'agent').length >= v.office.seats, true, 'seats full at start');
  assert.equal(v.hiring ?? null, null);
  renderPanel(root, v, 'hiring', (a) => act(state, a));
  assert.equal(root.querySelector('.state').textContent, UI_TEXT.hiring.noSeats);
  assert.ok(!root.textContent.includes(UI_TEXT.hiring.state.ready));
  assert.equal(root.querySelector('button[data-action="startHiring"]'), null);
  assert.equal(root.textContent.split(UI_TEXT.hiring.noSeats).length - 1, 1, 'said once');
});

test('people list shows the shift name before a shift starts, 퇴근 after it ends', () => {
  const state = createGame(11);
  const person = state.people.find((p) => state.roster[p.id]?.[0] === 'late' && p.health.kind === 'well');
  assert.ok(person, 'someone works late on Monday');
  const root = makeRoot();
  const row = () => root.querySelector(`[data-person="${person.id}"]`).textContent;
  state.minute = 8 * 60;
  renderPanel(root, view(state), 'people', (a) => act(state, a));
  assert.ok(row().includes(UI_TEXT.shift.late.full), row());
  assert.ok(!row().includes(UI_TEXT.activity.off), row());
  state.minute = 22 * 60;
  renderPanel(root, view(state), 'people', (a) => act(state, a));
  assert.ok(row().includes(UI_TEXT.activity.off), row());
});

test('metrics strip shows each client target next to its service level', () => {
  const state = createGame(11);
  const root = makeRoot();
  const v = view(state);
  renderMetrics(root, v);
  for (const c of v.clients.filter((x) => x.active)) {
    const item = root.querySelector(`[data-client="${c.id}"]`);
    assert.ok(item.textContent.includes(`(${UI_TEXT.metrics.target} ${c.slTarget.pct}%)`), item.textContent);
  }
});

test('top bar says the clock waits for an answer after an auto-pause', () => {
  const state = createGame(11);
  const root = makeRoot();
  pushEvent(state, { id: 'client-offer', clientId: CLIENTS[0].id });
  const v = view(state);
  const clock = { speed: 0, autoPaused: true, setSpeed() {} };
  renderTopbar(root, v, clock);
  assert.ok(root.textContent.includes(UI_TEXT.speed.autoPaused));
  renderTopbar(root, v, { ...clock, autoPaused: false });
  assert.ok(!root.textContent.includes(UI_TEXT.speed.autoPaused));
  assert.ok(!root.textContent.includes('false'), root.textContent);
});

test('a panel rendered with onClose has a close button that calls it', () => {
  const state = createGame(11);
  const root = makeRoot();
  let closed = 0;
  renderPanel(root, view(state), 'people', (a) => act(state, a), { onClose: () => { closed++; } });
  const btn = root.querySelector('button.panel-close');
  assert.ok(btn, 'close button');
  assert.equal(btn.textContent, UI_TEXT.common.close);
  click(btn);
  assert.equal(closed, 1);
});

test('style.css lays the open panel over the bottom of the stage', async () => {
  const { readFile } = await import('node:fs/promises');
  const css = await readFile(new URL('../style.css', import.meta.url), 'utf8');
  const root = [...css.matchAll(/\.panel-root\s*\{([^}]*)\}/g)].map((m) => m[1]).join('\n');
  assert.match(root, /grid-area:\s*stage/);
  assert.match(css, /max-height:\s*45vh/);
});

test('auto-paused note clears once no choice is waiting', () => {
  const state = createGame(11);
  const root = makeRoot();
  const clock = { speed: 0, autoPaused: true, setSpeed() {} };
  pushEvent(state, { id: 'client-offer', clientId: CLIENTS[0].id });
  renderTopbar(root, view(state), clock);
  assert.ok(root.textContent.includes(UI_TEXT.speed.autoPaused));
  act(state, { type: 'resolve', index: state.inbox.length - 1, choiceId: 'accept' });
  renderTopbar(root, view(state), clock);
  assert.ok(!root.textContent.includes(UI_TEXT.speed.autoPaused));
  assert.equal(clock.speed, 0);
});

test('people who are sick, on burnout, on leave or absent show their health state, not 퇴근', () => {
  const state = createGame(11);
  const [a, b, c, d] = state.people.filter((p) => p.role === 'agent');
  state.minute = 22 * 60;
  a.health = { kind: 'sick', daysLeft: 2 };
  b.health = { kind: 'burnout', daysLeft: 2 };
  c.health = { kind: 'leave', daysLeft: 2 };
  const root = makeRoot();
  const row = (v, p) => { renderPanel(root, v, 'people', (x) => act(state, x)); return root.querySelector(`[data-person="${p.id}"]`).textContent; };
  for (const [p, kind] of [[a, 'sick'], [b, 'burnout'], [c, 'leave']]) {
    const v = view(state);
    assert.ok(row(v, p).includes(UI_TEXT.health[kind].name), row(v, p));
    assert.ok(!row(v, p).includes(UI_TEXT.activity.off), row(v, p));
  }
  // absent today (shiftToday is computed by the sim; fake it on a view copy)
  const v = structuredClone(view(state));
  v.people.find((p) => p.id === d.id).shiftToday = 'absent';
  const text = row(v, d);
  assert.ok(text.includes(UI_TEXT.health.absent.name), text);
  assert.ok(!text.includes(UI_TEXT.activity.off), text);
});
