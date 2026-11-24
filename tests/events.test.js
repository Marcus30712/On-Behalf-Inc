import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../sim/rng.js';
import { createPerson, moraleOf } from '../sim/people.js';
import { defaultRoster } from '../sim/schedule.js';
import { pushEvent, resolveEvent, expireEvents } from '../sim/events.js';

function makeState({ day = 73 } = {}) {
  const rng = createRng(11);
  const people = [
    createPerson(rng, { id: 'v1', role: 'agent', nation: 'veltora' }),
    createPerson(rng, { id: 'k1', role: 'agent', nation: 'kamuen' }),
  ];
  return {
    day, minute: 1260, people, roster: defaultRoster(people), absences: [], assignment: {},
    clients: [], mods: {}, progress: { coaching: 0, qa: 0, research: 0, training: 0 },
    today: { clients: {} }, spikes: [], inbox: [], history: [], leaving: [],
  };
}
const person = (state, id) => state.people.find((p) => p.id === id);
const leaveEvent = (state) => pushEvent(state, {
  id: 'holiday-leave', personId: 'v1',
  data: { holidayId: 'seed-day', startDay: 74, endDay: 74, firstWorkday: 74 },
  deadlineDay: 74,
});

test('pushEvent queues an unseen, unresolved event stamped with the day', () => {
  const state = makeState();
  pushEvent(state, { id: 'sick', personId: 'v1', data: { days: 3 } });
  assert.deepEqual(state.inbox, [{
    id: 'sick', personId: 'v1', data: { days: 3 }, day: 73, seen: false, resolved: false,
  }]);
});

test('resolveEvent on an event without choices just marks it seen', () => {
  const state = makeState();
  pushEvent(state, { id: 'sick', personId: 'v1', data: { days: 3 } });
  const before = structuredClone(state.people);
  resolveEvent(state, 0, undefined, createRng(1));
  assert.equal(state.inbox[0].seen, true);
  assert.deepEqual(state.people, before);
});

test('granting leave sets health leave and raises morale; refusing lowers morale', () => {
  const granted = makeState();
  granted.lastEndedDay = 73;
  leaveEvent(granted);
  const m0 = person(granted, 'v1').morale;
  resolveEvent(granted, 0, 'grant', createRng(1));
  const g = person(granted, 'v1');
  assert.deepEqual(g.health, { kind: 'leave', daysLeft: 1 });
  assert.equal(g.moraleBoost, 10);
  assert.ok(g.morale > m0 || g.morale === 100);
  assert.equal(granted.inbox[0].resolved, true);
  assert.equal(granted.inbox[0].seen, true);
  assert.equal(granted.inbox[0].choice, 'grant');

  const refused = makeState();
  leaveEvent(refused);
  const r = person(refused, 'v1');
  r.stress = 40; // keep morale below the 100 cap so the drop is visible
  r.morale = moraleOf(r);
  const before = r.morale;
  resolveEvent(refused, 0, 'refuse', createRng(1));
  assert.equal(r.health.kind, 'well');
  assert.equal(r.moraleBoost, -15);
  assert.equal(r.morale, before - 15);
});

test('refusing leave makes the person absent on the first holiday workday about 30% of the time', () => {
  let absent = 0;
  const rng = createRng(5);
  for (let i = 0; i < 1000; i++) {
    const state = makeState();
    leaveEvent(state);
    resolveEvent(state, 0, 'refuse', rng);
    if (state.absences.some((a) => a.personId === 'v1' && a.day === 74)) absent++;
  }
  assert.ok(absent > 250 && absent < 350, `absent ${absent}`);
});

test('a resolved event cannot be resolved again; unknown choices change nothing', () => {
  const state = makeState();
  leaveEvent(state);
  assert.equal(resolveEvent(state, 0, 'maybe', createRng(1)), false);
  assert.equal(state.inbox[0].resolved, false);
  assert.equal(resolveEvent(state, 0, 'refuse', createRng(1)), true);
  assert.equal(resolveEvent(state, 0, 'grant', createRng(1)), false);
  assert.equal(person(state, 'v1').health.kind, 'well');
  assert.equal(resolveEvent(state, 9, 'grant', createRng(1)), false);
});

test('friday-off change takes Friday off the roster, keep leaves it and lowers morale', () => {
  const state = makeState({ day: 0 });
  pushEvent(state, { id: 'friday-off', personId: 'k1', data: { nationId: 'kamuen' }, deadlineDay: 4 });
  pushEvent(state, { id: 'friday-off', personId: 'k1', data: { nationId: 'kamuen' }, deadlineDay: 4 });
  const k = person(state, 'k1');
  resolveEvent(state, 1, 'keep', createRng(1));
  assert.equal(k.moraleBoost, -5);
  assert.notEqual(state.roster.k1[4], 'off');
  resolveEvent(state, 0, 'change', createRng(1));
  assert.equal(k.moraleBoost, 3);
  assert.equal(state.roster.k1[4], 'off');
  assert.equal(state.roster.k1[3], 'late'); // other days untouched
});

test('resign-notice: let-go schedules the leave day, keep-trying boosts morale and may be withdrawn', () => {
  const state = makeState({ day: 0 });
  pushEvent(state, { id: 'resign-notice', personId: 'v1', data: { days: 10, leaveDay: 14 }, deadlineDay: 14 });
  pushEvent(state, { id: 'resign-notice', personId: 'k1', data: { days: 10, leaveDay: 14 }, deadlineDay: 14 });
  resolveEvent(state, 0, 'let-go', createRng(1));
  resolveEvent(state, 1, 'keep-trying', createRng(1));
  assert.equal(person(state, 'k1').moraleBoost, 15);
  assert.deepEqual(state.leaving, [
    { personId: 'v1', day: 14 },
    { personId: 'k1', day: 14, withdrawIfMoraleAbove: 50 },
  ]);
});

test('expired choice events take the passive default', () => {
  const state = makeState({ day: 74 });
  state.lastEndedDay = 73;
  leaveEvent(state); // deadline 74
  pushEvent(state, { id: 'friday-off', personId: 'k1', data: { nationId: 'kamuen' }, deadlineDay: 75 });
  pushEvent(state, { id: 'candidate', data: {}, deadlineDay: 70 });
  expireEvents(state, createRng(1));
  assert.equal(state.inbox[0].choice, 'grant');
  assert.equal(state.inbox[0].auto, true);
  assert.equal(person(state, 'v1').health.kind, 'leave');
  assert.equal(state.inbox[1].resolved, false);
  assert.equal(state.inbox[2].choice, 'hold');
});
