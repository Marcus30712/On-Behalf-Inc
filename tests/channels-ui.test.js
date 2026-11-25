// v1.3 UI: channel marks, email and chat metrics, the map marker, and the
// desk build-done advisor line. Literal strings are the approved copy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { createGame, advance, view } from '../sim/game.js';
import { renderPanel, selectPerson, resetPanels } from '../ui/panels.js';
import { renderMetrics } from '../ui/topbar.js';
import { eventText } from '../ui/text.js';
import { createDrawer } from '../render/draw.js';
import { stepActors } from '../render/actors.js';

function makeRoot() {
  resetPanels();
  return new JSDOM('<!DOCTYPE html><div id="r"></div>').window.document.getElementById('r');
}

// Fake canvases: every context call and property set is recorded; each canvas
// has its own id so sprites can be told apart.
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

// ---- phone-only games look exactly as before v1.3 ---------------------------

test('a phone-only game renders its panels, metrics and map exactly as before', () => {
  const want = JSON.parse(readFileSync(new URL('./fixtures/phone-only-ui.json', import.meta.url), 'utf8'));
  const s = createGame(11);
  advance(s, 11 * 60);
  const v = view(s);
  const panel = (tab, act) => { const r = makeRoot(); act?.(); renderPanel(r, v, tab, () => ({ ok: true })); return r.innerHTML; };
  for (const tab of ['people', 'tasks', 'clients']) assert.equal(panel(tab), want[tab], tab);
  const onPhone = v.people.find((p) => p.task?.kind === 'phone');
  assert.equal(panel('people', () => selectPerson(onPhone.id)), want.card, 'card');
  const m = makeRoot();
  renderMetrics(m, v);
  assert.equal(m.innerHTML, want.metrics, 'metrics');
  let actors = [];
  for (let i = 0; i < 40; i++) actors = stepActors(actors, v.people, 500, undefined, v.office.seats);
  const make = canvasFactory();
  const screen = make(960, 576);
  createDrawer(make).drawActors(screen.getContext(), actors, v.people, 0, v.clients);
  assert.equal(JSON.stringify(screen.getContext().ops), want.drawOpsText, 'draw ops');
});

// ---- a game with a chat and an email client ----------------------------------

// A plain (unfrozen) view with the chat and email clients active, the first
// two agents answering them, and today's numbers set as given.
function mixedView({ chat = {}, email = {}, emailClient = {} } = {}) {
  const s = createGame(11);
  s.clients.push({ id: 'saebyeol-bank', satisfaction: 70, active: true });
  s.clients.push({ id: 'solbang-books', satisfaction: 70, active: true });
  advance(s, 11 * 60);
  const v = JSON.parse(JSON.stringify(view(s)));
  const bank = v.clients.find((c) => c.id === 'saebyeol-bank');
  const books = v.clients.find((c) => c.id === 'solbang-books');
  Object.assign(bank.today, { offered: 0, handled: 0, abandoned: 0, serviceLevel: null, asaSec: null }, chat);
  Object.assign(books.today, { offered: 0, handled: 0, abandoned: 0, arrived: 0, serviceLevel: null, asaSec: null }, email);
  Object.assign(books, { backlog: 0, onTime: null, satisfaction: 70 }, emailClient);
  const agents = v.people.filter((p) => p.role === 'agent');
  agents[0].task = { kind: 'phone', clientId: 'saebyeol-bank' };
  agents[0].activity = 'phone';
  agents[1].task = { kind: 'phone', clientId: 'solbang-books' };
  agents[1].activity = 'phone';
  return { v, chatAgent: agents[0], mailAgent: agents[1] };
}

const BUSY = {
  chat: { offered: 12.4, handled: 10.2, abandoned: 1, serviceLevel: 0.75, asaSec: 41 },
  email: { offered: 24.1, handled: 23.6, arrived: 25.4 },
  emailClient: { backlog: 37, onTime: 0.92 },
};

