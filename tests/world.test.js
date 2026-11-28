import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLANET } from '../world/planet.js';
import { NATIONS } from '../world/nations.js';
import { NAMES } from '../world/names.js';
import { TRAITS } from '../world/traits.js';
import { CLIENTS } from '../world/clients.js';
import { RESEARCH } from '../world/research.js';
import { channelOf } from '../sim/interval.js';
import { EVENTS } from '../world/events.js';
import { ADVISOR } from '../world/advisor.js';
import { holidaysOn } from '../sim/calendar.js';

test('planet has 12 months and 7 plain weekdays', () => {
  assert.equal(PLANET.months.length, 12);
  assert.deepEqual(PLANET.weekdays, ['월', '화', '수', '목', '금', '토', '일']);
});

test('two nations with 5 to 6 holidays each, different weekly rest', () => {
  assert.equal(NATIONS.length, 2);
  for (const n of NATIONS) assert.ok(n.holidays.length >= 5 && n.holidays.length <= 6, n.id);
  assert.notDeepEqual(NATIONS[0].weeklyRest, NATIONS[1].weeklyRest);
});

test('every holiday rule is fixed or drifting and has length >= 1', () => {
  for (const n of NATIONS) {
    for (const h of n.holidays) {
      assert.ok(['fixed', 'drifting'].includes(h.rule.kind), h.id);
      assert.ok(h.length >= 1, h.id);
      assert.ok(h.name && h.blurb, h.id);
    }
  }
});

test('quiet-month has staffAvail 0.8 and quiet-end starts the day after it ends, every year', () => {
  const kamuen = NATIONS.find((n) => n.id === 'kamuen');
  const quiet = kamuen.holidays.find((h) => h.id === 'quiet-month');
  assert.equal(quiet.staffAvail, 0.8);
  for (let y = 1; y <= 5; y++) {
    const start = holidaysOn(quiet.rule.baseDay + (y - 1) * (360 - 11), kamuen)
      .find((o) => o.holiday.id === 'quiet-month').startDay;
    const endDay = holidaysOn(start + quiet.length, kamuen).find((o) => o.holiday.id === 'quiet-end');
    assert.equal(endDay.startDay, start + quiet.length, `year ${y}`);
  }
});

test('at least 20 names per nation, no duplicates within a nation', () => {
  for (const n of NATIONS) {
    const list = NAMES[n.id];
    assert.ok(list.length >= 20, n.id);
    assert.equal(new Set(list).size, list.length, n.id);
  }
});

test('research has the four ids from the spec and the two desks', () => {
  assert.deepEqual(RESEARCH.map((r) => r.id).sort(), ['chat-desk', 'clinic', 'flexible-shifts', 'mail-desk', 'rest-room', 'stress-training']);
  for (const r of RESEARCH) {
    assert.ok(r.cost >= 60 && r.cost <= 120, r.id);
    assert.ok(r.buildHours >= 8 && r.buildHours <= 24, r.id);
    assert.ok(r.doneText, r.id);
  }
});

test('two starting clients and three offers; weekday hours Mon-Fri 09:00-21:00 except the weekend client', () => {
  assert.equal(CLIENTS.filter((c) => c.start).length, 2);
  assert.equal(CLIENTS.filter((c) => !c.start).length, 5);
  const weekend = CLIENTS.filter((c) => c.hours.days.includes(5));
  assert.deepEqual(weekend.map((c) => c.id), ['baram-delivery']);
  assert.deepEqual(weekend[0].hours, { days: [5, 6], open: 540, close: 1080 });
  for (const id of ['bandi-repair', 'baram-delivery']) assert.equal(CLIENTS.find((c) => c.id === id).requiresOfficeLevel, 1, id);
  for (const c of CLIENTS.filter((x) => !x.hours.days.includes(5))) {
    assert.deepEqual(c.hours.days, [0, 1, 2, 3, 4]);
    assert.equal(c.hours.open, 540);
    assert.equal(c.hours.close, 1260);
  }
  for (const c of CLIENTS) {
    assert.ok(NATIONS.some((n) => n.id === c.nation), c.id);
    // Lower bound 60 -> 48 in v1.6 (real breaks): every callsPerDay is x0.8 of its
    // v1.5 value (user decision 2026-11-26), so baram-delivery is 48 and bandi-repair 56.
    // A test bound, not a game rule.
    assert.ok(c.callsPerDay >= 48 && c.callsPerDay <= 150, c.id);
    assert.ok(c.ahtMin >= 4 && c.ahtMin <= (c.channel ? 9 : 6), c.id);
    assert.ok(c.patienceSec === undefined || (c.patienceSec >= 60 && c.patienceSec <= (c.channel === 'chat' ? 240 : 120)), c.id);
  }
});

