import { MAP, tileAt, baseSeats } from './map.js';
import { findPath, tilesByDistance } from './path.js';
import { nowActivity } from '../sim/away.js';

export const WALK_SPEED = 3; // tiles per real second: the floor (paused, or no rate given)
// v1.6: walking keeps pace with game time. 4 tiles per game minute means a
// 10-tile walk takes 2.5 game minutes at any speed (at 1x in opening hours,
// 6 game minutes per second, that is 24 tiles per second; 10 tiles in 0.42 s).
export const WALK_TILES_PER_GAME_MINUTE = 4;

// Tiles per real second for `rate` game minutes per real second (ui/clock.js
// gameMinutesFor(1000, speed, view)): max(WALK_SPEED, 4 × rate).
export function walkSpeed(rate) {
  const r = Number.isFinite(rate) && rate > 0 ? rate : 0;
  return Math.max(WALK_SPEED, WALK_TILES_PER_GAME_MINUTE * r);
}

const TABLE_TASKS = new Set(['coaching', 'research', 'training']);
// v1.6: lunch is spent in the break room too.
const BREAK_ROOM = new Set(['break', 'lunch']);
const key = (p) => `${p[0]},${p[1]}`;

function offSite(person) {
  return person.activity === 'off' || (person.health && person.health.kind !== 'well');
}

// v1.6 nowActivity (break minutes inside a break interval) lives in sim/away.js (v1.8).

// Where a person wants to be. `slotIndex` is the agent's seat index (order
// among agents); `spotIndex` is the index among people sharing the break room
// or task table; `seats` is how many agent seats are open (the office level's
// seats, view.office.seats; seats of unbuilt areas are never handed out).
// Returns null when the person has no seat or that shared area is full.
export function targetFor(person, slotIndex = 0, spotIndex = 0, map = MAP, seats = baseSeats(map)) {
  const s = map.spots;
  if (offSite(person)) return s.door;
  const home = person.role === 'lead' ? s.leadDesk
    : person.role === 'qa' ? s.qaDesk
    : slotIndex < seats ? s.seats[slotIndex] ?? null : null;
  if (BREAK_ROOM.has(person.activity)) return s.breakRoom[spotIndex] ?? null;
  if (person.activity === 'task') {
    const kind = person.task?.kind;
    if (TABLE_TASKS.has(kind)) return s.taskTable[spotIndex] ?? null;
    return home; // 'qa' task: the QA desk (or the person's own desk)
  }
  return home; // phone, idle
}

