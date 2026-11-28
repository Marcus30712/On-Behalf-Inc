// v2.4 (user rules 11-28): notice periods (agent one month, lead/QA two
// months), hiring from the moment of notice, a random join date, overlap
// (handover), a cancelled hire when the seat stays taken, and the lead's
// retention meeting for an agent within a day.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../sim/rng.js';
import { createPerson, moraleOf } from '../sim/people.js';
import { defaultRoster } from '../sim/schedule.js';
import { endOfDay, retainChance } from '../sim/day.js';
import { createGame } from '../sim/game.js';
import {
  startHiring, advanceHiring, hireCandidate, needsLead, seatWaiters,
} from '../sim/hiring.js';
import { seatsOf } from '../sim/office.js';

const GUREUM = 'gureum-travel';
const never = { next: () => 0.99, int: (a) => a, pick: (a) => a[0], chance: () => false };
// Breaking point fires; it picks the last breaking event (resign-notice).
const resigns = { ...never, chance: (p) => p === 0.08, pick: (a) => a.at(-1) };
const set = (p, fields) => { Object.assign(p, fields); p.morale = moraleOf(p); };
const ids = (state, id) => state.inbox.filter((e) => e.id === id);

function makeState({ roles = ['agent'], day = 4 } = {}) {
  const rng = createRng(21);
  const people = roles.map((role, i) => createPerson(rng, { id: `p${i}`, role, nation: 'veltora' }));
  const assignment = Object.fromEntries(people.map((p) => [p.id,
    p.role === 'agent' ? { kind: 'phone', clientId: GUREUM } : { kind: p.role === 'lead' ? 'coaching' : 'qa' }]));
  return {
    day, minute: 1260, people, roster: defaultRoster(people), absences: [], assignment,
    clients: [{ id: GUREUM, satisfaction: 70, active: true }],
    mods: {}, progress: { coaching: 0, qa: 0, research: 0, training: 0 },
    today: { clients: {} }, spikes: [], inbox: [], history: [], leaving: [],
  };
}

test('notice: an agent with no lead gives one month, a lead or QA two months', () => {
  const s = makeState();
  set(s.people[0], { stress: 100, fatigue: 100 });
  endOfDay(s, resigns);
  const n = ids(s, 'resign-notice')[0];
  assert.deepEqual(n.data, { months: 1, leaveDay: 34, name: s.people[0].name });
  assert.equal(n.deadlineDay, 34);
  for (const role of ['lead', 'qa']) {
    const t = makeState({ roles: [role] });
    set(t.people[0], { stress: 100, fatigue: 100 });
    endOfDay(t, resigns);
    const e = ids(t, 'resign-notice')[0];
    assert.equal(e.data.months, 2, role);
    assert.equal(e.data.leaveDay, 64, role);
    assert.equal(e.data[role], true);
  }
});

test('notice: with a lead, an agent gets a retention meeting the next day, no choice', () => {
  const s = makeState({ roles: ['agent', 'lead'] });
  const [agent, lead] = s.people;
  set(agent, { stress: 100, fatigue: 100 });
  endOfDay(s, { ...resigns, chance: (p) => p === 0.08 && agent.morale < 25 });
  assert.equal(ids(s, 'resign-notice').length, 0);
  const m = ids(s, 'resign-meeting')[0];
  assert.deepEqual(m.data, { months: 1, leaveDay: 34, leadName: lead.name, name: agent.name });
  assert.deepEqual(s.leaving, [{ personId: agent.id, day: 34, meetingDay: 5, leadId: lead.id }]);
});

function meeting(kept) {
  const s = makeState({ roles: ['agent', 'lead'] });
  const [agent, lead] = s.people;
  lead.skills.coaching = 7;
  s.leaving.push({ personId: agent.id, day: 34, meetingDay: 5, leadId: lead.id });
  s.day = 5;
  let asked;
  endOfDay(s, { ...never, chance: (p) => { if (p === 0.7) { asked = true; return kept; } return false; } });
  assert.ok(asked, 'the chance is the lead\'s communication (coaching) / 10');
  return { s, agent, lead };
}

test('retention meeting: persuaded, the notice is withdrawn', () => {
  const { s, agent, lead } = meeting(true);
  assert.deepEqual(s.leaving, []);
  assert.deepEqual(ids(s, 'retention-kept')[0].data, { leadName: lead.name, name: agent.name });
});

test('retention meeting: refused, the leave is confirmed', () => {
  const { s, agent, lead } = meeting(false);
  assert.deepEqual(s.leaving, [{ personId: agent.id, day: 34 }]);
  assert.deepEqual(ids(s, 'retention-failed')[0].data, { leadName: lead.name, leaveDay: 34, name: agent.name });
});