const USED_EVENTS = ['sick', 'burnout', 'no-show', 'argument', 'resign-notice', 'holiday-leave', 'friday-off', 'call-spike', 'client-offer', 'churn-warning', 'research-done', 'build-done', 'candidate', 'game-over-cash', 'game-over-clients', 'milestone-big-client', 'milestone-rank-s', 'expansion-done', 'backlog-warning', 'breaks-auto', 'resign-meeting', 'retention-kept', 'retention-failed', 'hire-cancelled'];
// Ids the sim pushes whose copy is not in world/ yet.
const PENDING_COPY = [];
// Advisor key where it differs from the event id.
const ADVISOR_KEY = { 'backlog-warning': 'backlog-growing' };

test('every event used by the sim has text, and advice', () => {
  for (const id of USED_EVENTS.filter((e) => !PENDING_COPY.includes(e))) {
    assert.ok(EVENTS[id]?.title && EVENTS[id]?.text, id);
    const key = ADVISOR_KEY[id] ?? id;
    assert.ok(Array.isArray(ADVISOR[key]) && ADVISOR[key].length >= 1, id);
  }
  assert.ok(EVENTS['build-done'].textNobody);
  for (const id of ['holiday-leave', 'friday-off', 'resign-notice', 'candidate', 'client-offer']) {
    assert.ok(EVENTS[id].choices.length >= 2, id);
    for (const c of EVENTS[id].choices) assert.ok(c.id && c.label && c.result, id);
  }
});

function strings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => strings(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => strings(v, out));
  return out;
}

test('no banned words in any copy string', () => {
  const all = strings([PLANET, NATIONS, NAMES, TRAITS, CLIENTS, RESEARCH, EVENTS, ADVISOR]);
  assert.ok(all.length > 100);
  for (const s of all) assert.ok(!s.includes('진상'), s);
});

test('traits carry no nation', () => {
  for (const t of TRAITS) assert.ok(!('nation' in t), t.id);
  assert.ok(TRAITS.some((t) => t.effect.stressGainMul < 1));
});

test('every client channel is phone, chat or email', () => {
  for (const c of CLIENTS) assert.ok(['phone', 'chat', 'email'].includes(channelOf(c)), c.id);
  assert.equal(channelOf(CLIENTS[0]), 'phone');
  assert.equal('channel' in CLIENTS[0], false, 'existing clients carry no channel key');
  const bank = CLIENTS.find((c) => c.id === 'saebyeol-bank');
  const books = CLIENTS.find((c) => c.id === 'solbang-books');
  assert.deepEqual(
    [bank.name, bank.industry, bank.nation, bank.channel, bank.requiresResearch, bank.monthlyFee, bank.start],
    ['새벽별 은행', '인터넷 은행 상담', 'veltora', 'chat', 'chat-desk', 20000, false],
  );
  assert.deepEqual(bank.slTarget, { pct: 80, sec: 60 });
  assert.deepEqual(
    [books.name, books.industry, books.nation, books.channel, books.requiresResearch, books.monthlyFee, books.start],
    ['솔방울 서점', '온라인 서점 주문·반품', 'kamuen', 'email', 'mail-desk', 12000, false],
  );
  assert.deepEqual(books.slTarget, { pct: 90, openMinutes: 720 });
  for (const c of [bank, books]) assert.deepEqual(c.hours, { days: [0, 1, 2, 3, 4], open: 540, close: 1260 });
});

