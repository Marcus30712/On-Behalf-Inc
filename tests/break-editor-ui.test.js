// v1.9: the 휴식표 tab.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createGame, act, view, advance } from '../sim/game.js';
import { ensureBreakPlan, workingShift, windowsFor, moveBreak } from '../sim/breaks.js';
import { SHIFTS } from '../sim/schedule.js';
import { UI_TEXT, fill } from '../ui/text.js';
import { formatTime } from '../ui/format.js';
import { renderPanel, resetPanels, TABS } from '../ui/panels.js';

function makeRoot() {
  resetPanels();
  const { document } = new JSDOM('<!DOCTYPE html><div id="root"></div>').window;
  return document.getElementById('root');
}
const click = (el) => el.dispatchEvent(new el.ownerDocument.defaultView.MouseEvent('click', { bubbles: true }));
const B = UI_TEXT.breaks;

function game() {
  const s = createGame(11);
  advance(s, 540 - s.minute);
  ensureBreakPlan(s);
  const agent = s.people.find((p) => p.role === 'agent' && workingShift(s, p, s.day) === 'early');
  return { s, agent };
}
const draw = (s) => {
  const root = makeRoot();
  const onAct = (a) => act(s, a);
  renderPanel(root, view(s), 'breaks', onAct);
  return { root, redraw: () => renderPanel(root, view(s), 'breaks', onAct) };
};
const cell = (root, id, kind) => root.querySelector(`[data-person="${id}"] [data-break="${kind}"]`);

test('v1.9 the 휴식표 tab comes right after the roster', () => {
  assert.equal(TABS[TABS.indexOf('roster') + 1], 'breaks');
  assert.deepEqual([UI_TEXT.tabs.breaks.name, UI_TEXT.tabs.breaks.tip], ['휴식표', '오늘 휴식 시간을 보고 바쁜 시간을 피해 옮겨요']);
});

test('v1.9 header, legend, a bar per slot, a row per working person', () => {
  const { s } = game();
  const { root } = draw(s);
  const lead = s.people.find((p) => p.role === 'lead');
  assert.ok(root.textContent.includes(B.title));
  assert.ok(root.textContent.includes(fill(B.byLead, { name: lead.name })));
  assert.ok(root.textContent.includes(B.legend));
  const board = view(s).breakBoard;
  const bars = root.querySelectorAll('.break-slot');
  assert.equal(bars.length, board.slots.length);
  const first = board.slots[0];
  assert.equal(bars[0].getAttribute('title'), fill(B.slot, { time: formatTime(first.minute), calls: Math.round(first.calls), n: first.away }));
  assert.equal(root.querySelectorAll('tr[data-person]').length, board.rows.length);
  for (const kind of ['am', 'lunch', 'pm']) assert.ok(root.querySelector('thead').textContent.includes(B[kind]));
});

test('v1.9 with no lead the header says breaks fell at random', () => {
  const { s } = game();
  s.people = s.people.filter((p) => p.role !== 'lead');
  delete s.breaks;
  ensureBreakPlan(s);
  assert.ok(draw(s).root.textContent.includes(B.byAuto));
});

test('v1.9 later moves a break 15 minutes and marks the row edited', () => {
  const { s, agent } = game();
  const { root, redraw } = draw(s);
  const before = view(s).breakBoard.rows.find((r) => r.personId === agent.id).breaks.lunch.start;
  const later = cell(root, agent.id, 'lunch').querySelector('button[data-step="later"]');
  // v2.2.1: the person's name first, so a screen reader on the phone cards says whose break.
  assert.equal(later.getAttribute('aria-label'), `${agent.name} ${B.lunch} ${B.later}`);
  click(later);
  redraw();
  const now = view(s).breakBoard.rows.find((r) => r.personId === agent.id).breaks.lunch.start;
  assert.equal(now, before + 15);
  assert.ok(cell(root, agent.id, 'lunch').textContent.includes(formatTime(now)));
  assert.ok(root.querySelector(`tr[data-person="${agent.id}"]`).textContent.includes(B.edited));
});

