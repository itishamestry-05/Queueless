/**
 * Patient accounts. Patients sign in with email + password; the record key is
 * a hash of the lower-cased email because RTDB keys cannot contain "." etc.
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config/env');
const { refs } = require('../config/firebase');

const BCRYPT_ROUNDS = 10;
const DUMMY_HASH = '$2a$10$abcdefghijklmnopqrstuuW2j7n5p9LK0L1PZmQDqfyV5bKzN6eLm';

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

function idForEmail(email) {
  return crypto.createHash('sha256').update(String(email).trim().toLowerCase()).digest('hex').slice(0, 24);
}

function toPublic(p) {
  return {
    id: p.id,
    name: p.name,
    email: p.email,
    phone: p.phone || null,
    gender: p.gender || null,
    dob: p.dob || null,
    createdAt: p.createdAt,
  };
}

function issueSession(p) {
  const user = { id: p.id, role: 'patient', name: p.name, displayName: p.name, email: p.email };
  const token = jwt.sign(
    { sub: p.id, role: 'patient', displayName: p.name, email: p.email },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
  return { token, expiresIn: config.jwt.expiresIn, user };
}

async function register({ name, email, phone, password, gender, dob }) {
  const normEmail = String(email).trim().toLowerCase();
  const id = idForEmail(normEmail);
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const record = {
    id,
    name: name.trim(),
    email: normEmail,
    phone: phone?.trim() || null,
    gender: gender || null,
    dob: dob || null,
    passwordHash,
    createdAt: Date.now(),
  };
  // Transaction so two sign-ups with the same email cannot overwrite each other.
  const result = await refs.patient(id).transaction(cur => (cur ? undefined : record));
  if (!result?.committed) throw httpError(409, 'An account with this email already exists. Sign in instead.');
  return issueSession(record);
}

async function login(email, password) {
  const snap = await refs.patient(idForEmail(email)).once('value');
  const account = snap.val();
  // Compare against a dummy hash for unknown emails so timing does not reveal
  // which emails are registered.
  const ok = await bcrypt.compare(password, account?.passwordHash || DUMMY_HASH);
  if (!account || !ok) throw httpError(401, 'Invalid email or password.');
  return issueSession(account);
}

async function getRecord(id) {
  const snap = await refs.patient(id).once('value');
  const p = snap.val();
  if (!p) throw httpError(404, 'Account not found.');
  return p;
}

async function getProfile(id) {
  return toPublic(await getRecord(id));
}

async function updateProfile(id, { name, phone, gender, dob }) {
  await getRecord(id);
  const patch = {};
  if (name !== undefined) patch.name = name.trim();
  if (phone !== undefined) patch.phone = phone?.trim() || null;
  if (gender !== undefined) patch.gender = gender || null;
  if (dob !== undefined) patch.dob = dob || null;
  await refs.patient(id).update(patch);
  return getProfile(id);
}

async function changePassword(id, currentPassword, newPassword) {
  const p = await getRecord(id);
  const ok = await bcrypt.compare(currentPassword, p.passwordHash);
  if (!ok) throw httpError(400, 'Current password is incorrect.');
  await refs.patient(id).update({ passwordHash: await bcrypt.hash(newPassword, BCRYPT_ROUNDS) });
}

module.exports = { register, login, getRecord, getProfile, updateProfile, changePassword, idForEmail };
