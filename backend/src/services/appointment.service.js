/**
 * Hospital appointments: booking numbers, doctor assignment and slot locking.
 *
 * Each booked (doctor, date, time) is claimed with an RTDB transaction on
 * slotLocks/<doctor>/<date>/<HHMM>, so two patients racing for the same slot
 * cannot both win. Cancelling or reassigning releases the lock.
 */
const crypto = require('crypto');
const { refs } = require('../config/firebase');
const clock = require('../utils/clock');

const SLOT_TIMES = Object.freeze([
  '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '12:00', '12:30', '13:00', '13:30', '14:00', '14:30',
  '15:00', '15:30', '16:00', '16:30', '17:00',
]);
const MAX_DAYS_AHEAD = 60;
const OPEN_STATUSES = ['pending', 'confirmed'];

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

function slotKey(time) {
  return time.replace(':', '');
}

function validateDate(date) {
  if (!clock.isValidDate(date)) throw httpError(400, 'Enter a real date in YYYY-MM-DD format.');
}

// "Today" and "now" are the hospital's (APP_TIMEZONE), not the server's.
function validateDateSlot(date, timeSlot) {
  validateDate(date);
  if (!SLOT_TIMES.includes(timeSlot)) throw httpError(400, 'Pick one of the listed time slots.');
  const today = clock.today();
  if (date < today) throw httpError(400, 'That date has already passed.');
  if (date === today && clock.toMinutes(timeSlot) <= clock.nowMinutes()) {
    throw httpError(400, 'That time has already passed. Pick a later slot.');
  }
  if (clock.daysBetween(today, date) > MAX_DAYS_AHEAD) throw httpError(400, `Bookings open up to ${MAX_DAYS_AHEAD} days ahead.`);
}

async function lockSlot(doctor, date, time, apptId) {
  const result = await refs.slotLock(doctor, date, slotKey(time)).transaction(cur => (cur ? undefined : apptId));
  return !!result?.committed;
}

async function releaseSlot(doctor, date, time, apptId) {
  if (!doctor || !date || !time) return;
  const ref = refs.slotLock(doctor, date, slotKey(time));
  const snap = await ref.once('value');
  if (snap.val() === apptId) await ref.remove();
}

async function nextBookingNo(date) {
  const day = date.replace(/-/g, '').slice(2); // YYMMDD
  const result = await refs.bookingCounter(day).transaction(cur => (cur || 0) + 1);
  const n = result?.snapshot?.val() || 1;
  return `BK-${day}-${String(n).padStart(3, '0')}`;
}

async function getDoctor(username) {
  if (!username) return null;
  const snap = await refs.doctor(username).once('value');
  return snap.val();
}

async function activeDoctorsFor(service) {
  const snap = await refs.doctors().once('value');
  return Object.values(snap.val() || {})
    .filter(d => d.active !== false && d.specialty === service)
    .sort((a, b) => a.username.localeCompare(b.username));
}

async function allAppointments() {
  const snap = await refs.appointments().once('value');
  return Object.values(snap.val() || {});
}

function byDateTime(a, b) {
  const ka = `${a.date}T${a.timeSlot}`;
  const kb = `${b.date}T${b.timeSlot}`;
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}

/**
 * Book an appointment. `patient` is the signed-in patient (or null for the
 * legacy guest form). With no doctor chosen, the first free doctor in the
 * department is assigned; a department with no doctors books unassigned.
 */
