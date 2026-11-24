// Autoplay balance check: plays whole games through the public game API
// (createGame, advance, act, view) with a fixed policy and reports how the
// people, the clients and the money fared.
//
//   node tools/autoplay.js            summary + balance checks for 10 seeds
//
// Policies:
// - idle: no decisions at all; every choice event takes its passive default
//   when its deadline passes.
// - sensible: grants holiday leave; keeps the Friday roster (two agents per
//   client and shift cannot spare one); at Friday's close gives next
//   Wednesday off to the most stressed agent (stress >= 65) of each client
//   and shift, and to the lead or QA if that stressed; researches clinic ->
//   rest-room -> stress-training -> flexible-shifts with the team lead on
//   research two hours a day; moves an agent toward the client with the lower
//   recent met-rate, then evens out headcount per shift; puts QA on the
//   phone for the worst client while a client's recent met-rate is under 85%
//   (calls grow every quarter, v1.1); hires into free seats, picks the first
//   candidate, tries to keep people who hand in notice and declines new
//   clients (with acceptOffers, takes them).
//
// The checks also play sensible over 720 days (fees in years 1 and 2) and
// sensible taking client offers (the S milestone after losing a client).
import { pathToFileURL } from 'node:url';
import { createGame, advance, act, view } from '../sim/game.js';

const DAY = 1440;
const OPEN = 540; // 09:00
const CLOSE = 1260; // 21:00
const RESEARCH_FROM = 960; // 16:00: the lead researches 16:00-18:00
const RESEARCH_TO = 1080;
const RESEARCH_ORDER = ['clinic', 'rest-room', 'stress-training', 'flexible-shifts'];
const REST_STRESS = 65; // at Friday's close, this stressed earns next Wednesday off
const REST_WEEKDAY = 2; // Wednesday: a day off mid-week breaks a run of hard days
const PLAN_WEEKDAY = 4; // rest days are planned at Friday's close
const SHIFT_IDS = ['early', 'late'];
const MONTH = 30;
const MET_DAY = 0.8; // as sim/economy.js: a day counts as met at 80% of intervals
const FULL_FEE_SHARE = 0.7; // ... and the fee is paid in full at 70% met days
const MOVE_DAYS = 5; // recorded days compared when moving an agent by met-rate
const MOVE_GAP = 0.1; // met-rate gap that justifies a move
const MOVE_COOLDOWN = 10; // days between moves by met-rate
const QA_PHONE_BELOW = 0.85; // QA answers the phone while a client's recent met-rate is under this

const mean = (xs) => (xs.length === 0 ? 0 : xs.reduce((s, x) => s + x, 0) / xs.length);

