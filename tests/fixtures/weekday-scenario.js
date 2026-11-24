// A fixed play-through used to check that v1.2 weekend operations change
// nothing while no weekend client is active: same seed + same acts must give
// the same serialized state as the v1.1/v1.2-Task-2 code (golden file
// tests/fixtures/weekday-golden.json, captured from commit bafdc6b before the
// weekend change). Regenerate only on a deliberate balance change:
//   node tests/fixtures/weekday-scenario.js > tests/fixtures/weekday-golden.json
import { createGame, advance, act, view } from '../../sim/game.js';
import { serialize } from '../../sim/state.js';
import { EVENTS } from '../../world/events.js';
import { RESEARCH } from '../../world/research.js';

export const SCENARIOS = [
  { seed: 7, days: 150 },
  { seed: 12345, days: 130 },
];

// Every day at 09:00: answer open choices (first choice, or the second every
// other time), and on a few days change the roster, tasks, hiring and research.
export function runScenario({ seed, days }) {
  const s = createGame(seed);
  act(s, { type: 'startResearch', researchId: RESEARCH[0].id });
  for (let d = 0; d < days; d++) {
    if (s.gameOver) break;
    s.inbox.forEach((e, index) => {
      const choices = EVENTS[e.id]?.choices;
      if (!choices || e.resolved) return;
      const pick = choices[(index + d) % 2 === 0 ? 0 : Math.min(1, choices.length - 1)];
      act(s, { type: 'resolve', index, choiceId: pick.id });
    });
    const v = view(s);
    if (d === 3) act(s, { type: 'setRoster', personId: v.people[1].id, weekday: 4, shift: 'off' });
    if (d === 3) act(s, { type: 'setRoster', personId: v.people[2].id, weekday: 0, shift: 'late' });
    if (d === 8) act(s, { type: 'assign', personId: v.people[3].id, kind: 'training' });
    if (d === 12) act(s, { type: 'startHiring' });
    if (d === 40) act(s, { type: 'assign', personId: v.people[3].id, kind: 'phone', clientId: v.clients[0].id });
    if (d === 60) act(s, { type: 'startHiring' });
    if (d === 61) act(s, { type: 'startExpansion' });
    if (d === 90 && !s.research.current) act(s, { type: 'startResearch', researchId: RESEARCH[1].id });
    advance(s, 1440);
  }
  return serialize(s);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = {};
  for (const sc of SCENARIOS) out[`${sc.seed}x${sc.days}`] = runScenario(sc);
  process.stdout.write(`${JSON.stringify(out)}\n`);
}
