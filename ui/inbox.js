// Inbox list, Kim Miso's advisor bubble and the first-run intro. Each render
// rebuilds the root it is given. Which items are open lives in this module
// (resetInbox() clears it for a new or loaded game).
import { UI_TEXT, eventText, fill } from './text.js';
import { EVENTS } from '../world/events.js';
import { builder } from './dom.js';
import { refusalText } from './panels.js';

let open = new Set(); // inbox indexes the player has expanded
let showOld = false; // resolved items past the newest few are folded until asked for
const RECENT_RESOLVED = 3;

export function resetInbox() {
  open = new Set();
  showOld = false;
}

function deadlineText(event, day) {
  if (event.resolved || event.deadlineDay === undefined) return '';
  const days = event.deadlineDay - day;
  return days <= 0 ? UI_TEXT.inbox.deadlineToday : fill(UI_TEXT.inbox.deadline, { days });
}

// onAct(action) -> { ok, reason }; options.onOpen(event) hears each expansion.
export function renderInbox(root, v, onAct, { onOpen, getView } = {}) {
  const h = builder(root.ownerDocument);
  // After an action the sim has changed, so redraw from a fresh view when given one.
  const rerender = (focusIndex) => {
    renderInbox(root, getView ? getView() : v, onAct, { onOpen, getView });
    if (focusIndex !== undefined) root.querySelector(`[data-index="${focusIndex}"] .inbox-head`)?.focus?.();
  };
  const notice = h('p', { class: 'notice', role: 'status' });

  const toggle = (event) => {
    if (open.has(event.index)) {
      open.delete(event.index);
    } else {
      open.add(event.index);
      // Information events are read by opening; choice events stay open until answered.
      if (!event.resolved && !eventText(event).choices) onAct({ type: 'resolve', index: event.index, choiceId: undefined });
      onOpen?.(event);
    }
    rerender(event.index);
  };

  const choose = (event, choiceId) => {
    const r = onAct({ type: 'resolve', index: event.index, choiceId });
    if (!r?.ok) notice.textContent = refusalText(r?.reason);
    else rerender(event.index);
  };

  const item = (event) => {
    const t = eventText(event);
    const isOpen = open.has(event.index);
    const needsAnswer = Boolean(t.choices) && !event.resolved;
    const unread = !event.seen;
    const chosen = t.choices?.find((c) => c.id === event.choice);
    const deadline = deadlineText(event, v.day);
    // Several requests can share a title ('금요일 휴무 요청'): name the person if the title does not.
    const name = event.data?.name && !EVENTS[event.id]?.title.includes('{name}') ? event.data.name : null;
    const body = isOpen && h('div', { class: 'inbox-body', id: `inbox-body-${event.index}` },
      h('p', {}, t.text),
      needsAnswer && h('p', { class: 'help' }, UI_TEXT.inbox.choices),
      needsAnswer && h('div', { class: 'choices' },
        t.choices.map((c) => h('button', { type: 'button', class: 'choice-btn', onclick: () => choose(event, c.id) }, c.label))),
      chosen && h('p', { class: 'choice-made' }, fill(UI_TEXT.inbox.yourChoice, { choice: chosen.label })),
      chosen && h('p', { class: 'choice-result' }, h('strong', {}, `${UI_TEXT.inbox.result} `), chosen.result));
    return h('li', {
      class: ['inbox-item', unread && 'unread', needsAnswer && 'needs-answer', event.resolved && 'resolved'].filter(Boolean).join(' '),
      'data-id': event.id, 'data-index': event.index,
    },
    h('button', { type: 'button', class: 'inbox-head', 'aria-expanded': String(isOpen), 'aria-controls': isOpen ? `inbox-body-${event.index}` : null, onclick: () => toggle(event) },
      h('span', { class: 'inbox-title' }, name ? `${t.title} · ${name}` : t.title),
      needsAnswer && h('span', { class: 'badge' }, UI_TEXT.inbox.needsAnswer),
      deadline && h('span', { class: 'inbox-deadline' }, deadline)),
    body);
  };

  const unreadCount = v.inbox.filter((e) => !e.seen).length;
  // Waiting and unread items always show; of the answered ones only the newest few.
  const resolvedIdx = v.inbox.filter((e) => e.resolved).map((e) => e.index);
  const folded = new Set(showOld ? [] : resolvedIdx.slice(RECENT_RESOLVED));
  const visible = v.inbox.filter((e) => !folded.has(e.index));
  root.replaceChildren(h('section', { class: 'inbox' },
    h('h2', {}, UI_TEXT.inbox.title, unreadCount > 0 && h('span', { class: 'badge' }, fill(UI_TEXT.inbox.unread, { n: unreadCount }))),
    v.inbox.length === 0 && h('p', { class: 'help' }, UI_TEXT.inbox.empty),
    h('ul', { class: 'inbox-list', 'aria-live': 'polite' }, visible.map(item)),
    folded.size > 0 && h('button', { type: 'button', class: 'show-old', onclick: () => { showOld = true; rerender(); } }, UI_TEXT.inbox.showOld),
    notice));
}

// Kim Miso's speech bubble for an event (null: nothing opened yet).
export function renderAdvisor(root, event, { drawer }) {
  const h = builder(root.ownerDocument);
  const line = event ? eventText(event).advisor : '';
  if (!line) { root.replaceChildren(); return; } // nothing to say: no bubble
  const face = h('canvas', { class: 'advisor-face', width: 16, height: 16, role: 'img', 'aria-label': UI_TEXT.advisor.name });
  const source = drawer.spriteCanvas('miso');
  face.getContext('2d')?.drawImage(source, 0, 0);
  root.replaceChildren(h('section', { class: 'advisor' },
    face,
    h('div', { class: 'bubble' },
      h('p', { class: 'advisor-name' }, `${UI_TEXT.advisor.name} · ${UI_TEXT.advisor.role}`),
      h('p', { class: 'advisor-line', 'aria-live': 'polite' }, line))));
}

const INTRO_KEYS = ['1', '2', '3', '4', '5'];

// Shows the intro lines one at a time; the last button (or Enter) calls onDone.
export function firstRunIntro(root, onDone) {
  const h = builder(root.ownerDocument);
  let step = 0;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    root.removeEventListener('keydown', onKey);
    root.replaceChildren();
    onDone();
  };
  const next = () => {
    if (step >= INTRO_KEYS.length - 1) finish();
    else { step++; draw(); }
  };
  // A focused button already turns Enter into a click.
  function onKey(e) {
    if (e.key === 'Enter' && e.target?.tagName !== 'BUTTON') next();
  }
  function draw() {
    const last = step === INTRO_KEYS.length - 1;
    root.replaceChildren(h('section', { class: 'intro', role: 'dialog', 'aria-label': UI_TEXT.advisor.name },
      h('p', { class: 'intro-line' }, UI_TEXT.intro[INTRO_KEYS[step]]),
      h('div', { class: 'intro-actions' },
        !last && h('button', { type: 'button', class: 'intro-skip', onclick: finish }, UI_TEXT.intro.skip),
        h('button', { type: 'button', class: 'intro-next', onclick: next }, last ? UI_TEXT.intro.done : UI_TEXT.intro.next))));
    root.querySelector('.intro-next').focus?.();
  }
  root.addEventListener('keydown', onKey);
  draw();
}
