// v1.4 Task 3: a person covering an open client while their own is closed, and
// a client's chip on a day it does not open. Literal strings are the approved
// copy (docs/superpowers/specs/2026-11-25-v1.4-copy.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createGame, advance, view } from '../sim/game.js';
import { renderPanel, selectPerson, resetPanels } from '../ui/panels.js';
import { renderMetrics } from '../ui/topbar.js';
import { createDrawer } from '../render/draw.js';
import { stepActors } from '../render/actors.js';

const DAY = 1440;
const SAT = 5; // day 0 is a Monday
const MON = 7;
const BARAM = 'baram-delivery'; // 바람개비 배달, the weekend-only client (world/clients.js)
const BOOKS = 'solbang-books'; // 솔방울 서점, a weekday email client

function makeRoot() {
  resetPanels();
  return new JSDOM('<!DOCTYPE html><div id="r"></div>').window.document.getElementById('r');
}

// Fake canvases, as in tests/channels-ui.test.js: every context call is recorded.
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

// A game with the weekend client active and two agents rostered for the
// weekend, still assigned to their weekday clients, advanced to day at minute.
// emailOn: then the email client joins and the first of them moves onto it
// (after the run, so the run itself is the same).
function weekendGame(day, minute, { emailOn = false } = {}) {
  const s = createGame(3);
  s.clients.push({ id: BARAM, satisfaction: 70, active: true });
  const crew = s.people.filter((p) => p.role === 'agent').slice(0, 2);
  for (const p of crew) s.roster[p.id] = { ...s.roster[p.id], 1: 'off', 2: 'off', 5: 'weekend', 6: 'weekend' };
  advance(s, day * DAY + minute - (s.day * DAY + s.minute));
  assert.deepEqual([s.day, s.minute], [day, minute]);
  if (emailOn) {
    s.clients.splice(2, 0, { id: BOOKS, satisfaction: 70, active: true });
    s.assignment[crew[0].id] = { kind: 'phone', clientId: BOOKS };
  }
  return { s, crew };
}

const tasksRow = (r, id) => r.querySelector(`select[data-person="${id}"][data-field="task"]`).closest('tr');

test('covering label: tasks panel and person card name the open client being helped', () => {
  const { s, crew } = weekendGame(SAT, 600);
  const v = view(s);
  const p = v.people.find((x) => x.id === crew[0].id);
  assert.equal(p.activity, 'phone');
  assert.notEqual(p.task.clientId, BARAM);

  const r = makeRoot();
  renderPanel(r, v, 'tasks', () => ({ ok: true }));
  const label = tasksRow(r, p.id).querySelector('.covering');
  assert.equal(label.textContent, '바람개비 배달 돕는 중');
  assert.equal(label.getAttribute('title'), '맡은 고객사가 문을 닫은 시간이라, 문을 연 바람개비 배달을 돕고 있어요.');

  const c = makeRoot();
  selectPerson(p.id);
  renderPanel(c, v, 'people', () => ({ ok: true }));
  const card = c.querySelector(`[data-card="${p.id}"] .covering`);
  assert.equal(card.textContent, '바람개비 배달 돕는 중');
  assert.equal(card.getAttribute('title'), '맡은 고객사가 문을 닫은 시간이라, 문을 연 바람개비 배달을 돕고 있어요.');
});

test('covering tooltip: the particle after the client name follows its last syllable', () => {
  const { s, crew } = weekendGame(SAT, 600);
  const v = JSON.parse(JSON.stringify(view(s)));
  v.clients.find((c) => c.id === BARAM).name = '주말 시험 고객사'; // ends in a vowel
  const r = makeRoot();
  renderPanel(r, v, 'tasks', () => ({ ok: true }));
  const label = tasksRow(r, crew[0].id).querySelector('.covering');
  assert.equal(label.textContent, '주말 시험 고객사 돕는 중');
  assert.equal(label.getAttribute('title'), '맡은 고객사가 문을 닫은 시간이라, 문을 연 주말 시험 고객사를 돕고 있어요.');
});

test('covering label: none on Monday, when everyone answers their own client', () => {
  const { s, crew } = weekendGame(MON, 600);
  const v = view(s);
  const r = makeRoot();
  renderPanel(r, v, 'tasks', () => ({ ok: true }));
  assert.equal(r.querySelectorAll('.covering').length, 0);
  assert.ok(!r.textContent.includes('돕는 중'));
  const c = makeRoot();
  selectPerson(crew[0].id);
  renderPanel(c, v, 'people', () => ({ ok: true }));
  assert.ok(c.querySelector(`[data-card="${crew[0].id}"]`));
  assert.ok(!c.textContent.includes('돕는 중'));
});

test('map: an email agent covering a phone client wears the headset, not ✉️', () => {
  const { s, crew } = weekendGame(SAT, 600, { emailOn: true });
  const v = view(s);
  const mail = v.people.find((x) => x.id === crew[0].id);
  assert.deepEqual(mail.task, { kind: 'phone', clientId: BOOKS });
  assert.equal(mail.answering, BARAM);
  assert.equal(mail.activity, 'phone');
  let actors = [];
  for (let i = 0; i < 60; i++) actors = stepActors(actors, v.people, 500, undefined, v.office.seats);
  const at = actors.find((a) => a.id === mail.id);
  assert.equal(at.path.length, 0, 'seated');
  const make = canvasFactory();
  const drawer = createDrawer(make);
  const headset = [drawer.spriteCanvas('headset').id, drawer.spriteCanvas('headsetBack').id];
  const screen = make(960, 576);
  const ctx = screen.getContext();
  drawer.drawActors(ctx, actors, v.people, 0, v.clients);
  const texts = ctx.ops.filter((o) => o[0] === 'fillText').map((o) => o[1]);
  assert.deepEqual(texts, []);
  const px = Math.round(at.x * 48);
  const py = Math.round(at.y * 48) - 24; // the 16x24 sprite reaches 8 sprite pixels above its tile
  assert.ok(ctx.ops.some((o) => o[0] === 'drawImage' && headset.includes(o[1]) && o[2] === px && o[3] === py), 'headset');

  // The people list says what they do now: on the phone, not 이메일.
  const r = makeRoot();
  renderPanel(r, v, 'people', () => ({ ok: true }));
  const item = r.querySelector(`button[data-person="${mail.id}"]`);
  assert.ok(!item.textContent.includes('이메일'), item.textContent);
  assert.ok(item.textContent.includes('전화 중'), item.textContent);
});

