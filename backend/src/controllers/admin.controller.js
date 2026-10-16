const bcrypt = require('bcryptjs');
const queueService = require('../services/queue.service');
const queueAdminService = require('../services/queueAdmin.service');
const autoModeService = require('../services/autoMode.service');
const staffService = require('../services/staff.service');
const analyticsService = require('../services/analytics.service');
const predictionService = require('../services/prediction.service');
const auditService = require('../services/audit.service');
const authService = require('../services/auth.service');
const appointmentService = require('../services/appointment.service');
const doctorService = require('../services/doctor.service');
const accounts = require('../services/accounts.service');
const { refs } = require('../config/firebase');
const path = require('path');
const config = require('../config/env');

const BCRYPT_ROUNDS = 10;

async function callNext(req, res) {
  const result = await queueService.callNextToken(req.body.service, req.body.staffUsername || null);
  res.json(result);
}

async function callNextPriority(req, res) {
  const result = await queueService.callNextPriorityToken(req.body.staffUsername || null);
  res.json(result);
}

async function pause(req, res) {
  await queueService.pauseQueue();
  res.json({ message: 'Queue paused.' });
}

async function resume(req, res) {
  await queueService.resumeQueue();
  res.json({ message: 'Queue resumed.' });
}

async function pauseService(req, res) {
  const { service } = req.body;
  if (!service || typeof service !== 'string' || !service.trim()) {
    throw Object.assign(new Error('service is required.'), { statusCode: 400 });
  }
  await queueService.pauseService(service.trim());
  res.json({ message: `Service "${service.trim()}" paused.` });
}

async function resumeService(req, res) {
  const { service } = req.body;
  if (!service || typeof service !== 'string' || !service.trim()) {
    throw Object.assign(new Error('service is required.'), { statusCode: 400 });
  }
  await queueService.resumeService(service.trim());
  res.json({ message: `Service "${service.trim()}" resumed.` });
}

async function activeQueue(req, res) {
  const data = await queueService.getActiveQueue();
  res.json(data);
}

async function reset(req, res) {
  await autoModeService.stopAutoMode();
  await queueService.resetQueue();
  res.json({ message: 'Queue reset.' });
}

async function getAnalytics(req, res) {
  const data = await analyticsService.getTrafficStats();
  res.json(data);
}

async function exportAnalyticsCsv(req, res) {
  const filepath = path.resolve(__dirname, '..', '..', config.analytics.csvPath);
  res.download(filepath, 'queue_events.csv', err => {
    if (err && !res.headersSent) res.status(404).json({ error: 'CSV file not found yet.' });
  });
}

async function getStaffMetrics(req, res) {
  const data = await analyticsService.getStaffMetrics();
  res.json(data);
}

async function getPredictions(req, res) {
  const data = await predictionService.getPredictions();
  res.json(data);
}

async function getAuditLog(req, res) {
  res.json(await auditService.list({ limit: 200 }));
}

async function startAutoMode(req, res) {
  const { services } = req.body;
  const result = await autoModeService.startAutoMode(services);
  res.json({ message: 'Auto mode started.', ...result });
}

async function stopAutoMode(req, res) {
  await autoModeService.stopAutoMode();
  res.json({ message: 'Auto mode stopped.' });
}

async function getAutoModeStatus(req, res) {
  res.json({ running: autoModeService.isRunning() });
}

async function getAppConfig(req, res) {
  const snap = await refs.appConfig().once('value');
  res.json(snap.val() || { industry: 'general', orgName: 'QueueLess' });
}

const VALID_INDUSTRIES = ['general', 'bank', 'medical', 'restaurant'];
const HH_MM_REGEX = /^\d{2}:\d{2}$/;

