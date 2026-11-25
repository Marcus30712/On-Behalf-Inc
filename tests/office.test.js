import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, act, view, advance, load, save } from '../sim/game.js';
import { serialize, deserialize } from '../sim/state.js';
import { OFFICE_LEVELS, seatsOf, startExpansion, advanceExpansion, rentOf } from '../sim/office.js';
import { startHiring } from '../sim/hiring.js';
import { monthEnd } from '../sim/economy.js';
import { eventText } from '../ui/text.js';

test('office levels table', () => {
  assert.deepEqual(OFFICE_LEVELS, [
    { seats: 8, cost: 0, buildWorkdays: 0, rent: 0 },
    { seats: 12, cost: 30000, buildWorkdays: 10, rent: 3000 },
    { seats: 16, cost: 36000, buildWorkdays: 15, rent: 2000 },
  ]);
});

// The approved copy says "공사 비용 💰 {cost}은": right only when the amount, read
// in Korean, ends in a final consonant. Whole thousands end in 천 or 만 (ㄴ).
test('expansion costs are whole thousands, so "{cost}은" reads right', () => {
  for (const { cost } of OFFICE_LEVELS.slice(1)) assert.equal(cost % 1000, 0, String(cost));
});

test('seatsOf defaults to 8 without office, follows level', () => {
  assert.equal(seatsOf({}), 8);
  assert.equal(seatsOf({ office: { level: 1, build: null } }), 12);
  assert.equal(seatsOf({ office: { level: 2, build: null } }), 16);
});

test('startExpansion refuses without cash, while building, at max level', () => {
  const s = createGame(1);
  s.cash = 29999;
  assert.deepEqual(startExpansion(s), { ok: false, reason: 'no-cash' });
  assert.equal(s.cash, 29999);
  s.cash = 100000;
  assert.deepEqual(startExpansion(s), { ok: true });
  assert.equal(s.cash, 70000);
  assert.deepEqual(startExpansion(s), { ok: false, reason: 'building' });
  assert.equal(s.cash, 70000);
  s.office = { level: 2, build: null };
  assert.deepEqual(startExpansion(s), { ok: false, reason: 'max-level' });
});

test('expansion completes after the build workdays, with one event', () => {
  const s = createGame(1);
  s.cash = 100000;
  startExpansion(s);
  assert.deepEqual(s.office.build, { level: 1, workdaysLeft: 10 });
  for (let i = 0; i < 9; i++) advanceExpansion(s);
  assert.equal(s.office.level, 0);
  advanceExpansion(s);
  assert.equal(s.office.level, 1);
  assert.equal(s.office.build, null);
  const done = s.inbox.filter((e) => e.id === 'expansion-done');
  assert.equal(done.length, 1);
  assert.deepEqual(done[0].data, { level: 1, seats: 12 });
  advanceExpansion(s);
  assert.equal(s.inbox.filter((e) => e.id === 'expansion-done').length, 1);
});

test('build counts only workdays through the game loop', () => {
  const s = createGame(1);
  s.cash = 100000;
  act(s, { type: 'startExpansion' });
  advance(s, 1440 * 7); // days 0..6: 5 workdays at most
  assert.ok(s.office.build.workdaysLeft >= 5);
  assert.equal(s.office.level, 0);
});

test('rent is paid at month end for completed levels only', () => {
  const a = createGame(1); const b = createGame(1);
  a.cash = b.cash = 50000;
  b.office = { level: 2, build: null };
  monthEnd(a); monthEnd(b);
  assert.equal(a.cash - b.cash, OFFICE_LEVELS[1].rent + OFFICE_LEVELS[2].rent);
  const c = createGame(1); c.cash = 50000;
  c.office = { level: 0, build: { level: 1, workdaysLeft: 3 } };
  monthEnd(c);
  assert.equal(c.cash, a.cash);
});

test('hiring uses seatsOf: full at 8, free after expansion', () => {
  const s = createGame(1);
  s.cash = 100000;
  assert.deepEqual(startHiring(s), { ok: false, reason: 'no-seat' });
  s.office = { level: 1, build: null };
  assert.deepEqual(startHiring(s), { ok: true });
});

test('act startExpansion and view.office', () => {
  const s = createGame(1);
  assert.deepEqual(view(s).office, {
    level: 0, seats: 8, build: null, rentThisMonth: 0, next: { cost: 30000, buildWorkdays: 10, rent: 3000 },
  });
  s.cash = 40000;
  assert.deepEqual(act(s, { type: 'startExpansion' }), { ok: true });
  assert.equal(view(s).office.build.level, 1);
  s.office = { level: 2, build: null };
  assert.equal(view(s).office.next, null);
  assert.equal(view(s).office.seats, 16);
});

