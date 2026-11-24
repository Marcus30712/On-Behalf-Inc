// Number and date display. Pure functions; copy comes from ui/text.js.
import { UI_TEXT, fill } from './text.js';
import { formatMoney } from './money.js';

const pad = (n) => String(n).padStart(2, '0');

export const formatTime = (minute) => `${pad(Math.floor(minute / 60) % 24)}:${pad(Math.floor(minute % 60))}`;

export const formatDate = ({ year, month, date, weekdayLabel }) =>
  fill(UI_TEXT.topbar.date, { year, month, day: date, weekday: weekdayLabel });

export { formatMoney };

// x is a share, 0..1.
export const formatPct = (x) => (x === null || x === undefined ? '—' : `${Math.round(x * 100)}%`);

export const formatSec = (s) => (s === null || s === undefined ? '—' : fill(UI_TEXT.metrics.asaUnit, { n: Math.round(s) }));