async function createAppointment({ patient = null, name, phone, email, service, doctorId, date, timeSlot, reason }) {
  const displayName = (patient?.name || name || '').trim();
  if (!displayName) throw httpError(400, 'Please enter the patient name.');
  if (!service || typeof service !== 'string') throw httpError(400, 'Please choose a department.');
  validateDateSlot(date, timeSlot);

  if (patient) {
    const clash = (await allAppointments()).find(a =>
      a.patientId === patient.id && a.date === date && a.timeSlot === timeSlot && OPEN_STATUSES.includes(a.status));
    if (clash) throw httpError(409, `You already have a booking at this time${clash.bookingNo ? ` (${clash.bookingNo})` : ''}.`);
  }

  const id = crypto.randomUUID();
  let doctor = null;

  if (doctorId) {
    doctor = await getDoctor(doctorId);
    if (!doctor || doctor.active === false) throw httpError(404, 'That doctor is not available for booking.');
    if (doctor.specialty !== service) throw httpError(400, 'That doctor is not in the chosen department.');
    if (!(await lockSlot(doctor.username, date, timeSlot, id))) {
      throw httpError(409, `${doctor.displayName} is already booked at ${clock.fmtSlot(timeSlot)}. Pick another time.`);
    }
  } else {
    const candidates = await activeDoctorsFor(service);
    for (const d of candidates) {
      if (await lockSlot(d.username, date, timeSlot, id)) { doctor = d; break; }
    }
    if (candidates.length && !doctor) {
      throw httpError(409, `Every doctor in this department is booked at ${clock.fmtSlot(timeSlot)}. Pick another time.`);
    }
    // Without a doctor there is no slot lock, so the same time could be booked
    // endlessly. Allow that only before any doctor has been added.
    if (!candidates.length) {
      const anyDoctor = Object.values((await refs.doctors().once('value')).val() || {}).some(d => d.active !== false);
      if (anyDoctor) throw httpError(400, 'No doctor is available in this department. Choose another department.');
    }
  }

  try {
    const bookingNo = await nextBookingNo(date);
    const record = {
      id,
      bookingNo,
      name: displayName,
      service,
      date,
      timeSlot,
      phone: (patient?.phone || phone || '').trim() || null,
      email: (patient?.email || email || '').trim() || null,
      reason: reason?.trim() || null,
      patientId: patient?.id || null,
      doctorId: doctor?.username || null,
      doctorName: doctor?.displayName || null,
      bookedAt: Date.now(),
      status: 'pending',
      note: null,
    };
    await refs.appointment(id).set(record);
    await refs.bookingIndex(bookingNo).set(id);
    return record;
  } catch (err) {
    if (doctor) await releaseSlot(doctor.username, date, timeSlot, id).catch(() => {});
    throw err;
  }
}

/** Time slots for a department (or one doctor) on a date, each marked free or taken. */
async function getSlots({ service, doctor, date }) {
  validateDate(date);
  let doctors;
  if (doctor) {
    const d = await getDoctor(doctor);
    if (!d || d.active === false) throw httpError(404, 'That doctor is not available for booking.');
    doctors = [d];
  } else {
    doctors = await activeDoctorsFor(service);
  }
  const locks = await Promise.all(
    doctors.map(d => refs.slotLocksForDay(d.username, date).once('value').then(s => s.val() || {}))
  );
  return SLOT_TIMES.map(time => {
    const key = slotKey(time);
    // No doctors in the department yet: every slot stays open (booked unassigned).
    const freeDoctors = doctors.filter((d, i) => !locks[i][key]).length;
    return { time, available: doctors.length === 0 || freeDoctors > 0, freeDoctors };
  });
}

async function listForPatient(patientId) {
  return (await allAppointments()).filter(a => a.patientId === patientId).sort(byDateTime).reverse();
}

async function listForDoctor(username, date) {
  return (await allAppointments())
    .filter(a => a.doctorId === username && (!date || a.date === date))
    .sort(byDateTime);
}

async function getAppointment(id) {
  const snap = await refs.appointment(id).once('value');
  const appt = snap.val();
  if (!appt) throw httpError(404, 'Appointment not found.');
  return appt;
}

/** Look up by booking number ("BK-260929-002"), as printed and encoded in the patient's QR code. */
async function findByBookingNo(bookingNo) {
  const no = String(bookingNo || '').trim().toUpperCase();
  if (!/^BK-\d{6}-\d{3,}$/.test(no)) throw httpError(400, 'That is not a booking number. It looks like BK-260929-002.');
  const id = (await refs.bookingIndex(no).once('value')).val();
  if (!id) throw httpError(404, `No booking found with number ${no}.`);
  return getAppointment(id);
}

/** Cancel. When `patientId` is given the appointment must belong to that patient. */
async function cancelAppointment(id, { patientId } = {}) {
  const appt = await getAppointment(id);
  if (patientId && appt.patientId !== patientId) throw httpError(404, 'Appointment not found.');
  if (appt.status === 'cancelled') return appt;
  if (!OPEN_STATUSES.includes(appt.status)) throw httpError(400, 'This appointment is already finished.');
  await refs.appointment(id).update({ status: 'cancelled', cancelledAt: Date.now() });
  await releaseSlot(appt.doctorId, appt.date, appt.timeSlot, id);
  return { ...appt, status: 'cancelled' };
}

