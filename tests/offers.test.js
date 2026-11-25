// v1.2 Task 4: offers gated by office level, 90-day re-offers, call growth
// resuming after the first expansion. Fake client defs go into CLIENTS here and
// come out again (the real ones arrive in Task 5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../sim/game.js';
import { serialize, deserialize } from '../sim/state.js';
import { dailyEconomy, acceptClient } from '../sim/economy.js';
import { startExpansion, advanceExpansion } from '../sim/office.js';
import { callsFor, CALL_GROWTH, CURVE } from '../sim/interval.js';
import { CLIENTS } from '../world/clients.js';
import { NATIONS } from '../world/nations.js';

const GUREUM = 'gureum-travel';
const DALBIT = 'dalbit-mall';
const FAKE = {
  id: 'test-big', name: '시험 고객사', industry: '시험', nation: 'veltora', start: false,
  slTarget: { pct: 80, sec: 20 }, monthlyFee: 10000, requiresOfficeLevel: 1,
  callsPerDay: 60, ahtMin: 5, patienceSec: 90, hours: { days: [0, 1, 2, 3, 4], open: 540, close: 1260 },
};

// The real v1.2 clients (requiresOfficeLevel) are taken out meanwhile so only the fakes are in play.
function withFakes(fakes, fn) {
  const added = fakes.filter((f) => !CLIENTS.includes(f));
  const saved = CLIENTS.slice();
  for (let i = CLIENTS.length - 1; i >= 0; i--) if ((CLIENTS[i].requiresOfficeLevel ?? 0) > 0) CLIENTS.splice(i, 1);
  CLIENTS.push(...added);
  try { fn(); } finally { CLIENTS.splice(0, CLIENTS.length, ...saved); }
}

// A state at A grade whose next dailyEconomy call raises an offer (if one is due).
function ready(seed = 1) {
  const s = createGame(seed);
  s.offerStreak = 19;
  s.clients.forEach((c) => { c.satisfaction = 100; });
  s.history = Array.from({ length: 20 }, (_, i) => ({
    day: i, clients: Object.fromEntries(s.clients.map((c) => [c.id, { intervals: 10, intervalsMet: 10, offered: 100, handled: 100 }])),
  }));
  return s;
}
const offers = (s) => s.inbox.filter((e) => e.id === 'client-offer');

test('a client needing office level 1 is not offered at level 0, but is at level 1', () => {
  withFakes([FAKE], () => {
    const s = ready();
    s.offered = [{ id: DALBIT, day: 0 }];
    s.day = 40;
    dailyEconomy(s);
    assert.equal(offers(s).length, 0, 'level 0: nothing eligible');
    s.office.level = 1;
    s.offerStreak = 19;
    dailyEconomy(s);
    assert.equal(offers(s).length, 1);
    assert.equal(offers(s)[0].clientId, FAKE.id);
    assert.deepEqual(s.offered.at(-1), { id: FAKE.id, day: 40 });
  });
});

test('a requiresOfficeLevel of 0 or none behaves as before', () => {
  const s = ready();
  s.day = 40;
  dailyEconomy(s);
  assert.equal(offers(s)[0].clientId, DALBIT);
  assert.deepEqual(s.offered, [{ id: DALBIT, day: 40 }]);
});

test('an offered client is offered again 90 days later, not before', () => {
  const s = ready();
  s.day = 40;
  dailyEconomy(s); // offered on day 40
  assert.equal(offers(s).length, 1);
  s.day = 40 + 89;
  s.offerStreak = 19;
  dailyEconomy(s);
  assert.equal(offers(s).length, 1, 'day 129: still too early');
  s.day = 40 + 90;
  s.offerStreak = 19;
  dailyEconomy(s);
  assert.equal(offers(s).length, 2, 'day 130: offered again');
  assert.deepEqual(s.offered, [{ id: DALBIT, day: 130 }], 'one record per client, refreshed');
});

test('a client that churned is not re-offered until 90 days after it was lost', () => {
  const s = ready();
  s.day = 40;
  dailyEconomy(s);
  acceptClient(s, DALBIT);
  const c = s.clients.find((x) => x.id === DALBIT);
  c.active = false;
  c.lostDay = 100; // lost long after the offer
  s.day = 100 + 89;
  s.offerStreak = 19;
  dailyEconomy(s);
  assert.equal(offers(s).length, 1, '89 days after the loss: no new offer');
  s.day = 100 + 90;
  s.offerStreak = 19;
  dailyEconomy(s);
  assert.equal(offers(s).length, 2);
});

