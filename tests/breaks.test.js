// v1.6 Task 2: the daily break plan (sim/breaks.js) and workShare with a plan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../sim/state.js';
import { SHIFTS, workShare } from '../sim/schedule.js';
import { CURVE } from '../sim/interval.js';
import { planBreaks, dayRng, BREAK_WINDOWS } from '../sim/breaks.js';
import { dateOf } from '../sim/calendar.js';

const H = (h) => h * 60;
const weekdays = (from, n) => {
  const out = [];
  for (let d = from; out.length < n; d++) if (dateOf(d).weekday < 5) out.push(d);
  return out;
};
const leadOf = (s) => s.people.find((p) => p.role === 'lead');
const shiftOf = (s, id, day) => s.roster[id]?.[dateOf(day).weekday];

// Six agents, each alone on their own weekday client (three early, three late),
// so a pick depends only on the forecast of that client, plus the lead (early)
// and the QA (late) of a new game.
const WEEKDAY_CLIENTS = ['gureum-travel', 'mulbit-telecom', 'dalbit-mall', 'bandi-repair', 'saebyeol-bank', 'solbang-books'];
function soloGame(seed) {
  const s = newGame(seed);
  s.clients = WEEKDAY_CLIENTS.map((id) => ({ id, satisfaction: 70, active: true }));
  const agents = s.people.filter((p) => p.role === 'agent');
  s.people = s.people.filter((p) => p.role !== 'agent' || agents.indexOf(p) < WEEKDAY_CLIENTS.length);
  agents.slice(0, WEEKDAY_CLIENTS.length).forEach((p, i) => {
    s.assignment[p.id] = { kind: 'phone', clientId: WEEKDAY_CLIENTS[i] };
    const shift = i % 2 === 0 ? 'early' : 'late';
    s.roster[p.id] = { 0: shift, 1: shift, 2: shift, 3: shift, 4: shift };
  });
  for (const p of agents.slice(WEEKDAY_CLIENTS.length)) {
    delete s.assignment[p.id];
    delete s.roster[p.id];
  }
  return s;
}

const WINDOWS = { am: [60, 165, 15], lunch: [180, 270, 60], pm: [360, 465, 15] };

test('break windows are the constraint windows on the 15-minute grid', () => {
  assert.deepEqual(BREAK_WINDOWS, {
    am: { from: 60, to: 165, length: 15 },
    lunch: { from: 180, to: 270, length: 60 },
    pm: { from: 360, to: 465, length: 15 },
  });
});

function assertInWindows(plan, start, label) {
  for (const [kind, [from, to]] of Object.entries(WINDOWS)) {
    const off = plan[kind] - start;
    assert.ok(off >= from && off <= to, `${label} ${kind} at +${off}`);
    assert.equal(off % 15, 0, `${label} ${kind} off the grid`);
  }
}

test('every planned break is inside its window, early and late shifts', () => {
  for (const seed of [1, 2, 3]) {
    const s = newGame(seed);
    for (const day of weekdays(0, 10)) {
      const plan = planBreaks(s, day);
      assert.equal(Object.keys(plan).length, s.people.length, 'everyone on shift gets a plan');
      for (const p of s.people) {
        const shift = SHIFTS[shiftOf(s, p.id, day)];
        assertInWindows(plan[p.id], shift.start, `${seed}/${day}/${p.id}`);
      }
    }
  }
});

test('a late shift (12:00) has windows from 12:00 and its last break ends 60 minutes before 21:00 or earlier', () => {
  const s = newGame(4);
  const late = s.people.find((p) => shiftOf(s, p.id, 0) === 'late');
  for (const day of weekdays(0, 40)) {
    const b = planBreaks(s, day)[late.id];
    assert.ok(b.am >= H(13) && b.am <= H(14) + 45, `am ${b.am}`);
    assert.ok(b.lunch >= H(15) && b.lunch <= H(16) + 30, `lunch ${b.lunch}`);
    assert.ok(b.pm >= H(18) && b.pm + 15 <= H(20), `pm ${b.pm}`);
  }
});

test('the weekend shift gets the same windows from 09:00', () => {
  const s = newGame(5);
  s.clients.push({ id: 'baram-delivery', satisfaction: 70, active: true });
  const crew = s.people.filter((p) => p.role === 'agent').slice(0, 3);
  for (const p of crew) {
    s.roster[p.id] = { ...s.roster[p.id], 5: 'weekend', 6: 'weekend' };
    s.assignment[p.id] = { kind: 'phone', clientId: 'baram-delivery' };
  }
  for (const day of [5, 6, 12, 13]) {
    const plan = planBreaks(s, day);
    assert.deepEqual(Object.keys(plan).sort(), crew.map((p) => p.id).sort(), 'only the weekend crew');
    for (const p of crew) {
      assertInWindows(plan[p.id], 540, `weekend ${day} ${p.id}`);
      assert.equal(plan[p.id].by, 'auto', 'the lead is off at the weekend');
    }
  }
});

