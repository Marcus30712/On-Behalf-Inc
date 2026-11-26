// Share of client-intervals that meet their service-level target, by hour of
// day (v1.6 balance doc, "시간대별 목표 달성 구간 비율").
//
//   node tools/byhour.js
//
// Method: seeds 1-10, six ordinary weekdays (days 1, 2, 3, 8, 9, 10), each a
// fresh default game started at 09:00 on that day (no earlier days played, no
// decisions), 24 half-hour intervals from 09:00 to 21:00 with the rng seeded
// seed * 100 + day. An interval counts for every client that has calls in it:
// met when the interval's service level reaches the client's target. Prints
// the share per half hour, then for the whole day, 10:00-12:00, 12:00-18:00
// and 18:00-20:00. Reads the current code only: to compare with v1.5, run it
// in a checkout of that version.
import { createGame } from '../sim/game.js';
import { stepInterval } from '../sim/interval.js';
import { createRng } from '../sim/rng.js';
import { CLIENTS } from '../world/clients.js';

const met = {};
const n = {};
for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
  for (const day of [1, 2, 3, 8, 9, 10]) {
    const s = createGame(seed);
    s.day = day;
    s.minute = 540;
    const rng = createRng(seed * 100 + day);
    for (let i = 0; i < 24; i++) {
      const m = s.minute;
      const r = stepInterval(s, rng);
      for (const [id, c] of Object.entries(r.clients)) {
        const t = CLIENTS.find((d) => d.id === id).slTarget.pct / 100;
        const k = `${String(Math.floor(m / 60)).padStart(2, '0')}:${m % 60 ? '30' : '00'}`;
        n[k] = (n[k] ?? 0) + 1;
        met[k] = (met[k] ?? 0) + (c.serviceLevel >= t ? 1 : 0);
      }
    }
  }
}
const keys = Object.keys(n).sort();
console.log(keys.map((k) => `${k} ${(100 * met[k] / n[k]).toFixed(0)}`).join('  '));
const tot = (f) => {
  let a = 0;
  let b = 0;
  for (const k of keys) if (f(k)) { a += met[k]; b += n[k]; }
  return (100 * a / b).toFixed(1);
};
console.log('all', tot(() => true), '| 10-12', tot((k) => k >= '10:00' && k < '12:00'),
  '| 12-18', tot((k) => k >= '12:00' && k < '18:00'), '| 18-20', tot((k) => k >= '18:00' && k < '20:00'));
