import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLANET } from '../world/planet.js';
import { NATIONS } from '../world/nations.js';
import { NAMES } from '../world/names.js';
import { TRAITS } from '../world/traits.js';
import { CLIENTS } from '../world/clients.js';
import { RESEARCH } from '../world/research.js';
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

test('research has the four ids from the spec', () => {
  assert.deepEqual(RESEARCH.map((r) => r.id).sort(), ['clinic', 'flexible-shifts', 'rest-room', 'stress-training']);
  for (const r of RESEARCH) {
    assert.ok(r.cost >= 60 && r.cost <= 120, r.id);
    assert.ok(r.buildHours >= 8 && r.buildHours <= 24, r.id);
    assert.ok(r.doneText, r.id);
  }
});

test('two starting clients and one offer, hours Mon-Fri 09:00-21:00', () => {
  assert.equal(CLIENTS.filter((c) => c.start).length, 2);
  assert.equal(CLIENTS.filter((c) => !c.start).length, 1);
  for (const c of CLIENTS) {
    assert.deepEqual(c.hours.days, [0, 1, 2, 3, 4]);
    assert.equal(c.hours.open, 540);
    assert.equal(c.hours.close, 1260);
    assert.ok(NATIONS.some((n) => n.id === c.nation), c.id);
    assert.ok(c.callsPerDay >= 60 && c.callsPerDay <= 150, c.id);
    assert.ok(c.ahtMin >= 4 && c.ahtMin <= 6, c.id);
    assert.ok(c.patienceSec >= 60 && c.patienceSec <= 120, c.id);
  }
});

const USED_EVENTS = ['sick', 'burnout', 'no-show', 'argument', 'resign-notice', 'holiday-leave', 'friday-off', 'call-spike', 'client-offer', 'churn-warning', 'research-done', 'build-done', 'candidate', 'game-over-cash', 'game-over-clients', 'milestone-big-client', 'milestone-rank-s', 'expansion-done'];
// Ids the sim pushes whose copy is not approved yet; Task 5 adds their text to world/events.js and empties this list.
const PENDING_COPY = ['expansion-done'];

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
