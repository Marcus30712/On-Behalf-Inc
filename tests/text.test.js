import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UI_TEXT } from '../ui/text.js';
import { fill, eventText, withParticle } from '../ui/text.js';
import { formatTime, formatDate, formatMoney, formatPct, formatSec } from '../ui/format.js';
import { refusalText } from '../ui/panels.js';
import { EVENTS } from '../world/events.js';
import { RESEARCH } from '../world/research.js';

const leaves = (obj, path = []) => Object.entries(obj).flatMap(([k, v]) =>
  (v !== null && typeof v === 'object' ? leaves(v, [...path, k]) : [[[...path, k].join('.'), v]]));

const REPRESENTATIVE = {
  sick: { personId: 'p1', clientId: 'gureum-travel', data: { name: '하나', client: '구름다리 여행', days: 3 } },
  burnout: { data: { name: '하나', client: '구름다리 여행', days: 5 } },
  'no-show': { data: { name: '하나', client: '구름다리 여행' } },
  argument: { data: { name: '하나', client: '구름다리 여행' } },
  'call-spike': { data: { client: '구름다리 여행', day: 12 } },
  'churn-warning': { data: { client: '물빛 통신', days: 20 } },
  'research-done': { data: { researchId: 'clinic', names: ['하나'] } },
  'build-done': { data: { researchId: 'clinic', names: ['하나'], helped: [{ personId: 'p1', name: '하나', daysLeft: 2 }] } },
  'game-over-cash': { data: { days: 40 } },
  'game-over-clients': { data: { days: 40 } },
  'milestone-big-client': {},
  'milestone-rank-s': {},
  'holiday-leave': { data: { name: '하나', holidayId: 'harvest', nationId: 'veltora' } },
  'friday-off': { data: { name: '하나', nationId: 'kamuen', fridayDay: 4 } },
  'resign-notice': { data: { name: '하나', days: 3, leaveDay: 9 } },
  candidate: { data: { cand1: '가을', cand2: '나무' } },
  'lead-candidate': { data: { cand1: '가을', cand2: '나무', c1: 6, c2: 7.5, p1: 4.7, p2: 3 } },
  'client-offer': { data: { client: '달빛몰' }, clientId: 'dalbit-mall' },
  'backlog-warning': { clientId: 'solbang-books', data: { n: 120 } },
  'expansion-start': { data: { level: 1, days: 10 } },
  'expansion-done': { data: { level: 2, seats: 16 } },
  'breaks-auto': {},
};

test('every event id in EVENTS renders without leftover braces', () => {
  for (const id of Object.keys(EVENTS)) {
    assert.ok(REPRESENTATIVE[id], `representative data for ${id}`);
    const out = eventText({ id, day: 3, ...REPRESENTATIVE[id] });
    const all = [out.title, out.text, out.advisor, ...(out.choices ?? []).flatMap((c) => [c.label, c.result])];
    for (const s of all) {
      assert.equal(typeof s, 'string', id);
      assert.ok(!s.includes('{') && !s.includes('}'), `${id}: ${s}`);
    }
    assert.ok(out.title.length > 0 && out.text.length > 0, id);
  }
});

test('every research done event renders with its research text', () => {
  for (const r of RESEARCH) {
    const out = eventText({ id: 'research-done', day: 1, data: { researchId: r.id } });
    assert.ok(out.title.includes(r.name));
    assert.ok(out.text.includes(`${r.buildHours}시간`));
  }
});

test('sick event for a lead drops the client sentence', () => {
  const out = eventText({ id: 'sick', day: 2, data: { name: '하나', days: 3 } });
  assert.match(out.text, /하나 씨가 몸살로 3일 쉬어야 해요\./);
  assert.ok(!out.text.includes('응대 인원'));
  const withClient = eventText({ id: 'sick', day: 2, data: { name: '하나', days: 3, client: '물빛 통신' } });
  assert.ok(withClient.text.includes('물빛 통신 응대 인원이 한 명 줄어요.'));
});