async function updateAppConfig(req, res) {
  const { industry, orgName, location, slaMinutes, displayMessage, autoResetTime } = req.body;
  if (industry && !VALID_INDUSTRIES.includes(industry)) {
    throw Object.assign(new Error(`Invalid industry. Must be one of: ${VALID_INDUSTRIES.join(', ')}.`), { statusCode: 400 });
  }
  if (slaMinutes !== undefined && slaMinutes !== null) {
    const parsed = parseInt(slaMinutes, 10);
    if (isNaN(parsed) || parsed < 1) {
      throw Object.assign(new Error('slaMinutes must be a positive integer.'), { statusCode: 400 });
    }
  }
  if (autoResetTime !== undefined && autoResetTime !== null) {
    if (!HH_MM_REGEX.test(autoResetTime)) {
      throw Object.assign(new Error('autoResetTime must be in HH:MM format.'), { statusCode: 400 });
    }
  }

  const updates = {
    industry: industry ?? undefined,
    orgName: orgName ?? undefined,
    location: location ?? null,
    slaMinutes: slaMinutes !== undefined ? (slaMinutes === null ? null : parseInt(slaMinutes, 10)) : undefined,
    displayMessage: displayMessage !== undefined ? (displayMessage?.trim() || null) : undefined,
    autoResetTime: autoResetTime !== undefined ? (autoResetTime ?? null) : undefined,
  };

  Object.keys(updates).forEach(k => updates[k] === undefined && delete updates[k]);

  await refs.appConfig().update(updates);
  res.json({ message: 'Config updated.', ...updates });
}

async function getFeedback(req, res) {
  const snap = await refs.feedback().once('value');
  const all = Object.values(snap.val() || {});
  const avgRating = all.length > 0
    ? (all.reduce((s, f) => s + (f.rating || 0), 0) / all.length).toFixed(1)
    : null;
  res.json({ entries: all.sort((a, b) => b.submittedAt - a.submittedAt), avgRating, total: all.length });
}

async function listStaff(req, res) {
  const members = await staffService.listStaff();
  res.json(members);
}

async function createStaff(req, res) {
  const { username, password, service, displayName, pin } = req.body;
  const result = await staffService.createStaff({ username, password, service, displayName, pin });
  res.status(201).json(result);
}

async function removeStaff(req, res) {
  await staffService.deleteStaff(req.params.username);
  auditService.record({ actor: req.user.sub, action: 'staff.deleted', target: req.params.username });
  res.json({ message: 'Staff member removed.' });
}

async function assignStaffQueue(req, res) {
  const { username } = req.params;
  const result = await staffService.assignStaffToQueue(username, req.body?.service);
  res.json({ message: `${username} assigned to "${result.service}".`, ...result });
}

async function queueStaff(req, res) {
  const queue = await queueAdminService.getQueueOverviewById(req.params.id);
  const members = await staffService.listStaff();
  res.json(members.filter(m => m.service === queue.key));
}

async function queueAnalytics(req, res) {
  const queue = await queueAdminService.getQueueOverviewById(req.params.id);
  const stats = await analyticsService.getTrafficStats();
  res.json({
    key: queue.key,
    label: queue.label,
    waitingCount: queue.waitingCount,
    nowServing: queue.nowServing,
    estimatedWaitSeconds: queue.estimatedWaitSeconds,
    totalIssued: stats.serviceDistribution?.[queue.key] || 0,
    peakHours: stats.peakHoursByService?.[queue.key] || {},
    avgWaitSeconds: Math.round(stats.avgWaitSeconds || 0),
  });
}

async function skipToken(req, res) {
  const { tokenId } = req.params;
  const result = await queueService.skipToken(tokenId);
  res.json(result);
}

async function referToken(req, res) {
  const { tokenId } = req.params;
  const { toService, reason, staffUsername } = req.body || {};
  const result = await queueService.referToken(tokenId, {
    toService,
    reason: reason || null,
    byStaff: staffUsername || req.user?.sub || null,
  });
  res.json({ message: `Token #${result.referred.number} referred to "${result.to}".`, ...result });
}

async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  await authService.changePassword(req.user.sub, currentPassword, newPassword);
  res.json({ message: 'Password updated successfully.' });
}