test('retainChance follows the lead\'s coaching, kept within 10%..90%', () => {
  const lead = (coaching) => ({ skills: { coaching } });
  assert.equal(retainChance(lead(5)), 0.5);
  assert.equal(retainChance(lead(0)), 0.1);
  assert.equal(retainChance(lead(10)), 0.9);
});

test('hiring opens the moment someone gives notice', () => {
  const s = createGame(5);
  s.cash = 100000;
  assert.equal(s.people.filter((p) => p.role === 'agent').length, seatsOf(s));
  assert.deepEqual(startHiring(s), { ok: false, reason: 'no-seat' });
  const agent = s.people.find((p) => p.role === 'agent');
  s.inbox.push({ id: 'resign-notice', personId: agent.id, day: 0, resolved: false, data: {} });
  assert.deepEqual(startHiring(s), { ok: true }, 'an unanswered notice');
  s.hiring = null;
  s.inbox = [];
  const lead = s.people.find((p) => p.role === 'lead');
  assert.equal(needsLead(s), false);
  s.leaving.push({ personId: lead.id, day: 60, withdrawIfMoraleAbove: 50 });
  assert.equal(needsLead(s), true, 'even while trying to keep them');
});

// A real rng whose int() always gives the low end.
const lowInt = (seed = 9) => { const r = createRng(seed); return { ...r, int: (a) => a }; };

function pickedAgent(s) {
  advanceHiring(s, lowInt()); // wait 3 workdays
  advanceHiring(s, lowInt());
  advanceHiring(s, lowInt());
  assert.ok(s.hiring.candidates);
  hireCandidate(s, 0);
}

test('join date: agents 21-42 days after the start, staff 42-70; picked waits for it', () => {
  const s = createGame(5);
  s.cash = 100000;
  const leaver = s.people.find((p) => p.role === 'agent');
  s.leaving.push({ personId: leaver.id, day: 40 });
  startHiring(s);
  const start = s.day;
  pickedAgent(s);
  const ev = s.inbox.find((e) => e.id === 'candidate');
  assert.equal(ev.data.joinDay, start + 21);
  assert.equal(s.hiring, null, 'the search ends when someone is picked');
  assert.equal(s.joining.length, 1);
  assert.equal(s.joining[0].day, start + 21);
  const picked = s.joining[0].person;
  assert.ok(!s.people.includes(picked), 'not before the join date');
  assert.deepEqual(startHiring(s), { ok: false, reason: 'no-seat' }, 'the joiner takes the freed seat');
  s.day = start + 20;
  advanceHiring(s, lowInt());
  assert.ok(!s.people.includes(picked));
  s.day = start + 21;
  advanceHiring(s, lowInt());
  assert.ok(s.people.includes(picked));
  assert.deepEqual(s.joining, []);
  const t = createGame(5);
  t.cash = 100000;
  t.people = t.people.filter((p) => p.role !== 'lead');
  startHiring(t, 'lead');
  advanceHiring(t, lowInt());
  assert.equal(t.hiring.joinDay, t.day + 42);
  const high = createRng(1);
  const u = createGame(5);
  u.people = u.people.filter((p) => p.role !== 'qa');
  u.cash = 100000;
  startHiring(u, 'qa');
  advanceHiring(u, { ...high, int: (a, b) => b });
  assert.equal(u.hiring.joinDay, u.day + 70);
});

test('overlap: a new agent beyond the seats trains until a seat frees, then answers calls', () => {
  const s = createGame(5);
  s.cash = 100000;
  const leaver = s.people.find((p) => p.role === 'agent');
  s.leaving.push({ personId: leaver.id, day: 40 });
  startHiring(s);
  pickedAgent(s);
  s.day = s.joining[0].day;
  const picked = s.joining[0].person;
  advanceHiring(s, lowInt());
  assert.equal(s.people.filter((p) => p.role === 'agent').length, seatsOf(s) + 1);
  assert.deepEqual(s.assignment[picked.id], { kind: 'training' });
  assert.equal(picked.seatWait, true);
  seatWaiters(s);
  assert.equal(picked.seatWait, true, 'still no seat');
  s.people = s.people.filter((p) => p !== leaver);
  seatWaiters(s);
  assert.equal(picked.seatWait, undefined);
  assert.equal(s.assignment[picked.id].kind, 'phone');
});

test('a withdrawn notice before the join date cancels the hire when no seat frees', () => {
  const s = createGame(5);
  s.cash = 100000;
  const leaver = s.people.find((p) => p.role === 'agent');
  s.leaving.push({ personId: leaver.id, day: 40 });
  startHiring(s);
  pickedAgent(s);
  const name = s.joining[0].person.name;
  const count = s.people.length;
  s.leaving = []; // persuaded to stay
  s.day = s.joining[0].day;
  advanceHiring(s, lowInt());
  assert.equal(s.people.length, count);
  assert.deepEqual(s.joining, []);
  assert.deepEqual(s.inbox.find((e) => e.id === 'hire-cancelled').data, { name });
});