test('build-done with nobody helped uses textNobody', () => {
  const out = eventText({ id: 'build-done', day: 2, data: { researchId: 'rest-room', names: [], helped: [] } });
  assert.equal(out.text, '휴게실 개선이 완공됐어요. 다들 반가워해요.');
  assert.equal(out.title, '휴게실 개선 완공');
});

test('build-done with two helped names both', () => {
  const out = eventText({
    id: 'build-done',
    day: 2,
    data: { researchId: 'rest-room', helped: [{ personId: 'a', name: '하나' }, { personId: 'b', name: '두리' }] },
  });
  assert.ok(out.text.includes('하나'));
  assert.ok(out.text.includes('두리'));
  assert.ok(out.text.startsWith('휴게실이 새로 단장됐어요.'));
});

test('build-done fills the clinic days from the helped person', () => {
  const out = eventText({
    id: 'build-done', day: 2,
    data: { researchId: 'clinic', helped: [{ personId: 'a', name: '하나', daysLeft: 2 }] },
  });
  assert.ok(out.text.includes('하나 씨의 병가가 2일로 줄었어요.'));
});

test('holiday-leave takes the holiday name from holidayId', () => {
  const out = eventText({ id: 'holiday-leave', day: 2, data: { name: '하나', holidayId: 'harvest' } });
  assert.ok(out.text.includes('내일부터 거둠 연휴예요.'));
});

test('friday-off takes the nation name from nationId', () => {
  const out = eventText({ id: 'friday-off', day: 2, data: { name: '하나', nationId: 'kamuen' } });
  assert.ok(out.text.startsWith('카무엔에서는'));
});

test('candidate choices carry the candidate names', () => {
  const out = eventText({ id: 'candidate', day: 2, data: { cand1: '가을', cand2: '나무' } });
  assert.deepEqual(out.choices.map((c) => c.id), ['pick-1', 'pick-2', 'hold']);
  assert.equal(out.choices[0].label, '가을 씨를 뽑는다');
  assert.equal(out.choices[1].result.startsWith('나무 씨가'), true);
});

test('event without choices has no choices key; advisor is stable', () => {
  const e = { id: 'no-show', day: 5, data: { name: '하나' } };
  assert.equal(eventText(e).choices, undefined);
  assert.equal(eventText(e).advisor, eventText(e).advisor);
});

test('auto-resolved event adds the auto note', () => {
  const e = {
    id: 'holiday-leave', day: 2, data: { name: '하나', holidayId: 'harvest' }, resolved: true, choice: 'grant', auto: true,
  };
  const out = eventText(e);
  assert.ok(out.text.endsWith("답이 없어 '휴가를 허락한다'로 처리했어요."), out.text);
  const manual = eventText({ ...e, auto: false });
  assert.ok(!manual.text.includes('답이 없어'));
});

test('auto note for a choice ending without a 받침 uses 로', () => {
  const e = {
    id: 'client-offer', day: 2, clientId: 'dalbit-mall', data: { client: '달빛몰' }, resolved: true, choice: 'decline', auto: true,
  };
  assert.ok(eventText(e).text.endsWith("'정중히 거절한다'로 처리했어요."));
});

test('withParticle: 받침 gets 으로, no 받침 or ㄹ gets 로', () => {
  assert.equal(withParticle('책'), '책으로');
  assert.equal(withParticle('집 정리'), '집 정리로');
  assert.equal(withParticle('휴가'), '휴가로');
  assert.equal(withParticle('서울'), '서울로');
  assert.equal(withParticle('공장'), '공장으로');
  assert.equal(withParticle('ABC'), 'ABC로');
});

