import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dateOf, isWorkday, holidaysOn, upcomingHolidays } from '../sim/calendar.js';

const fixedHoliday = { id: 'spring', rule: { kind: 'fixed', month: 3, date: 1 }, length: 1, staffLeave: 0.9, callEffect: { during: 0.3, after: 1.2, afterDays: 1 } };
const nationA = { id: 'a', weeklyRest: [5, 6], holidays: [fixedHoliday] };

test('day 0 is year 1, month 1, date 1, Monday', () => {
  assert.deepEqual(dateOf(0), { year: 1, month: 1, date: 1, weekday: 0 });
});

test('day 359 is year 1, month 12, date 30', () => {
  const d = dateOf(359);
  assert.equal(d.year, 1);
  assert.equal(d.month, 12);
  assert.equal(d.date, 30);
});

test('day 360 is year 2 month 1 date 1', () => {
  const d = dateOf(360);
  assert.equal(d.year, 2);
  assert.equal(d.month, 1);
  assert.equal(d.date, 1);
});

test('weekday cycles', () => {
  assert.equal(dateOf(5).weekday, 5);
  assert.equal(isWorkday(5), false);
  assert.equal(isWorkday(6), false);
  assert.equal(isWorkday(7), true);
  assert.equal(isWorkday(4), true);
});

test('fixed holiday every year', () => {
  const y1 = 2 * 30; // March 1, year 1
  const y2 = 360 + 2 * 30;
  assert.equal(holidaysOn(y1, nationA).length, 1);
  assert.equal(holidaysOn(y2, nationA).length, 1);
  assert.equal(holidaysOn(y1 + 1, nationA).length, 0);
  assert.equal(holidaysOn(y1, nationA)[0].holiday.id, 'spring');
  assert.equal(holidaysOn(y2, nationA)[0].startDay, y2);
  assert.equal(holidaysOn(y2, nationA)[0].dayOfHoliday, 1);
});

test('drifting holiday moves earlier each year', () => {
  const h = { id: 'moon', rule: { kind: 'drifting', baseDay: 100, driftPerYear: 11 }, length: 3, staffLeave: 0.8, callEffect: { during: 0.2, after: 1.5, afterDays: 2 } };
  const n = { id: 'b', weeklyRest: [6], holidays: [h] };
  const y1 = upcomingHolidays(0, n, 359);
  assert.equal(y1.length, 1);
  assert.equal(y1[0].startDay, 100);
  const y2 = upcomingHolidays(360, n, 359);
  assert.equal(y2[0].startDay, 100 + 360 - 11);
  assert.equal(y2[0].startDay, y1[0].startDay + 360 - 11);
});

test('drifting holiday crosses the year end', () => {
  const start = 11 * 30 + 28; // Dec 29, year 1 (30-day months: Dec 29,30, Jan 1,2,3 = 5 days)
  const h = { id: 'long', rule: { kind: 'drifting', baseDay: start, driftPerYear: 0 }, length: 5, staffLeave: 1, callEffect: { during: 0.1, after: 1, afterDays: 0 } };
  const n = { id: 'c', weeklyRest: [], holidays: [h] };
  for (let i = 0; i < 5; i++) {
    const r = holidaysOn(start + i, n);
    assert.equal(r.length, 1);
    assert.equal(r[0].dayOfHoliday, i + 1);
    assert.equal(r[0].startDay, start);
  }
  const last = dateOf(start + 4);
  assert.equal(last.year, 2);
  assert.equal(last.month, 1);
  assert.equal(last.date, 3);
  assert.equal(holidaysOn(start + 5, n).length, 0);
  assert.equal(holidaysOn(start - 1, n).length, 0);
});

test('drifting holiday that began in an earlier year spills in', () => {
  const h = { id: 'drift', rule: { kind: 'drifting', baseDay: 0, driftPerYear: 20 }, length: 3, staffLeave: 1, callEffect: { during: 0.1, after: 1, afterDays: 0 } };
  const n = { id: 'd', weeklyRest: [], holidays: [h] };
  // year 3 start = 2 * 340 = 680 -> year 2 (day 680 is year 2, month 12, date 21)
  assert.equal(dateOf(680).year, 2);
  assert.equal(holidaysOn(682, n)[0].dayOfHoliday, 3);
});

test('holiday on a weekend still counts', () => {
  const h = { id: 'sat', rule: { kind: 'drifting', baseDay: 5, driftPerYear: 0 }, length: 1, staffLeave: 1, callEffect: { during: 0.1, after: 1, afterDays: 0 } };
  const n = { id: 'e', weeklyRest: [5, 6], holidays: [h] };
  assert.equal(isWorkday(5), false);
  assert.equal(holidaysOn(5, n).length, 1);
});

test('two nations same day', () => {
  const other = { id: 'o', rule: { kind: 'fixed', month: 3, date: 1 }, length: 2, staffLeave: 0.5, callEffect: { during: 0.5, after: 1, afterDays: 0 } };
  const nb = { id: 'b', weeklyRest: [6], holidays: [other] };
  const day = 60;
  assert.equal(holidaysOn(day, nationA)[0].holiday.id, 'spring');
  assert.equal(holidaysOn(day, nb)[0].holiday.id, 'o');
  assert.equal(holidaysOn(day + 1, nationA).length, 0);
  assert.equal(holidaysOn(day + 1, nb).length, 1);
});

test('upcomingHolidays is sorted and windowed, staffAvail passes through', () => {
  const a = { id: 'a', rule: { kind: 'fixed', month: 1, date: 10 }, length: 1, staffLeave: 0, callEffect: { during: 1, after: 1, afterDays: 0 }, staffAvail: 0.5 };
  const b = { id: 'b', rule: { kind: 'fixed', month: 1, date: 5 }, length: 1, staffLeave: 0, callEffect: { during: 1, after: 1, afterDays: 0 } };
  const n = { id: 'n', weeklyRest: [], holidays: [a, b] };
  const r = upcomingHolidays(0, n, 9);
  assert.deepEqual(r.map(x => x.holiday.id), ['b', 'a']);
  assert.equal(r[1].holiday.staffAvail, 0.5);
  assert.equal(upcomingHolidays(0, n, 8).length, 1);
  assert.equal(upcomingHolidays(4, n, 0).length, 1);
});
