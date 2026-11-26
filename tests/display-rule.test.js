// Display rule (user decision 2026-11-26): shares/percentages and skill or
// score values shown as decimals always show exactly 2 decimals (100.00%,
// 92.44%, 6.00); money and counts (calls, mails, people, days, seconds) stay
// whole numbers. Only the shown text changes; stored values do not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createGame, advance, view } from '../sim/game.js';
import { formatPct, formatTarget } from '../ui/format.js';
import { eventText } from '../ui/text.js';
import { renderPanel, selectPerson, resetPanels } from '../ui/panels.js';
import { renderMetrics } from '../ui/topbar.js';

function makeRoot() {
  resetPanels();
  return new JSDOM('<!DOCTYPE html><div id="r"></div>').window.document.getElementById('r');
}

function plainView() {
  const s = createGame(11);
  advance(s, 11 * 60);
  return JSON.parse(JSON.stringify(view(s)));
}

test('formatPct shows exactly 2 decimals', () => {
  assert.equal(formatPct(0.9244), '92.44%');
  assert.equal(formatPct(1), '100.00%');
  assert.equal(formatPct(0), '0.00%');
  assert.equal(formatPct(0.8), '80.00%');
  assert.equal(formatPct(null), '—');
});

test('targets from a template show 2 decimals', () => {
  assert.equal(formatTarget({ channel: 'phone', slTarget: { pct: 80, sec: 20 } }), '20초 안에 80.00%');
  assert.equal(formatTarget({ channel: 'email', slTarget: { pct: 90, openMinutes: 720 } }), '영업시간 12시간 안에 90.00%');
  const offer = eventText({ id: 'client-offer', day: 3, clientId: 'dalbit-mall', data: { client: '달빛몰' } });
  assert.ok(offer.text.includes('80.00%') || offer.text.includes('90.00%'), offer.text);
  assert.ok(!/\d%/.test(offer.text.replace(/\d+\.\d\d%/g, '')), `no whole-number % left: ${offer.text}`);
});

test('the card shows every skill with 2 decimals, the stored value kept', () => {
  const v = plainView();
  const p = v.people[0];
  p.skills = { handling: 5.999999999999998, systems: 6.349999999999, coaching: 0.30000000000000004, evaluation: 2, planning: 7.05 };
  const root = makeRoot();
  selectPerson(p.id);
  renderPanel(root, v, 'people', () => ({ ok: true }));
  const items = [...root.querySelectorAll('ul.skills li')].map((li) => li.textContent);
  assert.deepEqual(items, ['응대 6.00', '시스템 6.35', '코칭 0.30', '평가 2.00', '스케줄링 7.05']);
  assert.equal(p.skills.handling, 5.999999999999998);
});

test('the clients panel shows service level and agents with 2 decimals, counts whole', () => {
  const v = plainView();
  const c = v.clients.find((x) => x.active);
  Object.assign(c.today, { serviceLevel: 0.9244, agents: 3.456, offered: 10, abandoned: 2, asaSec: 12.4 });
  const root = makeRoot();
  renderPanel(root, v, 'clients', () => ({ ok: true }));
  const cells = [...root.querySelector(`[data-client="${c.id}"]`).querySelectorAll('td')].map((td) => td.textContent);
  assert.ok(cells.includes('92.44%'), JSON.stringify(cells));
  assert.ok(cells.includes('3.46'), JSON.stringify(cells));
  assert.ok(cells.includes('2건'), `abandoned stays a count: ${JSON.stringify(cells)}`);
  assert.ok(cells.includes('12초'), `seconds stay whole: ${JSON.stringify(cells)}`);
});

test('the metrics strip shows 92.44% and its target as 80.00%', () => {
  const v = plainView();
  const c = v.clients.find((x) => x.active);
  Object.assign(c.today, { serviceLevel: 0.9244 });
  c.slTarget = { ...c.slTarget, pct: 80 };
  const m = makeRoot();
  renderMetrics(m, v);
  const chip = m.querySelector(`[data-client="${c.id}"]`).textContent;
  assert.ok(chip.includes('92.44%'), chip);
  assert.ok(chip.includes('(목표 80.00%)'), chip);
});