test('clients panel: a channel label next to every client name, and the email target', () => {
  const { v } = mixedView(BUSY);
  const r = makeRoot();
  renderPanel(r, v, 'clients', () => ({ ok: true }));
  const row = (id) => r.querySelector(`tr[data-client="${id}"]`);
  const name = (id) => row(id).querySelector('th').textContent;
  assert.ok(name('gureum-travel').includes('📞 전화'), name('gureum-travel'));
  assert.ok(name('mulbit-telecom').includes('📞 전화'));
  assert.ok(name('saebyeol-bank').includes('새벽별 은행'));
  assert.ok(name('saebyeol-bank').includes('💬 채팅'));
  assert.ok(name('solbang-books').includes('✉️ 이메일'));
  assert.equal(row('saebyeol-bank').querySelector('.channel').getAttribute('title'),
    '한 사람이 채팅 두 건을 함께 받아요. 고객은 전화보다 조금 더 기다려 줘요.');
  assert.equal(row('solbang-books').querySelector('.channel').getAttribute('title'),
    '바로 받지 않아도 되지만, 미루면 밀린 메일이 쌓여요. 문을 닫은 시간에는 기한이 흐르지 않아요.');
  const cells = (id) => [...row(id).querySelectorAll('td')].map((td) => td.textContent);
  assert.equal(cells('solbang-books')[1], '영업시간 12시간 안에 90%');
  assert.equal(cells('solbang-books')[2], '기한 안 답장 92%');
  assert.equal(cells('solbang-books')[3], '밀린 메일 37통');
  assert.equal(cells('solbang-books')[4], '—');
  assert.equal(cells('saebyeol-bank')[1], '60초 안에 80%');
  assert.equal(cells('saebyeol-bank')[2], '75%');
  assert.equal(cells('gureum-travel')[1], '20초 안에 80%');
});

test('email chip: backlog and on-time share instead of service level, rounded mail counts', () => {
  const { v } = mixedView(BUSY);
  const r = makeRoot();
  renderMetrics(r, v);
  const chip = r.querySelector('[data-client="solbang-books"]');
  const text = chip.textContent;
  assert.ok(text.includes('✉️ 이메일'), text);
  assert.ok(text.includes('밀린 메일 37통'), text);
  assert.ok(text.includes('기한 안 답장 92%'), text);
  assert.ok(text.includes('(목표 90%)'), text);
  assert.ok(text.includes('만족도 70'), text);
  assert.ok(!text.includes('서비스 레벨') && !text.includes('평균 대기') && !text.includes('포기'), text);
  assert.equal(chip.getAttribute('title'), '영업시간 12시간 안에 90% · 들어온 메일 25통 · 답장한 메일 24통');
  assert.equal(chip.className, 'metric');
  // The chips wrap to two lines with four clients: the strip packs them closer.
  assert.equal(r.querySelector('ul').className, 'metrics-list channels');
});

test('email chip: below target warns; before the first mail it says so', () => {
  let { v } = mixedView({ ...BUSY, emailClient: { backlog: 5, onTime: 0.85 } });
  let r = makeRoot();
  renderMetrics(r, v);
  let chip = r.querySelector('[data-client="solbang-books"]');
  assert.equal(chip.className, 'metric below');
  assert.ok(chip.textContent.includes('목표 아래'));
  ({ v } = mixedView());
  r = makeRoot();
  renderMetrics(r, v);
  chip = r.querySelector('[data-client="solbang-books"]');
  assert.equal(chip.getAttribute('title'), '오늘은 아직 메일이 없어요.');
  assert.ok(chip.textContent.includes('밀린 메일 0통'), chip.textContent);
  assert.ok(chip.textContent.includes('기한 안 답장 —'), chip.textContent);
  assert.equal(chip.className, 'metric');
});

test('email chip on an unstaffed first day: the tooltip counts the mail that came in', () => {
  const s = createGame(2);
  s.clients.push({ id: 'solbang-books', satisfaction: 70, active: true });
  // Day 0, 15:00, nobody on the mail (the final review saw 56 here at 100 mails a day; 84 now).
  advance(s, 15 * 60 - s.minute);
  const r = makeRoot();
  renderMetrics(r, view(s));
  const chip = r.querySelector('[data-client="solbang-books"]');
  assert.ok(chip.textContent.includes('밀린 메일 47통'), chip.textContent);
  const title = chip.getAttribute('title');
  assert.ok(!title.includes('오늘은 아직 메일이 없어요'), title);
  assert.equal(title, '영업시간 12시간 안에 90% · 들어온 메일 47통 · 답장한 메일 0통');
});

test('chat chip: like the phone chip, with chat labels', () => {
  const { v } = mixedView(BUSY);
  const r = makeRoot();
  renderMetrics(r, v);
  const chip = r.querySelector('[data-client="saebyeol-bank"]');
  const text = chip.textContent;
  assert.ok(text.includes('💬 채팅'), text);
  assert.ok(text.includes('서비스 레벨 75% (목표 80%)'), text);
  assert.ok(text.includes('평균 대기 41초'), text);
  assert.equal(chip.getAttribute('title'), '60초 안에 80% · 들어온 채팅 12건 · 받은 채팅 10건');
  const phone = r.querySelector('[data-client="gureum-travel"]');
  assert.ok(phone.textContent.includes('📞 전화'), phone.textContent);
  const empty = makeRoot();
  renderMetrics(empty, mixedView().v);
  assert.equal(empty.querySelector('[data-client="saebyeol-bank"]').getAttribute('title'), '오늘은 아직 채팅이 없어요.');
});

