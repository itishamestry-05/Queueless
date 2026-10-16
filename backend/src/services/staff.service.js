const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config/env');
const { refs } = require('../config/firebase');
const accounts = require('./accounts.service');

const BCRYPT_ROUNDS = 10;

async function createStaff({ username, password, service, displayName, pin }) {
  await accounts.assertUsernameFree(username);
  accounts.assertPassword(password);
  if (typeof service !== 'string' || !/^[a-z0-9_-]{1,50}$/.test(service)) {
    throw Object.assign(new Error('Choose a valid queue for this staff member.'), { statusCode: 400 });
  }
  if (displayName !== undefined && displayName !== null && (typeof displayName !== 'string' || displayName.length > 50)) {
    throw Object.assign(new Error('Display name must be 50 characters or less.'), { statusCode: 400 });
  }
  if (pin !== undefined && pin !== null && pin !== '') {
    pin = String(pin);
    if (!/^\d{4,6}$/.test(pin)) throw Object.assign(new Error('PIN must be 4–6 digits.'), { statusCode: 400 });
    // PIN login signs in the first account whose PIN matches, so PINs must be unique.
    if (await findByPin(pin)) throw Object.assign(new Error('That PIN is already used by another staff member.'), { statusCode: 409 });
  } else {
    pin = null;
  }
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const pinHash = pin ? await bcrypt.hash(pin, BCRYPT_ROUNDS) : null;
  const record = {
    username,
    passwordHash,
    pinHash,
    displayName: displayName || username,
    service,
    role: 'staff',
    createdAt: Date.now(),
  };
  await refs.staffMember(username).set(record);
  return { username, displayName: record.displayName, service, role: 'staff', createdAt: record.createdAt, hasPin: !!pin };
}

async function findByPin(pin) {
  const snap = await refs.staff().once('value');
  for (const account of Object.values(snap.val() || {})) {
    if (account?.pinHash && await bcrypt.compare(pin, account.pinHash)) return account;
  }
  return null;
}

async function loginByPin(pin) {
  pin = pin === undefined || pin === null ? '' : String(pin);
  if (!/^\d{4,6}$/.test(pin)) {
    throw Object.assign(new Error('Invalid PIN format.'), { statusCode: 400 });
  }
  const account = await findByPin(pin);
  if (account) {
    const token = jwt.sign(
      { sub: account.username, role: 'staff', service: account.service, displayName: account.displayName },
      config.jwt.secret,
      { expiresIn: '12h' }
    );
    return {
      token,
      user: { username: account.username, role: 'staff', service: account.service, displayName: account.displayName },
    };
  }
  throw Object.assign(new Error('Invalid PIN.'), { statusCode: 401 });
}

async function loginStaff(username, password) {
  const snap = await refs.staffMember(username).once('value');
  const account = snap.val();

  // Constant-time compare to prevent user enumeration via timing.
  const dummyHash = '$2a$10$abcdefghijklmnopqrstuuW2j7n5p9LK0L1PZmQDqfyV5bKzN6eLm';
  const hash = account?.passwordHash || dummyHash;
  const ok = await bcrypt.compare(password, hash);

  if (!account || !ok) {
    const err = new Error('Invalid username or password.');
    err.statusCode = 401;
    throw err;
  }

  const token = jwt.sign(
    { sub: account.username, role: 'staff', service: account.service, displayName: account.displayName },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );

  return {
    token,
    expiresIn: config.jwt.expiresIn,
    user: { username: account.username, role: 'staff', service: account.service, displayName: account.displayName },
  };
}

async function listStaff() {
  const [staffSnap, presenceSnap] = await Promise.all([
    refs.staff().once('value'),
    refs.presence().once('value'),
  ]);
  const all = staffSnap.val() || {};
  const presence = presenceSnap.val() || {};
  // Never return password or PIN hashes: a 4-6 digit PIN hash falls to an
  // offline brute force in minutes.
  return Object.values(all).map(({ passwordHash, pinHash, ...rest }) => ({
    ...rest,
    hasPin: !!pinHash,
    // Heartbeats arrive every 30s; silence for 90s means the tab is gone.
    online: !!(presence[rest.username]?.online && Date.now() - (presence[rest.username]?.lastSeen || 0) < 90 * 1000),
    lastSeen: presence[rest.username]?.lastSeen || null,
  }));
}

async function deleteStaff(username) {
  await Promise.all([
    refs.staffMember(username).remove(),
    refs.presenceMember(username).remove(),
  ]);
}

async function assignStaffToQueue(username, service) {
  const svc = String(service || '').trim();
  if (!svc) throw Object.assign(new Error('service is required.'), { statusCode: 400 });
  const snap = await refs.staffMember(username).once('value');
  if (!snap.exists()) throw Object.assign(new Error('Staff account not found.'), { statusCode: 404 });
  await refs.staffMember(username).update({ service: svc });
  return { username, service: svc };
}

async function getStaffProfile(username) {
  const snap = await refs.staffMember(username).once('value');
  const a = snap.val();
  if (!a) throw Object.assign(new Error('Account not found.'), { statusCode: 404 });
  return { username: a.username, displayName: a.displayName || a.username, service: a.service, role: 'staff', createdAt: a.createdAt };
}

async function updateStaffProfile(username, { displayName }) {
  if (!displayName || !displayName.trim()) throw Object.assign(new Error('Display name is required.'), { statusCode: 400 });
  if (displayName.trim().length > 50) throw Object.assign(new Error('Display name must be 50 characters or less.'), { statusCode: 400 });
  await refs.staffMember(username).update({ displayName: displayName.trim() });
  return { displayName: displayName.trim() };
}

async function changeStaffPassword(username, currentPassword, newPassword) {
  const snap = await refs.staffMember(username).once('value');
  const account = snap.val();
  if (!account) throw Object.assign(new Error('Account not found.'), { statusCode: 404 });
  const ok = await bcrypt.compare(currentPassword, account.passwordHash);
  if (!ok) throw Object.assign(new Error('Current password is incorrect.'), { statusCode: 400 });
  if (newPassword.length < 8) throw Object.assign(new Error('New password must be at least 8 characters.'), { statusCode: 400 });
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await refs.staffMember(username).update({ passwordHash });
}

module.exports = { createStaff, loginStaff, loginByPin, listStaff, deleteStaff, getStaffProfile, updateStaffProfile, changeStaffPassword, assignStaffToQueue };
