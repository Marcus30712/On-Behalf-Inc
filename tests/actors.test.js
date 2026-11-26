import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAP } from '../render/map.js';
import { tileAt } from '../render/map.js';
import { targetFor, stepActors, planTargets, walkSpeed, WALK_SPEED } from '../render/actors.js';
import { findPath } from '../render/path.js';
import { gameMinutesFor, createClock } from '../ui/clock.js';
import { createGame } from '../sim/game.js';

const s = MAP.spots;
let n = 0;
const person = (o = {}) => ({
  id: `p${n++}`, role: 'agent', activity: 'idle', task: null,
  health: { kind: 'well', daysLeft: 0 }, shiftToday: 'early', ...o,
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
  // distance walked along the 4-direction path (it may turn a corner)
  assert.ok(Math.abs(Math.abs(a.x - s.door[0]) + Math.abs(a.y - s.door[1]) - 1.5) < 1e-9, `${a.x},${a.y}`);
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

const agents = (count) => Array.from({ length: count }, () => person({ activity: 'phone', task: { kind: 'phone', clientId: 'x' } }));
const expansionSeats = (from) => new Set(s.seats.slice(from).map((t) => t.join(',')));

test('only the first `seats` seats are handed out; unbuilt seats stay empty', () => {
  const people = agents(16);
  for (const [seats, used] of [[undefined, 8], [8, 8], [12, 12], [16, 16]]) {
    const targets = planTargets(people, MAP, seats);
    const unbuilt = expansionSeats(used);
    people.forEach((p, i) => {
      const t = targets.get(p.id);
      if (i < used) assert.deepEqual(t, s.seats[i], `seats=${seats} agent ${i}`);
      else {
        assert.ok(!unbuilt.has(t.join(',')), `seats=${seats} agent ${i} on an unbuilt seat ${t}`);
        assert.equal(tileAt(MAP, t[0], t[1]), '.', `seats=${seats} agent ${i} waits on floor`);
      }
    });
    const keys = [...targets.values()].map((t) => t.join(','));
    assert.equal(new Set(keys).size, keys.length, 'no two people share a tile');
  }
});

test('more agents than seats at level 2: the extras wait on free floor', () => {
  const people = agents(18);
  const targets = planTargets(people, MAP, 16);
  for (const p of people.slice(16)) {
    const t = targets.get(p.id);
    assert.equal(tileAt(MAP, t[0], t[1]), '.');
  }
});

test('stepActors walks a 12th agent to its expansion seat when 12 seats are open', () => {
  const people = agents(12);
  let actors = [];
  for (let t = 0; t < 20000; t += 100) actors = stepActors(actors, people, 100, MAP, 12);
  assert.ok(at(actors[11], s.seats[11]), `${actors[11].x},${actors[11].y}`);
  let closed = [];
  for (let t = 0; t < 20000; t += 100) closed = stepActors(closed, people, 100);
  assert.ok(!at(closed[11], s.seats[11]));
});

test('v1.6: lunch goes to the break room too, sharing its spots with breaks', () => {
  assert.deepEqual(targetFor(person({ activity: 'lunch' }), 0, 1), s.breakRoom[1]);
  const people = [person({ activity: 'lunch' }), person({ activity: 'break' }), person({ activity: 'lunch' })];
  const targets = planTargets(people);
  people.forEach((p, i) => assert.deepEqual(targets.get(p.id), s.breakRoom[i]));
  const crowd = Array.from({ length: 6 }, (_, i) => person({ activity: i % 2 ? 'lunch' : 'break' }));
  const overflow = planTargets(crowd);
  const inRoom = crowd.filter((p) => s.breakRoom.some((b) => b[0] === overflow.get(p.id)[0] && b[1] === overflow.get(p.id)[1]));
  assert.equal(inRoom.length, 4);
});

// ---- v1.6 Task 5: calmer movement ------------------------------------------

// A real-time frame loop of `ms` at 16 ms frames with the given options.
const frames = (actors, people, ms, opts, step = 16) => {
  for (let t = 0; t < ms; t += step) actors = stepActors(actors, people, Math.min(step, ms - t), MAP, undefined, opts);
  return actors;
};
const same = (a, b) => a[0] === b[0] && a[1] === b[1];

test('v1.6: a 10-tile walk takes at most 3 game minutes at every speed, in and out of opening hours', () => {
  const p = person({ activity: 'phone' });
  const route = findPath(MAP, s.door, s.seats[0]);
  assert.ok(route.length > 11, 'the door is more than 10 tiles from seat 0');
  const from = route.at(-11);
  const start = { id: p.id, x: from[0], y: from[1], path: route.slice(-10).map((t) => [...t]), target: s.seats[0], gone: false };
  for (const speed of [1, 2, 3]) {
    for (const minute of [600, 1300]) {
      const rate = gameMinutesFor(1000, speed, { day: 0, minute });
      const ms = (3 / rate) * 1000; // 3 game minutes in real ms
      const [a] = frames([start], [p], ms, { rate });
      assert.ok(at(a, s.seats[0]), `speed ${speed} minute ${minute}: at ${a.x},${a.y} after ${ms} ms`);
    }
  }
  // 1x in opening hours: 3 game minutes are half a real second
  assert.equal(gameMinutesFor(1000, 1, { day: 0, minute: 600 }), 6);
  assert.ok(walkSpeed(6) * 0.5 >= 10, `walkSpeed(6) = ${walkSpeed(6)}`);
  // paused (rate 0) or no rate given: the old 3 tiles per second
  assert.equal(walkSpeed(0), WALK_SPEED);
  assert.equal(walkSpeed(undefined), WALK_SPEED);
});

test('v1.6: a break-room spot is kept while the person stays on break when others join or leave', () => {
  const [a, b, c, d] = ['a', 'b', 'c', 'd'].map((id) => person({ id, activity: 'break' }));
  let people = [a, b, c];
  let actors = run([], people, 20000);
  const spotOf = (id) => actors.find((x) => x.id === id).target;
  const bSpot = spotOf('b');
  const cSpot = spotOf('c');
  assert.ok(s.breakRoom.some((t) => same(t, bSpot)) && s.breakRoom.some((t) => same(t, cSpot)));
  // a goes back to the desk: b and c stay where they are
  people = [{ ...a, activity: 'phone' }, b, c];
  actors = run(actors, people, 5000);
  assert.ok(same(spotOf('b'), bSpot), `b moved to ${spotOf('b')}`);
  assert.ok(same(spotOf('c'), cSpot), `c moved to ${spotOf('c')}`);
  // d joins ahead of b in people order: b and c still stay; d takes a free spot
  people = [{ ...a, activity: 'phone' }, d, b, c];
  actors = run(actors, people, 20000);
  assert.ok(same(spotOf('b'), bSpot));
  assert.ok(same(spotOf('c'), cSpot));
  const dSpot = spotOf('d');
  assert.ok(s.breakRoom.some((t) => same(t, dSpot)) && !same(dSpot, bSpot) && !same(dSpot, cSpot));
  // planTargets keeps a held spot too
  const held = new Map([['b', s.breakRoom[3]]]);
  const t = planTargets([d, b], MAP, undefined, { held });
  assert.deepEqual(t.get('b'), s.breakRoom[3]);
  assert.deepEqual(t.get('d'), s.breakRoom[0]);
});

test('v1.6: a 15-minute break leaves the desk only for its own 15 game minutes, lunch only for its hour', () => {
  const H = (h, m = 0) => h * 60 + m;
  // view of the 10:00 interval: the am break 10:15-10:30 makes the whole interval 'break'
  const breaks = { am: H(10, 15), lunch: H(12, 45), pm: H(15, 30), by: 'lead' };
  const p = person({ activity: 'break', breaks });
  const target = (who, minute) => planTargets([who], MAP, undefined, { minute }).get(who.id);
  for (const m of [H(10), H(10, 14.9)]) assert.deepEqual(target(p, m), s.seats[0], `desk at ${m}`);
  for (const m of [H(10, 15), H(10, 29.9)]) assert.deepEqual(target(p, m), s.breakRoom[0], `room at ${m}`);
  // lunch 12:45-13:45 touches three intervals; at the desk outside its hour
  const lunch = { ...p, activity: 'lunch' };
  assert.deepEqual(target(lunch, H(12, 30)), s.seats[0]);
  assert.deepEqual(target(lunch, H(12, 44)), s.seats[0]);
  assert.deepEqual(target(lunch, H(12, 45)), s.breakRoom[0]);
  assert.deepEqual(target(lunch, H(13, 44)), s.breakRoom[0]);
  assert.deepEqual(target(lunch, H(13, 45)), s.seats[0]);
  // pm break at 15:30 fills its interval: away for all of it
  assert.deepEqual(target({ ...p, breaks: { ...breaks } }, H(15, 30)), s.breakRoom[0]);
  // without a minute (or a plan) the activity decides, as before
  assert.deepEqual(target(p, undefined), s.breakRoom[0]);
  assert.deepEqual(target({ ...p, breaks: null }, H(10)), s.breakRoom[0]);
  // stepActors walks by the minute it is given
  const seated = { id: p.id, x: s.seats[0][0], y: s.seats[0][1], path: [], target: s.seats[0], gone: false };
  let [a] = stepActors([seated], [p], 100, MAP, undefined, { minute: H(10, 5), rate: 6 });
  assert.ok(at(a, s.seats[0]) && a.path.length === 0, 'stays seated before the break');
  [a] = frames([a], [p], 1000, { minute: H(10, 16), rate: 6 });
  assert.ok(at(a, s.breakRoom[0]), `in the break room during the break: ${a.x},${a.y}`);
});

test('v1.6: the clock tells the current game minute between intervals', () => {
  const state = createGame(1);
  state.minute = 600;
  const clock = createClock({ state });
  clock.setSpeed(1);
  clock.tick(0);
  clock.tick(2500); // 15 game minutes at 1x in opening hours: the interval is not done yet
  assert.equal(state.minute, 600);
  assert.equal(clock.minuteNow, 615);
});

// v1.8.1: while a let-go lead works out notice next to the new one, the second
// lead waits on a free floor tile instead of sharing the lead desk.
test('v1.8.1 two leads never share the lead desk', () => {
  const lead = (id) => ({ id, role: 'lead', activity: 'idle', task: null, health: { kind: 'well', daysLeft: 0 } }); // at their desk
  const targets = planTargets([lead('l1'), lead('l2')]);
  const [a, b] = [targets.get('l1'), targets.get('l2')];
  assert.ok(a && b, 'both have a target');
  assert.notDeepEqual(a, b);
  assert.ok([a, b].some((t) => t[0] === MAP.spots.leadDesk[0] && t[1] === MAP.spots.leadDesk[1]), 'one sits at the lead desk');
});

// v1.8.1: in a break interval's desk minutes, someone on a table task goes to
// the task table (deskActivity 'task'), not their home desk.
test('v1.8.1 desk minutes of a break interval: a table task goes to the task table', () => {
  const p = { id: 'l1', role: 'lead', activity: 'lunch', deskActivity: 'task', task: { kind: 'coaching' },
    breaks: { am: 600, lunch: 735, pm: 900 }, health: { kind: 'well', daysLeft: 0 } };
  const table = MAP.spots.taskTable.map(([x, y]) => `${x},${y}`);
  const desk = planTargets([p], MAP, undefined, { minute: 725 }).get('l1');
  assert.ok(table.includes(`${desk[0]},${desk[1]}`), `at the task table: ${desk}`);
  const away = planTargets([p], MAP, undefined, { minute: 740 }).get('l1');
  assert.ok(MAP.spots.breakRoom.some(([x, y]) => x === away[0] && y === away[1]), `in the break room: ${away}`);
});

// v1.8.1 (regression guard): only the lead and QA desks seat one; people
// heading out (the door) may share their target.
test('v1.8.1 two people going home both head for the door', () => {
  const off = (id, role) => ({ id, role, activity: 'off', task: null, health: { kind: 'well', daysLeft: 0 } });
  const t = planTargets([off('l1', 'lead'), off('q1', 'qa')]);
  const door = `${MAP.spots.door[0]},${MAP.spots.door[1]}`;
  assert.deepEqual([t.get('l1'), t.get('q1')].map((x) => x && `${x[0]},${x[1]}`), [door, door]);
});
