// Shared display helpers for hospital appointments.
import { hospitalNow, LOCALE } from './format.js';

export const STATUS_LABEL = {
  pending: 'Booked',
  confirmed: 'Confirmed',
  completed: 'Seen',
  no_show: 'Missed',
  cancelled: 'Cancelled',
};

export const STATUS_STYLE = {
  pending: 'border-warn/40 text-warn bg-warn/5',
  confirmed: 'border-success/40 text-success bg-success/5',
  completed: 'border-ink/30 text-ink bg-ink/5',
  no_show: 'border-accent/40 text-accent-deep bg-accent/5',
  cancelled: 'border-rule text-ash bg-paper',
};

export const OPEN_STATUSES = ['pending', 'confirmed'];

// "Today" is the hospital's day (IST by default), not the viewer's device day
// and not the UTC day that toISOString() would give.
export function localDate() {
  return hospitalNow().date;
}

// Pure calendar arithmetic on YYYY-MM-DD strings (UTC avoids DST/offset shifts).
export function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** True when the slot has already started on the hospital's clock. */
export function isPastSlot(date, time) {
  const now = hospitalNow();
  if (date !== now.date) return date < now.date;
  const [hh, mm] = time.split(':').map(Number);
  return hh * 60 + mm <= now.minutes;
}

/** "2026-09-28" -> "Mon, 28 Sept 2026" */
export function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(LOCALE, { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

const FIELD_LOOK = 'border border-rule bg-cream px-4 text-sm focus:outline-none focus:border-ink';
export const FIELD = `w-full py-3 ${FIELD_LOOK}`;
// Compact control that sizes to its content (filters, per-row dropdowns).
export const FIELD_INLINE = `w-auto py-2 ${FIELD_LOOK}`;

export function apiError(e, fallback) {
  const details = e?.response?.data?.details;
  if (details?.length) return details.map(d => d.message.replace(/"/g, '')).join(' ');
  return e?.response?.data?.error || fallback;
}