async function getProfile(req, res) {
  const profile = await authService.getAdminProfile(req.user.sub);
  res.json(profile);
}

async function updateProfile(req, res) {
  const result = await authService.updateAdminProfile(req.user.sub, req.body);
  res.json({ message: 'Profile updated.', ...result });
}

async function setAnnouncement(req, res) {
  const { message } = req.body;
  if (!message?.trim()) throw Object.assign(new Error('Message is required.'), { statusCode: 400 });
  await refs.announcement().set({ message: message.trim(), createdAt: Date.now() });
  res.json({ message: 'Announcement set.' });
}

async function clearAnnouncement(req, res) {
  await refs.announcement().remove();
  res.json({ message: 'Announcement cleared.' });
}

async function setTokenNote(req, res) {
  const { tokenId } = req.params;
  const { note } = req.body;
  await queueService.setTokenNote(tokenId, note);
  res.json({ message: 'Note saved.' });
}

async function listAppointments(req, res) {
  const snap = await refs.appointments().once('value');
  const all = Object.values(snap.val() || {}).sort((a, b) => {
    const da = `${a.date}T${a.timeSlot}`;
    const db2 = `${b.date}T${b.timeSlot}`;
    return da < db2 ? -1 : da > db2 ? 1 : 0;
  });
  res.json(all);
}

async function cancelAppointment(req, res) {
  await appointmentService.cancelAppointment(req.params.id);
  auditService.record({ actor: req.user.sub, action: 'appointment.cancelled', target: req.params.id });
  res.json({ message: 'Appointment cancelled.' });
}

async function assignAppointmentDoctor(req, res) {
  const { doctorId } = req.body || {};
  if (!doctorId) throw Object.assign(new Error('doctorId is required.'), { statusCode: 400 });
  const appt = await appointmentService.assignDoctor(req.params.id, doctorId);
  auditService.record({ actor: req.user.sub, action: 'appointment.doctor_assigned', target: req.params.id, meta: { doctorId } });
  res.json(appt);
}

// ---- Doctors ----

const DOCTOR_USERNAME = /^[a-z0-9_-]{3,30}$/;

function checkDoctorFields(body, { creating }) {
  const { username, password, displayName, specialty, qualification, phone, email, active } = body || {};
  const bad = (msg) => { throw Object.assign(new Error(msg), { statusCode: 400 }); };
  // Types first: a number or object here would crash on .trim() further down.
  for (const [field, value, max] of [['displayName', displayName, 60], ['specialty', specialty, 50], ['qualification', qualification, 120],
    ['phone', phone, 20], ['email', email, 120], ['password', password, 200]]) {
    if (value !== undefined && value !== null && (typeof value !== 'string' || value.length > max)) bad(`${field} must be text of at most ${max} characters.`);
  }
  if (active !== undefined && typeof active !== 'boolean') bad('active must be true or false.');
  if (creating) {
    if (!DOCTOR_USERNAME.test(username || '')) bad('Username must be 3-30 characters: lowercase letters, digits, dots, - or _.');
    if (!displayName?.trim()) bad('Doctor name is required.');
    if (!specialty?.trim()) bad('Department is required.');
  }
  if (displayName !== undefined && (!String(displayName).trim() || String(displayName).length > 60)) bad('Doctor name must be 1-60 characters.');
  if (specialty !== undefined && (!/^[a-z0-9_-]{1,50}$/.test(specialty))) bad('Department is not valid.');
  if ((creating || password) && String(password || '').length < 8) bad('Password must be at least 8 characters.');
}

async function listDoctors(req, res) {
  res.json(await doctorService.listForAdmin());
}

async function createDoctor(req, res) {
  checkDoctorFields(req.body, { creating: true });
  const { username, password, displayName, specialty, qualification, phone, email } = req.body;
  const doctor = await doctorService.createDoctor({ username, password, displayName, specialty, qualification, phone, email });
  auditService.record({ actor: req.user.sub, action: 'doctor.created', target: username, meta: { specialty } });
  res.status(201).json(doctor);
}