test('v1.1 save without office loads at level 0', () => {
  const s = createGame(1);
  const raw = JSON.parse(serialize(s));
  delete raw.office;
  const loaded = deserialize(JSON.stringify(raw));
  assert.ok(loaded);
  assert.equal(seatsOf(loaded), 8);
  assert.deepEqual(view(loaded).office.build, null);
  assert.deepEqual(act(loaded, { type: 'startExpansion' }), { ok: false, reason: 'no-cash' });
});

// v1.4 Task 5: the month an expansion finishes pays rent from its completion
// day (inclusive) only; months are 30 days. Old saves without a completion day pay in full.
test('rent prorated from completion day', () => {
  const s = createGame(1);
  // Level 1 finished on day 20 of month 0 (days 0-29): days 20-29 are 10 days.
  s.office = { level: 1, build: null, level1Day: 20 };
  assert.equal(rentOf(s, 0, 29), 3000 * 10 / 30);
  assert.equal(rentOf(s, 30, 59), 3000, 'full rent the next month');
  assert.equal(rentOf(s), 3000, 'without a month, the full monthly rent');
  // Through monthEnd: against the same game at level 0.
  const a = createGame(1); const b = createGame(1);
  a.cash = b.cash = 200000;
  a.day = b.day = 29;
  b.office = { level: 1, build: null, level1Day: 20 };
  monthEnd(a); monthEnd(b);
  assert.equal(a.cash - b.cash, 1000);
  a.day = b.day = 59;
  const gap = a.cash - b.cash;
  monthEnd(a); monthEnd(b);
  assert.equal(a.cash - b.cash - gap, 3000);
  // Level 2 finishing on day 45 (days 45-59: 15 days); level 1 is paid in full.
  s.office = { level: 2, build: null, level1Day: 20, level2Day: 45 };
  assert.equal(rentOf(s, 30, 59), 3000 + 2000 * 15 / 30);
  assert.equal(rentOf(s, 60, 89), 5000);
  // A v1.3 save at level 2 has no level2Day: full rent.
  s.office = { level: 2, build: null, level1Day: 20 };
  assert.equal(rentOf(s, 30, 59), 5000);
});

test('finishing expansion 2 records its day', () => {
  const s = createGame(2);
  s.cash = 200000;
  s.office = { level: 1, build: null, level1Day: 9 };
  startExpansion(s);
  for (let i = 0; i < 15; i++) { s.day = 60 + i; advanceExpansion(s); }
  assert.equal(s.office.level, 2);
  assert.equal(s.office.level2Day, 74);
  assert.equal(s.office.level1Day, 9);
  const loaded = deserialize(serialize(s));
  assert.equal(loaded.office.level2Day, 74);
});

test('expansion-start event is pushed with {stage, days} and renders without {', () => {
  const s = createGame(1);
  s.cash = 100000;
  startExpansion(s);
  const started = s.inbox.filter((e) => e.id === 'expansion-start');
  assert.equal(started.length, 1);
  assert.deepEqual(started[0].data, { stage: 1, days: 10 });
  const t = eventText(started[0]);
  assert.equal(t.title, '창가 구역 공사 시작');
  assert.equal(t.text, '창가 구역 공사를 시작했어요. 10근무일 뒤에 완공돼요. 그동안 조금 시끄러울 거예요.');
  assert.ok(t.advisor.length > 0);
  assert.ok(!/[{}]/.test(t.title + t.text + t.advisor), t.title + t.text + t.advisor);
  // A refused start pushes nothing.
  assert.deepEqual(startExpansion(s), { ok: false, reason: 'building' });
  assert.equal(s.inbox.filter((e) => e.id === 'expansion-start').length, 1);
  // Stage 2 names the inner area.
  const s2 = createGame(1);
  s2.cash = 100000;
  s2.office = { level: 1, build: null, level1Day: 0 };
  startExpansion(s2);
  const t2 = eventText(s2.inbox.find((e) => e.id === 'expansion-start'));
  assert.equal(t2.title, '안쪽 구역 공사 시작');
  assert.equal(t2.text, '안쪽 구역 공사를 시작했어요. 15근무일 뒤에 완공돼요. 그동안 조금 시끄러울 거예요.');
});
