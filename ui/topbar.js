// Top bar (date, time, speed, cash, reputation) and the client metrics strip.
// Rebuilds the root it is given; copy comes from ui/text.js.
import { HIRE_COST, SHIFTS } from '../sim/game.js';
import { CLIENTS } from '../world/clients.js';
import { UI_TEXT, fill } from './text.js';
import { formatDate, formatTime, formatMoney, formatPct, formatSec } from './format.js';
import { SPEEDS } from './clock.js';
import { builder } from './dom.js';
import { EVENTS } from '../world/events.js';

const OPEN = 9 * 60;
const CLOSE = 21 * 60;
const SATURDAY = 5;

// The closed note, or null while the center is open. With a weekend client
// Saturday and Sunday open for the weekend shift's hours.
function status(v) {
  if (v.date.weekday >= SATURDAY) {
    if (!v.flags?.weekend) return UI_TEXT.topbar.weekend;
    const { start, end } = SHIFTS.weekend;
    return v.minute < start || v.minute >= end ? UI_TEXT.topbar.closed : null;
  }
  if (v.minute < OPEN || v.minute >= CLOSE) return UI_TEXT.topbar.closed;
  return null;
}

// A client that takes calls only at the weekend (world/clients.js hours).
const weekendOnly = (id) => {
  const days = CLIENTS.find((d) => d.id === id)?.hours.days ?? [];
  return days.length > 0 && days.every((d) => d >= SATURDAY);
};

export function renderTopbar(root, v, clock) {
  const h = builder(root.ownerDocument);
  const shut = status(v);
  const speeds = SPEEDS.map((n) => h('button', {
    type: 'button',
    class: 'speed',
    'data-speed': n,
    'aria-pressed': String(clock.speed === n),
    title: UI_TEXT.speed[n].tip,
    onclick: () => { clock.setSpeed(n); renderTopbar(root, v, clock); },
  }, UI_TEXT.speed[n].label));
  const low = v.cash < HIRE_COST;
  root.replaceChildren(
    h('div', { class: 'when' },
      h('span', { class: 'date' }, formatDate(v.date)), ' ',
      h('span', { class: 'time' }, formatTime(v.minute)),
      shut && h('span', { class: 'shut' }, shut),
      !shut && v.date.weekday >= SATURDAY && h('span', { class: 'weekend-open' }, UI_TEXT.topbar.weekendOpen)),
    h('div', { class: 'speeds', role: 'group' }, speeds),
    clock.autoPaused && v.inbox.some((e) => !e.resolved && EVENTS[e.id]?.choices) ? h('span', { class: 'auto-paused', role: 'status' }, UI_TEXT.speed.autoPaused) : '',
    h('div', { class: low ? 'cash low' : 'cash', title: UI_TEXT.topbar.cashTip },
      `${UI_TEXT.topbar.cash} 💰 ${formatMoney(v.cash)}`,
      low && h('span', { class: 'warn' }, ` · ${UI_TEXT.topbar.cashLow}`)),
    h('div', { class: 'grade', 'data-grade': v.reputation, title: UI_TEXT.grade[v.reputation]?.text ?? UI_TEXT.topbar.reputationTip },
      `${UI_TEXT.topbar.reputation} ⭐ ${UI_TEXT.grade[v.reputation]?.grade ?? v.reputation}`),
  );
}

export function renderMetrics(root, v) {
  const h = builder(root.ownerDocument);
  const M = UI_TEXT.metrics;
  const items = v.clients.filter((c) => c.active).map((c) => {
    if (weekendOnly(c.id) && v.date.weekday < SATURDAY) {
      return h('li', { class: 'metric weekend-only', 'data-client': c.id, title: M.weekendOnlyTip },
        h('strong', {}, c.name), h('span', {}, M.weekendOnly));
    }
    const t = c.today;
    const below = t.serviceLevel !== null && t.serviceLevel * 100 < c.slTarget.pct;
    const abandoned = t.offered > 0 ? fill(M.abandonedUnit, { n: t.abandoned }) : M.none;
    return h('li', {
      class: below ? 'metric below' : 'metric',
      'data-client': c.id,
      title: t.offered > 0 ? fill(M.targetFull, c.slTarget) : M.noneTip,
    },
    h('strong', {}, c.name),
    h('span', {}, `${M.serviceLevel} ${formatPct(t.serviceLevel)} `,
      h('small', { class: 'target' }, `(${M.target} ${c.slTarget.pct}%)`)),
    h('span', {}, `${M.asa} ${formatSec(t.asaSec)}`),
    h('span', {}, `${M.abandoned} ${abandoned}`),
    h('span', {}, `${M.satisfaction} ${Math.round(c.satisfaction)}`),
    below && h('span', { class: 'warn' }, M.belowTarget));
  });
  root.replaceChildren(h('ul', { class: 'metrics-list' }, items));
}
