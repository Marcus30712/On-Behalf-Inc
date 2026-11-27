// v2.3: "매일 이 시간" — a break pinned to a time every day (state.breakRules).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, advance, act, view } from '../sim/game.js';
import { serialize, deserialize } from '../sim/state.js';
import { ensureBreakPlan, workingShift, windowsFor, planBreaks, breakBoard, moveBreak, pinBreak, unpinBreak } from '../sim/breaks.js';
import { SHIFTS } from '../sim/schedule.js';

const DAY = 1440;
function game(seed = 11) {
  const s = createGame(seed);
  advance(s, 540 - s.minute);
  ensureBreakPlan(s);
  const agent = s.people.find((p) => p.role === 'agent' && workingShift(s, p, s.day) === 'early');
  return { s, agent };
}
const win = (kind, shiftId = 'early') => {
  const sh = SHIFTS[shiftId];
  const w = windowsFor(sh.end - sh.start)[kind];
  return { first: sh.start + w.from, last: sh.start + w.to };
};
// The next weekday (Mon-Fri) at 09:00 with its plan kept.
function nextWorkday(s) {
  do advance(s, DAY); while (view(s).date.weekday >= 5);
  ensureBreakPlan(s);
}

test('v2.3 pin keeps today, sets the rule; unpin removes it', () => {
  const { s, agent } = game();
  const today = s.breaks.plan[agent.id].lunch;
  assert.deepEqual(pinBreak(s, { personId: agent.id, kind: 'lunch' }), { ok: true });
  assert.equal(s.breakRules[agent.id].lunch, today);
  assert.equal(s.breaks.plan[agent.id].lunch, today, 'today unchanged');
  assert.deepEqual(unpinBreak(s, { personId: agent.id, kind: 'lunch' }), { ok: true });
  assert.equal(s.breakRules[agent.id]?.lunch, undefined);
});

test('v2.3 pin refusals', () => {
  const { s, agent } = game();
  assert.deepEqual(pinBreak(s, { personId: 'nobody', kind: 'am' }), { ok: false, reason: 'unknown-person' });
  assert.deepEqual(pinBreak(s, { personId: agent.id, kind: 'nap' }), { ok: false, reason: 'bad-break' });
  const off = s.people.at(-1);
  s.roster[off.id] = { ...s.roster[off.id], 0: 'off' };
  assert.deepEqual(pinBreak(s, { personId: off.id, kind: 'am' }), { ok: false, reason: 'not-working' });
  assert.deepEqual(unpinBreak(s, { personId: 'nobody', kind: 'am' }), { ok: false, reason: 'unknown-person' });
  assert.deepEqual(unpinBreak(s, { personId: agent.id, kind: 'nap' }), { ok: false, reason: 'bad-break' });
});

test('v2.3 a pinned break comes back at its time on the next workday', () => {
  const { s, agent } = game();
  const { last } = win('lunch');
  assert.deepEqual(moveBreak(s, { personId: agent.id, kind: 'lunch', start: last }), { ok: true });
  assert.deepEqual(pinBreak(s, { personId: agent.id, kind: 'lunch' }), { ok: true });
  nextWorkday(s);
  assert.equal(s.breaks.plan[agent.id].lunch, last);
  nextWorkday(s);
  assert.equal(s.breaks.plan[agent.id].lunch, last, 'every day');
});

test('v2.3 moving a pinned break moves the rule', () => {
  const { s, agent } = game();
  const { first } = win('pm');
  pinBreak(s, { personId: agent.id, kind: 'pm' });
  assert.deepEqual(moveBreak(s, { personId: agent.id, kind: 'pm', start: first }), { ok: true });
  assert.equal(s.breakRules[agent.id].pm, first);
});

