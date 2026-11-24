import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, view } from '../sim/game.js';
import { EVENTS } from '../world/events.js';
import { SPEEDS, gameMinutesFor, createClock } from '../ui/clock.js';

test('1x runs 6 game minutes per real second in opening hours', () => {
  assert.equal(gameMinutesFor(1000, 1, { day: 0, minute: 600 }), 6);
  assert.equal(gameMinutesFor(1000, 3, { day: 0, minute: 600 }), 18);
  assert.deepEqual(SPEEDS, [0, 1, 2, 3]);
});

test('outside hours and weekends run fast', () => {
  assert.equal(gameMinutesFor(1000, 1, { day: 0, minute: 1300 }), 120);
  assert.equal(gameMinutesFor(1000, 1, { day: 0, minute: 500 }), 120);
  assert.equal(gameMinutesFor(1000, 1, { day: 5, minute: 600 }), 120); // Saturday
  assert.equal(gameMinutesFor(1000, 2, { day: 0, minute: 1300 }), 240);
});

test('speed 0 advances nothing', () => {
  const state = createGame(1);
  const clock = createClock({ state, now: 0 });
  clock.setSpeed(0);
  clock.tick(0);
  const before = view(state).minute;
  const r = clock.tick(5000);
  assert.equal(r.advancedMinutes, 0);
  assert.equal(view(state).minute, before);
  assert.equal(gameMinutesFor(1000, 0, { day: 0, minute: 600 }), 0);
});

test('small ticks still move the clock', () => {
  const state = createGame(1);
  state.minute = 540;
  const clock = createClock({ state, now: 0 });
  clock.setSpeed(1);
  for (let i = 0; i < 1000; i++) clock.tick(i * 16);
  const moved = view(state).minute - 540;
  assert.ok(Math.abs(moved - 96) <= 30, `moved ${moved}`);
});

test('a long pause does not run away', () => {
  const state = createGame(1);
  state.minute = 540;
  const clock = createClock({ state, now: 0 });
  clock.setSpeed(3);
  clock.tick(0);
  const r = clock.tick(3600 * 1000);
  assert.ok(r.advancedMinutes <= 240, `advanced ${r.advancedMinutes}`);
  assert.ok(r.advancedMinutes > 0);
});

test('a new choice event pauses the clock', () => {
  const state = createGame(1);
  const clock = createClock({ state, now: 0 });
  clock.setSpeed(2);
  let now = 0;
  clock.tick(now);
  let result;
  for (let i = 0; i < 2000 && clock.speed !== 0; i++) {
    now += 2000;
    result = clock.tick(now);
  }
  assert.equal(clock.speed, 0);
  assert.ok(result.newEvents.length > 0);
  const inbox = view(state).inbox;
  assert.ok(result.newEvents.some((i) => EVENTS[inbox.find((e) => e.index === i).id].choices));
  // paused: nothing moves, resume restores the earlier speed
  const m = view(state).minute;
  assert.equal(clock.tick(now + 5000).advancedMinutes, 0);
  assert.equal(view(state).minute, m);
  clock.resume();
  assert.equal(clock.speed, 2);
});

test('a day ending is reported once', () => {
  const state = createGame(1);
  state.minute = 1380;
  const clock = createClock({ state, now: 0 });
  clock.setSpeed(1);
  clock.tick(0);
  const r = clock.tick(1000); // 120 game minutes outside hours
  assert.equal(r.dayEnded, true);
  assert.equal(clock.tick(1016).dayEnded, false);
});

test('a finished game advances nothing', () => {
  const state = createGame(1);
  state.gameOver = true;
  const clock = createClock({ state, now: 0 });
  clock.setSpeed(3);
  clock.tick(0);
  assert.equal(clock.tick(10000).advancedMinutes, 0);
});

test('autoPaused is set by a choice pause and cleared by resume or setSpeed', () => {
  const state = createGame(1);
  const clock = createClock({ state, now: 0 });
  assert.equal(clock.autoPaused, false);
  clock.setSpeed(2);
  let now = 0;
  clock.tick(now);
  for (let i = 0; i < 2000 && clock.speed !== 0; i++) { now += 2000; clock.tick(now); }
  assert.equal(clock.speed, 0);
  assert.equal(clock.autoPaused, true);
  clock.resume();
  assert.equal(clock.autoPaused, false);
  for (let i = 0; i < 2000 && clock.speed !== 0; i++) { now += 2000; clock.tick(now); }
  assert.equal(clock.autoPaused, true);
  clock.setSpeed(0);
  assert.equal(clock.autoPaused, false, 'a manual pause is not an auto-pause');
});