test('metrics: a weekday client shows 오늘 휴무 on Saturday and the 아직 form before 09:00 on a weekday', () => {
  const r = makeRoot();
  const chip = (id) => r.querySelector(`[data-client="${id}"]`);
  renderMetrics(r, view(weekendGame(SAT, 600).s));
  assert.equal(chip('gureum-travel').getAttribute('title'), '이 고객사는 오늘 문을 열지 않아요.');
  assert.equal(chip('gureum-travel').querySelector('span').textContent, '오늘 휴무');
  assert.equal(chip('gureum-travel').textContent, '구름다리 여행오늘 휴무');
  assert.ok(!chip(BARAM).textContent.includes('오늘 휴무'), 'the open weekend client shows numbers');

  renderMetrics(r, view(weekendGame(MON, 480).s)); // Monday 08:00
  assert.equal(chip('gureum-travel').getAttribute('title'), '오늘은 아직 전화가 없어요.');
  assert.ok(!chip('gureum-travel').textContent.includes('오늘 휴무'));
  assert.ok(chip('gureum-travel').textContent.includes('서비스 레벨'), chip('gureum-travel').textContent);
  assert.equal(chip(BARAM).textContent, '바람개비 배달주말 운영', 'the weekend client keeps 주말 운영 on weekdays');
});

// v1.4 final fix I1: the per-client count in the tasks panel is "now": people on the
// phone count under the client they answer, the others under their assignment.
test('tasks header: on Saturday the weekend client count equals its 돕는 중 rows', () => {
  const { s } = weekendGame(SAT, 540); // 09:00: v1.6 breaks start at 10:00 at the earliest
  const v = view(s);
  const r = makeRoot();
  renderPanel(r, v, 'tasks', () => ({ ok: true }));
  const rows = [...r.querySelectorAll('.covering')].filter((e) => e.textContent === '바람개비 배달 돕는 중').length;
  assert.equal(rows, 2);
  assert.equal(r.querySelector('p.seats').textContent, '상담사 좌석 8 / 8 · 구름다리 여행 응대 2명 · 물빛 통신 응대 4명 · 바람개비 배달 응대 2명');
});

test('view: answering is the assigned client for a phone person who is not on the phone now', () => {
  const { s, crew } = weekendGame(SAT, 600);
  const v = view(s);
  const off = v.people.find((p) => p.task?.kind === 'phone' && p.activity !== 'phone');
  assert.ok(off, 'someone assigned to phones is not on them');
  assert.equal(off.answering, off.task.clientId);
  assert.equal(v.people.find((p) => p.id === crew[0].id).answering, BARAM);
});

// v1.4 final fix M1
test('metrics: an email client closed today keeps its backlog count beside 오늘 휴무', () => {
  const { s } = weekendGame(SAT, 600, { emailOn: true });
  s.backlog[BOOKS] = { openMin: 0, items: [{ at: 30, n: 13 }], carry: 0 };
  const r = makeRoot();
  renderMetrics(r, view(s));
  const chip = r.querySelector(`[data-client="${BOOKS}"]`);
  assert.ok(chip.classList.contains('closed-today'));
  assert.ok(chip.textContent.includes('오늘 휴무'), chip.textContent);
  assert.ok(chip.textContent.includes('밀린 메일 13통'), chip.textContent);
});

// v1.4 final fix M3
test('person card: the assigned client and the covered client are separated by " · "', () => {
  const { s, crew } = weekendGame(SAT, 600);
  const v = view(s);
  const c = makeRoot();
  selectPerson(crew[0].id);
  renderPanel(c, v, 'people', () => ({ ok: true }));
  const text = [...c.querySelectorAll(`[data-card="${crew[0].id}"] dd`)].map((d) => d.textContent).find((t) => t.includes('돕는 중'));
  assert.equal(text, '상담 응대 · 구름다리 여행 · 바람개비 배달 돕는 중');
});

// v1.8.1: in a break interval's desk minutes a covering agent answers the
// client they cover (deskAnswering), not their own closed one.
test('v1.8.1 deskAnswering names the covered client during a break interval', () => {
  const { s, crew } = weekendGame(SAT, 540);
  let seen = false;
  for (let m = 540; m < 1080 && !seen; m += 30) {
    advance(s, m - s.minute);
    const p = view(s).people.find((x) => x.id === crew[0].id);
    if (p.activity !== 'lunch' && p.activity !== 'break') continue;
    if (p.deskActivity !== 'phone') continue;
    assert.equal(p.answering, p.task.clientId, 'on a break interval: the assigned client');
    assert.equal(p.deskAnswering, BARAM, 'at the desk: the covered client');
    seen = true;
  }
  assert.ok(seen, 'a break interval with desk minutes on the phone');
});