async function updateDoctor(req, res) {
  checkDoctorFields(req.body, { creating: false });
  const { displayName, specialty, qualification, phone, email, active, password } = req.body || {};
  const doctor = await doctorService.updateDoctor(req.params.username, { displayName, specialty, qualification, phone, email, active, password });
  auditService.record({ actor: req.user.sub, action: 'doctor.updated', target: req.params.username });
  res.json(doctor);
}

async function deleteDoctor(req, res) {
  await doctorService.deleteDoctor(req.params.username);
  auditService.record({ actor: req.user.sub, action: 'doctor.deleted', target: req.params.username });
  res.json({ message: 'Doctor removed.' });
}

async function confirmAppointment(req, res) {
  const { id } = req.params;
  const snap = await refs.appointment(id).once('value');
  if (!snap.exists()) throw Object.assign(new Error('Appointment not found.'), { statusCode: 404 });
  if (snap.val().status !== 'pending') {
    throw Object.assign(new Error(`Only pending appointments can be confirmed (this one is ${snap.val().status}).`), { statusCode: 400 });
  }
  const patch = { status: 'confirmed', confirmedAt: Date.now(), confirmedBy: req.user.sub };
  await refs.appointment(id).update(patch);
  auditService.record({ actor: req.user.sub, action: 'appointment.confirmed', target: id });
  res.json({ message: 'Appointment confirmed.', appointment: { ...snap.val(), ...patch } });
}

// Reception scans the patient's QR code (or types the booking number).
async function lookupAppointment(req, res) {
  res.json(await appointmentService.findByBookingNo(req.params.bookingNo));
}

// ---- Queue management (custom queues within an Industry Type) ----

async function listQueues(req, res) {
  const queues = await queueAdminService.listQueues({ includeArchived: true });
  res.json(queues);
}

async function queuesOverview(req, res) {
  const overview = await queueAdminService.getQueuesOverview();
  res.json(overview);
}

async function getQueue(req, res) {
  const queue = await queueAdminService.getQueueOverviewById(req.params.id);
  res.json(queue);
}

async function createQueue(req, res) {
  const queue = await queueAdminService.createQueue(req.body || {});
  res.status(201).json({ message: `Queue "${queue.label}" created.`, queue });
}

async function updateQueue(req, res) {
  const queue = await queueAdminService.updateQueue(req.params.id, req.body || {});
  res.json({ message: 'Queue updated.', queue });
}

async function setQueueEnabled(req, res) {
  const result = await queueAdminService.setEnabled(req.params.id, req.body?.enabled);
  res.json({ message: result.enabled ? 'Queue enabled.' : 'Queue disabled.', ...result });
}

async function archiveQueue(req, res) {
  const result = await queueAdminService.archiveQueue(req.params.id);
  res.json({ message: 'Queue archived.', ...result });
}

async function deleteQueue(req, res) {
  const result = await queueAdminService.deleteQueue(req.params.id);
  auditService.record({ actor: req.user.sub, action: 'queue.deleted', target: req.params.id });
  res.json({ message: 'Queue deleted.', ...result });
}

async function reorderQueues(req, res) {
  const result = await queueAdminService.reorderQueues(req.body?.orderedIds);
  res.json({ message: 'Queues reordered.', ...result });
}

async function listAdmins(req, res) {
  const snap = await refs.admins().once('value');
  const all = snap.val() || {};
  const admins = Object.values(all).map(({ username, displayName, role }) => ({
    username,
    displayName: displayName || username,
    role: role || 'admin',
  }));
  res.json(admins);
}

