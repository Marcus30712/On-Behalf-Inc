import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  runPolicy, wornDown, idleYearVerdict, fullFeeShare, expansionVerdict, channelsVerdict, emailLost, emailStruggles, emailKept,
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
  // The fee cut is a penalty, not the normal state. Re-based in v1.6 (real
  // breaks): 70% -> 65%, as the autoplay check; breaks in the hours one shift
  // covers alone cost some met days (69.2% measured). Idle stays far lower
  // (tools/autoplay.js checks the 15-point gap).
  const full = runs.reduce((s, r) => s + r.feeMonths.full, 0);
  const total = runs.reduce((s, r) => s + r.feeMonths.total, 0);
  assert.ok(full / total >= 0.65, `full fee in ${full}/${total} client-months`);
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

// The brief's offers-S guard for v1.2 ("제안 수락 sensible의 S 이정표가 v1.1(3/10)보다
// 나빠지지 않는다"): the same check as v1.1, the 13th line of the autoplay checks.
// Re-based in v1.6 (real breaks): within two years on >= 8/10 seeds (was within
// a year on >= 3/10). With real breaks the three-client year holds 73-87 at best,
// so S comes in year 2 (10/10 measured). The S threshold stays 90: idle holds
// 89.1 for 30 workdays in year 1 on seed 1, so a lower one lets idle reach S.
test('sensible play that takes client offers can still reach S within two years (offers-S guard, re-based v1.6)', () => {
  // Eight seats for three clients: every seed loses a client, which keeps 15
  // off the reputation for 180 days; S comes back after that.
  const runs = SEEDS.map((seed) => runPolicy({ seed, days: 720, policy: 'sensible', acceptOffers: true }));
  const s = runs.filter((r) => r.rankS).length;
  assert.ok(s >= 8, `S milestone on ${s}/10 seeds`);
});

