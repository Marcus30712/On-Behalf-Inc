// v1.8.1: sim/away.js on its own (v1.8 tested it only through the panel and actors).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nowActivity, answeringAt } from '../sim/away.js';
import { BREAK_LENGTH } from '../sim/schedule.js';

const plan = { am: 600, lunch: 735, pm: 900 };
const at = (activity, extra = {}) => ({ id: 'a', activity, breaks: plan, deskActivity: 'phone', ...extra });

test('nowActivity: not a break activity, or no plan or minute: as given', () => {
  assert.equal(nowActivity(at('phone'), 740), 'phone');
  assert.equal(nowActivity(at('off'), 740), 'off');
  assert.equal(nowActivity(at('lunch', { breaks: null }), 725), 'lunch');
  assert.equal(nowActivity(at('lunch'), undefined), 'lunch');
});

test('nowActivity: away only during each break\'s own minutes', () => {
  for (const [kind, start] of Object.entries(plan)) {
    const activity = kind === 'lunch' ? 'lunch' : 'break';
    const p = at(activity);
    assert.equal(nowActivity(p, start - 1), 'phone', `${kind}: before`);
    assert.equal(nowActivity(p, start), activity, `${kind}: first minute`);
    assert.equal(nowActivity(p, start + BREAK_LENGTH[kind] - 1), activity, `${kind}: last minute`);
    assert.equal(nowActivity(p, start + BREAK_LENGTH[kind]), 'phone', `${kind}: after`);
  }
});

test('nowActivity: without deskActivity the desk minutes read as idle', () => {
  assert.equal(nowActivity(at('lunch', { deskActivity: undefined }), 725), 'idle');
});

test('answeringAt: the desk client in desk minutes, else the current one', () => {
  const p = at('lunch', { answering: 'own', deskAnswering: 'covered' });
  assert.equal(answeringAt(p, 725), 'covered');
  assert.equal(answeringAt(p, 740), 'own');
  assert.equal(answeringAt({ ...p, deskAnswering: undefined }, 725), 'own', 'an older view: as before');
});