test('an active client is never offered again', () => {
  const s = ready();
  s.day = 40;
  dailyEconomy(s);
  acceptClient(s, DALBIT);
  s.day = 400;
  s.offerStreak = 19;
  dailyEconomy(s);
  assert.equal(offers(s).length, 1);
});

test('an old save with offered as ids loads as {id, day} records', () => {
  const s = createGame(3);
  s.offered = [DALBIT];
  s.day = 55;
  const back = deserialize(serialize(s));
  assert.deepEqual(back.offered, [{ id: DALBIT, day: 55 }]);
  assert.deepEqual(deserialize(serialize(back)).offered, back.offered, 'records stay as they are');
});

test('a game with no offers serializes offered as an empty list, and level1Day is absent', () => {
  const s = createGame(3);
  assert.deepEqual(s.offered, []);
  assert.equal('level1Day' in s.office, false);
  assert.deepEqual(s.office, { level: 0, build: null });
});

test('finishing expansion 1 records its day; expansion 2 does not overwrite it', () => {
  const s = createGame(2);
  s.cash = 200000;
  startExpansion(s);
  for (let i = 0; i < 10; i++) { s.day = 20 + i; advanceExpansion(s); }
  assert.equal(s.office.level, 1);
  assert.equal(s.office.level1Day, 29);
  startExpansion(s);
  for (let i = 0; i < 15; i++) { s.day = 60 + i; advanceExpansion(s); }
  assert.equal(s.office.level, 2);
  assert.equal(s.office.level1Day, 29);
});

// A nation with no holidays, so growth is the only thing moving the call volume.
// Added to NATIONS only around a callsFor call (new games pick nations by index).
const QUIET = { ...NATIONS[0], id: 'test-quiet', holidays: [] };
const A = { ...CLIENTS[0], nation: QUIET.id };
function quietCalls(...args) {
  NATIONS.push(QUIET);
  try { return callsFor(...args); } finally { NATIONS.splice(NATIONS.indexOf(QUIET), 1); }
}
const flat = { next: () => 0.5 };
const H = (h) => h * 60;
const step = CALL_GROWTH.perQuarter;
// Growth factor on the Tuesday on or after `day` (weekday 1: weekday multiplier 1).
const tuesday = (day) => day + ((8 - (day % 7)) % 7);
const factor = (state, day) => quietCalls(A, tuesday(day), H(11), flat, state) / (A.callsPerDay * CURVE[4]);

test('without an expansion, call growth is the v1.1 curve (two quarters, then holds)', () => {
  const s = createGame(1);
  assert.ok(Math.abs(factor(s, 0) - 1) < 1e-9);
  assert.ok(Math.abs(factor(s, 100) - (1 + step)) < 1e-9);
  assert.ok(Math.abs(factor(s, 200) - (1 + 2 * step)) < 1e-9);
  assert.ok(Math.abs(factor(s, 2000) - (1 + 2 * step)) < 1e-9);
  assert.equal(factor(undefined, 2000), factor(s, 2000), 'state is optional');
});

test('after expansion 1, growth resumes for one quarter from its completion day, capped at x1.21', () => {
  const s = createGame(1);
  s.office = { level: 1, build: null, level1Day: 200 };
  // Day 200 + 90 = 290: the first extra step. Before that, the v1.1 curve (x1.14).
  assert.ok(Math.abs(factor(s, 285) - (1 + 2 * step)) < 1e-9, 'first quarter after completion: nothing extra yet');
  assert.ok(Math.abs(factor(s, 295) - (1 + 3 * step)) < 1e-9, 'one quarter after completion');
  assert.ok(Math.abs(factor(s, 375) - (1 + 3 * step)) < 1e-9);
  assert.ok(Math.abs(factor(s, 385) - (1 + 3 * step)) < 1e-9, 'two quarters after completion: no more');
  assert.ok(Math.abs(factor(s, 5000) - 1.21) < 1e-9, 'capped');
});

test('an early expansion stacks on the first quarters, still capped at x1.21', () => {
  const s = createGame(1);
  s.office = { level: 1, build: null, level1Day: 10 };
  assert.ok(Math.abs(factor(s, 105) - (1 + 2 * step)) < 1e-9, 'day 105: base quarter 1 + extra quarter 1');
  assert.ok(Math.abs(factor(s, 195) - (1 + 3 * step)) < 1e-9);
  assert.ok(Math.abs(factor(s, 3000) - 1.21) < 1e-9);
});

