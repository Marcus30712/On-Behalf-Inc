// Top bar (date, time, speed, cash, reputation) and the client metrics strip.
// Rebuilds the root it is given; copy comes from ui/text.js.
import { HIRE_COST, SHIFTS } from '../sim/game.js';
import { CLIENTS } from '../world/clients.js';
import { UI_TEXT, fill } from './text.js';
import { formatDate, formatTime, formatMoney, formatDecimal, formatPct, formatSec, formatTarget, hasChannels, channelLabel } from './format.js';
import { SPEEDS } from './clock.js';
import { builder } from './dom.js';
import { EVENTS } from '../world/events.js';

const OPEN = 9 * 60;
const CLOSE = 21 * 60;
const SATURDAY = 5;
const COMPACT_FROM = 4; // more active clients than this: compact chips

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

// The chip's tooltip: the target and today's counts, or the nothing-yet note.
// Mail counts can be fractional in the sim and are rounded.
function chipTitle(c) {
  const M = UI_TEXT.metrics;
  const t = c.today;
  const n = (x) => Math.round(x);
  if (c.channel === 'email') {
    // "들어온 메일" is today's arrivals, not the answered-or-overdue count.
    const arrived = t.arrived ?? 0;
    return arrived > 0 ? [formatTarget(c), `${M.received} ${fill(M.backlogUnit, { n: n(arrived) })}`,
      `${M.answered} ${fill(M.backlogUnit, { n: n(t.handled) })}`].join(' · ') : M.noneEmail;
  }
  if (c.channel === 'chat') {
    return t.offered > 0 ? [formatTarget(c), `${M.chats} ${fill(M.abandonedUnit, { n: n(t.offered) })}`,
      `${M.chatsHandled} ${fill(M.abandonedUnit, { n: n(t.handled) })}`].join(' · ') : M.noneChat;
  }
  return t.offered > 0 ? formatTarget(c) : M.noneTip;
}

export function renderMetrics(root, v) {
  const h = builder(root.ownerDocument);
  const M = UI_TEXT.metrics;
  const mixed = hasChannels(v);
  const items = v.clients.filter((c) => c.active).map((c) => {
    const label = mixed && channelLabel(h, c);
    if (weekendOnly(c.id) && v.date.weekday < SATURDAY) {
      return h('li', { class: 'metric weekend-only', 'data-client': c.id, title: M.weekendOnlyTip },
        h('strong', {}, c.name), label, h('span', {}, M.weekendOnly));
    }
    // A client that does not open at all today (a weekday client at the weekend).
    if (c.openToday === false) {
      return h('li', { class: 'metric closed-today', 'data-client': c.id, title: M.closedTodayTip },
        h('strong', {}, c.name), label, h('span', {}, M.closedToday),
        c.channel === 'email' && h('span', {}, `${M.backlog} ${fill(M.backlogUnit, { n: Math.round(c.backlog ?? 0) })}`));
    }
    const t = c.today;
    const email = c.channel === 'email';
    const share = email ? c.onTime ?? null : t.serviceLevel;
    const below = share !== null && share * 100 < c.slTarget.pct;
    const abandoned = t.offered > 0 ? fill(M.abandonedUnit, { n: t.abandoned }) : M.none;
    const target = h('small', { class: 'target' }, `(${M.target} ${formatDecimal(c.slTarget.pct)}%)`);
    const numbers = email
      ? [h('span', {}, `${M.backlog} ${fill(M.backlogUnit, { n: Math.round(c.backlog ?? 0) })}`),
        h('span', {}, `${M.onTime} ${formatPct(share)} `, target)]
      : [h('span', {}, `${M.serviceLevel} ${formatPct(t.serviceLevel)} `, target),
        h('span', {}, `${M.asa} ${formatSec(t.asaSec)}`),
        h('span', {}, `${M.abandoned} ${abandoned}`)];
    return h('li', {
      class: below ? 'metric below' : 'metric',
      'data-client': c.id,
      title: chipTitle(c),
    },
    h('strong', {}, c.name),
    label,
    numbers,
    h('span', {}, `${M.satisfaction} ${Math.round(c.satisfaction)}`),
    below && h('span', { class: 'warn' }, M.belowTarget));
  });
  // From five clients on the chips use the compact form (smaller type, tighter
  // gaps) so the strip stays within two or three lines at 1280x720.
  const cls = ['metrics-list', mixed && 'channels', items.length > COMPACT_FROM && 'compact'].filter(Boolean).join(' ');
  root.replaceChildren(h('ul', { class: cls }, items));
}
