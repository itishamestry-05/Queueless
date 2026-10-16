/**
 * Rules shared by every staff-side account type (admins, staff, doctors).
 *
 * Messaging, notifications, AI chats, files and shares are keyed by username
 * alone, so a username must be unique across ALL account types. Otherwise a
 * manager could create a staff account called "boss" and read the superadmin's
 * messages.
 */
const { refs } = require('../config/firebase');

const USERNAME_RE = /^[A-Za-z0-9_-]{3,30}$/;

function badRequest(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

function assertUsernameFormat(username) {
  if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
    throw badRequest('Username must be 3-30 characters: letters, digits, dots, - or _.');
  }
}

async function assertUsernameFree(username) {
  assertUsernameFormat(username);
  const [a, s, d] = await Promise.all([
    refs.admin(username).once('value'),
    refs.staffMember(username).once('value'),
    refs.doctor(username).once('value'),
  ]);
  if (a.exists() || s.exists() || d.exists()) {
    throw badRequest(`The username "${username}" is already taken.`, 409);
  }
}

function assertPassword(password) {
  if (typeof password !== 'string' || password.length < 8 || password.length > 200) {
    throw badRequest('Password must be at least 8 characters.');
  }
}

module.exports = { USERNAME_RE, assertUsernameFormat, assertUsernameFree, assertPassword };
