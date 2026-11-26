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
  assert.equal(root.querySelector('.advisor'), null, 'no event: no bubble');
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

test('choosing updates the DOM from a fresh view without the caller re-rendering', () => {
  const { state, calls, onAct } = setup();
  const root = makeRoot();
  renderInbox(root, view(state), onAct, { getView: () => view(state) });
  const head = () => root.querySelector('[data-id="client-offer"] .inbox-head');
  assert.equal(head().getAttribute('aria-expanded'), 'false');
  click(head());
  assert.equal(head().getAttribute('aria-expanded'), 'true');
  assert.equal(head().getAttribute('aria-controls'), root.querySelector('.inbox-body').id);
  click(root.querySelector('.choice-btn'));
  assert.equal(root.querySelectorAll('.choice-btn').length, 0);
  assert.ok(root.querySelector('.choice-result'));
  assert.equal(calls.filter((c) => c.type === 'resolve').length, 1);
  assert.equal(root.ownerDocument.activeElement, head(), 'focus stays on the head');
  const info = root.querySelector('[data-id="call-spike"]');
  click(info.querySelector('.inbox-head'));
  assert.ok(!root.querySelector('[data-id="call-spike"]').classList.contains('unread'));
});

test('a refused resolve shows the notice', () => {
  const { state } = setup();
  const root = makeRoot();
  renderInbox(root, view(state), () => ({ ok: false, reason: 'bad-choice' }));
  click(root.querySelector('[data-id="client-offer"] .inbox-head'));
  click(root.querySelector('.choice-btn'));
  assert.equal(root.querySelector('.notice').textContent, UI_TEXT.refuse['bad-choice']);
});

test('intro skip calls onDone', () => {
  const root = makeRoot();
  let done = 0;
  firstRunIntro(root, () => { done++; });
  click(root.querySelector('.intro-skip'));
  assert.equal(done, 1);
});

test('a person event whose title has no name shows the name in its head', () => {
  const state = createGame(5);
  const [a, b] = state.people;
  pushEvent(state, { id: 'friday-off', personId: a.id, data: { fridayDay: 4 }, deadlineDay: 4 });
  pushEvent(state, { id: 'sick', personId: b.id, data: { days: 2 } });
  const root = makeRoot();
  renderInbox(root, view(state), (x) => act(state, x));
  const head = (id) => root.querySelector(`[data-id="${id}"] .inbox-title`).textContent;
  const fridayTitle = eventText(view(state).inbox.find((e) => e.id === 'friday-off')).title;
  assert.equal(head('friday-off'), `${fridayTitle} · ${a.name}`);
  assert.equal(head('sick'), eventText(view(state).inbox.find((e) => e.id === 'sick')).title, 'name already in the title');
});

test('resolved events fold under a show-old button', () => {
  const state = createGame(5);
  for (let i = 0; i < 6; i++) pushEvent(state, { id: 'call-spike', clientId: CLIENTS[0].id });
  for (let i = 0; i < 6; i++) act(state, { type: 'resolve', index: i, choiceId: undefined });
  pushEvent(state, { id: 'call-spike', clientId: CLIENTS[0].id }); // unread, index 6
  pushEvent(state, { id: 'client-offer', clientId: CLIENTS[0].id, deadlineDay: state.day + 3 }); // choice, index 7
  const onAct = (a) => act(state, a);
  const root = makeRoot();
  renderInbox(root, view(state), onAct, { getView: () => view(state) });
  const shown = () => items(root).map((l) => Number(l.dataset.index));
  assert.deepEqual(shown(), [7, 6, 5, 4, 3], 'waiting + unread + 3 newest resolved');
  const btn = root.querySelector('button.show-old');
  assert.equal(btn.textContent, UI_TEXT.inbox.showOld);
  click(btn);
  assert.equal(items(root).length, 8);
  assert.equal(root.querySelector('button.show-old'), null);
  resetInbox();
  renderInbox(root, view(state), onAct, { getView: () => view(state) });
  assert.equal(items(root).length, 5, 'reset folds again');
});

test('no show-old button when 3 or fewer events are resolved', () => {
  const { state, onAct } = setup();
  const root = makeRoot();
  renderInbox(root, view(state), onAct);
  assert.equal(root.querySelector('button.show-old'), null);
});

test('v1.7 lead-candidate shows skills with 2 decimals; a lead\'s notice has its own advice', () => {
  const out = eventText({ id: 'lead-candidate', day: 0, data: { cand1: '가을', cand2: '나무', c1: 6, c2: 7.5, p1: 4.7, p2: 3 } });
  assert.equal(out.text, '가을 씨(코칭 6.00 · 스케줄링 4.70)와 나무 씨(코칭 7.50 · 스케줄링 3.00)가 팀장 자리에 지원했어요. 누구와 함께할까요?');
  const lead = eventText({ id: 'resign-notice', day: 0, data: { name: '가을', days: 10, leaveDay: 12, lead: true } });
  assert.equal(lead.advisor, '팀장이 떠나면 휴식표를 짤 사람이 없어요. 채용 탭에서 새 팀장을 미리 찾아 둬요.');
  const agent = eventText({ id: 'resign-notice', day: 0, data: { name: '가을', days: 10, leaveDay: 12 } });
  assert.notEqual(agent.advisor, lead.advisor);
});