/** Admin: assign or move an appointment to a doctor in the same department. */
async function assignDoctor(id, doctorUsername) {
  const appt = await getAppointment(id);
  if (!OPEN_STATUSES.includes(appt.status)) throw httpError(400, 'Only pending or confirmed appointments can be reassigned.');
  const doctor = await getDoctor(doctorUsername);
  if (!doctor || doctor.active === false) throw httpError(404, 'Doctor not found or switched off.');
  if (doctor.specialty !== appt.service) throw httpError(400, 'That doctor is not in this appointment\'s department.');
  if (appt.doctorId === doctor.username) return appt;
  if (!(await lockSlot(doctor.username, appt.date, appt.timeSlot, id))) {
    throw httpError(409, `${doctor.displayName} is already booked at ${clock.fmtSlot(appt.timeSlot)} on ${appt.date}.`);
  }
  await refs.appointment(id).update({ doctorId: doctor.username, doctorName: doctor.displayName });
  await releaseSlot(appt.doctorId, appt.date, appt.timeSlot, id);
  return { ...appt, doctorId: doctor.username, doctorName: doctor.displayName };
}

/** Doctor: close out one of their own appointments. */
async function setDoctorOutcome(id, doctorUsername, status) {
  if (!['completed', 'no_show'].includes(status)) throw httpError(400, 'status must be "completed" or "no_show".');
  const appt = await getAppointment(id);
  if (appt.doctorId !== doctorUsername) throw httpError(404, 'Appointment not found.');
  if (!OPEN_STATUSES.includes(appt.status)) throw httpError(400, 'This appointment is already closed.');
  if (appt.date > clock.today()) throw httpError(400, 'You can only close an appointment on or after its day.');
  const patch = { status, finishedAt: Date.now() };
  await refs.appointment(id).update(patch);
  return { ...appt, ...patch };
}

// A prescription can be written or corrected for a visit that happened (or is
// happening): not for a cancelled or missed one, and not ahead of the day.
const RX_STATUSES = ['pending', 'confirmed', 'completed'];
const blank = (v) => (typeof v === 'string' ? v.trim() : v) || null;

/**
 * Doctor: save the prescription for one of their own appointments. With
 * `complete`, an open appointment is also closed as seen in the same step.
 * The patient reads it back through their own appointment list.
 */
async function savePrescription(id, doctorUsername, input, { complete = false } = {}) {
  const appt = await getAppointment(id);
  if (appt.doctorId !== doctorUsername) throw httpError(404, 'Appointment not found.');
  if (!RX_STATUSES.includes(appt.status)) throw httpError(400, 'A prescription cannot be written for a cancelled or missed appointment.');
  if (appt.date > clock.today()) throw httpError(400, 'You can write a prescription on or after the appointment day.');

  const medicines = (input.medicines || [])
    .map(m => ({
      name: blank(m.name),
      dosage: blank(m.dosage),
      frequency: blank(m.frequency),
      timing: blank(m.timing),
      duration: blank(m.duration),
      notes: blank(m.notes),
    }))
    .filter(m => m.name);
  const rx = {
    diagnosis: blank(input.diagnosis),
    medicines,
    tests: blank(input.tests),
    advice: blank(input.advice),
    followUpDate: blank(input.followUpDate),
  };
  if (!rx.diagnosis && !medicines.length && !rx.tests && !rx.advice) {
    throw httpError(400, 'Add a diagnosis, a medicine, a test or advice before saving.');
  }
  if (rx.followUpDate) {
    if (!clock.isValidDate(rx.followUpDate)) throw httpError(400, 'Enter a real follow-up date.');
    if (rx.followUpDate <= appt.date) throw httpError(400, 'The follow-up date must be after this visit.');
  }

  const doctor = await getDoctor(doctorUsername);
  const now = Date.now();
  const prescription = {
    ...rx,
    doctorName: doctor?.displayName || appt.doctorName || null,
    doctorQualification: doctor?.qualification || null,
    writtenAt: appt.prescription?.writtenAt || now,
    updatedAt: now,
  };
  const patch = { prescription };
  if (complete && OPEN_STATUSES.includes(appt.status)) {
    patch.status = 'completed';
    patch.finishedAt = now;
  }
  await refs.appointment(id).update(patch);
  return { ...appt, ...patch };
}

async function countOpenForDoctor(username) {
  const today = clock.today();
  return (await allAppointments())
    .filter(a => a.doctorId === username && OPEN_STATUSES.includes(a.status) && a.date >= today).length;
}

module.exports = {
  SLOT_TIMES,
  createAppointment,
  getSlots,
  listForPatient,
  listForDoctor,
  getAppointment,
  findByBookingNo,
  cancelAppointment,
  assignDoctor,
  setDoctorOutcome,
  savePrescription,
  countOpenForDoctor,
};
