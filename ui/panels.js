// The seven bottom-tab panels and the person card. Each render rebuilds the
// root it is given from the view; buttons call onAct(action) -> { ok, reason }.
// A refusal is shown inside the panel; it stays while the clock stands still
// and clears once time passes or any action succeeds. After an ok action the
// caller re-renders with a fresh view. resetPanels() clears the panels' own
// state (open card, notices, pending phone picks) for a new or loaded game.
import { HIRE_COST, SHIFTS } from '../sim/game.js';
import { RESEARCH } from '../world/research.js';
import { TRAITS } from '../world/traits.js';
import { NATIONS } from '../world/nations.js';
import { CLIENTS } from '../world/clients.js';
import { PLANET } from '../world/planet.js';
import { UI_TEXT, fill } from './text.js';
import { formatDate, formatMoney, formatPct, formatSec } from './format.js';
import { builder } from './dom.js';

export const TABS = ['people', 'roster', 'tasks', 'research', 'hiring', 'clients', 'calendar'];

const WEEKDAYS = 5;
const CYCLE = { early: 'late', late: 'off', off: 'early' };
const TASK_KINDS = ['phone', 'coaching', 'qa', 'research', 'training'];
const SKILLS = ['handling', 'systems', 'coaching', 'evaluation'];
const HIGH = 70; // fatigue / stress danger zone
const LOW = 30; // morale danger zone

let selected = null; // person id whose card is open in the people panel
let notices = {}; // tab -> { text, day, minute } of the refusal
let pendingPhone = new Set(); // people picked 'phone' in tasks, waiting for a client

// Opens a person's card the next time the people panel renders (null closes it).
export function selectPerson(id) {
  selected = id ?? null;
}

export function resetPanels() {
  selected = null;
  notices = {};
  pendingPhone = new Set();
}

// The tab's refusal text if the clock has not moved since it was given.
function noticeFor(tab, v) {
  const n = notices[tab];
  if (n && (n.day !== v.day || n.minute !== v.minute)) delete notices[tab];
  return notices[tab]?.text ?? '';
}

export function refusalText(reason) {
  const t = UI_TEXT.refuse[reason] ?? UI_TEXT.refuse.default;
  return fill(t, { cost: formatMoney(HIRE_COST) }) || UI_TEXT.refuse.default;
}

const nationName = (id) => NATIONS.find((n) => n.id === id)?.name ?? '';
const clientName = (v, id) => v.clients.find((c) => c.id === id)?.name ?? CLIENTS.find((c) => c.id === id)?.name ?? '';
const roleText = (p) => [UI_TEXT.role[p.role] ?? p.role,
  p.probationDays > 0 ? fill(UI_TEXT.role.probation, { n: p.probationDays }) : null].filter(Boolean).join(' · ');

// options.onClose: shows a close button that calls it.
export function renderPanel(root, v, tab, onAct, { onClose } = {}) {
  const h = builder(root.ownerDocument);
  const notice = h('p', { class: 'notice', role: 'status' }, noticeFor(tab, v));
  const ctx = {
    h, v,
    rerender: () => renderPanel(root, v, tab, onAct, { onClose }),
    run(action) {
      const r = onAct(action);
      if (r?.ok) notices = {};
      else notices[tab] = { text: refusalText(r?.reason), day: v.day, minute: v.minute };
      notice.textContent = notices[tab]?.text ?? '';
      return r;
    },
  };
  const body = (BODIES[tab] ?? BODIES.people)(ctx);
  const close = onClose && h('button', { type: 'button', class: 'panel-close', onclick: onClose }, UI_TEXT.common.close);
  root.replaceChildren(h('section', { class: `panel panel-${tab}`, 'data-tab': tab }, close, body, notice));
}

const title = (h, text, help) => [h('h2', {}, text), help && h('p', { class: 'help' }, help)];

const bar = (h, key, value) => {
  const danger = key === 'morale' ? value <= LOW : value >= HIGH;
  const flag = danger ? UI_TEXT.bar[key === 'morale' ? 'low' : 'high'].name : null;
  return h('div', { class: danger ? 'bar danger' : 'bar', title: UI_TEXT.bar[key].tip },
    h('span', { class: 'bar-name' }, UI_TEXT.bar[key].name),
    h('meter', { min: 0, max: 100, value: Math.round(value) }),
    h('span', { class: 'bar-value' }, String(Math.round(value))),
    flag && h('span', { class: 'warn' }, flag));
};

function healthText(p) {
  if (p.shiftToday === 'absent') return UI_TEXT.health.absent.left;
  const t = UI_TEXT.health[p.health?.kind] ?? UI_TEXT.health.well;
  return p.health?.kind === 'well' ? t.name : fill(t.left, { days: p.health.daysLeft });
}