test('v1.9 a button that cannot move is disabled', () => {
  const { s, agent } = game();
  const shift = SHIFTS[workingShift(s, agent, s.day)];
  const first = shift.start + windowsFor(shift.end - shift.start).am.from;
  moveBreak(s, { personId: agent.id, kind: 'am', start: first });
  const { root } = draw(s);
  const c = cell(root, agent.id, 'am');
  assert.equal(c.querySelector('button[data-step="earlier"]').disabled, true);
  assert.equal(c.querySelector('button[data-step="later"]').disabled, false);
});

test('v1.9 a busy slot is marked and says how many are away', () => {
  // v2.0.1: a real busy slot: three early agents' breaks moved into a
  // top-25% forecast slot their window reaches.
  const { s } = game();
  const early = s.people.filter((p) => p.role === 'agent' && workingShift(s, p, s.day) === 'early');
  const shift = SHIFTS.early;
  const slots0 = view(s).breakBoard.slots;
  const sorted = slots0.map((x) => x.calls).sort((a, b) => b - a);
  const top = sorted[Math.ceil(sorted.length * 0.25) - 1];
  // The first break window that reaches a top-25% slot (the peak may be in the afternoon).
  const [kind, peak] = ['am', 'lunch', 'pm'].map((k) => {
    const w = windowsFor(shift.end - shift.start)[k];
    const reach = slots0.filter((x) => x.minute >= shift.start + w.from && x.minute <= shift.start + w.to);
    return [k, reach.reduce((a, x) => (x.calls > a.calls ? x : a))];
  }).find(([, x]) => x.calls >= top);
  for (const p of early.slice(0, 3)) assert.deepEqual(moveBreak(s, { personId: p.id, kind, start: peak.minute }), { ok: true });
  const board = view(s).breakBoard;
  const slot = board.slots.find((x) => x.minute === peak.minute);
  assert.ok(slot.busy, `the peak slot ${slot.minute} is busy (calls ${slot.calls}, away ${slot.away})`);
  const root = makeRoot();
  renderPanel(root, view(s), 'breaks', () => ({ ok: true }));
  const bar = [...root.querySelectorAll('.break-slot')][board.slots.indexOf(slot)];
  assert.ok(bar.classList.contains('busy'));
  assert.ok(root.textContent.includes(fill(B.busy, { n: slot.away })));
});

test('v1.9 refusals use the approved text', () => {
  assert.equal(UI_TEXT.refuse['not-working'], '오늘 근무하지 않는 사람이에요.');
  assert.equal(UI_TEXT.refuse['bad-break'], '휴식은 15분 단위로만 옮길 수 있어요.');
  assert.equal(UI_TEXT.refuse['break-started'], '이미 시작했거나 지난 휴식은 옮길 수 없어요.');
  assert.equal(UI_TEXT.refuse['break-window'], '그 시간으로는 옮길 수 없어요. 정해진 휴식 시간 범위를 벗어나요.');
  const { s } = game();
  const root = makeRoot();
  const v = view(s);
  renderPanel(root, v, 'breaks', () => ({ ok: false, reason: 'break-started' }));
  click(root.querySelector('button[data-step="later"]:not([disabled])'));
  assert.equal(root.querySelector('.notice').textContent, UI_TEXT.refuse['break-started']);
});

test('v1.9 nobody working today', () => {
  const { s } = game();
  const v = { ...view(s), breakBoard: { slots: [], rows: [], by: 'auto', lead: null } };
  const root = makeRoot();
  renderPanel(root, v, 'breaks', () => ({ ok: true }));
  assert.ok(root.textContent.includes(B.none));
});

test('v2.0.1 the role column has its header', () => {
  const { s } = game();
  const ths = [...draw(s).root.querySelectorAll('thead th')].map((th) => th.textContent);
  assert.equal(ths[1], UI_TEXT.tasks.colRole);
});

// v2.1: on a phone the table shows as cards; each break cell carries its
// approved break name for the CSS label (style.css ::before).
test('v2.1 each break cell is labelled with its break name', () => {
  const { s, agent } = game();
  const { root } = draw(s);
  for (const kind of ['am', 'lunch', 'pm']) assert.equal(cell(root, agent.id, kind).getAttribute('data-label'), B[kind]);
});
