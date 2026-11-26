import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHIFTS, defaultRoster, onShift, workShare, isAbsent } from '../sim/schedule.js';

const well = { kind: 'well', daysLeft: 0 };
const mk = (id, role, health = well) => ({ id, role, health });
const people = [
  ...Array.from({ length: 8 }, (_, i) => mk(`a${i}`, 'agent')),
  mk('l1', 'lead'),
  mk('q1', 'qa'),
];
const state = () => ({ roster: defaultRoster(people), absences: [] });
const H = (h) => h * 60;

test('early shift covers 09:00-18:00, late 12:00-21:00, overlap 12:00-18:00', () => {
  const WEEK = [0, 1, 2, 3, 4];
  assert.deepEqual(SHIFTS, {
    early: { start: 540, end: 1080, days: WEEK },
    late: { start: 720, end: 1260, days: WEEK },
    weekend: { start: 540, end: 1080, days: [5, 6] }, // v1.2
  });
  const s = state();
  const early = people[0];
  const late = people[1];
  assert.equal(onShift(s, early, 0, H(9)), true);
  assert.equal(onShift(s, early, 0, H(17) + 30), true);
  assert.equal(onShift(s, early, 0, H(18)), false);
  assert.equal(onShift(s, early, 0, H(8) + 30), false);
  assert.equal(onShift(s, late, 0, H(11) + 30), false);
  assert.equal(onShift(s, late, 0, H(12)), true);
  assert.equal(onShift(s, late, 0, H(20) + 30), true);
  assert.equal(onShift(s, late, 0, H(21)), false);
  const both = (m) => onShift(s, early, 0, m) && onShift(s, late, 0, m);
  assert.equal(both(H(12)), true);
  assert.equal(both(H(17) + 30), true);
  assert.equal(both(H(18)), false);
  assert.equal(both(H(11) + 30), false);
});

test('weekend nobody works', () => {
  const s = state();
  for (const day of [5, 6, 12, 13]) {
    for (const p of people) {
      for (let m = 0; m < 1440; m += 30) assert.equal(onShift(s, p, day, m), false);
    }
  }
});

test('sick person is off shift', () => {
  const s = state();
  const sick = { ...people[0], health: { kind: 'sick', daysLeft: 2 } };
  assert.equal(onShift(s, people[0], 0, H(10)), true);
  assert.equal(onShift(s, sick, 0, H(10)), false);
  for (const kind of ['burnout', 'leave']) {
    assert.equal(onShift(s, { ...people[0], health: { kind, daysLeft: 1 } }, 0, H(10)), false);
  }
});

test('absent person is off shift only on that day', () => {
  const s = state();
  s.absences.push({ personId: 'a0', day: 1 });
  assert.equal(isAbsent(s, 'a0', 1), true);
  assert.equal(isAbsent(s, 'a0', 2), false);
  assert.equal(onShift(s, people[0], 1, H(10)), false);
  assert.equal(onShift(s, people[0], 2, H(10)), true);
  assert.equal(isAbsent({ roster: s.roster }, 'a0', 1), false);
});

test('person missing from roster is off', () => {
  assert.equal(onShift(state(), mk('ghost', 'agent'), 0, H(10)), false);
});

test('lunch takes a full interval, short breaks half', () => {
  // v1.6: breaks come from the day plan; these are the old group-0 times.
  const early = { am: H(12), lunch: H(13), pm: H(16) };
  const late = { am: H(13), lunch: H(16), pm: H(17) + 30 };
  assert.equal(workShare(H(9), 'early', early), 1);
  assert.equal(workShare(H(11), 'early', early), 1);
  assert.equal(workShare(H(12), 'early', early), 0.5);
  assert.equal(workShare(H(12) + 30, 'early', early), 1);
  assert.equal(workShare(H(13), 'early', early), 0);
  assert.equal(workShare(H(13) + 30, 'early', early), 0);
  assert.equal(workShare(H(14), 'early', early), 1);
  assert.equal(workShare(H(16), 'early', early), 0.5);
  assert.equal(workShare(H(17) + 30, 'early', early), 1);
  // outside shift
  assert.equal(workShare(H(8) + 30, 'early', early), 0);
  assert.equal(workShare(H(18), 'early', early), 0);
  assert.equal(workShare(H(13), 'late', late), 0.5);
  assert.equal(workShare(H(16), 'late', late), 0);
  assert.equal(workShare(H(16) + 30, 'late', late), 0);
  assert.equal(workShare(H(17) + 30, 'late', late), 0.5);
  assert.equal(workShare(H(19), 'late', late), 1);
  assert.equal(workShare(H(20) + 30, 'late', late), 1);
  assert.equal(workShare(H(21), 'late', late), 0);
});

test('default roster gives 4 early and 4 late agents', () => {
  const r = defaultRoster(people);
  const agents = people.filter((p) => p.role === 'agent');
  assert.equal(agents.filter((p) => r[p.id][0] === 'early').length, 4);
  assert.equal(agents.filter((p) => r[p.id][0] === 'late').length, 4);
  assert.equal(r.a0[0], 'early');
  assert.equal(r.a1[0], 'late');
  for (const p of people) {
    for (let wd = 0; wd < 5; wd++) assert.notEqual(r[p.id][wd], 'off');
    assert.equal(Object.keys(r[p.id]).length, 5);
  }
  assert.equal(r.l1[2], 'early');
  assert.equal(r.q1[4], 'late');
});
