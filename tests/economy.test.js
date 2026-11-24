import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../sim/rng.js';
import { createPerson } from '../sim/people.js';
import { defaultRoster } from '../sim/schedule.js';
import { isWorkday } from '../sim/calendar.js';
import { stepInterval } from '../sim/interval.js';
import { endOfDay } from '../sim/day.js';
import { resolveEvent } from '../sim/events.js';
import { advanceHiring } from '../sim/hiring.js';
import {
  SALARY, monthEnd, dailyEconomy, reputation, isOver,
} from '../sim/economy.js';

const GUREUM = 'gureum-travel';
const MULBIT = 'mulbit-telecom';
const DALBIT = 'dalbit-mall';

function makeState({ clients = [GUREUM, MULBIT], cash = 100000 } = {}) {
  const rng = createRng(41);
  const people = [];
  for (let i = 0; i < 8; i++) people.push(createPerson(rng, { id: `a${i}`, role: 'agent', nation: 'veltora' }));
  people.push(createPerson(rng, { id: 'l1', role: 'lead', nation: 'veltora' }));
  people.push(createPerson(rng, { id: 'q1', role: 'qa', nation: 'kamuen' }));
  const assignment = Object.fromEntries(people.filter((p) => p.role === 'agent')
    .map((p, i) => [p.id, { kind: 'phone', clientId: clients[i % clients.length] }]));
  return {
    day: 29, minute: 1260, people, roster: defaultRoster(people), absences: [], assignment,
    clients: clients.map((id) => ({ id, satisfaction: 70, active: true })),
    mods: {}, progress: { coaching: 0, qa: 0, research: 0, training: 0 },
    today: { clients: {} }, spikes: [], inbox: [], history: [], leaving: [], cash,
  };
}
// One history entry per workday of month 1 (days 0-29); met[id] = days met out of them.
function monthHistory(met) {
  const days = [];
  for (let d = 0; d < 30; d++) if (isWorkday(d)) days.push(d);
  return days.map((d, i) => ({
    day: d,
    clients: Object.fromEntries(Object.entries(met).map(([id, n]) => [
      id, { intervals: 24, intervalsMet: i < n ? 24 : 12 },
    ])),
  }));
}
const events = (state, id) => state.inbox.filter((e) => e.id === id);
const payroll = 8 * SALARY.agent + SALARY.lead + SALARY.qa;

test('month end pays fees and salaries; missing SL cuts the fee', () => {
  assert.deepEqual(SALARY, { agent: 2400, lead: 3600, qa: 3000 });
  const s = makeState();
  // 22 workdays in days 0-29. gureum meets 16 (0.73), mulbit 15 (0.68 < 0.7).
  s.history = [{ day: -3, clients: { [MULBIT]: { intervals: 24, intervalsMet: 24 } } }, ...monthHistory({ [GUREUM]: 16, [MULBIT]: 15 })];
  assert.equal(s.history.length, 23);
  s.reputationPenalty = 4;
  monthEnd(s);
  assert.equal(s.cash, 100000 + 18000 + 16000 * 0.8 - payroll);
  assert.equal(s.reputationPenalty, 2);
  assert.equal(isOver(s), false);
});

test('an inactive client pays nothing', () => {
  const s = makeState();
  s.history = monthHistory({ [GUREUM]: 22, [MULBIT]: 22 });
  s.clients[1].active = false;
  monthEnd(s);
  assert.equal(s.cash, 100000 + 18000 - payroll);
});

test('negative cash ends the game once', () => {
  const s = makeState({ cash: -10000 });
  s.history = monthHistory({ [GUREUM]: 0, [MULBIT]: 0 });
  monthEnd(s);
  assert.ok(s.cash < 0);
  assert.equal(isOver(s), true);
  assert.deepEqual(s.gameOver, { kind: 'game-over-cash', day: 29 });
  assert.equal(events(s, 'game-over-cash').length, 1);
  assert.equal(events(s, 'game-over-cash')[0].data.days, 30);

  s.day = 30;
  s.minute = 600;
  const frozen = JSON.stringify(s);
  const rng = createRng(1);
  stepInterval(s, rng);
  endOfDay(s, rng);
  monthEnd(s);
  dailyEconomy(s);
  advanceHiring(s, rng);
  assert.equal(JSON.stringify(s), frozen);
});

