// Dates and times as shown to people: Indian format (en-IN) on the hospital's
// clock. The zone comes from /config (APP_TIMEZONE, IST by default), so a
// patient booking from abroad or a laptop set to UTC still sees hospital time.

export const LOCALE = 'en-IN';
let timeZone = 'Asia/Kolkata';

export function setHospitalTimeZone(tz) {
  if (!tz) return;
  try {
    new Intl.DateTimeFormat(LOCALE, { timeZone: tz });
    timeZone = tz;
  } catch { /* unknown zone: keep the previous one */ }
}

export const hospitalTimeZone = () => timeZone;

const fmt = (value, options) => {
  if (value === null || value === undefined || value === '') return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(LOCALE, { timeZone, ...options });
};

/** 28 Sept 2026 */
export const fmtDate = (v) => fmt(v, { day: 'numeric', month: 'short', year: 'numeric' });
/** 10:30 am */
export const fmtTime = (v) => fmt(v, { hour: 'numeric', minute: '2-digit', hour12: true });
/** 28 Sept 2026, 10:30 am */
export const fmtDateTime = (v) => fmt(v, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
/** 28 Sept, 10:30 am (compact lists) */
export const fmtShortDateTime = (v) => fmt(v, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
/** Mon */
export const fmtWeekday = (v) => fmt(v, { weekday: 'short' });
/** 10:30:15 am (live clocks) */
export const fmtClock = (v) => fmt(v, { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });

/** "14:30" slot value -> "2:30 pm" label. The value sent to the server stays 24-hour. */
export function fmtSlot(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return String(hhmm);
  const suffix = h >= 12 ? 'pm' : 'am';
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** Calendar date and minutes-since-midnight right now on the hospital's clock. */
export function hospitalNow(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const get = (t) => parts.find(p => p.type === t)?.value;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}
