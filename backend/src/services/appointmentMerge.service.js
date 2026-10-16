const { refs } = require('../config/firebase');
const queueService = require('./queue.service');
const analytics = require('./analytics.service');
const clock = require('../utils/clock');

const INTERVAL_MS = 60 * 1000;
const WINDOW_MINUTES = 5;
let timer = null;

// Hospital-local clock (APP_TIMEZONE, India by default).
const getCurrentMinutesSinceMidnight = clock.nowMinutes;
const getCurrentDateStr = clock.today;
const timeSlotToMinutes = clock.toMinutes;

async function mergeTick() {
  try {
    const snap = await refs.appointments().once('value');
    const all = snap.val() || {};
    const today = getCurrentDateStr();
    const nowMinutes = getCurrentMinutesSinceMidnight();

    const candidates = Object.values(all).filter(appt => {
      if (appt.status !== 'confirmed') return false;
      if (appt.tokenId) return false;
      if (appt.date !== today) return false;
      if (!appt.timeSlot || !/^\d{2}:\d{2}$/.test(appt.timeSlot)) return false;
      const slotMinutes = timeSlotToMinutes(appt.timeSlot);
      return nowMinutes >= slotMinutes && nowMinutes < slotMinutes + WINDOW_MINUTES;
    });

    for (const appt of candidates) {
      try {
        const token = await queueService.issueToken({
          service: appt.service || 'general',
          priority: 'priority',
          patientName: appt.name || null,
          email: appt.email || null,
        });
        await refs.appointment(appt.id).update({ tokenId: token.id, mergedAt: Date.now() });
        analytics.logEvent({
          event_type: 'appointment_merged',
          token_id: token.id,
          token_number: token.number,
          service: token.service,
          timestamp: Date.now(),
          appointment_id: appt.id,
        }).catch(err => console.error('[analytics]', err.message));
        console.log(`[appointmentMerge] Merged appointment ${appt.id} → token ${token.id} (#${token.number})`);
      } catch (err) {
        console.error(`[appointmentMerge] Failed to merge appointment ${appt.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[appointmentMerge] tick error (non-fatal):', err.message);
  }
}

function startAppointmentMerge() {
  if (timer) return;
  timer = setInterval(mergeTick, INTERVAL_MS);
  mergeTick();
  console.log('[appointmentMerge] Appointment merge service started (checks every minute).');
}

function stopAppointmentMerge() {
  if (timer) { clearInterval(timer); timer = null; }
}

module.exports = { startAppointmentMerge, stopAppointmentMerge };
