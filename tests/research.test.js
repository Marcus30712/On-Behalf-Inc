import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../sim/rng.js';
import { createPerson, moraleOf, applyRest } from '../sim/people.js';
import { defaultRoster } from '../sim/schedule.js';
import { stepInterval } from '../sim/interval.js';
import { startResearch, advanceResearch, advanceBuild, mods } from '../sim/research.js';
import { CLIENTS } from '../world/clients.js';
import { RESEARCH } from '../world/research.js';

const flat = { next: () => 0.5 };
const H = (h) => h * 60;
const def = (id) => RESEARCH.find((r) => r.id === id);

function makeState() {
  const rng = createRng(5);
  const people = [
    createPerson(rng, { id: 'a1', role: 'agent', nation: 'veltora' }),
    createPerson(rng, { id: 'a2', role: 'agent', nation: 'veltora' }),
    createPerson(rng, { id: 'l1', role: 'lead', nation: 'veltora' }),
  ];
  return {
    day: 1, minute: H(10), people, roster: defaultRoster(people), absences: [], assignment: {},
    clients: [{ id: CLIENTS[0].id, satisfaction: 70, active: true }], mods: {}, flags: {}, progress: { coaching: 0, qa: 0, research: 0, training: 0 },
    today: { clients: {} }, spikes: [], inbox: [],
    research: { done: [], current: null, points: 0, build: null },
  };
}
const person = (s, id) => s.people.find((p) => p.id === id);

test('research needs people assigned to it', () => {
  const s = makeState();
  assert.equal(startResearch(s, 'rest-room'), true);
  stepInterval(s, flat);
  advanceResearch(s);
  assert.equal(s.research.points, 0);
  s.assignment.l1 = { kind: 'research' };
  s.minute = H(15);
  stepInterval(s, flat);
  advanceResearch(s);
  assert.ok(s.research.points > 0);
  assert.equal(s.progress.research, 0);
});

test('finished research starts construction, finished construction applies the effect', () => {
  const s = makeState();
  startResearch(s, 'rest-room');
  s.progress.research = def('rest-room').cost;
  advanceResearch(s);
  assert.equal(s.research.current, null);
  assert.deepEqual(s.research.build, { researchId: 'rest-room', minutesLeft: def('rest-room').buildHours * 60 });
  assert.equal(s.inbox.at(-1).id, 'research-done');
  assert.equal(s.inbox.at(-1).data.researchId, 'rest-room');
  advanceBuild(s, 60);
  assert.equal(s.research.build.minutesLeft, def('rest-room').buildHours * 60 - 60);
  assert.equal(mods(s).restRecoveryMul, 1);
  advanceBuild(s, def('rest-room').buildHours * 60);
  assert.equal(s.research.build, null);
  assert.deepEqual(s.research.done, ['rest-room']);
  assert.equal(mods(s).restRecoveryMul, 1.5);
  assert.equal(s.inbox.at(-1).id, 'build-done');
});

test('clinic shortens the sick leave of someone already sick', () => {
  const s = makeState();
  const sick = person(s, 'a1');
  sick.health = { kind: 'sick', daysLeft: 4 };
  const burnt = person(s, 'a2');
  burnt.health = { kind: 'burnout', daysLeft: 1 };
  s.research.build = { researchId: 'clinic', minutesLeft: 30 };
  advanceBuild(s, 30);
  assert.equal(sick.health.daysLeft, 3); // ceil(4 x 0.6)
  assert.equal(burnt.health.daysLeft, 1); // minimum 1, unchanged
  const ev = s.inbox.at(-1);
  assert.equal(ev.id, 'build-done');
  assert.deepEqual(ev.data, { researchId: 'clinic', names: [sick.name] });
  assert.equal(s.mods.sickDaysMul, 0.6);
});

test('rest-room changes rest recovery from then on', () => {
  const s = makeState();
  const a = person(s, 'a1');
  a.fatigue = 50; a.stress = 60;
  const b = person(s, 'a2');
  b.fatigue = 5; b.stress = 20;
  s.research.build = { researchId: 'rest-room', minutesLeft: 30 };
  advanceBuild(s, 30);
  assert.equal(a.fatigue, 40);
  assert.equal(a.stress, 50);
  assert.equal(a.morale, moraleOf(a));
  assert.equal(b.fatigue, 0);
  assert.equal(b.stress, 10);
  assert.deepEqual(s.inbox.at(-1).data.names, [a.name]); // only stress >= 40 (HIGH_STRESS) before
  // From then on, rest recovers 30% faster.
  a.fatigue = 50;
  applyRest(a, { minutes: 30, mods: mods(s) });
  assert.ok(Math.abs(a.fatigue - (50 - 2 * 1.5)) < 1e-9);
});

test('stress-training lowers everyone stress; flexible-shifts sets the flag', () => {
  const s = makeState();
  person(s, 'a1').stress = 70;
  person(s, 'a2').stress = 10;
  s.research.build = { researchId: 'stress-training', minutesLeft: 30 };
  advanceBuild(s, 30);
  assert.equal(person(s, 'a1').stress, 55);
  assert.equal(person(s, 'a2').stress, 0);
  assert.deepEqual(s.inbox.at(-1).data.names, [person(s, 'a1').name]);
  assert.equal(mods(s).stressGainMul, 0.8);
  s.research.build = { researchId: 'flexible-shifts', minutesLeft: 30 };
  advanceBuild(s, 30);
  assert.equal(s.flags.flexibleShifts, true);
  assert.deepEqual(s.inbox.at(-1).data.names, []);
});

test('cannot start the same research twice, or two at once, or unknown', () => {
  const s = makeState();
  assert.equal(startResearch(s, 'nope'), false);
  assert.equal(startResearch(s, 'clinic'), true);
  assert.equal(startResearch(s, 'rest-room'), false); // another is current
  s.research.current = null;
  s.research.build = { researchId: 'clinic', minutesLeft: 10 };
  assert.equal(startResearch(s, 'rest-room'), false); // building
  s.research.build = null;
  s.research.done.push('clinic');
  assert.equal(startResearch(s, 'clinic'), false);
  assert.equal(startResearch(s, 'rest-room'), true);
});

test('missing research state is treated as empty', () => {
  const s = makeState();
  delete s.research; delete s.mods; delete s.flags;
  assert.deepEqual(mods(s), { restRecoveryMul: 1, stressGainMul: 1, sickDaysMul: 1, fatigueGainMul: 1 });
  advanceResearch(s);
  advanceBuild(s, 60);
  assert.equal(startResearch(s, 'clinic'), true);
});