test('the two desk researches carry the approved copy and an empty effect', () => {
  const chat = RESEARCH.find((r) => r.id === 'chat-desk');
  const mail = RESEARCH.find((r) => r.id === 'mail-desk');
  assert.equal(chat.name, '채팅 창구');
  assert.equal(chat.blurb, '상담 화면에 채팅 창을 붙이고, 짧고 또렷하게 쓰는 법을 익혀요. 사무실을 한 번 넓히면 채팅 상담 계약 제안이 와요.');
  assert.equal(chat.doneText, '채팅 창구가 열렸어요. {name} 씨가 첫 인사 문장을 몇 번이나 고쳐 써 보네요.');
  assert.equal(mail.name, '메일 창구');
  assert.equal(mail.blurb, '메일함을 고객사별로 나누고 답장 서식을 만들어요. 사무실을 두 번 넓히면 이메일 상담 계약 제안이 와요.');
  assert.equal(mail.doneText, '메일 창구가 열렸어요. {name} 씨가 답장 서식을 벽에 붙여 두었어요.');
  for (const r of [chat, mail]) { assert.deepEqual(r.effect, {}); assert.equal(r.cost, 90); assert.equal(r.buildHours, 20); }
});

test('PENDING_COPY is empty and the v1.3 event copy is verbatim', () => {
  assert.deepEqual(PENDING_COPY, []);
  assert.deepEqual(EVENTS['backlog-warning'], { title: '{client} 메일이 밀려요', text: '답장을 기다리는 메일이 {n}통이에요. 기한을 넘긴 메일이 늘면 {client}의 만족도가 떨어져요.' });
  const o = EVENTS['client-offer'];
  assert.equal(o.textChat, '{client}에서 채팅 상담 계약을 제안했어요. 한 사람이 채팅 두 건을 함께 받아요. 목표는 {sl}, 월 계약금은 {fee}예요.');
  assert.equal(o.textEmail, '{client}에서 이메일 상담 계약을 제안했어요. 메일은 쌓아 두었다가 답해도 되지만 기한이 있어요. 목표는 {sl}, 월 계약금은 {fee}예요.');
  assert.equal(o.acceptChat, '{client}가 새 고객사가 돼요. 업무 배치에서 채팅을 맡을 사람을 정해 주세요.');
  assert.equal(o.acceptEmail, '{client}가 새 고객사가 돼요. 업무 배치에서 메일을 맡을 사람을 정해 주세요. 아무도 없으면 메일이 계속 쌓여요.');
  assert.deepEqual(ADVISOR['client-offer-chat'], ['채팅은 동시에 받으니 사람이 적어 보여도 돼요. 다만 한 건이 길어지는 건 각오해야 해요.']);
  assert.deepEqual(ADVISOR['client-offer-email'], ['메일은 조용히 쌓여요. 한가한 사람이 생기면 메일부터 맡겨 봐요.']);
  assert.deepEqual(ADVISOR['backlog-growing'], ['{client} 메일이 {n}통 밀렸어요. 오늘 안에 다 못 보면 내일 아침이 더 무거워요.']);
});

test('v1.4 copy: big-client milestone and churn advice use channel-neutral wording', () => {
  assert.equal(EVENTS['milestone-big-client'].text, '이제 고객사 세 곳의 상담을 함께 맡아요. 작은 센터가 여기까지 왔어요.');
  assert.deepEqual(ADVISOR['churn-warning'], ['아직 늦지 않았어요. 그 고객사에 사람을 더 붙이고 목표부터 맞춰요.']);
});
