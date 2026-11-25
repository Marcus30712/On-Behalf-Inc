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
    assert.ok(c.callsPerDay >= 60 && c.callsPerDay <= 150, c.id);
    assert.ok(c.ahtMin >= 4 && c.ahtMin <= (c.channel ? 9 : 6), c.id);
    assert.ok(c.patienceSec === undefined || (c.patienceSec >= 60 && c.patienceSec <= (c.channel === 'chat' ? 240 : 120)), c.id);
  }
});

const USED_EVENTS = ['sick', 'burnout', 'no-show', 'argument', 'resign-notice', 'holiday-leave', 'friday-off', 'call-spike', 'client-offer', 'churn-warning', 'research-done', 'build-done', 'candidate', 'game-over-cash', 'game-over-clients', 'milestone-big-client', 'milestone-rank-s', 'expansion-done', 'backlog-warning'];
// Ids the sim pushes whose copy is not in world/ yet (v1.3 Task 4 adds it).
const PENDING_COPY = ['backlog-warning'];

test('every event used by the sim has text, and advice', () => {
  for (const id of USED_EVENTS.filter((e) => !PENDING_COPY.includes(e))) {
    assert.ok(EVENTS[id]?.title && EVENTS[id]?.text, id);
    assert.ok(Array.isArray(ADVISOR[id]) && ADVISOR[id].length >= 1, id);
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
  assert.equal(chat.blurb, '상담 화면에 채팅 창을 붙이고, 짧고 또렷하게 쓰는 법을 익혀요. 채팅 상담 계약을 받을 수 있어요.');
  assert.equal(chat.doneText, '채팅 창구가 열렸어요. {name} 씨가 첫 인사 문장을 몇 번이나 고쳐 써 보네요.');
  assert.equal(mail.name, '메일 창구');
  assert.equal(mail.blurb, '메일함을 고객사별로 나누고 답장 서식을 만들어요. 이메일 상담 계약을 받을 수 있어요.');
  assert.equal(mail.doneText, '메일 창구가 열렸어요. {name} 씨가 답장 서식을 벽에 붙여 두었어요.');
  for (const r of [chat, mail]) { assert.deepEqual(r.effect, {}); assert.equal(r.cost, 90); assert.equal(r.buildHours, 20); }
});