test('level 0 without level1Day is v1.1 growth', () => {
  const s = createGame(1);
  assert.equal(quietCalls(A, 501, H(11), flat, s), quietCalls(A, 501, H(11), flat));
});

test('a never-offered eligible client is offered before a cooled-down re-offer', () => {
  withFakes([FAKE], () => {
    const s = ready();
    s.office.level = 1;
    s.day = 400;
    s.offered = [{ id: DALBIT, day: 0 }]; // cooled down, eligible again; FAKE never offered, listed after it
    dailyEconomy(s);
    assert.equal(offers(s)[0].clientId, FAKE.id);
    assert.equal(offers(s)[0].data?.again, undefined);
    s.offerStreak = 19;
    s.day = 410;
    dailyEconomy(s);
    assert.equal(offers(s)[1].clientId, DALBIT, 'then the re-offer');
    assert.equal(offers(s)[1].data.again, true);
    assert.equal(offers(s)[1].data.officeLevel, 1);
  });
});

test('research-gated client is not offered before its research', () => {
  // At office level 2 (every channel client's level, v1.3 Task 6); the v1.2
  // clients needing level 1 count as offered lately.
  const run = (done) => {
    const s = ready();
    s.office.level = 2;
    s.offered = [DALBIT, 'bandi-repair', 'baram-delivery'].map((id) => ({ id, day: 0 }));
    s.day = 40;
    s.research = { done, current: null, points: 0, build: null };
    dailyEconomy(s);
    return offers(s).map((e) => e.clientId);
  };
  assert.deepEqual(run([]), [], 'no research: neither new client');
  assert.deepEqual(run(['mail-desk']), ['solbang-books']);
  assert.deepEqual(run(['chat-desk']), ['saebyeol-bank']);
});

test('a state without research at all offers neither gated client', () => {
  const s = ready();
  s.offered = [{ id: DALBIT, day: 0 }];
  s.day = 40;
  delete s.research;
  dailyEconomy(s);
  assert.equal(offers(s).length, 0);
});

// v1.3 Task 6 (design §4.1 revision): a channel client is offered only once its
// research is done and the office has reached its requiresOfficeLevel, so the
// offer comes when the seats can exist.
const CHANNEL_IDS = ['saebyeol-bank', 'solbang-books'];
const DESK = { 'saebyeol-bank': 'chat-desk', 'solbang-books': 'mail-desk' };
const OTHERS = [DALBIT, 'bandi-repair', 'baram-delivery'];

test('channel clients need an office level: chat 1, email at least 1', () => {
  const level = (id) => CLIENTS.find((c) => c.id === id).requiresOfficeLevel;
  assert.equal(level('saebyeol-bank'), 1);
  assert.ok([1, 2].includes(level('solbang-books')), `email level ${level('solbang-books')}`);
});

test('with its research done, a channel client is not offered below its office level (never at 0), and is at it', () => {
  for (const id of CHANNEL_IDS) {
    // Never at level 0 (no seats for a new desk), whatever the level field says.
    const need = Math.max(1, CLIENTS.find((c) => c.id === id).requiresOfficeLevel ?? 0);
    const s = ready();
    s.offered = OTHERS.map((o) => ({ id: o, day: 30 })); // every other client offered lately
    s.day = 40;
    s.research = { done: [DESK[id]], current: null, points: 0, build: null };
    for (let level = 0; level < need; level++) {
      s.office.level = level;
      s.offerStreak = 19;
      dailyEconomy(s);
      assert.equal(offers(s).length, 0, `${id} offered at level ${level}`);
    }
    s.office.level = need;
    s.offerStreak = 19;
    dailyEconomy(s);
    assert.deepEqual(offers(s).map((e) => e.clientId), [id], `${id} at level ${need}`);
  }
});

test('at its level, a never-offered channel client still comes before a cooled-down re-offer', () => {
  for (const id of CHANNEL_IDS) {
    const s = ready();
    s.office.level = CLIENTS.find((c) => c.id === id).requiresOfficeLevel;
    s.offered = OTHERS.map((o) => ({ id: o, day: 0 })); // all cooled down by day 400
    s.day = 400;
    s.research = { done: [DESK[id]], current: null, points: 0, build: null };
    dailyEconomy(s);
    assert.equal(offers(s)[0].clientId, id);
    assert.equal(offers(s)[0].data?.again, undefined);
    s.offerStreak = 19;
    s.day = 410;
    dailyEconomy(s);
    assert.equal(offers(s)[1].clientId, DALBIT, 'then the re-offer, in CLIENTS order');
    assert.equal(offers(s)[1].data.again, true);
  }
});