// Two years of sensible play: without expansion, expanding greedily (every
// offer the office can staff) and expanding while keeping service (v1.2),
// played once and shared by the tests below.
let twoYears;
function twoYear() {
  twoYears ??= {
    plain: SEEDS.map((seed) => runPolicy({ seed, days: 720, policy: 'sensible' })),
    greedy: SEEDS.map((seed) => runPolicy({ seed, days: 720, policy: 'sensible', expand: 'greedy' })),
    keep: SEEDS.map((seed) => runPolicy({ seed, days: 720, policy: 'sensible', expand: 'keep' })),
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

// v1.2: a player who keeps service (at most three weekday clients plus the
// weekend client) can expand and come out ahead: expansion 1 finishes within
// two years, fees stay paid in full, and the cash at day 720 is not below
// sensible play without expansion on most seeds. Re-based in v1.6 (real
// breaks): not poorer on >= 6/10 (was >= 8); three weekday clients on 8 seats
// are squeezed hardest by real breaks (6/10 measured, two seeds near a tie).
test('sensible play that keeps service finishes expansion 1 and is not poorer for it', () => {
  const { plain, keep } = twoYear();
  const v = expansionVerdict(keep, plain);
  const days = keep.map((r) => r.level1Day ?? '-').join(' ');
  const cash = (runs) => runs.map((r) => Math.round(r.cash)).join(' ');
  assert.ok(v.built >= 8, `expansion 1 finished on ${v.built}/10 seeds (days ${days})`);
  assert.ok(v.fees.every((f) => f >= 0.65), `fees in full ${v.fees.map((f) => (f * 100).toFixed(1)).join('% / ')}%`);
  assert.ok(v.notPoorer >= 6, `not poorer on ${v.notPoorer}/10: expanded ${cash(keep)} vs not ${cash(plain)}`);
  for (const r of keep) assert.equal(r.gameOver, null, `game over on day ${r.survivedDays}`);
});

// Expansion is not easy money: taking every offer the office can staff earns
// more than keeping service, and pays for it in service.
test('greedy expansion trades service for cash', () => {
  const { keep, greedy } = twoYear();
  const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const fee = (runs) => fullFeeShare(runs, 0, 720);
  assert.ok(mean(greedy.map((r) => r.cash)) > mean(keep.map((r) => r.cash)), 'greedy is not richer');
  assert.ok(fee(greedy) < fee(keep) - 0.1, `fees in full: greedy ${fee(greedy)} vs keep ${fee(keep)}`);
});

// The weekend crew keeps a five-day week: nobody is rostered six days (x1.5 fatigue).
test('the weekend crew keeps a five-day week', () => {
  const { keep, greedy } = twoYear();
  const runs = [...keep, ...greedy];
  assert.ok(runs.some((r) => r.weekendDays > 0), 'no seed opened on a weekend');
  for (const r of runs) assert.equal(r.sixDay, 0, `person-days rostered six days or more: ${r.sixDay}`);
});

// v1.3: the keep-service game that also researches the chat and mail desks and
// takes both channel clients (staffing the mail), and the same game leaving
// the mail unstaffed, over 720 days. Compared with keep-service (above).
let channelGames;
function channelRuns() {
  channelGames ??= {
    staff: SEEDS.map((seed) => runPolicy({ seed, days: 720, policy: 'sensible', expand: 'keep', channels: 'staff' })),
    nostaff: SEEDS.map((seed) => runPolicy({ seed, days: 720, policy: 'sensible', expand: 'keep', channels: 'nostaff' })),
    single: SEEDS.map((seed) => runPolicy({ seed, days: 720, policy: 'sensible', expand: 'keep', channels: 'single' })),
    pair: SEEDS.map((seed) => runPolicy({ seed, days: 720, policy: 'sensible', expand: 'keep', channels: 'pair' })),
  };
  return channelGames;
}

test('chat and email clients can be run well and are not a loss', () => {
  const { staff } = channelRuns();
  const { keep } = twoYear();
  const v = channelsVerdict(staff, keep);
  const cash = (runs) => runs.map((r) => Math.round(r.cash)).join(' ');
  assert.ok(v.active >= 8, `both channel clients active at day 720 on ${v.active}/10: ${staff.map((r) => r.clients.join('+')).join(' ')}`);
  assert.equal(v.backlogOk, SEEDS.length,
    `email backlog within two days of mail: ${staff.map((r) => `${Math.round(r.email.maxBacklog)}/${Math.round(r.email.perDay)}`).join(' ')}`);
  assert.ok(v.fees.every((f) => f >= 0.65), `fees in full ${v.fees.map((f) => (f * 100).toFixed(1)).join('% / ')}%`);
  // Money (user decision 2026-11-25): the mean, not seed by seed (near-ties go either way).
  assert.ok(v.meanCash >= v.keepMeanCash,
    `mean cash ${Math.round(v.meanCash)} vs keep-service ${Math.round(v.keepMeanCash)} (not poorer on ${v.notPoorer}/10): ${cash(staff)} vs ${cash(keep)}`);
  for (const r of staff) assert.equal(r.gameOver, null, `game over on day ${r.survivedDays}`);
});

// Failure condition of the design: email is not free money. Nobody on the mail, the client leaves.
test('an email client nobody answers is lost', () => {
  const { nostaff } = channelRuns();
  const lost = emailLost(nostaff);
  assert.ok(lost >= 8, `email client lost on ${lost}/10: ${nostaff.map((r) => `${r.email.days}d lost ${r.email.lost}`).join(' ')}`);
});

// The design's lesson: one email agent with nobody covering their days off is not enough.
test('one email agent with no cover struggles', () => {
  const { single } = channelRuns();
  const n = emailStruggles(single);
  const met = single.map((r) => (r.email.met === null ? '-' : r.email.met.toFixed(2)));
  assert.ok(n >= 8, `struggled on ${n}/10: met ${met.join(' ')}, lost ${single.map((r) => r.email.lost).join(' ')}`);
});

// Final review I5: two email agents, assigned once with no daily stand-in (what
// the offer text suggests), keep the client: one absent day must not start a
// backlog the pair can never drain.
test('two email agents assigned once keep the email client', () => {
  const { pair } = channelRuns();
  const n = emailKept(pair);
  const met = pair.map((r) => (r.email.met === null ? '-' : r.email.met.toFixed(2)));
  assert.ok(n >= 8, `never lost on ${n}/10: lost ${pair.map((r) => r.email.lost).join(' ')}, met ${met.join(' ')}`);
});
