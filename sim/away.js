// Where a person is within a break interval, by the minute. Pure, no DOM.
//
// The sim marks the whole 30-minute interval 'break' or 'lunch' when a break
// touches it. With the current game minute (sim minute plus the part of the
// interval already run) and the person's plan (view.people[].breaks, start
// minutes; lengths from sim/schedule.js), the person is away only during the
// break's own minutes; for the rest of the interval they do what they do at
// the desk (view.people[].deskActivity, v1.8; 'idle' when a view lacks it).
// Without a minute or a plan, the activity decides as before.
// v1.6 in render/actors.js; v1.8 shared with the people list (ui/panels.js).
import { BREAK_LENGTH } from './schedule.js';

const AWAY = new Set(['break', 'lunch']);

export function nowActivity(person, minute) {
  if (!AWAY.has(person.activity) || !Number.isFinite(minute) || !person.breaks) return person.activity;
  const away = Object.entries(BREAK_LENGTH).some(([kind, length]) => {
    const start = person.breaks[kind];
    return Number.isFinite(start) && minute >= start && minute < start + length;
  });
  return away ? person.activity : (person.deskActivity ?? 'idle');
}
