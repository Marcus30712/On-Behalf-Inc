import { MAP, tileAt, baseSeats } from './map.js';
import { findPath, tilesByDistance } from './path.js';

export const WALK_SPEED = 3; // tiles per second

const TABLE_TASKS = new Set(['coaching', 'research', 'training']);
// v1.6: lunch is spent in the break room too.
const BREAK_ROOM = new Set(['break', 'lunch']);
const key = (p) => `${p[0]},${p[1]}`;

function offSite(person) {
  return person.activity === 'off' || (person.health && person.health.kind !== 'well');
}

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

// Targets for everyone: Map id -> [x,y]. Shared spots go out in people order;
// anyone left without a spot (or an agent beyond the open seats) waits on the
// nearest free floor tile.
export function planTargets(people, map = MAP, seats = baseSeats(map)) {
  const s = map.spots;
  const reserved = new Set([
    ...s.seats, s.leadDesk, s.qaDesk, ...s.breakRoom, ...s.taskTable, s.clinic, s.door,
  ].map(key));
  const taken = new Set();
  const targets = new Map();
  const overflow = [];
  let seat = 0;
  let breakIdx = 0;
  let tableIdx = 0;
  for (const p of people) {
    const slot = p.role === 'agent' ? seat++ : 0;
    let spot = 0;
    if (!offSite(p)) {
      if (BREAK_ROOM.has(p.activity)) spot = breakIdx++;
      else if (p.activity === 'task' && TABLE_TASKS.has(p.task?.kind)) spot = tableIdx++;
    }
    const t = targetFor(p, slot, spot, map, seats);
    if (t) {
      targets.set(p.id, t);
      taken.add(key(t));
    } else {
      const area = BREAK_ROOM.has(p.activity) ? s.breakRoom[0]
        : p.activity === 'task' && TABLE_TASKS.has(p.task?.kind) ? s.taskTable[0]
        : s.seats[0];
      overflow.push([p.id, area]);
    }
  }
  for (const [id, area] of overflow) {
    const free = tilesByDistance(map, area)
      .find((t) => tileAt(map, t[0], t[1]) === '.' && !reserved.has(key(t)) && !taken.has(key(t)));
    const t = free ?? s.door;
    targets.set(id, t);
    taken.add(key(t));
  }
  return targets;
}

// Advance everyone by dtMs. Pure: inputs are not modified. Each actor is
// { id, x, y, path, target, gone } where path holds the tiles still to walk.
// `seats`: open agent seats (view.office.seats).
export function stepActors(actors, people, dtMs, map = MAP, seats = baseSeats(map)) {
  const byId = new Map(actors.map((a) => [a.id, a]));
  const targets = planTargets(people, map, seats);
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
    if (a.gone && a.path.length > 0) a.gone = false;
    let budget = (WALK_SPEED * dtMs) / 1000;
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