// Plays the game from 09:00 on day 0 for `days` days, one day at a time:
// decide at 09:00, play to 21:00 (the lead switches to research for two
// hours), read the day's queues (on Fridays, plan next week's rest days),
// then play through the night.
// `acceptOffers` (sensible only): take every new-client offer instead of
// declining it.
export function runPolicy({ seed, days, policy, acceptOffers = false }) {
  const state = createGame(seed);
  const sensible = policy === 'sensible';
  const plan = sensible ? sensiblePlan(view(state), acceptOffers) : null;
  const tally = {
    seen: 0, sick: 0, sickDays: 0, burnouts: 0, burnoutLog: [], helped: 0, clinicHelped: 0, helpedNames: [], offers: 0, builtOn: {},
    left: 0, slSum: 0, slCount: 0, days: [], monthCash: [], minSatisfaction: 100,
  };
  let known = new Set(view(state).people.map((p) => p.id));

  for (let d = 0; d < days && !state.gameOver; d++) {
    let v = view(state);
    collect(v, tally);
    if (sensible) decide(state, v, plan, tally);

    if (sensible && plan.leadId && view(state).research.current) {
      advance(state, RESEARCH_FROM - state.minute);
      act(state, { type: 'assign', personId: plan.leadId, kind: 'research' });
      advance(state, RESEARCH_TO - state.minute);
      act(state, { type: 'assign', personId: plan.leadId, kind: 'coaching' });
    }
    advance(state, CLOSE - state.minute);

    v = view(state);
    recordDay(v, tally);
    if (sensible && v.date.weekday === PLAN_WEEKDAY) planRestDays(state, v, plan);
    advance(state, DAY - state.minute + OPEN);

    v = view(state);
    const now = new Set(v.people.map((p) => p.id));
    for (const id of known) if (!now.has(id)) tally.left += 1;
    known = now;
    if (v.day % 30 === 0) tally.monthCash.push(v.cash);
  }
  const v = view(state);
  collect(v, tally);
  return {
    survivedDays: state.gameOver ? state.gameOver.day : Math.min(days, v.day),
    gameOver: state.gameOver ? state.gameOver.kind : null,
    avgSL: tally.slCount > 0 ? tally.slSum / tally.slCount : 0,
    sickDays: tally.sickDays,
    sick: tally.sick,
    burnouts: tally.burnouts,
    burnoutLog: tally.burnoutLog,
    resigned: tally.left,
    cash: v.cash,
    monthCash: tally.monthCash,
    helped: tally.helped,
    clinicHelped: tally.clinicHelped,
    offers: tally.offers,
    helpedNames: tally.helpedNames,
    minSatisfaction: tally.minSatisfaction,
    researched: v.research.done,
    rankS: (v.milestones ?? []).includes('milestone-rank-s'),
    builtOn: tally.builtOn,
    feeMonths: feeMonths(tally.days, v.day),
    days: tally.days,
  };
}

// Client-months that ended, and how many earned the full fee, by the month-end
// rule of sim/economy.js applied to the recorded days.
export function feeMonths(days, today) {
  const months = new Map();
  for (const d of days) {
    const month = Math.floor(d.day / MONTH);
    if ((month + 1) * MONTH > today) continue; // month not over yet
    for (const [id, c] of Object.entries(d.clients)) {
      const key = `${month}/${id}`;
      const m = months.get(key) ?? { days: 0, met: 0 };
      m.days += 1;
      if (c.met >= MET_DAY) m.met += 1;
      months.set(key, m);
    }
  }
  const all = [...months.values()];
  return { total: all.length, full: all.filter((m) => m.met / m.days >= FULL_FEE_SHARE).length };
}

// Worn down within the first `days` days: the game ended, or two or more
// people burnt out. (The brief also lists "average SL under target"; it is
// left out because sensible play, which gives rest days, often runs a little
// under target in its first months too, so it would not tell the two apart.)
export function wornDown(run, days = Infinity) {
  const burnouts = run.burnoutLog.filter((entry) => Number(entry.split(':')[0]) < days).length;
  return (!!run.gameOver && run.survivedDays < days) || burnouts >= 2;
}

// The first `days` days of a longer run, as a run of that length would report
// them (the idle policy takes no decisions, so they are the same game).
export function upTo(run, days) {
  const survivedDays = Math.min(days, run.survivedDays);
  const kept = run.days.filter((d) => d.day < days);
  return {
    ...run,
    survivedDays,
    gameOver: run.gameOver && run.survivedDays < days ? run.gameOver : null,
    burnoutLog: run.burnoutLog.filter((entry) => Number(entry.split(':')[0]) < days),
    days: kept,
    feeMonths: feeMonths(kept, survivedDays),
  };
}

// Share of ended client-months paid in full, over all runs, for months that
// start in [from, to).
export function fullFeeShare(runs, from = 0, to = Infinity) {
  let full = 0;
  let total = 0;
  for (const r of runs) {
    const end = Math.min(to, r.survivedDays);
    const m = feeMonths(r.days.filter((d) => d.day >= from && d.day < end), end);
    full += m.full;
    total += m.total;
  }
  return total === 0 ? 0 : full / total;
}