test('v2.3 a rule outside the day\'s window is not used that day and stays', () => {
  const { s, agent } = game();
  s.breakRules = { [agent.id]: { lunch: win('lunch').first } }; // early-shift lunch time
  nextWorkday(s);
  s.roster[agent.id] = { ...s.roster[agent.id], [view(s).date.weekday]: 'late' };
  delete s.breaks;
  ensureBreakPlan(s);
  const late = win('lunch', 'late');
  const got = s.breaks.plan[agent.id].lunch;
  assert.ok(got >= late.first && got <= late.last, `planned inside the late window: ${got}`);
  assert.equal(s.breakRules[agent.id].lunch, win('lunch').first, 'the rule stays');
  const cell = breakBoard(s).rows.find((r) => r.personId === agent.id).breaks.lunch;
  assert.deepEqual([cell.pinned, cell.ruleOff], [true, win('lunch').first]);
});

test('v2.3 the lead plans others around pinned breaks', () => {
  const { s } = game();
  const lead = s.people.find((p) => p.role === 'lead');
  lead.skills.planning = 8; // planningOf reads this when set
  const early = s.people.filter((p) => p.role === 'agent' && workingShift(s, p, s.day) === 'early');
  const free = planBreaks(s, s.day);
  // Pin two agents' lunches to the slot the free plan gives a third agent.
  const third = early[2];
  const slot = free[third.id].lunch;
  s.breakRules = { [early[0].id]: { lunch: slot }, [early[1].id]: { lunch: slot } };
  const plan = planBreaks(s, s.day);
  assert.equal(plan[early[0].id].lunch, slot);
  assert.equal(plan[early[1].id].lunch, slot);
  const together = early.filter((p) => plan[p.id].lunch === slot).length;
  assert.ok(together <= 2, `the others avoid the pinned slot (${together} at ${slot})`);
});

test('v2.3 without rules the plan is exactly as before', () => {
  const { s } = game();
  const before = planBreaks(s, s.day);
  s.breakRules = {};
  assert.deepEqual(planBreaks(s, s.day), before);
  s.breakRules = { nobody: { am: 600 } };
  assert.deepEqual(planBreaks(s, s.day), before, 'rules for people not here change nothing');
});

test('v2.3 a person who leaves takes their rules with them', () => {
  const { s, agent } = game();
  pinBreak(s, { personId: agent.id, kind: 'am' });
  s.leaving.push({ personId: agent.id, day: s.day });
  advance(s, DAY);
  assert.equal(s.people.some((p) => p.id === agent.id), false);
  assert.equal(s.breakRules[agent.id], undefined);
});

test('v2.3 saves keep rules; old saves and broken rules load', () => {
  const { s, agent } = game();
  pinBreak(s, { personId: agent.id, kind: 'lunch' });
  const back = deserialize(serialize(s));
  assert.deepEqual(back.breakRules, s.breakRules);
  const old = JSON.parse(serialize(s));
  delete old.breakRules;
  assert.deepEqual(deserialize(JSON.stringify(old)).breakRules, {}, 'a save from before v2.3');
  old.breakRules = { [agent.id]: { lunch: 'noon', am: 600, nap: 5 }, x: 7 };
  assert.deepEqual(deserialize(JSON.stringify(old)).breakRules, { [agent.id]: { am: 600 } }, 'bad entries dropped');
});

test('v2.3 through the game: actions and the board flag', () => {
  const { s, agent } = game();
  assert.deepEqual(act(s, { type: 'pinBreak', personId: agent.id, kind: 'am' }), { ok: true });
  const row = view(s).breakBoard.rows.find((r) => r.personId === agent.id);
  assert.deepEqual([row.breaks.am.pinned, row.breaks.lunch.pinned, row.breaks.am.ruleOff], [true, false, null]);
  assert.deepEqual(act(s, { type: 'unpinBreak', personId: agent.id, kind: 'am' }), { ok: true });
  assert.equal(view(s).breakBoard.rows.find((r) => r.personId === agent.id).breaks.am.pinned, false);
});