// 'off' before today's shift has begun reads as the shift, not as gone home.
function activityText(v, p) {
  if (p.shiftToday === 'absent') return UI_TEXT.health.absent.name;
  if (p.health?.kind && p.health.kind !== 'well' && UI_TEXT.health[p.health.kind]) return UI_TEXT.health[p.health.kind].name;
  const shift = SHIFTS[p.shiftToday];
  if (p.activity === 'off' && shift && v.minute < shift.start) return UI_TEXT.shift[p.shiftToday].full;
  return UI_TEXT.activity[p.activity] ?? '';
}

function taskText(v, task) {
  if (!task) return UI_TEXT.activity.idle;
  const name = UI_TEXT.task[task.kind]?.name ?? task.kind;
  return task.kind === 'phone' ? `${name} · ${clientName(v, task.clientId)}` : name;
}

function personCard({ h, v, rerender }) {
  const back = h('button', { type: 'button', class: 'back', onclick: () => { selected = null; rerender(); } }, UI_TEXT.common.back);
  const p = v.people.find((x) => x.id === selected);
  if (!p) return h('article', { class: 'card' }, back, h('p', {}, UI_TEXT.people.leftNote));
  const C = UI_TEXT.card;
  const traits = p.traits.map((id) => TRAITS.find((t) => t.id === id)).filter(Boolean)
    .map((t) => h('li', {}, h('strong', {}, t.name), ' ', t.blurb));
  const skills = SKILLS.map((k) => h('li', { title: UI_TEXT.skill[k].tip }, `${UI_TEXT.skill[k].name} ${p.skills?.[k] ?? 0}`));
  const holidays = (p.holidays ?? []).map((x) => {
    const n = x.startDay - v.day;
    return h('li', {}, fill(n <= 0 ? C.holidayToday : C.holidayItem, { holiday: x.name, n, days: x.length }));
  });
  const shift = UI_TEXT.shift[p.shiftToday]?.full ?? UI_TEXT.health[p.shiftToday]?.name ?? '';
  return h('article', { class: 'card', 'data-card': p.id },
    back,
    h('h3', {}, p.name, ' ', h('small', {}, roleText(p))),
    h('dl', {},
      h('dt', {}, C.nation), h('dd', {}, nationName(p.nation)),
      h('dt', {}, C.health), h('dd', {}, healthText(p)),
      h('dt', {}, C.shiftToday), h('dd', {}, shift),
      h('dt', {}, C.task), h('dd', {}, taskText(v, p.task))),
    h('h4', {}, C.traits), h('ul', { class: 'traits' }, traits),
    h('h4', {}, C.skills), h('ul', { class: 'skills' }, skills),
    h('h4', {}, C.condition), bar(h, 'fatigue', p.fatigue), bar(h, 'stress', p.stress), bar(h, 'morale', p.morale),
    h('h4', {}, C.holidays),
    holidays.length > 0 ? h('ul', { class: 'holidays' }, holidays) : h('p', {}, C.noHolidays));
}

function peoplePanel(ctx) {
  const { h, v, rerender } = ctx;
  if (selected !== null) return personCard(ctx);
  const P = UI_TEXT.people;
  if (v.people.length === 0) return [title(h, P.title), h('p', {}, P.empty)];
  const cards = v.people.map((p) => h('button', {
    type: 'button', class: 'person', 'data-person': p.id, title: P.open,
    onclick: () => { selected = p.id; rerender(); },
  },
  h('strong', {}, p.name),
  h('span', {}, roleText(p)),
  h('span', {}, activityText(v, p)),
  h('span', {}, healthText(p))));
  return [title(h, P.title, fill(P.count, { n: v.people.length })), h('div', { class: 'person-list' }, cards)];
}

function rosterPanel({ h, v, run }) {
  const R = UI_TEXT.roster;
  if (v.people.length === 0) return [title(h, R.title), h('p', {}, R.empty)];
  const today = v.date.weekday;
  const head = h('tr', {}, h('th', {}, R.colName), PLANET.weekdays.slice(0, WEEKDAYS).map((d, w) =>
    h('th', { class: w === today ? 'today' : null, title: w === today ? R.todayMark : null }, d)));
  const rows = v.people.map((p) => h('tr', {}, h('th', { scope: 'row' }, p.name),
    (p.week ?? []).slice(0, WEEKDAYS).map((shift, w) => h('td', {},
      h('button', {
        type: 'button', class: `shift shift-${shift}`, 'data-person': p.id, 'data-weekday': w,
        title: UI_TEXT.shift[shift]?.full,
        onclick: () => run({ type: 'setRoster', personId: p.id, weekday: w, shift: CYCLE[shift] ?? 'early' }),
      }, UI_TEXT.shift[shift]?.short ?? shift)))));
  return [title(h, R.title, R.help), h('p', { class: 'help' }, R.hours),
    h('table', { class: 'roster' }, h('thead', {}, head), h('tbody', {}, rows))];
}

