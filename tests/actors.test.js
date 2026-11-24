import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAP } from '../render/map.js';
import { targetFor, stepActors } from '../render/actors.js';

const s = MAP.spots;
let n = 0;
const person = (o = {}) => ({
  id: `p${n++}`, role: 'agent', activity: 'idle', task: null,
  health: { kind: 'well', daysLeft: 0 }, shiftToday: 'early', breakGroup: 0, ...o,
});
const at = (a, t) => a.x === t[0] && a.y === t[1];
const run = (actors, people, ms, step = 100) => {
  for (let t = 0; t < ms; t += step) actors = stepActors(actors, people, step);
  return actors;
};

test('phone agents go to their own seat, break goes to the break room, off leaves', () => {
  const a = person({ activity: 'phone', task: { kind: 'phone', clientId: 'x' } });
  const b = person({ activity: 'phone', task: { kind: 'phone', clientId: 'x' } });
  assert.deepEqual(targetFor(a, 0), s.seats[0]);
  assert.deepEqual(targetFor(b, 1), s.seats[1]);
  assert.deepEqual(targetFor(person({ activity: 'break' }), 0, 2), s.breakRoom[2]);
  assert.deepEqual(targetFor(person({ activity: 'off' }), 0), s.door);
  assert.deepEqual(targetFor(person({ activity: 'idle', health: { kind: 'sick', daysLeft: 2 } }), 0), s.door);
  assert.deepEqual(targetFor(person({ role: 'lead', activity: 'idle' }), 0), s.leadDesk);
  assert.deepEqual(targetFor(person({ role: 'qa', activity: 'task', task: { kind: 'qa' } }), 0), s.qaDesk);
  assert.deepEqual(targetFor(person({ role: 'lead', activity: 'task', task: { kind: 'coaching' } }), 0, 1), s.taskTable[1]);
  assert.deepEqual(targetFor(person({ activity: 'task', task: { kind: 'training' } }), 0, 2), s.taskTable[2]);
});

test('two people on break never get the same break spot', () => {
  const people = [person({ activity: 'break' }), person({ activity: 'break' }), person({ activity: 'break' })];
  const actors = run([], people, 20000);
  const spots = actors.map((a) => `${a.x},${a.y}`);
  assert.equal(new Set(spots).size, 3);
  actors.forEach((a, i) => assert.ok(at(a, s.breakRoom[i])));
});

test('more people than spots: extras wait on distinct floor tiles', () => {
  const people = Array.from({ length: 6 }, () => person({ activity: 'break' }));
  const actors = run([], people, 30000);
  const spots = actors.map((a) => `${a.x},${a.y}`);
  assert.equal(new Set(spots).size, 6);
  for (const a of actors) assert.ok(a.path.length === 0);
  const reachedSpots = actors.filter((a) => s.breakRoom.some((b) => at(a, b)));
  assert.equal(reachedSpots.length, 4);
});

test('actors reach their target and stop', () => {
  const p = person({ activity: 'phone' });
  // 3 seconds = 9 tiles; start 7 tiles from the seat (the door is 16 tiles away)
  const start = { id: p.id, x: 9, y: 1, path: [], target: [9, 1], gone: false };
  const actors = run([start], [p], 3000);
  assert.ok(at(actors[0], s.seats[0]), `${actors[0].x},${actors[0].y}`);
  assert.equal(actors[0].path.length, 0);
  assert.equal(actors[0].gone, false);
  const later = stepActors(actors, [p], 1000);
  assert.ok(at(later[0], s.seats[0]));
});

test('movement is 3 tiles per second and smooth', () => {
  const p = person({ activity: 'phone' });
  const [a] = stepActors([], [p], 500);
  assert.ok(Math.abs(Math.hypot(a.x - s.door[0], a.y - s.door[1]) - 1.5) < 1e-9);
});

test('a person who left is marked gone at the door, and returns when back on shift', () => {
  const p = person({ activity: 'phone' });
  let actors = run([], [p], 3000);
  const off = { ...p, activity: 'off' };
  actors = run(actors, [off], 6000);
  assert.equal(actors[0].gone, true);
  assert.ok(at(actors[0], s.door));
  const back = stepActors(actors, [p], 100);
  assert.equal(back[0].gone, false);
  // someone who is off from the start never appears
  assert.equal(stepActors([], [off], 100)[0].gone, true);
});

test('stepActors does not mutate its inputs', () => {
  const p = person({ activity: 'phone' });
  const actors = stepActors([], [p], 500);
  const snap = JSON.stringify(actors);
  const peopleSnap = JSON.stringify([p]);
  stepActors(actors, [{ ...p, activity: 'break' }], 700);
  assert.equal(JSON.stringify(actors), snap);
  assert.equal(JSON.stringify([p]), peopleSnap);
});

test('changing target mid-walk replans without teleporting', () => {
  const p = person({ activity: 'phone' });
  const [a] = stepActors([], [p], 700);
  const [b] = stepActors([a], [{ ...p, activity: 'break' }], 0);
  assert.equal(b.x, a.x);
  assert.equal(b.y, a.y);
  assert.ok(b.path.length > 0);
});

test('agent seats follow order among agents; lead and QA use their desks', () => {
  const lead = person({ role: 'lead' });
  const a1 = person();
  const qa = person({ role: 'qa' });
  const a2 = person();
  const actors = run([], [lead, a1, qa, a2], 8000);
  assert.ok(at(actors[0], s.leadDesk));
  assert.ok(at(actors[1], s.seats[0]));
  assert.ok(at(actors[2], s.qaDesk));
  assert.ok(at(actors[3], s.seats[1]));
});