test('fill drops a sentence with a missing value and keeps the others', () => {
  assert.equal(fill('{a}가 왔어요. {b}도 왔어요. 끝!', { a: '가' }), '가가 왔어요. 끝!');
  assert.equal(fill('첫째예요? {x}예요. 셋째!', {}), '첫째예요? 셋째!');
  assert.equal(fill('{a}만 있어요.', { a: 0 }), '0만 있어요.');
  assert.equal(fill('{a}', {}), '');
  assert.equal(fill('{a} 씨가 {a} 씨를 봐요', { a: '나' }), '나 씨가 나 씨를 봐요');
});

test('fill keeps 이(가) correct after the value', () => {
  assert.equal(fill('{r}이(가) 끝났어요.', { r: '의무실' }), '의무실이 끝났어요.');
  assert.equal(fill('{r}이(가) 끝났어요.', { r: '유연 근무' }), '유연 근무가 끝났어요.');
});

test('formatTime, formatMoney, formatPct, formatSec', () => {
  assert.equal(formatTime(0), '00:00');
  assert.equal(formatTime(9 * 60 + 5), '09:05');
  assert.equal(formatTime(21 * 60), '21:00');
  assert.equal(formatMoney(12400), '12,400');
  assert.equal(formatMoney(-500), '-500');
  assert.equal(formatPct(0.82), '82.00%');
  assert.equal(formatPct(null), '—');
  assert.equal(formatSec(14.4), '14초');
  assert.equal(formatSec(14.4), fill(UI_TEXT.metrics.asaUnit, { n: 14 }));
  assert.equal(formatSec(null), '—');
});

test('formatDate shows year, month, date and the weekday label', () => {
  assert.equal(formatDate({ year: 3, month: 4, date: 12, weekdayLabel: '화' }), '3년차 4월 12일 (화)');
});

test('UI_TEXT strings are all non-empty', () => {
  const all = leaves(UI_TEXT);
  assert.ok(all.length > 250, `only ${all.length} strings`);
  for (const [key, value] of all) {
    assert.equal(typeof value, 'string', key);
    assert.ok(value.trim().length > 0, key);
  }
});

test('no banned word in UI_TEXT', () => {
  for (const [key, value] of leaves(UI_TEXT)) assert.ok(!value.includes('진상'), key);
});

test('UI_TEXT keeps the approved key shape', () => {
  assert.equal(UI_TEXT.tabs.people.name, '사람');
  assert.equal(UI_TEXT.tabs.people.tip, '직원 한 명 한 명의 상태를 봐요');
  assert.equal(UI_TEXT.activity.idle, '대기');
  assert.equal(UI_TEXT.inbox.auto, "답이 없어 '{choice}'(으)로 처리했어요.");
  assert.equal(UI_TEXT.refuse['no-seat'], '빈 좌석이 없어요. 지금은 더 뽑을 수 없어요.');
  assert.equal(UI_TEXT.hiring.state.ready, '채용할 수 있어요');
  assert.equal(UI_TEXT.topbar.date, '{year}년차 {month}월 {day}일 ({weekday})');
});

test('fill settles (으)로 after a value with a 받침', () => {
  assert.equal(fill("'{c}'(으)로 처리했어요.", { c: '책' }), "'책'으로 처리했어요.");
  assert.equal(fill("'{c}'(으)로 처리했어요.", { c: '서울' }), "'서울'로 처리했어요.");
});

test('fill settles particles written right after a value', () => {
  assert.equal(fill('{a}가 왔어요.', { a: '달빛몰' }), '달빛몰이 왔어요.');
  assert.equal(fill('{a}가 왔어요.', { a: '가을' }), '가을이 왔어요.');
  assert.equal(fill('{a}가 왔어요.', { a: '나무' }), '나무가 왔어요.');
  assert.equal(fill('{a}를 봐요. {a}은 {a}와 {a}로', { a: '물빛 통신' }), '물빛 통신을 봐요. 물빛 통신은 물빛 통신과 물빛 통신으로');
  assert.equal(fill('{a}를 {a}는 {a}와 {a}로', { a: '나무' }), '나무를 나무는 나무와 나무로');
  assert.equal(fill('{a}에서 {a} 가요 {a}가을', { a: '달빛몰' }), '달빛몰에서 달빛몰 가요 달빛몰가을');
});