test('people off, sick or absent get no plan', () => {
  const s = newGame(6);
  const [a, b] = s.people;
  a.health = { kind: 'sick', daysLeft: 2 };
  s.absences.push({ personId: b.id, day: 1 });
  assert.equal(planBreaks(s, 1)[a.id], undefined);
  assert.equal(planBreaks(s, 1)[b.id], undefined);
  assert.ok(planBreaks(s, 2)[b.id]);
  assert.deepEqual(planBreaks(s, 5), {}, 'center closed on Saturday without a weekend client');
});

test('breaks never overlap and a full day works 450 minutes', () => {
  for (const seed of [1, 7]) {
    const s = newGame(seed);
    for (const day of weekdays(0, 15)) {
      const plan = planBreaks(s, day);
      for (const p of s.people) {
        const shiftId = shiftOf(s, p.id, day);
        const { start, end } = SHIFTS[shiftId];
        const b = plan[p.id];
        const spans = [[b.am, 15], [b.lunch, 60], [b.pm, 15]].sort((x, y) => x[0] - y[0]);
        for (let i = 1; i < spans.length; i++) assert.ok(spans[i - 1][0] + spans[i - 1][1] <= spans[i][0], 'overlap');
        let worked = 0;
        for (let m = start - 60; m < end + 60; m += 30) worked += 30 * workShare(m, shiftId, b);
        assert.equal(worked, 450, `${seed}/${day}/${p.id}`);
      }
    }
  }
});

test('workShare with a plan: a 15-minute break halves its own interval only, lunch spans its hour', () => {
  const plan = { am: H(10) + 15, lunch: H(12) + 45, pm: H(15) + 30 };
  assert.equal(workShare(H(9) + 30, 'early', plan), 1);
  assert.equal(workShare(H(10), 'early', plan), 0.5);
  assert.equal(workShare(H(10) + 30, 'early', plan), 1);
  assert.equal(workShare(H(12), 'early', plan), 1);
  assert.equal(workShare(H(12) + 30, 'early', plan), 0.5);
  assert.equal(workShare(H(13), 'early', plan), 0);
  assert.equal(workShare(H(13) + 30, 'early', plan), 0.5);
  assert.equal(workShare(H(14), 'early', plan), 1);
  assert.equal(workShare(H(15) + 30, 'early', plan), 0.5);
  assert.equal(workShare(H(16), 'early', plan), 1);
  assert.equal(workShare(H(18), 'early', plan), 0, 'outside the shift');
  // Without a plan, the old fixed groups (kept until Task 3).
  assert.equal(workShare(H(12), 'early'), 0.5);
  assert.equal(workShare(H(12) + 30, 'early', 1), 0.5);
});

test('the plan is deterministic for a state and day, and leaves the game rng alone', () => {
  const s = newGame(8);
  const before = JSON.stringify(s);
  const a = planBreaks(s, 2);
  const b = planBreaks(s, 2);
  const c = planBreaks(s, 2, dayRng(s, 2));
  assert.deepEqual(a, b);
  assert.deepEqual(a, c);
  assert.equal(JSON.stringify(s), before, 'state (and rngState) unchanged');
  assert.deepEqual(planBreaks(JSON.parse(before), 2), a, 'same plan from a copy of the state');
  assert.notDeepEqual(planBreaks(s, 3), a, 'another day, another plan');
  const other = newGame(9);
  other.people = s.people; other.roster = s.roster; other.assignment = s.assignment;
  assert.notDeepEqual(planBreaks(other, 2), a, 'another game seed, another plan');
});

test('by is lead when the lead is on shift that day, auto when away', () => {
  const s = newGame(10);
  const lead = leadOf(s);
  for (const b of Object.values(planBreaks(s, 0))) assert.equal(b.by, 'lead');
  lead.health = { kind: 'sick', daysLeft: 3 };
  for (const b of Object.values(planBreaks(s, 0))) assert.equal(b.by, 'auto');
  lead.health = { kind: 'well', daysLeft: 0 };
  s.absences.push({ personId: lead.id, day: 1 });
  for (const b of Object.values(planBreaks(s, 1))) assert.equal(b.by, 'auto');
  s.roster[lead.id] = { ...s.roster[lead.id], 2: 'off' };
  for (const b of Object.values(planBreaks(s, 2))) assert.equal(b.by, 'auto');
  assert.equal(planBreaks(s, 3)[lead.id].by, 'lead');
});