function tasksPanel({ h, v, run, rerender }) {
  const T = UI_TEXT.tasks;
  if (v.people.length === 0) return [title(h, T.title), h('p', {}, T.empty)];
  const active = v.clients.filter((c) => c.active);
  const onPhone = v.people.filter((p) => p.task?.kind === 'phone');
  // Seats are for agents (sim/hiring.js); a lead or QA on the phone uses their own desk.
  const seated = onPhone.filter((p) => p.role === 'agent').length;
  const byClient = active.map((c) => fill(T.byClient, { client: c.name, n: onPhone.filter((p) => p.task.clientId === c.id).length }));
  const rows = v.people.map((p) => {
    const phone = p.task?.kind === 'phone' || pendingPhone.has(p.id);
    const kind = pendingPhone.has(p.id) ? 'phone' : p.task?.kind ?? '';
    const taskSelect = h('select', {
      'data-person': p.id, 'data-field': 'task',
      onchange: (e) => {
        const k = e.target.value;
        if (k === 'phone') { pendingPhone.add(p.id); rerender(); return; }
        pendingPhone.delete(p.id);
        run({ type: 'assign', personId: p.id, kind: k });
      },
    },
    !kind && h('option', { value: '', selected: true, disabled: true }, UI_TEXT.activity.idle),
    TASK_KINDS.map((k) => h('option', { value: k, selected: k === kind, title: UI_TEXT.task[k].tip }, UI_TEXT.task[k].name)));
    const current = p.task?.kind === 'phone' && !pendingPhone.has(p.id) ? p.task.clientId : '';
    const ended = current && !active.some((c) => c.id === current);
    const clientSelect = phone && h('select', {
      'data-person': p.id, 'data-field': 'client',
      onchange: (e) => {
        const r = run({ type: 'assign', personId: p.id, kind: 'phone', clientId: e.target.value });
        if (r?.ok) pendingPhone.delete(p.id);
      },
    },
    (!current || ended) && h('option', { value: current, selected: true, disabled: true }, ended ? clientName(v, current) : T.pickClient),
    active.map((c) => h('option', { value: c.id, selected: c.id === current }, c.name)));
    return h('tr', {},
      h('th', { scope: 'row' }, p.name),
      h('td', {}, roleText(p)),
      h('td', {}, taskSelect),
      h('td', {}, clientSelect || '', ended && h('span', { class: 'warn' }, ` ${T.clientEnded}`)));
  });
  return [title(h, T.title, T.help),
    h('p', { class: 'seats' }, fill(T.seats, { n: seated }), byClient.length > 0 && ` · ${byClient.join(' · ')}`),
    h('table', { class: 'tasks' },
      h('thead', {}, h('tr', {}, [T.colName, T.colRole, T.colTask, T.colClient].map((c) => h('th', {}, c)))),
      h('tbody', {}, rows))];
}

function researchPanel({ h, v, run }) {
  const R = UI_TEXT.research;
  const r = v.research;
  const assigned = v.people.filter((p) => p.task?.kind === 'research').length;
  const busy = r.current || r.build;
  const items = RESEARCH.map((def) => {
    let state;
    if (r.done.includes(def.id)) state = h('span', { class: 'done' }, R.done);
    else if (r.build?.researchId === def.id) state = h('span', {}, fill(R.building, { hours: Math.ceil(r.build.minutesLeft / 60) }));
    else if (r.current === def.id) {
      state = h('span', {}, R.current, ' ',
        h('progress', { max: def.cost, value: Math.min(r.points, def.cost) }), ' ',
        fill(R.progress, { n: Math.floor(r.points), cost: def.cost }));
    } else {
      state = h('button', {
        type: 'button', 'data-action': 'startResearch', 'data-id': def.id,
        onclick: () => run({ type: 'startResearch', researchId: def.id }),
      }, R.start);
    }
    return h('li', { class: 'research', 'data-research': def.id },
      h('strong', {}, def.name), h('p', {}, def.blurb),
      h('span', { class: 'cost' }, fill(R.cost, { n: def.cost })), ' ', state);
  });
  return [title(h, R.title, R.help),
    h('p', {}, fill(R.assigned, { n: assigned })),
    assigned === 0 && h('p', { class: 'warn' }, R.nobody),
    busy && h('p', { class: 'help' }, R.oneAtATime),
    r.done.length === RESEARCH.length && h('p', {}, R.allDone),
    h('ul', { class: 'research-list' }, items)];
}