test('tasks and people: client choices carry the channel; chat and mail agents are not 전화 중', () => {
  const { v, chatAgent, mailAgent } = mixedView(BUSY);
  let r = makeRoot();
  renderPanel(r, v, 'tasks', () => ({ ok: true }));
  const options = [...r.querySelector(`select[data-person="${chatAgent.id}"][data-field="client"]`).options].map((o) => o.textContent);
  assert.ok(options.includes('새벽별 은행 · 💬 채팅'), options.join('|'));
  assert.ok(options.includes('솔방울 서점 · ✉️ 이메일'), options.join('|'));
  assert.ok(options.includes('구름다리 여행 · 📞 전화'), options.join('|'));
  r = makeRoot();
  renderPanel(r, v, 'people', () => ({ ok: true }));
  const item = (p) => r.querySelector(`[data-person="${p.id}"]`).textContent;
  assert.ok(item(chatAgent).includes('💬 채팅') && !item(chatAgent).includes('전화 중'), item(chatAgent));
  assert.ok(item(mailAgent).includes('✉️ 이메일') && !item(mailAgent).includes('전화 중'), item(mailAgent));
  r = makeRoot();
  selectPerson(mailAgent.id);
  renderPanel(r, v, 'people', () => ({ ok: true }));
  assert.ok(r.textContent.includes('상담 응대 · 솔방울 서점 · ✉️ 이메일'), r.textContent);
});

test('map: chat and email agents at their desks show 💬 or ✉️ instead of the headset', () => {
  const { v, chatAgent, mailAgent } = mixedView(BUSY);
  let actors = [];
  for (let i = 0; i < 60; i++) actors = stepActors(actors, v.people, 500, undefined, v.office.seats);
  const make = canvasFactory();
  const drawer = createDrawer(make);
  const headset = drawer.spriteCanvas('headset').id;
  const headsetBack = drawer.spriteCanvas('headsetBack').id;
  const screen = make(960, 576);
  const ctx = screen.getContext();
  drawer.drawActors(ctx, actors, v.people, 0, v.clients);
  const at = (p) => actors.find((a) => a.id === p.id);
  const px = (p) => Math.round(at(p).x * 48);
  const py = (p) => Math.round(at(p).y * 48) - 9; // spot(): the sprite stands 3 sprite pixels up
  const ops = ctx.ops;
  const headsetAt = (p) => ops.some((o) => o[0] === 'drawImage' && [headset, headsetBack].includes(o[1])
    && o[2] === px(p) && o[3] === py(p));
  const texts = ops.filter((o) => o[0] === 'fillText').map((o) => o[1]);
  assert.equal(at(chatAgent).path.length, 0, 'chat agent seated');
  assert.equal(at(mailAgent).path.length, 0, 'mail agent seated');
  assert.ok(!headsetAt(chatAgent), 'no headset on the chat agent');
  assert.ok(!headsetAt(mailAgent), 'no headset on the mail agent');
  assert.deepEqual(texts.sort(), ['✉️', '💬'].sort());
  const phoneAgent = v.people.find((p) => p.role === 'agent' && p.activity === 'phone'
    && v.clients.find((c) => c.id === p.task?.clientId)?.channel === 'phone' && at(p)?.path.length === 0 && !at(p).gone);
  assert.ok(phoneAgent && headsetAt(phoneAgent), 'phone agents keep the headset');
});

// ---- advisor on desk build-done (Task 4 ruling) ------------------------------

test('desk build-done: the advisor does not name the featured person', () => {
  const featured = (researchId) => eventText({ id: 'build-done', day: 1,
    data: { researchId, names: [], helped: [], featured: { personId: 'p1', name: '하나' } } });
  assert.equal(featured('chat-desk').advisor, '이게 센터장님이 한 일이에요.');
  assert.equal(featured('mail-desk').advisor, '이게 센터장님이 한 일이에요.');
  assert.equal(featured('chat-desk').text, '채팅 창구가 열렸어요. 하나 씨가 첫 인사 문장을 몇 번이나 고쳐 써 보네요.');
  // Helped people still get the line with their name.
  const helped = eventText({ id: 'build-done', day: 1,
    data: { researchId: 'rest-room', names: ['하나'], helped: [{ personId: 'p1', name: '하나' }] } });
  assert.equal(helped.advisor, '보세요, 하나 씨 얼굴이 달라졌죠? 이게 센터장님이 한 일이에요.');
});