// Hands-off play must not win a year (v1.1): on every seed it ends the year
// with less cash than sensible play, it reaches the S milestone on at most two
// seeds, and on seven or more it loses someone (a resignation) or the game.
export function idleYearVerdict(idle, sensible) {
  return {
    poorer: idle.filter((r, i) => r.cash < sensible[i].cash).length,
    rankS: idle.filter((r) => r.rankS).length,
    lost: idle.filter((r) => r.resigned >= 1 || r.gameOver).length,
  };
}

// New inbox events since the last look.
function collect(v, tally) {
  for (const e of v.inbox) {
    if (e.index < tally.seen) continue;
    if (e.id === 'sick') { tally.sick += 1; tally.sickDays += e.data.days; }
    if (e.id === 'burnout') { tally.burnouts += 1; tally.burnoutLog.push(`${e.day}:${e.personId}`); }
    if (e.id === 'client-offer') tally.offers += 1;
    if (e.id === 'build-done') tally.builtOn[e.data.researchId] = e.day;
    if (e.id === 'build-done' && e.data.names.length > 0) {
      tally.helped += 1;
      if (e.data.researchId === 'clinic') tally.clinicHelped += 1;
      tally.helpedNames.push(`${e.data.researchId}: ${e.data.names.join(', ')}`);
    }
  }
  tally.seen = v.inbox.length;
}

function recordDay(v, tally) {
  const clients = {};
  for (const c of v.clients) {
    if (!c.active) continue;
    tally.minSatisfaction = Math.min(tally.minSatisfaction, c.satisfaction);
    if (c.today.intervalsMetRate === null) continue;
    clients[c.id] = {
      met: c.today.intervalsMetRate, offered: c.today.offered, abandoned: c.today.abandoned,
      agents: c.today.agents, satisfaction: c.satisfaction,
    };
    tally.slSum += c.today.intervalsMetRate;
    tally.slCount += 1;
  }
  if (Object.keys(clients).length > 0) tally.days.push({ day: v.day, weekday: v.date.weekday, clients });
}

// --- sensible policy -------------------------------------------------------

function sensiblePlan(v, acceptOffers) {
  return {
    acceptOffers,
    leadId: v.people.find((p) => p.role === 'lead')?.id,
    restOff: [], // [{ personId, shift }]: next Wednesday off, and the usual shift
    lastMove: -Infinity, // day of the last move by met-rate
  };
}

const agentsOf = (v) => v.people.filter((p) => p.role === 'agent');

function decide(state, v, plan, tally) {
  answerInbox(state, v, plan);
  moveToNeediest(state, view(state), plan, tally);
  balanceClients(state, view(state));
  qaOnPhone(state, view(state), tally);
  if (!v.research.current && !v.research.build) {
    const next = RESEARCH_ORDER.find((id) => !v.research.done.includes(id));
    if (next) act(state, { type: 'startResearch', researchId: next });
  }
  if (agentsOf(v).length < 8 && !v.hiring) act(state, { type: 'startHiring' });
}

function answerInbox(state, v, plan) {
  for (const e of v.inbox) {
    if (e.resolved) continue;
    let choice;
    if (e.id === 'holiday-leave') choice = 'grant';
    else if (e.id === 'resign-notice') choice = 'keep-trying';
    else if (e.id === 'candidate') choice = 'pick-1';
    else if (e.id === 'client-offer') choice = plan.acceptOffers ? 'accept' : 'decline';
    else if (e.id === 'friday-off') choice = 'keep';
    if (choice) act(state, { type: 'resolve', index: e.index, choiceId: choice });
  }
}