// Candidate starts of a window, each with its CURVE weight (mean over the
// quarter-hours it covers). Growth, weekday and holiday multiply a client's
// whole day alike, so the curve ranks a client's slots as the forecast does.
function candidates(start, kind) {
  const [from, to, length] = WINDOWS[kind];
  const out = [];
  for (let off = from; off <= to; off += 15) {
    let w = 0;
    for (let m = start + off; m < start + off + length; m += 15) w += CURVE[Math.floor((m - 540) / 30)] ?? 0;
    out.push({ at: start + off, weight: w / (length / 15) });
  }
  return out;
}
// Starts whose weight is in the window's top 25% (ties at the cut included).
function topQuarter(cands) {
  const sorted = cands.map((c) => c.weight).sort((x, y) => y - x);
  const cut = sorted[Math.ceil(sorted.length / 4) - 1];
  return new Set(cands.filter((c) => c.weight >= cut - 1e-12).map((c) => c.at));
}

function picks(s, days) {
  const out = []; // { kind, index, top }
  for (const day of days) {
    const plan = planBreaks(s, day);
    for (const p of s.people.filter((x) => x.role === 'agent')) {
      const start = SHIFTS[shiftOf(s, p.id, day)].start;
      for (const kind of Object.keys(WINDOWS)) {
        const cands = candidates(start, kind);
        const at = plan[p.id][kind];
        out.push({ kind, index: cands.findIndex((c) => c.at === at), top: topQuarter(cands).has(at), share: topQuarter(cands).size / cands.length });
      }
    }
  }
  return out;
}

test('a lead with planning 8 keeps breaks out of the busiest quarter of slots', () => {
  const s = soloGame(11);
  leadOf(s).skills.planning = 8;
  const list = picks(s, weekdays(0, 150));
  assert.ok(list.length >= 2000);
  const inTop = list.filter((x) => x.top).length / list.length;
  assert.ok(inTop <= 0.1, `top-25% picks ${inTop}`);
  for (const b of Object.values(planBreaks(s, 0))) assert.equal(b.by, 'lead');
});

test('with the lead away (q = 0) picks are uniform over each window', () => {
  const s = soloGame(12);
  leadOf(s).health = { kind: 'sick', daysLeft: 999 };
  const list = picks(s, weekdays(0, 150));
  // Picks in the busiest quarter as often as chance gives them.
  const expectedTop = list.reduce((sum, x) => sum + x.share, 0) / list.length;
  const inTop = list.filter((x) => x.top).length / list.length;
  assert.ok(Math.abs(inTop - expectedTop) < 0.05, `top ${inTop} vs chance ${expectedTop}`);
  // Chi-square over candidate positions per window (p = 0.001 bounds: df 7 → 24.3, df 6 → 22.5).
  for (const [kind, bound] of [['am', 24.3], ['lunch', 22.5], ['pm', 24.3]]) {
    const idx = list.filter((x) => x.kind === kind).map((x) => x.index);
    assert.ok(idx.every((i) => i >= 0));
    const n = Math.max(...idx) + 1;
    const counts = Array(n).fill(0);
    for (const i of idx) counts[i]++;
    const e = idx.length / n;
    const chi2 = counts.reduce((sum, c) => sum + (c - e) ** 2 / e, 0);
    assert.ok(chi2 < bound, `${kind} chi2 ${chi2.toFixed(1)} counts ${counts}`);
  }
});

test('a lead with planning 8 rarely starts two agents of one client on the same break together', () => {
  // Two early agents on one client: count breaks they start at the same minute.
  const together = (planning, away) => {
    const s = newGame(13);
    const lead = leadOf(s);
    lead.skills.planning = planning;
    if (away) lead.health = { kind: 'sick', daysLeft: 999 };
    const [a, b] = s.people.filter((p) => p.role === 'agent' && s.roster[p.id][0] === 'early'
      && s.assignment[p.id].clientId === 'gureum-travel');
    let n = 0;
    for (const day of weekdays(0, 100)) {
      const plan = planBreaks(s, day);
      for (const kind of Object.keys(WINDOWS)) if (plan[a.id][kind] === plan[b.id][kind]) n++;
    }
    return n;
  };
  const skilled = together(8, false);
  const random = together(0, true);
  assert.ok(skilled * 3 < random, `same start: lead 8 ${skilled}, random ${random}`);
});

test('pick quality rises with planning: fewer busiest-quarter picks at 0, 3, 5, 8', () => {
  const shareAt = (planning) => {
    const s = soloGame(14);
    leadOf(s).skills.planning = planning;
    const list = picks(s, weekdays(0, 150));
    return list.filter((x) => x.top).length / list.length;
  };
  const shares = [0, 3, 5, 8].map(shareAt);
  const label = `shares ${shares.map((x) => x.toFixed(4)).join(' / ')}`;
  for (let i = 1; i < shares.length; i++) assert.ok(shares[i] < shares[i - 1], label);
  // Ruling (load ÷ window maximum): the lead range 3-5-8 matters evenly, each
  // step taking at least 0.05 off the share (raw load gave 0.033 and 0.040).
  assert.ok(shares[1] - shares[2] >= 0.05 && shares[2] - shares[3] >= 0.05, `uneven: ${label}`);
});
