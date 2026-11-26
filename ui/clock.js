// Real time -> game time. Pure: no timers, no DOM; the caller passes the real
// clock into tick(). Only sim/game.js and read-only copy from world/ are used.
import { advance, view, SHIFTS } from '../sim/game.js';
import { EVENTS } from '../world/events.js';

export const SPEEDS = [0, 1, 2, 3];

const OPEN = 9 * 60;
const CLOSE = 21 * 60;
const OPEN_RATE = 6; // game minutes per real second at 1x, in opening hours
const FAST_RATE = 120; // outside opening hours (weekends: unless a weekend client opens them)
const MAX_TICK_MINUTES = 240; // a tab that was paused must not run away

// Weekdays 09-21; with a weekend client (view flags.weekend) also Saturday and
// Sunday for the weekend shift's hours.
function isOpenNow({ day, minute, flags }) {
  const weekday = ((day % 7) + 7) % 7;
  if (weekday < 5) return minute >= OPEN && minute < CLOSE;
  return !!flags?.weekend && minute >= SHIFTS.weekend.start && minute < SHIFTS.weekend.end;
}

export function gameMinutesFor(realMs, speed, { day, minute, flags }) {
  if (!(speed > 0) || !(realMs > 0)) return 0;
  const rate = isOpenNow({ day, minute, flags }) ? OPEN_RATE : FAST_RATE;
  return (realMs / 1000) * rate * speed;
}

export function createClock({ state }) {
  let speed = 0;
  let lastSpeed = 1;
  let lastReal = null;
  let autoPaused = false; // stopped by a new choice event, not by the player

  const clock = {
    get speed() { return speed; },
    get autoPaused() { return autoPaused; },
    // v1.6: the game minute now, between intervals too: the sim's minute (start
    // of the interval in progress) plus the minutes run toward it. The view
    // shows the interval; render/actors.js uses this to time breaks.
    get minuteNow() { return state.minute + (state.pendingMinutes ?? 0); },
    setSpeed(n) {
      if (!SPEEDS.includes(n)) return;
      speed = n;
      autoPaused = false;
      if (n > 0) lastSpeed = n;
    },
    resume() {
      speed = lastSpeed;
      autoPaused = false;
    },
    tick(realNowMs) {
      const idle = { advancedMinutes: 0, newEvents: [], dayEnded: false };
      const elapsed = lastReal === null ? 0 : realNowMs - lastReal;
      lastReal = realNowMs;
      if (state.gameOver || speed === 0 || !(elapsed > 0)) return idle;

      const before = view(state);
      const minutes = Math.min(MAX_TICK_MINUTES, gameMinutesFor(elapsed, speed, before));
      const advancedMinutes = advance(state, minutes);
      const after = view(state);

      const newEvents = after.inbox
        .filter((e) => e.index >= before.inbox.length)
        .map((e) => e.index)
        .sort((a, b) => a - b);
      if (after.inbox.some((e) => e.index >= before.inbox.length && EVENTS[e.id]?.choices)) {
        speed = 0;
        autoPaused = true;
      }

      return { advancedMinutes, newEvents, dayEnded: after.day !== before.day };
    },
  };
  return clock;
}