async function createAdmin(req, res) {
  const { username, password, displayName, role } = req.body;
  const uname = typeof username === 'string' ? username.trim() : '';
  accounts.assertPassword(password);
  const desiredRole = role || 'admin';
  if (!['admin', 'manager'].includes(desiredRole)) {
    throw Object.assign(new Error('Role must be "admin" or "manager".'), { statusCode: 400 });
  }
  // Hospital admins are appointed by the super admin; admins may add managers.
  if (desiredRole === 'admin' && req.user.role !== 'superadmin') {
    throw Object.assign(new Error('Only a super admin can create admin accounts.'), { statusCode: 403 });
  }
  if (displayName !== undefined && displayName !== null && (typeof displayName !== 'string' || displayName.length > 50)) {
    throw Object.assign(new Error('Display name must be 50 characters or less.'), { statusCode: 400 });
  }

  const allSnap = await refs.admins().once('value');
  const existing = allSnap.val() || {};
  if (Object.keys(existing).length >= 10) {
    throw Object.assign(new Error('Maximum of 10 admin accounts allowed.'), { statusCode: 400 });
  }
  await accounts.assertUsernameFree(uname);

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const record = {
    username: uname,
    passwordHash,
    displayName: displayName?.trim() || uname,
    role: desiredRole,
    createdAt: Date.now(),
  };
  await refs.admin(uname).set(record);
  auditService.record({ actor: req.user.sub, action: 'admin.created', target: uname, meta: { role: desiredRole } });

  res.status(201).json({
    username: record.username,
    displayName: record.displayName,
    role: record.role,
    createdAt: record.createdAt,
  });
}

async function deleteAdmin(req, res) {
  const { username } = req.params;
  if (username === req.user.sub) {
    throw Object.assign(new Error('Cannot delete your own admin account.'), { statusCode: 400 });
  }
  const snap = await refs.admin(username).once('value');
  if (!snap.exists()) {
    throw Object.assign(new Error(`Admin "${username}" not found.`), { statusCode: 404 });
  }
  // Admins may remove managers; removing an admin or super admin takes a super admin.
  if (snap.val().role !== 'manager' && req.user.role !== 'superadmin') {
    throw Object.assign(new Error('Only a super admin can remove admin accounts.'), { statusCode: 403 });
  }
  await refs.admin(username).remove();
  auditService.record({ actor: req.user.sub, action: 'admin.deleted', target: username });
  res.json({ message: `Admin "${username}" deleted.` });
}

async function setAdminRole(req, res) {
  const { username } = req.params;
  const { role } = req.body || {};
  if (!['admin', 'manager', 'superadmin'].includes(role)) {
    throw Object.assign(new Error('Role must be "superadmin", "admin", or "manager".'), { statusCode: 400 });
  }
  if (username === req.user.sub) {
    throw Object.assign(new Error('You cannot change your own role.'), { statusCode: 400 });
  }
  const snap = await refs.admin(username).once('value');
  if (!snap.exists()) {
    throw Object.assign(new Error(`Admin "${username}" not found.`), { statusCode: 404 });
  }
  await refs.admin(username).update({ role });
  auditService.record({ actor: req.user.sub, action: 'admin.role_changed', target: username, meta: { role } });
  res.json({ username, role });
}

module.exports = {
  callNext, callNextPriority, pause, resume, activeQueue, reset,
  getAnalytics, exportAnalyticsCsv, getStaffMetrics, getPredictions, getAuditLog,
  startAutoMode, stopAutoMode, getAutoModeStatus,
  getAppConfig, updateAppConfig,
  getFeedback,
  listStaff, createStaff, removeStaff, assignStaffQueue,
  skipToken, referToken,
  changePassword,
  getProfile, updateProfile,
  setAnnouncement, clearAnnouncement,
  setTokenNote,
  listAppointments, cancelAppointment, confirmAppointment, assignAppointmentDoctor, lookupAppointment,
  listDoctors, createDoctor, updateDoctor, deleteDoctor,
  pauseService, resumeService,
  listAdmins, createAdmin, deleteAdmin, setAdminRole,
  queueStaff, queueAnalytics,
  listQueues, queuesOverview, getQueue, createQueue, updateQueue,
  setQueueEnabled, archiveQueue, deleteQueue, reorderQueues,
};