// Targets for everyone: Map id -> [x,y]. Task-table spots go out in people
// order; anyone left without a spot (or an agent beyond the open seats) waits
// on the nearest free floor tile.
// v1.6 options: `minute` is the current game minute (see nowActivity);
// `held` (Map id -> [x,y]) is where people already on break sit. A held tile
// is kept while the person stays on break, so nobody moves when others join
// or leave; newcomers take the lowest free break-room spot, then floor.
export function planTargets(people, map = MAP, seats = baseSeats(map), { minute, held } = {}) {
  const s = map.spots;
  const reserved = new Set([
    ...s.seats, s.leadDesk, s.qaDesk, ...s.breakRoom, ...s.taskTable, s.clinic, s.door,
  ].map(key));
  const taken = new Set();
  const targets = new Map();
  const overflow = [];
  const now = people.map((p) => ({ ...p, activity: nowActivity(p, minute) }));
  const onBreak = (p) => !offSite(p) && BREAK_ROOM.has(p.activity);
  const isFloor = (t) => tileAt(map, t[0], t[1]) === '.' && !reserved.has(key(t));

  // Break room first: held spots stay, then newcomers in people order.
  const roomKeys = s.breakRoom.map(key);
  const roomTaken = new Set();
  const heldFloor = new Map();
  for (const p of now) {
    const h = onBreak(p) ? held?.get(p.id) : null;
    if (!h) continue;
    const i = roomKeys.indexOf(key(h));
    if (i >= 0 && !roomTaken.has(i)) {
      roomTaken.add(i);
      targets.set(p.id, s.breakRoom[i]);
    } else if (i < 0) heldFloor.set(p.id, h);
  }
  for (const p of now) {
    if (!onBreak(p) || targets.has(p.id)) continue;
    const i = s.breakRoom.findIndex((_, k) => !roomTaken.has(k));
    if (i < 0) continue;
    roomTaken.add(i);
    targets.set(p.id, s.breakRoom[i]);
    heldFloor.delete(p.id); // a waiting person takes a freed chair
  }
  for (const t of targets.values()) taken.add(key(t));

  let seat = 0;
  let tableIdx = 0;
  for (const p of now) {
    const slot = p.role === 'agent' ? seat++ : 0;
    if (targets.has(p.id)) continue;
    if (onBreak(p)) {
      overflow.push([p.id, s.breakRoom[0]]);
      continue;
    }
    const spot = !offSite(p) && p.activity === 'task' && TABLE_TASKS.has(p.task?.kind) ? tableIdx++ : 0;
    const t = targetFor(p, slot, spot, map, seats);
    // v1.8.1: the lead and QA desks seat one; a second lead (working out
    // notice next to the new one) waits on the floor nearby.
    if (t && p.role !== 'agent' && taken.has(key(t))) {
      overflow.push([p.id, t]);
      continue;
    }
    if (t) {
      targets.set(p.id, t);
      taken.add(key(t));
    } else {
      const area = p.activity === 'task' && TABLE_TASKS.has(p.task?.kind) ? s.taskTable[0] : s.seats[0];
      overflow.push([p.id, area]);
    }
  }
  // Floor waiters: a held floor tile first (if still free), then the nearest.
  for (const [id] of overflow) {
    const h = heldFloor.get(id);
    if (h && isFloor(h) && !taken.has(key(h))) {
      targets.set(id, h);
      taken.add(key(h));
    }
  }
  for (const [id, area] of overflow) {
    if (targets.has(id)) continue;
    const free = tilesByDistance(map, area).find((t) => isFloor(t) && !taken.has(key(t)));
    const t = free ?? s.door;
    targets.set(id, t);
    taken.add(key(t));
  }
  return targets;
}

// Advance everyone by dtMs. Pure: inputs are not modified. Each actor is
// { id, x, y, path, target, gone, spot } where path holds the tiles still to
// walk and spot the break tile held while on break (null otherwise).
// `seats`: open agent seats (view.office.seats). v1.6 options: `minute`, the
// current game minute (planTargets); `rate`, game minutes per real second now
// (walkSpeed; 0 or missing walks at WALK_SPEED).
export function stepActors(actors, people, dtMs, map = MAP, seats = baseSeats(map), { minute, rate } = {}) {
  const byId = new Map(actors.map((a) => [a.id, a]));
  const held = new Map(actors.filter((a) => a.spot).map((a) => [a.id, a.spot]));
  const targets = planTargets(people, map, seats, { minute, held });
  const speed = walkSpeed(rate);
  const door = map.spots.door;
  const next = [];
  for (const p of people) {
    const target = targets.get(p.id);
    const prev = byId.get(p.id);
    let a = prev
      ? { ...prev, path: prev.path.map((t) => [...t]) }
      : { id: p.id, x: door[0], y: door[1], path: [], target: door, gone: offSite(p) };
    if (!a.target || a.target[0] !== target[0] || a.target[1] !== target[1]) {
      const midStep = a.path.length > 0 && (a.x !== Math.round(a.x) || a.y !== Math.round(a.y));
      const from = midStep ? a.path[0] : [Math.round(a.x), Math.round(a.y)];
      const route = findPath(map, from, target);
      a.target = target;
      a.path = route ? (midStep ? route : route.slice(1)) : [];
    }
    a.spot = !offSite(p) && BREAK_ROOM.has(nowActivity(p, minute)) ? [...target] : null;
    if (a.gone && a.path.length > 0) a.gone = false;
    let budget = (speed * dtMs) / 1000;
    while (budget > 0 && a.path.length > 0) {
      const [px, py] = a.path[0];
      const dist = Math.hypot(px - a.x, py - a.y);
      if (dist <= budget) {
        a.x = px;
        a.y = py;
        budget -= dist;
        a.path.shift();
      } else {
        a.x += ((px - a.x) / dist) * budget;
        a.y += ((py - a.y) / dist) * budget;
        budget = 0;
      }
    }
    if (a.path.length === 0 && a.x === door[0] && a.y === door[1] && target[0] === door[0] && target[1] === door[1]) a.gone = true;
    next.push(a);
  }
  return next;
}