test('last client leaving ends the game', () => {
  const s = makeState({ clients: [GUREUM] });
  s.history = monthHistory({ [GUREUM]: 0 });
  s.clients[0].satisfaction = 15;
  dailyEconomy(s);
  assert.equal(events(s, 'churn-warning').length, 1);
  assert.equal(events(s, 'churn-warning')[0].clientId, GUREUM);
  assert.equal(events(s, 'churn-warning')[0].data.days, 20);
  assert.deepEqual(s.churn, [{ clientId: GUREUM, workdaysLeft: 20 }]);
  for (let i = 0; i < 19; i++) dailyEconomy(s);
  assert.equal(s.clients[0].active, true);
  assert.equal(isOver(s), false);
  dailyEconomy(s);
  assert.equal(s.clients[0].active, false);
  assert.deepEqual(s.gameOver, { kind: 'game-over-clients', day: 29 });
  dailyEconomy(s);
  assert.equal(events(s, 'game-over-clients').length, 1);
  assert.equal(events(s, 'churn-warning').length, 1);
});

test('a lost client\'s agents move to the active client with the lowest met-rate', () => {
  const s = makeState({ clients: [GUREUM, MULBIT, DALBIT] });
  s.history = monthHistory({ [GUREUM]: 22, [MULBIT]: 5, [DALBIT]: 10 });
  s.clients.find((c) => c.id === GUREUM).satisfaction = 10;
  s.churn = [{ clientId: GUREUM, workdaysLeft: 1 }];
  const movers = Object.keys(s.assignment).filter((id) => s.assignment[id].clientId === GUREUM);
  assert.ok(movers.length > 0);
  dailyEconomy(s);
  assert.equal(s.clients[0].active, false);
  for (const id of movers) assert.deepEqual(s.assignment[id], { kind: 'phone', clientId: MULBIT });
  assert.equal(isOver(s), false);
});

test('churn warning recovers if satisfaction climbs back', () => {
  const s = makeState();
  s.history = monthHistory({ [GUREUM]: 0, [MULBIT]: 0 });
  s.clients[1].satisfaction = 20;
  dailyEconomy(s);
  assert.equal(events(s, 'churn-warning').length, 1);
  for (let i = 0; i < 5; i++) dailyEconomy(s);
  assert.equal(s.churn[0].workdaysLeft, 15);
  s.clients[1].satisfaction = 40;
  dailyEconomy(s);
  assert.equal(s.churn.length, 1, '40 is not enough');
  s.clients[1].satisfaction = 41;
  dailyEconomy(s);
  assert.deepEqual(s.churn, []);
  for (let i = 0; i < 30; i++) dailyEconomy(s);
  assert.equal(s.clients[1].active, true);
  assert.equal(events(s, 'churn-warning').length, 1);
});

