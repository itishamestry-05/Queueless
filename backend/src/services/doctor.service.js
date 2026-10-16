/**
 * Doctor accounts. Created and managed by admins; each doctor belongs to one
 * department (`specialty`, the same key as a service/queue, e.g. "eye_specialist").
 */
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config/env');
const { refs } = require('../config/firebase');
const appointmentService = require('./appointment.service');
const accounts = require('./accounts.service');
const { normalizeIndianMobile } = require('../utils/phone');

// Mobiles get the standard +91 form; landlines and extensions are kept as typed.
const tidyPhone = (p) => (p ? normalizeIndianMobile(p) || String(p).trim() : null);

const BCRYPT_ROUNDS = 10;
const DUMMY_HASH = '$2a$10$abcdefghijklmnopqrstuuW2j7n5p9LK0L1PZmQDqfyV5bKzN6eLm';

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

function toAdminView(d) {
  const { passwordHash, ...rest } = d;
  return { ...rest, active: d.active !== false };
}

function toPublicView(d) {
  return {
    username: d.username,
    displayName: d.displayName,
    specialty: d.specialty,
    qualification: d.qualification || null,
  };
}

async function getRecord(username) {
  const snap = await refs.doctor(username).once('value');
  const d = snap.val();
  if (!d) throw httpError(404, 'Doctor not found.');
  return d;
}

async function createDoctor({ username, password, displayName, specialty, qualification, phone, email }) {
  await accounts.assertUsernameFree(username);
  const record = {
    username,
    passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
    displayName: displayName.trim(),
    specialty,
    qualification: qualification?.trim() || null,
    phone: tidyPhone(phone),
    email: email?.trim() || null,
    role: 'doctor',
    active: true,
    createdAt: Date.now(),
  };
  const result = await refs.doctor(username).transaction(cur => (cur ? undefined : record));
  if (!result?.committed) throw httpError(409, `A doctor with username "${username}" already exists.`);
  return toAdminView(record);
}

async function listDoctors({ specialty, includeInactive = true } = {}) {
  const snap = await refs.doctors().once('value');
  return Object.values(snap.val() || {})
    .filter(d => includeInactive || d.active !== false)
    .filter(d => !specialty || d.specialty === specialty)
    .sort((a, b) => String(a.displayName || '').localeCompare(String(b.displayName || '')));
}

async function listForAdmin() {
  return (await listDoctors()).map(toAdminView);
}

async function listPublic(specialty) {
  return (await listDoctors({ specialty, includeInactive: false })).map(toPublicView);
}

async function updateDoctor(username, { displayName, specialty, qualification, phone, email, active, password }) {
  const current = await getRecord(username);
  const patch = {};
  if (displayName !== undefined) patch.displayName = displayName.trim();
  if (qualification !== undefined) patch.qualification = qualification?.trim() || null;
  if (phone !== undefined) patch.phone = tidyPhone(phone);
  if (email !== undefined) patch.email = email?.trim() || null;
  if (active !== undefined) patch.active = !!active;
  if (password) patch.passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  if (specialty !== undefined && specialty !== current.specialty) {
    // Open bookings are tied to the old department; moving the doctor would
    // leave them pointing at a doctor who no longer covers it.
    const open = await appointmentService.countOpenForDoctor(username);
    if (open) throw httpError(409, `Reassign or cancel this doctor's ${open} upcoming appointment(s) before changing department.`);
    patch.specialty = specialty;
  }
  await refs.doctor(username).update(patch);
  return toAdminView({ ...current, ...patch });
}

async function deleteDoctor(username) {
  await getRecord(username);
  const open = await appointmentService.countOpenForDoctor(username);
  if (open) {
    throw httpError(409, `This doctor has ${open} upcoming appointment(s). Reassign or cancel them first, or switch the doctor off instead.`);
  }
  await refs.doctor(username).remove();
}

async function login(username, password) {
  const snap = await refs.doctor(username).once('value');
  const d = snap.val();
  const ok = await bcrypt.compare(password, d?.passwordHash || DUMMY_HASH);
  if (!d || !ok) throw httpError(401, 'Invalid username or password.');
  if (d.active === false) throw httpError(403, 'This account is switched off. Contact the hospital admin.');
  const user = { username: d.username, role: 'doctor', displayName: d.displayName, specialty: d.specialty };
  const token = jwt.sign(
    { sub: d.username, role: 'doctor', displayName: d.displayName, specialty: d.specialty },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
  return { token, expiresIn: config.jwt.expiresIn, user };
}

async function getProfile(username) {
  return toAdminView(await getRecord(username));
}

async function updateOwnProfile(username, { displayName, qualification, phone }) {
  // Doctors may edit their contact details, not their department or status.
  return updateDoctor(username, { displayName, qualification, phone });
}

async function changePassword(username, currentPassword, newPassword) {
  const d = await getRecord(username);
  const ok = await bcrypt.compare(currentPassword, d.passwordHash);
  if (!ok) throw httpError(400, 'Current password is incorrect.');
  await refs.doctor(username).update({ passwordHash: await bcrypt.hash(newPassword, BCRYPT_ROUNDS) });
}

module.exports = {
  createDoctor, listForAdmin, listPublic, updateDoctor, deleteDoctor,
  login, getProfile, updateOwnProfile, changePassword,
};