test('real client names get grammatical particles in churn-warning and client-offer', () => {
  const names = { 'gureum-travel': '구름다리 여행', 'mulbit-telecom': '물빛 통신', 'dalbit-mall': '달빛몰' };
  for (const [clientId, client] of Object.entries(names)) {
    const warn = eventText({ id: 'churn-warning', day: 1, clientId, data: { client, days: 20 } });
    assert.ok(warn.title.startsWith(`${client}이 계약 해지를`), warn.title);
    const offer = eventText({ id: 'client-offer', day: 1, clientId, data: { client } });
    assert.ok(offer.choices[0].result.startsWith(`${client}이 새 고객사가 돼요.`), offer.choices[0].result);
    assert.ok(offer.text.startsWith(`${client}에서`));
  }
});

const offer = (clientId, data) => eventText({ id: 'client-offer', day: 3, clientId, data });

test('client-offer text: old text at level 0, textMore after expansion, textWeekend for the weekend client', () => {
  assert.match(offer('dalbit-mall').text, /좌석이 8개뿐이라/);
  assert.equal(offer('dalbit-mall').choices[0].result, '달빛몰이 새 고객사가 돼요. 상담사를 세 고객사에 나눠 배치하세요.');
  const more = offer('dalbit-mall', { officeLevel: 1 });
  assert.ok(!more.text.includes('8개뿐'));
  assert.match(more.text, /받으면 지금 인원을 나눠야 해요\.$/);
  assert.match(more.choices[0].result, /업무 배치에서 응대 인원을 정해 주세요\./);
  const bandi = offer('bandi-repair');
  assert.match(bandi.text, /^반딧불 가전에서 계약을 제안했어요\./);
  assert.match(bandi.choices[0].result, /업무 배치/);
  const weekend = offer('baram-delivery', { officeLevel: 1 });
  assert.match(weekend.text, /^바람개비 배달에서 주말 계약을 제안했어요\. 토·일 09:00~18:00에 전화를 받아요\./);
  assert.match(weekend.choices[0].result, /주말 조를 짜 주세요\./);
  assert.match(weekend.advisor, /주말 일은 누가 쉬는지/);
  assert.match(more.advisor, /큰 기회예요/);
});

test('a re-offer starts with the again sentence', () => {
  const out = offer('bandi-repair', { officeLevel: 1, again: true });
  assert.ok(out.text.startsWith('예전에 인연이 닿지 않았던 반딧불 가전에서 다시 연락이 왔어요. 반딧불 가전에서 계약을 제안했어요.'));
  assert.ok(!offer('bandi-repair', { officeLevel: 1 }).text.includes('예전에'));
});

test('expansion events fill stage, days and seats', () => {
  const done = eventText({ id: 'expansion-done', day: 1, data: { level: 1, seats: 12 } });
  assert.equal(done.title, '창가 구역 완공');
  assert.match(done.text, /^창가 구역이 문을 열었어요\. 이제 상담사 좌석이 12개예요\./);
  assert.ok(done.advisor.length > 0);
  const start = eventText({ id: 'expansion-start', day: 1, data: { level: 2, days: 15 } });
  assert.equal(start.title, '안쪽 구역 공사 시작');
  assert.match(start.text, /15근무일 뒤에 완공돼요/);
});