test('reputation weighs met-rate, satisfaction and the penalty', () => {
  const s = makeState();
  // 60 x 1 + 0.4 x 75 = 90 -> S
  s.history = monthHistory({ [GUREUM]: 22, [MULBIT]: 22 });
  s.clients.forEach((c) => { c.satisfaction = 75; });
  assert.equal(reputation(s), 'S');
  s.reputationPenalty = 1; // 89 -> A
  assert.equal(reputation(s), 'A');
  s.reputationPenalty = 0;
  // Only the last 20 workdays count: the 2 oldest (met 12/24) drop out.
  s.history = monthHistory({ [GUREUM]: 0, [MULBIT]: 0 }).map((h, i) => (i < 2 ? h : {
    ...h, clients: { [GUREUM]: { intervals: 24, intervalsMet: 24 }, [MULBIT]: { intervals: 24, intervalsMet: 24 } },
  }));
  assert.equal(reputation(s), 'S');
  // Half met: 30 + 30 = 60 -> B; less satisfaction -> C, D.
  s.history = monthHistory({ [GUREUM]: 0, [MULBIT]: 0 });
  assert.equal(reputation(s), 'B');
  s.clients.forEach((c) => { c.satisfaction = 50; });
  assert.equal(reputation(s), 'C');
  s.clients.forEach((c) => { c.satisfaction = 0; });
  assert.equal(reputation(s), 'D');
  // Inactive clients do not count.
  s.clients[1].active = false;
  s.clients[0].satisfaction = 75;
  s.history = monthHistory({ [GUREUM]: 22, [MULBIT]: 0 });
  assert.equal(reputation(s), 'S');
});

test('20 workdays at A or better bring one client offer; accepting adds the client', () => {
  const s = makeState();
  s.history = monthHistory({ [GUREUM]: 22, [MULBIT]: 22 });
  s.clients.forEach((c) => { c.satisfaction = 50; }); // 60 + 20 = 80 -> A
  for (let i = 0; i < 19; i++) dailyEconomy(s);
  assert.equal(events(s, 'client-offer').length, 0);
  dailyEconomy(s);
  const offers = events(s, 'client-offer');
  assert.equal(offers.length, 1);
  assert.equal(offers[0].clientId, DALBIT);
  assert.ok(offers[0].deadlineDay > s.day);
  for (let i = 0; i < 40; i++) dailyEconomy(s);
  assert.equal(events(s, 'client-offer').length, 1);

  resolveEvent(s, s.inbox.indexOf(offers[0]), 'accept', createRng(1));
  assert.deepEqual(s.clients.at(-1), { id: DALBIT, satisfaction: 70, active: true });
});

test('a dip below A restarts the offer count', () => {
  const s = makeState();
  s.history = monthHistory({ [GUREUM]: 22, [MULBIT]: 22 });
  s.clients.forEach((c) => { c.satisfaction = 50; });
  for (let i = 0; i < 15; i++) dailyEconomy(s);
  s.clients.forEach((c) => { c.satisfaction = 25; }); // 70 -> B
  dailyEconomy(s);
  s.clients.forEach((c) => { c.satisfaction = 50; });
  for (let i = 0; i < 19; i++) dailyEconomy(s);
  assert.equal(events(s, 'client-offer').length, 0);
  dailyEconomy(s);
  assert.equal(events(s, 'client-offer').length, 1);
});

test('milestones fire once', () => {
  const s = makeState();
  s.history = monthHistory({ [GUREUM]: 22, [MULBIT]: 22 });
  s.clients.forEach((c) => { c.satisfaction = 80; }); // 92 -> S
  dailyEconomy(s);
  dailyEconomy(s);
  assert.equal(events(s, 'milestone-rank-s').length, 1);
  assert.deepEqual(s.milestones, ['milestone-rank-s']);

  // Three clients at once.
  s.clients.forEach((c) => { c.satisfaction = 50; });
  for (let i = 0; i < 20; i++) dailyEconomy(s);
  const offer = events(s, 'client-offer')[0];
  resolveEvent(s, s.inbox.indexOf(offer), 'accept', createRng(1));
  assert.equal(events(s, 'milestone-big-client').length, 1);
  dailyEconomy(s);
  s.clients[2].active = false;
  dailyEconomy(s);
  s.clients[2].active = true;
  dailyEconomy(s);
  s.clients.forEach((c) => { c.satisfaction = 90; });
  dailyEconomy(s);
  assert.equal(events(s, 'milestone-big-client').length, 1);
  assert.equal(events(s, 'milestone-rank-s').length, 1);
});
