// Event inbox: notices and choices. Pure rules, no DOM.
//
// Event = { id, personId?, clientId?, data?, day, deadlineDay?, seen, resolved, choice?, auto? }
// Choice effects live in EVENT_EFFECTS; events added by later tasks (candidate,
// client-offer, ...) get their entries there. A choice with no entry just resolves.
import { EVENTS } from '../world/events.js';
import { moraleOf } from './people.js';

const LEAVE_REFUSED_ABSENCE = 0.3;
const RESIGN_WITHDRAW_MORALE = 50;

// Passive choice taken when a choice event's deadline passes unanswered.
const DEFAULT_CHOICE = {
  'holiday-leave': 'grant',
  'friday-off': 'keep',
  'resign-notice': 'let-go',
  candidate: 'hold',
  'client-offer': 'decline',
};

const personOf = (state, event) => state.people.find((p) => p.id === event.personId);

function boostMorale(person, amount) {
  person.moraleBoost = (person.moraleBoost ?? 0) + amount;
  person.morale = moraleOf(person);
}

export const EVENT_EFFECTS = {
  'holiday-leave': {
    // endOfDay already put the person on leave when asking (passive default);
    // this only sets it for a request made without that, through the holiday's end.
    grant(state, event, person) {
      boostMorale(person, 10);
      const daysLeft = event.data.endDay - (state.lastEndedDay ?? event.day);
      if (person.health.kind === 'well' && daysLeft > 0) person.health = { kind: 'leave', daysLeft };
    },
    refuse(state, event, person, rng) {
      boostMorale(person, -15);
      if (person.health.kind === 'leave') person.health = { kind: 'well', daysLeft: 0 };
      if (rng.chance(LEAVE_REFUSED_ABSENCE)) {
        state.absences.push({ personId: person.id, day: event.data.firstWorkday });
      }
    },
  },
  'friday-off': {
    change(state, event, person) {
      boostMorale(person, 8);
      state.roster[person.id] = { ...state.roster[person.id], 4: 'off' };
    },
    keep(state, event, person) {
      boostMorale(person, -5);
    },
  },
  'resign-notice': {
    'keep-trying'(state, event, person) {
      boostMorale(person, 15);
      (state.leaving ??= []).push({
        personId: person.id, day: event.data.leaveDay, withdrawIfMoraleAbove: RESIGN_WITHDRAW_MORALE,
      });
    },
    'let-go'(state, event, person) {
      (state.leaving ??= []).push({ personId: person.id, day: event.data.leaveDay });
    },
  },
};

export function pushEvent(state, { id, personId, clientId, data, deadlineDay }) {
  const event = { id };
  if (personId !== undefined) event.personId = personId;
  if (clientId !== undefined) event.clientId = clientId;
  if (data !== undefined) event.data = data;
  event.day = state.day;
  if (deadlineDay !== undefined) event.deadlineDay = deadlineDay;
  event.seen = false;
  event.resolved = false;
  (state.inbox ??= []).push(event);
}

// Returns true if the state changed. Events without choices are only marked seen.
export function resolveEvent(state, eventIndex, choiceId, rng) {
  const event = state.inbox?.[eventIndex];
  if (!event || event.resolved) return false;
  const choices = EVENTS[event.id]?.choices;
  if (!choices) {
    event.seen = true;
    return true;
  }
  if (!choices.some((c) => c.id === choiceId)) return false;
  event.seen = true;
  event.resolved = true;
  event.choice = choiceId;
  const effect = EVENT_EFFECTS[event.id]?.[choiceId];
  const person = event.personId === undefined ? undefined : personOf(state, event);
  if (effect && (event.personId === undefined || person)) effect(state, event, person, rng);
  return true;
}

// Auto-resolves unanswered choice events whose deadline is today or earlier.
export function expireEvents(state, rng) {
  (state.inbox ?? []).forEach((event, i) => {
    if (event.resolved || event.deadlineDay === undefined || event.deadlineDay > state.day) return;
    const choice = DEFAULT_CHOICE[event.id];
    if (!choice) return;
    event.auto = true;
    resolveEvent(state, i, choice, rng);
  });
}