test('a new lead joins while the old one works out notice (handover)', () => {
  const s = createGame(5);
  s.cash = 100000;
  const old = s.people.find((p) => p.role === 'lead');
  s.leaving.push({ personId: old.id, day: 90 });
  startHiring(s, 'lead');
  for (let i = 0; i < 5; i++) advanceHiring(s, lowInt());
  hireCandidate(s, 0);
  assert.equal(needsLead(s), false, 'a lead is joining');
  s.day = s.joining[0].day;
  advanceHiring(s, lowInt());
  assert.equal(s.people.filter((p) => p.role === 'lead').length, 2);
});

// ---- copy (11-28) -----------------------------------------------------------
import { JSDOM } from 'jsdom';
import { eventText, UI_TEXT } from '../ui/text.js';
import { renderPanel, resetPanels } from '../ui/panels.js';
import { view } from '../sim/game.js';

test('notice copy: periods, the meeting, its outcomes, dated joins, a cancelled hire', () => {
  const t = (id, data) => eventText({ id, day: 0, data });
  assert.equal(t('resign-notice', { name: '하나', months: 2, leaveDay: 60 }).text,
    '하나 씨가 두 달 뒤에 그만두겠다고 했어요. 많이 지쳐 보여요. 지금부터 채용 탭에서 새 사람을 찾을 수 있어요.');
  assert.equal(t('resign-meeting', { name: '하나', months: 1, leaveDay: 30, leadName: '가을' }).text,
    '하나 씨가 한 달 뒤에 그만두겠다고 했어요. 많이 지쳐 보여요. 내일 가을 팀장이 면담해서 붙잡아 볼게요. 지금부터 채용 탭에서 새 사람을 찾을 수 있어요.');
  assert.equal(t('retention-kept', { name: '하나', leadName: '가을' }).title, '하나 씨가 남기로 했어요');
  assert.equal(t('retention-failed', { name: '하나', leadName: '가을', leaveDay: 34 }).text,
    '가을 팀장이 면담했지만 하나 씨의 마음은 그대로예요. 1년차 2월 5일에 떠나요.');
  assert.equal(t('candidate', { cand1: '가을', cand2: '나무', joinDay: 40 }).choices[0].result,
    '가을 씨가 1년차 2월 11일에 수습 상담사로 들어와요. 처음 두 주는 교육이 필요해요.');
  assert.equal(t('hire-cancelled', { name: '나무' }).text, '빈자리가 없어 나무 씨의 합류가 취소됐어요. 채용 비용은 돌려받지 못해요.');
});

const root = () => { resetPanels(); return new JSDOM('<!DOCTYPE html><div id="r"></div>').window.document.getElementById('r'); };

test('hiring tab: soon-free seats, the picked join date; tasks tab: a seat waiter', () => {
  const s = createGame(5);
  s.cash = 100000;
  const leaver = s.people.find((p) => p.role === 'agent');
  s.leaving.push({ personId: leaver.id, day: 40 });
  let r = root();
  renderPanel(r, view(s), 'hiring', () => ({ ok: true }));
  assert.ok(r.textContent.includes('빈 좌석 1개 · 곧 비는 자리 1개 포함'));
  startHiring(s);
  pickedAgent(s);
  r = root();
  renderPanel(r, view(s), 'hiring', () => ({ ok: true }));
  assert.ok(r.querySelector('.joining').textContent.includes(`${s.joining[0].person.name} 씨가 1년차 1월 22일에 합류해요`));
  s.day = s.joining[0].day;
  const picked = s.joining[0].person;
  advanceHiring(s, lowInt());
  r = root();
  renderPanel(r, view(s), 'tasks', () => ({ ok: true }));
  assert.ok(r.textContent.includes(`${picked.name} 씨는 빈 좌석이 날 때까지 교육 테이블에서 일해요.`));
  assert.ok(UI_TEXT.hiring.help.endsWith('합류까지는 3~6주 걸려요.'));
  assert.ok(UI_TEXT.hiring.lead.help.endsWith('합류까지는 6~10주 걸려요.'));
  assert.ok(UI_TEXT.hiring.qa.help.endsWith('합류까지는 6~10주 걸려요.'));
});

test('a save from before the joining list loads with an empty one', async () => {
  const { serialize, deserialize } = await import('../sim/state.js');
  const s = createGame(5);
  delete s.joining;
  assert.deepEqual(deserialize(serialize(s)).joining, []);
  s.joining = [{ person: null, day: 3 }, 'x', { person: s.people[0], day: 'y' }];
  assert.deepEqual(deserialize(serialize(s)).joining, [], 'malformed entries are dropped');
});
