import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UI_TEXT } from '../ui/text.js';
import { fill, eventText, withParticle } from '../ui/text.js';
import { formatTime, formatDate, formatMoney, formatPct, formatSec } from '../ui/format.js';
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
  'client-offer': { data: { client: '달빛몰' }, clientId: 'dalbit-mall' },
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
  assert.equal(formatPct(0.82), '82%');
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
