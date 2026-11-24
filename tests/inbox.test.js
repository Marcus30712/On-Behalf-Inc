import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createGame, act, view } from '../sim/game.js';
import { pushEvent } from '../sim/events.js';
import { CLIENTS } from '../world/clients.js';
import { UI_TEXT, eventText } from '../ui/text.js';
import { renderInbox, renderAdvisor, firstRunIntro, resetInbox } from '../ui/inbox.js';
import { createDrawer } from '../render/draw.js';

function makeRoot() {
  resetInbox();
  const { document } = new JSDOM('<!DOCTYPE html><div id="root"></div>').window;
  return document.getElementById('root');
}
const click = (el) => el.dispatchEvent(new el.ownerDocument.defaultView.MouseEvent('click', { bubbles: true }));
const fakeCanvas = (w, h) => ({ width: w, height: h, getContext: () => ({ fillRect() {}, drawImage() {}, set fillStyle(_) {} }) });

function setup() {
  const state = createGame(5);
  pushEvent(state, { id: 'call-spike', clientId: CLIENTS[0].id }); // information, older
  pushEvent(state, { id: 'client-offer', clientId: CLIENTS[0].id, deadlineDay: state.day + 3 }); // choice
  const calls = [];
  const onAct = (a) => { calls.push(a); return act(state, a); };
  return { state, calls, onAct };
}
const items = (root) => [...root.querySelectorAll('li.inbox-item')];

test('choice events are listed first and show their choices', () => {
  const { state, onAct } = setup();
  const root = makeRoot();
  renderInbox(root, view(state), onAct);
  const li = items(root);
  assert.equal(li.length, 2);
  assert.equal(li[0].dataset.id, 'client-offer');
  assert.ok(li[1].classList.contains('unread'));
  assert.equal(root.querySelectorAll('.choice-btn').length, 0, 'collapsed');
  click(li[0].querySelector('.inbox-head'));
  const btns = [...root.querySelectorAll('.choice-btn')];
  const want = eventText(view(state).inbox[0]).choices;
  assert.deepEqual(btns.map((b) => b.textContent), want.map((c) => c.label));
  assert.equal(root.querySelector('ul').getAttribute('aria-live'), 'polite');
});

test('choosing calls resolve with the event index and shows the result text', () => {
  const { state, calls, onAct } = setup();
  const root = makeRoot();
  const v = () => view(state);
  renderInbox(root, v(), onAct);
  click(items(root)[0].querySelector('.inbox-head'));
  const index = v().inbox[0].index;
  click(root.querySelector('.choice-btn'));
  assert.deepEqual(calls.at(-1), { type: 'resolve', index, choiceId: 'accept' });
  renderInbox(root, v(), onAct);
  const text = root.textContent;
  const first = eventText(v().inbox.find((e) => e.index === index)).choices[0];
  assert.ok(text.includes(first.result));
  assert.ok(text.includes(first.label));
  assert.equal(root.querySelectorAll('.choice-btn').length, 0);
});

test('opening an information event marks it read', () => {
  const { state, calls, onAct } = setup();
  const root = makeRoot();
  const opened = [];
  renderInbox(root, view(state), onAct, { onOpen: (e) => opened.push(e.id) });
  const info = items(root).find((l) => l.dataset.id === 'call-spike');
  click(info.querySelector('.inbox-head'));
  assert.deepEqual(calls.at(-1), { type: 'resolve', index: 0, choiceId: undefined });
  assert.equal(state.inbox[0].seen, true);
  assert.deepEqual(opened, ['call-spike']);
  click(items(root).find((l) => l.dataset.id === 'call-spike').querySelector('.inbox-head'));
  assert.equal(calls.length, 1, 'no second resolve');
});

test('advisor line matches the opened event', () => {
  const { state } = setup();
  const root = makeRoot();
  const event = view(state).inbox[0];
  renderAdvisor(root, event, { drawer: createDrawer(fakeCanvas) });
  assert.equal(root.querySelector('.advisor-line').textContent, eventText(event).advisor);
  assert.ok(root.querySelector('canvas'));
  renderAdvisor(root, null, { drawer: createDrawer(fakeCanvas) });
  assert.equal(root.querySelector('.advisor-line').textContent, UI_TEXT.inbox.empty);
});

test('first-run intro steps through the lines and finishes', () => {
  const root = makeRoot();
  let done = 0;
  firstRunIntro(root, () => { done++; });
  const lines = ['1', '2', '3', '4', '5'].map((k) => UI_TEXT.intro[k]);
  for (let i = 0; i < 5; i++) {
    assert.equal(root.querySelector('.intro-line').textContent, lines[i]);
    const btn = root.querySelector('button.intro-next');
    assert.equal(btn.textContent, i < 4 ? UI_TEXT.intro.next : UI_TEXT.intro.done);
    if (i === 3) root.dispatchEvent(new root.ownerDocument.defaultView.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    else click(btn);
    if (i === 3) assert.equal(root.querySelector('.intro-line').textContent, lines[4]);
  }
  assert.equal(done, 1);
});