// Friday evening: this week's extra days off go back to normal, and the most
// stressed agent of each client and shift, and the lead or QA if stressed
// (stress >= REST_STRESS at the end of the day), get next Wednesday off.
function planRestDays(state, v, plan) {
  for (const { personId, shift } of plan.restOff) {
    act(state, { type: 'setRoster', personId, weekday: REST_WEEKDAY, shift });
  }
  plan.restOff = [];
  const byClient = new Map();
  for (const p of v.people) {
    if (p.health.kind !== 'well' || p.stress < REST_STRESS) continue;
    if (!SHIFT_IDS.includes(p.rosterShift)) continue;
    // Agents: one per client and shift; the lead and QA each on their own.
    const key = p.role === 'agent' ? `${p.task?.clientId}/${p.rosterShift}` : p.role;
    const best = byClient.get(key);
    if (!best || p.stress > best.stress) byClient.set(key, p);
  }
  for (const p of byClient.values()) {
    if (act(state, { type: 'setRoster', personId: p.id, weekday: REST_WEEKDAY, shift: 'off' }).ok) {
      plan.restOff.push({ personId: p.id, shift: p.rosterShift });
    }
  }
}

// Well phone agents per client working `shift` today.
function staffOn(v, active, shift) {
  const staff = new Map(active.map((id) => [id, []]));
  for (const p of agentsOf(v)) {
    if (p.health.kind !== 'well' || p.rosterShift !== shift) continue;
    if (p.task?.kind === 'phone' && staff.has(p.task.clientId)) staff.get(p.task.clientId).push(p);
  }
  return staff;
}

// Met-rate first: when one client's last MOVE_DAYS recorded days ran
// MOVE_GAP below another's, and the better client has more agents at work on
// some shift today, the least stressed of them moves to the worse client.
// At most one move per MOVE_COOLDOWN days, so agents do not ping-pong.
function moveToNeediest(state, v, plan, tally) {
  if (v.day - plan.lastMove < MOVE_COOLDOWN) return;
  const active = v.clients.filter((c) => c.active).map((c) => c.id);
  if (active.length < 2) return;
  const recent = tally.days.slice(-MOVE_DAYS);
  const rate = (id) => mean(recent.map((d) => d.clients[id]?.met).filter((m) => m !== undefined));
  const ranked = [...active].sort((a, b) => rate(a) - rate(b));
  const worst = ranked[0];
  const best = ranked.at(-1);
  if (recent.length < MOVE_DAYS || rate(best) - rate(worst) < MOVE_GAP) return;
  for (const shift of SHIFT_IDS) {
    const staff = staffOn(v, active, shift);
    if (staff.get(best).length <= staff.get(worst).length) continue;
    const mover = [...staff.get(best)].sort((a, b) => a.stress - b.stress)[0];
    if (act(state, { type: 'assign', personId: mover.id, kind: 'phone', clientId: worst }).ok) {
      plan.lastMove = v.day;
      return;
    }
  }
}

// Headcount second: on each shift, if one client has two more agents at work
// today than another, one moves over to the short-handed client.
function balanceClients(state, v) {
  const active = v.clients.filter((c) => c.active).map((c) => c.id);
  if (active.length < 2) return;
  for (const shift of SHIFT_IDS) {
    const staff = staffOn(v, active, shift);
    const sorted = [...staff.entries()].sort((a, b) => a[1].length - b[1].length);
    const [shortId, short] = sorted[0];
    const [, long] = sorted.at(-1);
    if (long.length - short.length < 2) continue;
    const mover = [...long].sort((a, b) => a.stress - b.stress)[0];
    act(state, { type: 'assign', personId: mover.id, kind: 'phone', clientId: shortId });
  }
}

// Calls grow every quarter (v1.1): while a client's last MOVE_DAYS recorded
// days ran under QA_PHONE_BELOW, QA answers the phone for the worst of them;
// otherwise QA goes back to QA work.
function qaOnPhone(state, v, tally) {
  const qa = v.people.find((p) => p.role === 'qa');
  const active = v.clients.filter((c) => c.active).map((c) => c.id);
  if (!qa || active.length === 0) return;
  const recent = tally.days.slice(-MOVE_DAYS);
  const rate = (id) => mean(recent.map((d) => d.clients[id]?.met).filter((m) => m !== undefined));
  const worst = [...active].sort((a, b) => rate(a) - rate(b))[0];
  const behind = recent.length >= MOVE_DAYS && rate(worst) < QA_PHONE_BELOW;
  const want = behind ? { kind: 'phone', clientId: worst } : { kind: 'qa' };
  if (qa.task?.kind !== want.kind || qa.task?.clientId !== want.clientId) {
    act(state, { type: 'assign', personId: qa.id, ...want });
  }
}