test('v1.2 UI_TEXT keys exist', () => {
  for (const k of ['shift.weekend.short', 'shift.weekend.full', 'tasks.seatsOf', 'refuse.office.no-cash', 'refuse.building', 'refuse.max-level', 'topbar.weekendOpen', 'metrics.weekendOnly', 'metrics.weekendOnlyTip', 'roster.weekendHelp', 'roster.weekendCount', 'roster.sixDays', 'roster.sixDaysShort', 'office.title', 'office.confirmText', 'office.stages.2.name']) {
    assert.equal(typeof k.split('.').reduce((o, p) => o?.[p], UI_TEXT), 'string', k);
  }
  assert.equal(UI_TEXT.shift.weekend.full, '주말 조');
});

// Final review, Important 2 + 3: a number takes its particle and copula by how
// it reads in Korean (its last read syllable), and {x}예요 settles like 이/가.
test('a number settles 은/는 by its Korean reading', () => {
  const cases = {
    '30,000': '은', // 삼만
    '36,000': '은', // 삼만육천
    '9,000': '은', // 구천
    '17,000': '은', // 만칠천
    '1,500': '은', // 천오백
    '2,000': '은', // 이천
    10: '은', // 십
    1: '은', // 일
    2: '는', // 이
    3: '은', // 삼
    4: '는', // 사
    5: '는', // 오
    6: '은', // 육
    7: '은', // 칠
    8: '은', // 팔
    9: '는', // 구
    0: '은', // 영
    '120,000,000': '은', // 일억이천만
    '1.5': '는', // 일점오
  };
  for (const [n, particle] of Object.entries(cases)) {
    assert.equal(fill('{n}은 나가요.', { n }), `${n}${particle} 나가요.`, n);
  }
  assert.equal(fill('{n}로 가요.', { n: '30,000' }), '30,000으로 가요.');
  assert.equal(fill('{n}로 가요.', { n: '1' }), '1로 가요.');
  assert.equal(fill('{n}가 남았어요.', { n: '9' }), '9가 남았어요.');
  assert.equal(fill('{n}가 남았어요.', { n: '36' }), '36이 남았어요.');
});

test('{x}예요 settles to 이에요 after a 받침 and 예요 otherwise', () => {
  assert.equal(fill('비용은 {c}예요.', { c: '💰 30,000' }), '비용은 💰 30,000이에요.');
  assert.equal(fill('비용은 {c}예요.', { c: '💰 1,500' }), '비용은 💰 1,500이에요.');
  assert.equal(fill('비용은 {c}예요.', { c: '9' }), '비용은 9예요.');
  assert.equal(fill('오늘은 {h}예요.', { h: '씨앗날' }), '오늘은 씨앗날이에요.');
  assert.equal(fill('오늘은 {h}예요.', { h: '해넘이 연휴' }), '오늘은 해넘이 연휴예요.');
  assert.equal(fill('오늘은 {h}이에요.', { h: '해넘이 연휴' }), '오늘은 해넘이 연휴예요.');
});

test('rendered money lines read right: refusals, offers and the holiday line', () => {
  assert.equal(refusalText('no-cash', { type: 'startHiring' }), '돈이 모자라요. 채용 비용은 💰 1,500이에요.');
  assert.equal(refusalText('no-cash', { type: 'startExpansion' }, { office: { next: { cost: 30000 } } }),
    '돈이 모자라요. 공사 비용은 💰 30,000이에요.');
  assert.equal(refusalText('no-cash', { type: 'startExpansion' }, { office: { next: { cost: 36000 } } }),
    '돈이 모자라요. 공사 비용은 💰 36,000이에요.');
  assert.match(offer('bandi-repair').text, /월 계약금은 💰 17,000이에요\. /);
  assert.match(offer('baram-delivery', { officeLevel: 1 }).text, /월 계약금은 💰 9,000이에요\.$/);
  assert.match(offer('dalbit-mall').text, /월 계약금은 💰 24,000이에요\. /);
  const seed = eventText({ id: 'holiday-leave', day: 1, data: { name: '하나', holidayId: 'seed-day', nationId: 'veltora' } });
  assert.ok(seed.text.startsWith('내일부터 씨앗날이에요. 하나 씨가'), seed.text);
  const year = eventText({ id: 'holiday-leave', day: 1, data: { name: '하나', holidayId: 'year-turn', nationId: 'veltora' } });
  assert.ok(year.text.startsWith('내일부터 해넘이 연휴예요. '), year.text);
});

