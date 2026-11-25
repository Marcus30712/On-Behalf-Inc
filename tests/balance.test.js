import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  runPolicy, wornDown, idleYearVerdict, fullFeeShare, expansionVerdict,
} from '../tools/autoplay.js';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const SL_TARGET = 0.8; // both starting clients aim for 80%

// A whole year of each policy, played once and shared by the tests below.
// The idle game takes no decisions, so its first 180 days are the same as a
// 180-day game: the 180-day checks read them with wornDown(r, 180).
let played;
function year() {
  played ??= {
    idle: SEEDS.map((seed) => runPolicy({ seed, days: 360, policy: 'idle' })),
    sensible: SEEDS.map((seed) => runPolicy({ seed, days: 360, policy: 'sensible' })),
  };
  return played;
}

// "Worn down" (tools/autoplay.js wornDown): a game over, or two or more
// burnouts. The same rule is applied to sensible play below, which must
// mostly stay clear of it, so this test cannot pass for any policy.
test('doing nothing wears people down within a few months', () => {
  const runs = year().idle;
  const worn = runs.filter((r) => wornDown(r, 180));
  assert.ok(worn.length >= 8, `worn down on ${worn.length}/10 seeds`);
  // Not a collapse: every idle game reaches its first month end.
  for (const r of runs) assert.ok(r.survivedDays >= 30, `idle game over on day ${r.survivedDays}`);
});

test('sensible play survives a year', () => {
  const runs = year().sensible;
  const ok = runs.filter((r) => !r.gameOver && r.avgSL >= 0.9 * SL_TARGET);
  assert.ok(ok.length >= 8, `survived on ${ok.length}/10 seeds: ${runs.map((r) => r.avgSL.toFixed(2)).join(' ')}`);
  // Taking care works: by the same rule as the idle test, at most 2 seeds
  // are worn down in the first 180 days.
  const worn = runs.filter((r) => wornDown(r, 180));
  assert.ok(worn.length <= 2, `sensible play worn down on ${worn.length}/10 seeds`);
  // The fee cut is a penalty, not the normal state.
  const full = runs.reduce((s, r) => s + r.feeMonths.full, 0);
  const total = runs.reduce((s, r) => s + r.feeMonths.total, 0);
  assert.ok(full / total >= 0.7, `full fee in ${full}/${total} client-months`);
  // Money: still positive after twelve month ends, and grown on average.
  const cash = runs.map((r) => r.monthCash[11]);
  assert.ok(cash.every((c) => c > 0), `cash after 12 months: ${cash.join(' ')}`);
  assert.ok(cash.reduce((s, c) => s + c, 0) / cash.length > 20000, `cash after 12 months: ${cash.join(' ')}`);
  // The core moment: a finished research helps someone who is worn or ill.
  const helped = runs.reduce((s, r) => s + r.helped, 0) / runs.length;
  assert.ok(helped >= 1, `research helped ${helped} times per seed`);
});

test('hands-off play does not win a year', () => {
  const { idle, sensible } = year();
  const v = idleYearVerdict(idle, sensible);
  const cash = (runs) => runs.map((r) => Math.round(r.cash)).join(' ');
  assert.equal(v.poorer, SEEDS.length, `idle cash ${cash(idle)} vs sensible ${cash(sensible)}`);
  assert.ok(v.rankS <= 2, `idle reached the S milestone on ${v.rankS}/10 seeds`);
  assert.ok(v.lost >= 7, `idle lost someone or the game on ${v.lost}/10 seeds`);
});

test('sensible play that takes client offers can still reach S within a year', () => {
  // Eight seats for three clients: every seed loses a client, which keeps 15
  // off the reputation for 180 days; S comes back on the seeds that lose one early.
  const runs = SEEDS.map((seed) => runPolicy({ seed, days: 360, policy: 'sensible', acceptOffers: true }));
  const s = runs.filter((r) => r.rankS).length;
  assert.ok(s >= 3, `S milestone on ${s}/10 seeds`);
});

// Two years of sensible play, without and with office expansion (v1.2),
// played once and shared by the tests below.
let twoYears;
function twoYear() {
  twoYears ??= {
    plain: SEEDS.map((seed) => runPolicy({ seed, days: 720, policy: 'sensible' })),
    expand: SEEDS.map((seed) => runPolicy({ seed, days: 720, policy: 'sensible', expand: true })),
  };
  return twoYears;
}

test('sensible play keeps its fees over two years (calls stop growing after two quarters)', () => {
  const runs = twoYear().plain;
  assert.equal(runs.filter((r) => r.gameOver).length, 0);
  for (const [from, to] of [[0, 360], [360, 720]]) {
    const share = fullFeeShare(runs, from, to);
    assert.ok(share >= 0.65, `full fee in ${(share * 100).toFixed(1)}% of client-months, days ${from}-${to}`);
  }
});

// v1.2: sensible play that expands the office when it can afford it, hires
// into the new seats and takes the offers the office level can staff
// (the weekend client too, with a weekend crew).
test('sensible play finishes expansion 1 within two years and is not poorer for it', () => {
  const { plain, expand } = twoYear();
  const v = expansionVerdict(expand, plain);
  const days = expand.map((r) => r.level1Day ?? '-').join(' ');
  assert.ok(v.built >= 8, `expansion 1 finished on ${v.built}/10 seeds (days ${days})`);
  const cash = (runs) => runs.map((r) => Math.round(r.cash)).join(' ');
  assert.equal(v.notPoorer, v.built, `expanded ${cash(expand)} vs not ${cash(plain)}`);
  for (const r of expand) assert.equal(r.gameOver, null, `game over on day ${r.survivedDays}`);
  // The weekend crew keeps a five-day week: nobody is rostered six days (x1.5 fatigue).
  assert.ok(expand.some((r) => r.weekendDays > 0), 'no seed opened on a weekend');
  for (const r of expand) assert.equal(r.sixDay, 0, `person-days rostered six days or more: ${r.sixDay}`);
});

test('sensible play that expands and takes offers reaches S within a year as often as v1.1 (3/10)', () => {
  const runs = twoYear().expand;
  const s = runs.filter((r) => r.rankSDay !== null && r.rankSDay < 360).length;
  assert.ok(s >= 3, `S milestone within 360 days on ${s}/10 seeds (days ${runs.map((r) => r.rankSDay ?? '-').join(' ')})`);
});
