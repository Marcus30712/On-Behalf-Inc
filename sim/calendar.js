// Planet calendar: 360-day year (12 months x 30 days), day 0 = year 1, 1 Jan, Monday.
// Pure functions; no dependency on other modules.
//
// Nation shape: { id, weeklyRest: number[], holidays: Holiday[] }
// Holiday: { id, rule, length, staffLeave, callEffect, staffAvail? }
//   rule: { kind: 'fixed', month, date } | { kind: 'drifting', baseDay, driftPerYear }
//   staffAvail (0..1, default 1) is passed through unchanged for later tasks.

export const DAYS_PER_MONTH = 30;
export const MONTHS_PER_YEAR = 12;
export const DAYS_PER_YEAR = DAYS_PER_MONTH * MONTHS_PER_YEAR;

export function dateOf(day) {
  const year = Math.floor(day / DAYS_PER_YEAR) + 1;
  const inYear = day - (year - 1) * DAYS_PER_YEAR;
  return {
    year,
    month: Math.floor(inYear / DAYS_PER_MONTH) + 1,
    date: (inYear % DAYS_PER_MONTH) + 1,
    weekday: ((day % 7) + 7) % 7,
  };
}

export function isWorkday(day) {
  return dateOf(day).weekday < 5;
}

// v1.4: company timers (offer streak, hiring wait, build days) count Monday to
// Friday only, even on a weekend day the center opens for a weekend client.
// Same days as isWorkday; a separate name so callers say which rule they mean.
export const isCompanyWorkday = isWorkday;

// Start day of the holiday's occurrence for 1-based year y.
function startOfYear(rule, y) {
  if (rule.kind === 'fixed') {
    return (y - 1) * DAYS_PER_YEAR + (rule.month - 1) * DAYS_PER_MONTH + (rule.date - 1);
  }
  return rule.baseDay + (y - 1) * (DAYS_PER_YEAR - rule.driftPerYear);
}

// Every occurrence starting in [from, to] (startDay >= 0 only), ascending.
function occurrencesStarting(holiday, from, to) {
  const rule = holiday.rule;
  const step = rule.kind === 'fixed' ? DAYS_PER_YEAR : DAYS_PER_YEAR - rule.driftPerYear;
  const first = startOfYear(rule, 1);
  // Starts grow by `step` each year, so jump near `from`, then back off two years for safety.
  let y = Math.max(1, Math.floor((from - first) / step) + 1 - 2);
  const out = [];
  for (; ; y++) {
    const start = startOfYear(rule, y);
    if (start > to) break;
    if (start >= from && start >= 0) out.push(start);
  }
  return out;
}

export function holidaysOn(day, nation) {
  const out = [];
  for (const holiday of nation.holidays) {
    const starts = occurrencesStarting(holiday, day - holiday.length + 1, day);
    for (const startDay of starts) {
      out.push({ holiday, startDay, dayOfHoliday: day - startDay + 1 });
    }
  }
  return out;
}

export function upcomingHolidays(day, nation, withinDays) {
  const out = [];
  for (const holiday of nation.holidays) {
    for (const startDay of occurrencesStarting(holiday, day, day + withinDays)) {
      out.push({ holiday, startDay });
    }
  }
  return out.sort((a, b) => a.startDay - b.startDay);
}