// v1.3 channels: literal rendered strings (numbers and 예요/이에요 settle at render time).
test('chat and email offers use their own variants, fee and target', () => {
  const chat = offer('saebyeol-bank');
  assert.equal(chat.text, '새벽별 은행에서 채팅 상담 계약을 제안했어요. 한 사람이 채팅 두 건을 함께 받아요. 목표는 60초 안에 80.00%, 월 계약금은 💰 20,000이에요.');
  assert.equal(chat.choices[0].result, '새벽별 은행이 새 고객사가 돼요. 업무 배치에서 채팅을 맡을 사람을 정해 주세요.');
  assert.equal(chat.advisor, '채팅은 동시에 받으니 사람이 적어 보여도 돼요. 다만 한 건이 길어지는 건 각오해야 해요.');
  const mail = offer('solbang-books');
  assert.equal(mail.text, '솔방울 서점에서 이메일 상담 계약을 제안했어요. 메일은 쌓아 두었다가 답해도 되지만 기한이 있어요. 목표는 영업시간 12시간 안에 90.00%, 월 계약금은 💰 12,000이에요.');
  assert.equal(mail.choices[0].result, '솔방울 서점이 새 고객사가 돼요. 업무 배치에서 메일을 맡을 사람을 정해 주세요. 아무도 없으면 메일이 계속 쌓여요.');
  assert.equal(mail.advisor, '메일은 조용히 쌓여요. 한가한 사람이 생기면 메일부터 맡겨 봐요.');
  // Channel wins over the v1.2 office-level variant; a re-offer keeps its prefix.
  assert.equal(offer('saebyeol-bank', { officeLevel: 1 }).text, chat.text);
  assert.equal(offer('solbang-books', { officeLevel: 2, again: true }).text,
    '예전에 인연이 닿지 않았던 솔방울 서점에서 다시 연락이 왔어요. ' + mail.text);
  assert.equal(offer('saebyeol-bank', { again: true }).choices[1].result, '지금 인원으로 지금 고객사에 집중해요.');
});

test('backlog-warning renders its copy and advice', () => {
  const out = eventText({ id: 'backlog-warning', day: 3, clientId: 'solbang-books', data: { n: 120 } });
  assert.equal(out.title, '솔방울 서점 메일이 밀려요');
  assert.equal(out.text, '답장을 기다리는 메일이 120통이에요. 기한을 넘긴 메일이 늘면 솔방울 서점의 만족도가 떨어져요.');
  assert.equal(out.advisor, '솔방울 서점 메일이 120통 밀렸어요. 오늘 안에 다 못 보면 내일 아침이 더 무거워요.');
});

test('desk build-done events show the done text with the featured person', () => {
  const data = (researchId) => ({ researchId, names: [], helped: [], featured: { personId: 'p1', name: '하나' } });
  assert.equal(eventText({ id: 'build-done', day: 1, data: data('chat-desk') }).text,
    '채팅 창구가 열렸어요. 하나 씨가 첫 인사 문장을 몇 번이나 고쳐 써 보네요.');
  assert.equal(eventText({ id: 'build-done', day: 1, data: data('mail-desk') }).text,
    '메일 창구가 열렸어요. 하나 씨가 답장 서식을 벽에 붙여 두었어요.');
  // Nobody to name: the nobody text.
  assert.equal(eventText({ id: 'build-done', day: 1, data: { researchId: 'chat-desk', helped: [] } }).text,
    '채팅 창구가 완공됐어요. 다들 반가워해요.');
});