function hiringPanel({ h, v, run }) {
  const H = UI_TEXT.hiring;
  const free = Math.max(0, v.office.seats - v.people.filter((p) => p.role === 'agent').length);
  let state;
  if (!v.hiring) state = free > 0 ? H.state.ready : H.noSeats;
  else if (v.hiring.candidates) state = H.state.arrived;
  else state = fill(H.state.searching, { n: v.hiring.workdays });
  return [title(h, H.title, H.help),
    h('p', { class: 'state' }, state),
    h('p', {}, fill(H.cost, { cost: formatMoney(HIRE_COST) })),
    (free > 0 || v.hiring) && h('p', {}, free > 0 ? fill(H.seats, { n: free }) : H.noSeats),
    !v.hiring && free > 0 && h('button', { type: 'button', 'data-action': 'startHiring', onclick: () => run({ type: 'startHiring' }) }, H.start),
    h('p', { class: 'help' }, H.probationNote),
    h('p', { class: 'help' }, H.noRefund)];
}

function clientsPanel({ h, v }) {
  const C = UI_TEXT.clients;
  const M = UI_TEXT.metrics;
  const rows = v.clients.map((c) => {
    const def = CLIENTS.find((d) => d.id === c.id);
    const t = c.today;
    return h('tr', { 'data-client': c.id, class: c.active ? null : 'ended' },
      h('th', { scope: 'row' }, c.name, h('br'), h('small', {}, fill(C.fee, { cost: def ? formatMoney(def.monthlyFee) : null }))),
      h('td', {}, nationName(def?.nation)),
      h('td', {}, fill(M.targetFull, c.slTarget)),
      h('td', {}, formatPct(t.serviceLevel)),
      h('td', {}, formatSec(t.asaSec)),
      h('td', {}, t.offered > 0 ? fill(M.abandonedUnit, { n: t.abandoned }) : M.none),
      h('td', {}, String(Math.round(c.satisfaction))),
      h('td', {}, t.agents.toFixed(1)),
      h('td', {}, c.active ? C.active : C.ended,
        c.active && c.churnWorkdaysLeft !== null && c.churnWorkdaysLeft !== undefined
          && h('div', { class: 'warn' }, fill(C.churnWarning, { days: c.churnWorkdaysLeft }))));
  });
  const head = [C.colName, C.colNation, C.colTarget, C.colSL, C.colAsa, C.colAbandoned, C.colSatisfaction, C.colAgents, '']
    .map((x) => h('th', {}, x));
  return [title(h, C.title, `${M.today}`),
    !v.clients.some((c) => c.active) && h('p', { class: 'warn' }, C.empty),
    h('table', { class: 'clients' }, h('thead', {}, h('tr', {}, head)), h('tbody', {}, rows))];
}

function calendarPanel({ h, v }) {
  const K = UI_TEXT.calendar;
  const rest = NATIONS.map((n) => h('p', { class: 'help' },
    fill(K.weeklyRest, { nation: n.name, days: n.weeklyRest.map((d) => PLANET.weekdays[d]).join('·') })));
  const list = v.calendar ?? [];
  const rows = list.map((x) => {
    const def = NATIONS.find((n) => n.id === x.nation)?.holidays.find((d) => d.id === x.id);
    const people = v.people.filter((p) => p.nation === x.nation).map((p) => p.name);
    const notes = [x.startDay <= v.day && K.today,
      def?.callEffect.during < 1 && K.callsDown, def?.callEffect.after > 1 && K.callsUp].filter(Boolean);
    return h('tr', { 'data-holiday': x.id },
      h('td', {}, formatDate(x.date)),
      h('td', {}, nationName(x.nation)),
      h('td', { title: def?.blurb }, x.name, ' ', h('small', {}, fill(K.length, { days: x.length })),
        notes.length > 0 && h('div', { class: 'help' }, notes.join(' · '))),
      h('td', {}, people.length > 0 ? people.join(', ') : K.noPeople));
  });
  return [title(h, K.title, K.help), rest,
    list.length === 0 ? h('p', {}, K.empty)
      : h('table', { class: 'calendar' },
        h('thead', {}, h('tr', {}, [K.colDate, K.colNation, K.colHoliday, K.colPeople].map((c) => h('th', {}, c)))),
        h('tbody', {}, rows))];
}

const BODIES = {
  people: peoplePanel,
  roster: rosterPanel,
  tasks: tasksPanel,
  research: researchPanel,
  hiring: hiringPanel,
  clients: clientsPanel,
  calendar: calendarPanel,
};
