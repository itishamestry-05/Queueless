const authService = require('../services/auth.service');
const { isAdminTier, atLeast } = require('../config/roles');
const { refs } = require('../config/firebase');

function extractPayload(req, res) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    res.status(401).json({ error: 'Missing or malformed Authorization header. Expected: Bearer <token>.' });
    return null;
  }

  try {
    return authService.verifyToken(token);
  } catch (err) {
    const reason = err.name === 'TokenExpiredError' ? 'Token expired.' : 'Invalid token.';
    res.status(401).json({ error: reason });
    return null;
  }
}

// A JWT stays valid for hours, but accounts change: staff get removed, doctors
// switched off, admins demoted, staff moved to another queue. Re-read the
// account on every request so those changes apply immediately.
async function currentIdentity(payload) {
  const { role, sub } = payload;
  let snap;
  if (isAdminTier(role)) snap = await refs.admin(sub).once('value');
  else if (role === 'staff') snap = await refs.staffMember(sub).once('value');
  else if (role === 'doctor') snap = await refs.doctor(sub).once('value');
  else if (role === 'patient') snap = await refs.patient(sub).once('value');
  else return null;
  const account = snap.val();
  if (!account) return null;
  if (role === 'doctor' && account.active === false) return null;
  if (isAdminTier(role)) return { ...payload, role: account.role || 'admin' };
  if (role === 'staff') return { ...payload, service: account.service };
  if (role === 'doctor') return { ...payload, specialty: account.specialty, displayName: account.displayName };
  return payload;
}

// Verify the token, refresh the identity, then apply `allowed(user)`.
function gate(allowed, forbiddenMessage) {
  return async (req, res, next) => {
    const payload = extractPayload(req, res);
    if (!payload) return;
    let user;
    try {
      user = await currentIdentity(payload);
    } catch (err) {
      if (err.statusCode === 400) user = null; // unusable subject in the token
      else return next(err);
    }
    if (!user) return res.status(401).json({ error: 'Your account is no longer active. Please sign in again.' });
    if (!allowed(user)) return res.status(403).json({ error: forbiddenMessage });
    req.user = user;
    next();
  };
}

// Admin area: any admin-tier role (superadmin / admin / manager).
const requireAdmin = gate(u => isAdminTier(u.role), 'Forbidden - admin access required.');

// Admin-tier OR staff (used for shared features like messaging and the assistant).
const requireStaff = gate(u => isAdminTier(u.role) || u.role === 'staff', 'Forbidden.');

// Require a minimum admin-tier role (e.g. 'admin' for account management,
// 'superadmin' for role changes).
function requireRole(minRole) {
  return gate(u => isAdminTier(u.role) && atLeast(u.role, minRole), `Forbidden - ${minRole} role or higher required.`);
}

// Exact-role gate for the hospital portals. Admin tokens are deliberately NOT
// accepted here: a patient's or doctor's own data is only reachable with their
// own token, and admins use the /admin routes instead.
const requirePatient = gate(u => u.role === 'patient', 'Forbidden - patient sign-in required.');
const requireDoctor = gate(u => u.role === 'doctor', 'Forbidden - doctor sign-in required.');

module.exports = { requireAdmin, requireStaff, requireRole, requirePatient, requireDoctor };
