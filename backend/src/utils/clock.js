/**
 * Wall-clock helpers in the hospital's time zone (APP_TIMEZONE).
 *
 * The server usually runs in UTC, but "today" and "10:30" mean the hospital's
 * local day and time for bookings, merges and the daily reset.
 */
const config = require('../config/env');

function parts(date = new Date()) {
  try {
    const p = new Intl.DateTimeFormat('en-CA', {
      timeZone: config.timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(date);
    const get = (t) => p.find(x => x.type === t).value;
    return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')), minute: Number(get('minute')) };
  } catch {
    const iso = date.toISOString();
    return { date: iso.slice(0, 10), hour: date.getUTCHours(), minute: date.getUTCMinutes() };
  }
}

/** Local calendar date, YYYY-MM-DD. */
function today() {
  return parts().date;
}

/** Minutes since local midnight. */
function nowMinutes() {
  const p = parts();
  return p.hour * 60 + p.minute;
}

function toMinutes(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
}

/** True for a real calendar date in YYYY-MM-DD form (rejects 2026-02-31). */
function isValidDate(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr || '')) return false;
  const d = new Date(`${dateStr}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === dateStr;
}

/** Whole days from `a` to `b` (both YYYY-MM-DD). */
function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

/** "14:30" -> "2:30 pm" for messages people read. */
function fmtSlot(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return String(hhmm);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'pm' : 'am'}`;
}

/** Hospital-local { date: 'YYYY-MM-DD', hour } for a timestamp (analytics buckets). */
function at(ts) {
  const p = parts(new Date(ts));
  return { date: p.date, hour: p.hour };
}

module.exports = { today, nowMinutes, toMinutes, isValidDate, daysBetween, fmtSlot, at };