// --- command line ----------------------------------------------------------

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const pct = (x) => `${(x * 100).toFixed(1)}%`;

function printRuns(label, runs) {
  console.log(`\n${label}`);
  console.log('seed  days  over                 avgSL   sick(days)  burnout  left  helped  minSat  cash');
  runs.forEach((r, i) => {
    console.log([
      String(SEEDS[i]).padEnd(5), String(r.survivedDays).padEnd(5), String(r.gameOver ?? '-').padEnd(20),
      pct(r.avgSL).padEnd(7), `${r.sick}(${r.sickDays})`.padEnd(11), String(r.burnouts).padEnd(8),
      String(r.resigned).padEnd(5), String(r.helped).padEnd(7), r.minSatisfaction.toFixed(0).padEnd(7),
      Math.round(r.cash),
    ].join(' '));
  });
}

// Average met-share per weekday, and on heavy days (offered >= 1.25 x that
// client's median weekday volume) against ordinary days.
function weekdayProfile(runs) {
  const byWeekday = [[], [], [], [], []];
  const heavy = [];
  const normal = [];
  for (const r of runs) {
    const offered = {};
    for (const d of r.days) for (const [id, c] of Object.entries(d.clients)) (offered[id] ??= []).push(c.offered);
    const median = Object.fromEntries(Object.entries(offered).map(([id, xs]) => {
      const s = [...xs].sort((a, b) => a - b);
      return [id, s[Math.floor(s.length / 2)]];
    }));
    for (const d of r.days) {
      for (const [id, c] of Object.entries(d.clients)) {
        byWeekday[d.weekday].push(c.met);
        (c.offered >= 1.25 * median[id] ? heavy : normal).push(c.met);
      }
    }
  }
  return { byWeekday: byWeekday.map(mean), heavy: mean(heavy), heavyDays: heavy.length, normal: mean(normal) };
}

