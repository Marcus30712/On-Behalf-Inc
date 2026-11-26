// v1.9: moving today's breaks (moveBreak) and the board the 휴식표 tab shows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, advance, act, view } from '../sim/game.js';
import { serialize, deserialize } from '../sim/state.js';
import { moveBreak, breakBoard, windowsFor, workingShift, ensureBreakPlan } from '../sim/breaks.js';
import { CLIENTS } from '../world/clients.js';
import { SHIFTS } from '../sim/schedule.js';

const DAY = 1440;
// A fresh game at 09:00 Monday, today's plan kept, and an agent on the early shift.
function game() {
  const s = createGame(11);
  advance(s, 540 - s.minute);
  act(s, { type: 'assign', personId: s.people[0].id, kind: 'phone', clientId: s.clients[0].id });
  ensureBreakPlan(s); // the day starts with today's plan kept (sim/day.js startDay)
  const agent = s.people.find((p) => p.role === 'agent' && workingShift(s, p, s.day) === 'early');
  return { s, agent };
}
const winOf = (s, p, kind) => {
  const shift = SHIFTS[workingShift(s, p, s.day)];
  const w = windowsFor(shift.end - shift.start)[kind];
  return { first: shift.start + w.from, last: shift.start + w.to };
};
const startOf = (s, p, kind) => breakBoard(s).rows.find((r) => r.personId === p.id).breaks[kind].start;

test('v1.9 moveBreak refusals, in order', () => {
  const { s, agent } = game();
  assert.deepEqual(moveBreak(s, { personId: 'nobody', kind: 'am', start: 600 }), { ok: false, reason: 'unknown-person' });
  const off = s.people.find((p) => !workingShift(s, p, s.day)) ?? (() => { const p = s.people.at(-1); s.roster[p.id] = { ...s.roster[p.id], 0: 'off' }; return p; })();
  assert.deepEqual(moveBreak(s, { personId: off.id, kind: 'am', start: 600 }), { ok: false, reason: 'not-working' });
  assert.deepEqual(moveBreak(s, { personId: agent.id, kind: 'nap', start: 600 }), { ok: false, reason: 'bad-break' });
  assert.deepEqual(moveBreak(s, { personId: agent.id, kind: 'am', start: 610 }), { ok: false, reason: 'bad-break' });
  assert.deepEqual(moveBreak(s, { personId: agent.id, kind: 'am', start: 525 }), { ok: false, reason: 'break-started' }, 'before now');
  const { first, last } = winOf(s, agent, 'am');
  assert.deepEqual(moveBreak(s, { personId: agent.id, kind: 'am', start: first - 15 }), { ok: false, reason: 'break-window' });
  assert.deepEqual(moveBreak(s, { personId: agent.id, kind: 'am', start: last + 15 }), { ok: false, reason: 'break-window' });
});

test('v1.9 window edges and now are allowed; the entry is marked edited for today only', () => {
  const { s, agent } = game();
  const { first, last } = winOf(s, agent, 'lunch');
  assert.deepEqual(moveBreak(s, { personId: agent.id, kind: 'lunch', start: first }), { ok: true });
  assert.equal(s.breaks.plan[agent.id].lunch, first);
  assert.equal(s.breaks.plan[agent.id].edited, true);
  assert.deepEqual(moveBreak(s, { personId: agent.id, kind: 'lunch', start: last }), { ok: true });
  assert.equal(startOf(s, agent, 'lunch'), last);
  // A start equal to now is allowed.
  advance(s, first - s.minute);
  assert.deepEqual(moveBreak(s, { personId: agent.id, kind: 'lunch', start: first }), { ok: true });
  // Started: the lunch now begins at `first` = now; once now passes it, it cannot move.
  advance(s, 30);
  assert.deepEqual(moveBreak(s, { personId: agent.id, kind: 'lunch', start: last }), { ok: false, reason: 'break-started' });
  // The next day the plan is new and unmarked.
  advance(s, DAY);
  view(s);
  assert.notEqual(s.breaks.plan[agent.id]?.edited, true);
});

test('v1.9 the interval uses the moved break', () => {
  const { s, agent } = game();
  const { first, last } = winOf(s, agent, 'lunch'); // early shift: 720 and 810
  assert.deepEqual(moveBreak(s, { personId: agent.id, kind: 'lunch', start: first }), { ok: true });
  assert.deepEqual(moveBreak(s, { personId: agent.id, kind: 'lunch', start: last }), { ok: true });
  advance(s, first - s.minute);
  assert.notEqual(view(s).people.find((p) => p.id === agent.id).activity, 'lunch', 'not at the old time');
  advance(s, last - s.minute);
  assert.equal(view(s).people.find((p) => p.id === agent.id).activity, 'lunch', 'at the new time');
});