test('v1.3 UI_TEXT keys hold the approved copy', () => {
  const t = UI_TEXT;
  assert.equal(t.channel.phone, '📞 전화');
  assert.equal(t.channel.chat, '💬 채팅');
  assert.equal(t.channel.email, '✉️ 이메일');
  assert.equal(t.channel.chatTip, '한 사람이 채팅 두 건을 함께 받아요. 고객은 전화보다 조금 더 기다려 줘요.');
  assert.equal(t.channel.emailTip, '바로 받지 않아도 되지만, 미루면 밀린 메일이 쌓여요. 문을 닫은 시간에는 기한이 흐르지 않아요.');
  const want = { backlog: '밀린 메일', backlogUnit: '{n}통', onTime: '기한 안 답장',
    targetEmail: '영업시간 {hours}시간 안에 {pct}%', answered: '답장한 메일', received: '들어온 메일', chats: '들어온 채팅',
    chatsHandled: '받은 채팅', noneEmail: '오늘은 아직 메일이 없어요.', noneChat: '오늘은 아직 채팅이 없어요.' };
  for (const [k, v] of Object.entries(want)) assert.equal(t.metrics[k], v, k);
});

test('the email target reads hours from openMinutes', () => {
  const out = offer('solbang-books');
  assert.ok(out.text.includes('목표는 영업시간 12시간 안에 90.00%,'));
});

test('no leftover braces in any new v1.3 event or variant', () => {
  for (const [clientId, data] of [['saebyeol-bank', {}], ['solbang-books', {}], ['solbang-books', { again: true }]]) {
    const out = offer(clientId, data);
    for (const s of [out.title, out.text, out.advisor, ...out.choices.flatMap((c) => [c.label, c.result])]) {
      assert.ok(!/[{}]/.test(s), s);
    }
  }
  const w = eventText({ id: 'backlog-warning', day: 1, clientId: 'solbang-books', data: { n: 120 } });
  for (const s of [w.title, w.text, w.advisor]) assert.ok(!/[{}]/.test(s), s);
});

// v1.4 Task 2: approved copy (docs/superpowers/specs/2026-11-25-v1.4-copy.md §1, §2).
test('v1.4 changed lines read as approved', () => {
  assert.equal(UI_TEXT.task.phone.name, '상담 응대');
  assert.equal(UI_TEXT.tasks.help, '사람마다 맡을 일을 골라요. 상담 응대는 어느 고객사를 맡을지도 골라요.');
});

test('v1.4 new UI_TEXT keys have the exact approved text; dropped keys are gone', () => {
  assert.equal(UI_TEXT.tasks.covering, '{client} 돕는 중');
  assert.equal(UI_TEXT.tasks.coveringTip, '맡은 고객사가 문을 닫은 시간이라, 문을 연 {client}을 돕고 있어요.');
  assert.equal(UI_TEXT.metrics.closedToday, '오늘 휴무');
  assert.equal(UI_TEXT.metrics.closedTodayTip, '이 고객사는 오늘 문을 열지 않아요.');
  assert.equal(UI_TEXT.roster.colSixDays, '주 6일');
  assert.equal(UI_TEXT.office.tabTip, undefined);
  assert.equal(UI_TEXT.refuse['need-previous'], undefined);
});

// v1.8: three lines from the phone-only days now cover chat and email too.
test('v1.8 channel-neutral copy', async () => {
  const { ADVISOR: ADVICE } = await import('../world/advisor.js');
  const { EVENTS } = await import('../world/events.js');
  assert.equal(UI_TEXT.task.phone.tip, '고객사의 전화·채팅·메일을 맡아요.');
  assert.equal(ADVICE['expansion-start'][0], '공사하는 동안에도 상담은 들어와요. 배치는 평소처럼 챙겨 주세요.');
  assert.equal(EVENTS['game-over-clients'].text, '남은 고객사가 하나도 없어요. 맡을 상담이 없어 센터는 여기서 문을 닫아요. 함께한 {days}일, 고마웠어요.');
});