function main() {
  const check = (ok, text) => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${text}`);
    return ok;
  };
  const t0 = Date.now();
  const idleYear = SEEDS.map((seed) => runPolicy({ seed, days: 360, policy: 'idle' }));
  const idle = idleYear.map((r) => upTo(r, 180));
  const firstMonth = idleYear.map((r) => upTo(r, 30));
  const sensible = SEEDS.map((seed) => runPolicy({ seed, days: 360, policy: 'sensible' }));
  const offers = SEEDS.map((seed) => runPolicy({ seed, days: 360, policy: 'sensible', acceptOffers: true }));
  const twoYears = SEEDS.map((seed) => runPolicy({ seed, days: 720, policy: 'sensible' }));
  printRuns('idle, 360 days', idleYear);
  printRuns('sensible, 360 days', sensible);
  printRuns('sensible taking client offers, 360 days', offers);
  printRuns('sensible, 720 days', twoYears);

  const target = 0.8;
  const worn = idle.filter((r) => wornDown(r, 180)).length;
  const sensibleWorn = sensible.filter((r) => wornDown(r, 180)).length;
  const feeShare = (runs) => {
    const sum = runs.reduce((acc, r) => [acc[0] + r.feeMonths.full, acc[1] + r.feeMonths.total], [0, 0]);
    return sum[0] / sum[1];
  };
  const feeSensible = feeShare(sensible);
  const feeIdle = feeShare(idle);
  const survived = sensible.filter((r) => !r.gameOver && r.avgSL >= 0.9 * target).length;
  const start = weekdayProfile(firstMonth);
  const sensibleYear = weekdayProfile(sensible);
  const helpedPerSeed = mean(sensible.map((r) => r.helped));
  const cash12 = sensible.map((r) => r.monthCash[11] ?? r.cash);
  const year = idleYearVerdict(idleYear, sensible);
  const offersS = offers.filter((r) => r.rankS).length;
  const fee2 = [fullFeeShare(twoYears, 0, 360), fullFeeShare(twoYears, 360, 720)];
  const over2 = twoYears.filter((r) => r.gameOver).length;

  console.log('\nfirst month, default roster (idle): met-share by weekday Mon..Fri',
    start.byWeekday.map(pct).join(' '), `| heavy days ${pct(start.heavy)} (${start.heavyDays}) vs ordinary ${pct(start.normal)}`);
  console.log('sensible year: met-share by weekday Mon..Fri',
    sensibleYear.byWeekday.map(pct).join(' '), `| heavy days ${pct(sensibleYear.heavy)} (${sensibleYear.heavyDays}) vs ordinary ${pct(sensibleYear.normal)}`);
  console.log('sensible cash at month ends (seed 1):', sensible[0].monthCash.map(Math.round).join(' '));
  console.log('research that helped someone (seed 1):', sensible[0].helpedNames.join(' | ') || '-');
  console.log('sensible year: clinic shortened a sick leave on', sensible.filter((r) => r.clinicHelped > 0).length,
    'of 10 seeds; client offers per seed:', sensible.map((r) => r.offers).join(' '));
  console.log('');

  const results = [
    check(worn >= 8, `idle wears people down within 180 days: ${worn}/10 seeds (burnouts>=2 or game over)`),
    check(sensibleWorn <= 2, `sensible play is not worn down by day 180 (same rule): ${sensibleWorn}/10 seeds worn`),
    check(feeSensible >= 0.7 && feeIdle <= feeSensible - 0.15,
      `fees paid in full: sensible ${pct(feeSensible)} of client-months (>= 70%), idle ${pct(feeIdle)}`),
    check(survived >= 8, `sensible survives 360 days with avg SL >= 90% of target: ${survived}/10 seeds`),
    check(start.normal >= 0.7 && start.normal < 0.98,
      `default staffing mostly meets target on ordinary days, not always: ${pct(start.normal)}`),
    check(start.byWeekday[0] < mean(start.byWeekday.slice(1, 4)) && sensibleYear.heavy < sensibleYear.normal - 0.05,
      `Mondays and heavy days strain it: Mon ${pct(start.byWeekday[0])} vs Tue-Thu ${pct(mean(start.byWeekday.slice(1, 4)))}, heavy ${pct(sensibleYear.heavy)} vs ${pct(sensibleYear.normal)}`),
    check(cash12.every((c) => c > 0) && mean(cash12) > 20000,
      `sensible cash after 12 months positive with growth: min ${Math.round(Math.min(...cash12))}, mean ${Math.round(mean(cash12))} (start 20000)`),
    check(firstMonth.every((r) => r.survivedDays >= 29 && !r.gameOver),
      `idle reaches the first month end on every seed: ${firstMonth.map((r) => r.survivedDays).join(' ')}`),
    check(helpedPerSeed >= 1,
      `research helps someone (build-done with names): ${helpedPerSeed.toFixed(1)} per seed`),
    check(year.poorer === SEEDS.length,
      `idle ends the year with less cash than sensible on every seed: ${year.poorer}/10 (idle ${idleYear.map((r) => Math.round(r.cash)).join(' ')})`),
    check(year.rankS <= 2, `idle reaches the S milestone on at most 2 seeds: ${year.rankS}/10`),
    check(year.lost >= 7, `idle loses someone (resignation) or the game within a year: ${year.lost}/10 seeds`),
    check(offersS >= 3,
      `sensible play that takes client offers still reaches the S milestone: ${offersS}/10 seeds (>= 3)`),
    check(over2 === 0 && fee2.every((f) => f >= 0.65),
      `sensible play over two years: fees in full year 1 ${pct(fee2[0])}, year 2 ${pct(fee2[1])} (each >= 65%), game over ${over2}/10`),
  ];
  console.log(`\n${results.filter(Boolean).length}/${results.length} checks pass (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  if (!results.every(Boolean)) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
