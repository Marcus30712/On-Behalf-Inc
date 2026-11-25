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

// v1.3 channels. A client's target as text: email in open hours, else seconds.
export const formatTarget = (c) => (c.channel === 'email'
  ? fill(UI_TEXT.metrics.targetEmail, { hours: c.slTarget.openMinutes / 60, pct: c.slTarget.pct })
  : fill(UI_TEXT.metrics.targetFull, c.slTarget));

// Channel labels show only once a chat or email client is on the books, so a
// phone-only game looks as it did before channels.
export const hasChannels = (v) => v.clients.some((c) => (c.channel ?? 'phone') !== 'phone');

export const CHANNEL_TIPS = { chat: UI_TEXT.channel.chatTip, email: UI_TEXT.channel.emailTip };

// The client's channel (📞 전화, 💬 채팅, ✉️ 이메일), its tip on hover.
export const channelLabel = (h, c) => h('span', { class: 'channel', title: CHANNEL_TIPS[c.channel] }, UI_TEXT.channel[c.channel ?? 'phone']);