test('v1.9 someone with no kept entry gets one when moved', () => {
  const { s, agent } = game();
  delete s.breaks.plan[agent.id];
  const { last } = winOf(s, agent, 'pm');
  assert.deepEqual(moveBreak(s, { personId: agent.id, kind: 'pm', start: last }), { ok: true });
  const e = s.breaks.plan[agent.id];
  assert.equal(e.pm, last);
  assert.ok(Number.isFinite(e.am) && Number.isFinite(e.lunch));
});

test('v1.9 board: slots, away, edge flags, who planned', () => {
  const { s, agent } = game();
  const b = breakBoard(s);
  assert.equal(b.slots[0].minute, 540);
  const close = Math.max(...s.clients.map((c) => CLIENTS.find((d) => d.id === c.id).hours.close));
  assert.equal(b.slots.at(-1).minute, close - 30, 'until the latest close of today\'s clients');
  assert.ok(b.slots.every((x, i) => i === 0 || x.minute - b.slots[i - 1].minute === 30));
  assert.ok(b.slots.every((x) => Number.isFinite(x.calls) && x.calls >= 0));
  const lead = s.people.find((p) => p.role === 'lead');
  assert.deepEqual([b.by, b.lead], ['lead', lead.name]);
  const row = b.rows.find((r) => r.personId === agent.id);
  const { first, last } = winOf(s, agent, 'am');
  moveBreak(s, { personId: agent.id, kind: 'am', start: first });
  const atFirst = breakBoard(s).rows.find((r) => r.personId === agent.id).breaks.am;
  assert.deepEqual([atFirst.start, atFirst.earlier, atFirst.later], [first, false, true]);
  moveBreak(s, { personId: agent.id, kind: 'am', start: last });
  const atLast = breakBoard(s).rows.find((r) => r.personId === agent.id).breaks.am;
  assert.deepEqual([atLast.start, atLast.earlier, atLast.later], [last, true, false]);
  assert.equal(breakBoard(s).rows.find((r) => r.personId === agent.id).edited, true);
  assert.equal(row.edited, false);
  // away: agents on a break that touches the slot.
  const slot = breakBoard(s).slots.find((x) => x.minute === last - (last % 30));
  const touching = s.people.filter((p) => p.role === 'agent' && s.breaks.plan[p.id]
    && ['am', 'lunch', 'pm'].some((k) => { const st = s.breaks.plan[p.id][k]; const len = k === 'lunch' ? 60 : 15; return st < slot.minute + 30 && st + len > slot.minute; }));
  assert.equal(slot.away, touching.length);
});

test('v1.9 board: a busy slot is a top-25% forecast slot with two or more away', () => {
  const { s } = game();
  const agents = s.people.filter((p) => p.role === 'agent' && workingShift(s, p, s.day) === 'early');
  const b0 = breakBoard(s);
  // The busiest am-window slot for the early shift (09:00 + 60..165 min).
  const amSlots = b0.slots.filter((x) => x.minute >= 600 && x.minute <= 690);
  const peak = amSlots.reduce((a, x) => (x.calls > a.calls ? x : a));
  const sorted = b0.slots.map((x) => x.calls).sort((a, b) => b - a);
  const bar = sorted[Math.ceil(sorted.length * 0.25) - 1];
  for (const p of agents.slice(0, 2)) assert.deepEqual(moveBreak(s, { personId: p.id, kind: 'am', start: peak.minute }), { ok: true });
  const after = breakBoard(s).slots.find((x) => x.minute === peak.minute);
  assert.ok(after.away >= 2);
  assert.equal(after.busy, peak.calls >= bar, `calls ${peak.calls} vs top-25% bar ${bar}`);
  for (const x of breakBoard(s).slots) if (x.away < 2) assert.equal(x.busy, false, `${x.minute}: fewer than two away`);
});

test('v1.9 through the game: the action, the view, and a v1.8 save', () => {
  const { s, agent } = game();
  const { last } = winOf(s, agent, 'am');
  assert.deepEqual(act(s, { type: 'moveBreak', personId: agent.id, kind: 'am', start: last }), { ok: true });
  assert.equal(view(s).breakBoard.rows.find((r) => r.personId === agent.id).breaks.am.start, last);
  const old = JSON.parse(serialize(s));
  for (const e of Object.values(old.breaks.plan)) delete e.edited;
  const loaded = deserialize(JSON.stringify(old));
  assert.ok(loaded, 'a v1.8 save (no edited) loads');
  assert.equal(view(loaded).breakBoard.rows.length, breakBoard(s).rows.length);
});
