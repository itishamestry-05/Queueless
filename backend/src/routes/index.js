const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const Joi = require('joi');
const rateLimit = require('express-rate-limit');
const { validate } = require('../middleware/validate');
const { indianMobile } = require('../utils/phone');
const { refs } = require('../config/firebase');
const appointmentService = require('../services/appointment.service');
const doctorService = require('../services/doctor.service');

router.use('/auth',     require('./auth.routes'));
router.use('/tokens',   require('./token.routes'));
router.use('/admin',    require('./admin.routes'));
router.use('/staff',    require('./staff.routes'));
router.use('/assistant', require('./assistant.routes'));
router.use('/patients',  require('./patient.routes'));
router.use('/doctor',    require('./doctor.routes'));
router.use(require('./messaging.routes')); // /conversations, /directory (per-route auth)
router.use(require('./share.routes'));     // /shares (auth), /share/:id (public capability)
router.use(require('./upload.routes'));    // /uploads (auth) — RTDB-backed shared files

router.post('/feedback', asyncHandler(require('../controllers/feedback.controller').submitFeedback));

router.get('/config', asyncHandler(async (req, res) => {
  const queueAdminService = require('../services/queueAdmin.service');
  const analyticsService = require('../services/analytics.service');
  const config = require('../config/env');
  const [snap, activeQueues, stats] = await Promise.all([
    refs.appConfig().once('value'),
    queueAdminService.getActiveQueues().catch(() => []),
    analyticsService.getTrafficStats().catch(() => ({})),
  ]);
  const cfg = snap.val() || { industry: 'general', orgName: 'QueueLess' };
  // Live average service time (observed waits when available, configured
  // default otherwise) so customer-facing wait previews are never static.
  const avgServiceSeconds = Math.round(
    (stats.avgWaitSeconds > 0 ? stats.avgWaitSeconds : config.queue.avgServiceTimeSeconds) || 180
  );
  // Custom queues (admin-defined) take precedence over the static industry
  // profile on the frontend; empty array means "fall back to industry defaults".
  // timezone lets every screen show times on the hospital's clock (IST by default).
  res.json({ ...cfg, queues: activeQueues, avgServiceSeconds, timezone: config.timezone });
}));

// Public: the same data the Firebase live feed carries (queue state, public
// token records, announcement). Screens poll this when real-time updates are
// unavailable, so they keep updating. Names and notes are never in here.
router.get('/queue/live', asyncHandler(async (req, res) => {
  const [stateSnap, tokensSnap, announcementSnap] = await Promise.all([
    refs.queueState().once('value'),
    refs.tokens().once('value'),
    refs.announcement().once('value'),
  ]);
  res.set('Cache-Control', 'no-store');
  res.json({
    state: stateSnap.val(),
    tokens: tokensSnap.val() || {},
    announcement: announcementSnap.val() || null,
    at: Date.now(),
  });
}));

// Public: live announcement (used by display board + customer pages)
router.get('/announcement', asyncHandler(async (req, res) => {
  const snap = await refs.announcement().once('value');
  res.json(snap.val() || null);
}));

// Public: book appointment (guest form, no account). Signed-in patients book
// through POST /patients/me/appointments so the booking is linked to them.
const guestBookingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many bookings from this address. Please sign in or try again later.' },
  skip: () => process.env.NODE_ENV === 'test',
});

const guestBookingSchema = Joi.object({
  name: Joi.string().trim().min(2).max(80).required(),
  service: Joi.string().pattern(/^[a-z0-9_-]{1,50}$/).required(),
  doctorId: Joi.string().pattern(/^[A-Za-z0-9_-]{3,30}$/).allow('', null),
  date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
  timeSlot: Joi.string().pattern(/^\d{2}:\d{2}$/).required(),
  phone: indianMobile.allow('', null),
  email: Joi.string().trim().email().max(120).allow('', null),
  reason: Joi.string().trim().max(300).allow('', null),
});

router.post('/appointments', guestBookingLimiter, validate(guestBookingSchema), asyncHandler(async (req, res) => {
  const { name, service, doctorId, date, timeSlot, phone, email, reason } = req.body;
  const record = await appointmentService.createAppointment({ name, service, doctorId, date, timeSlot, phone, email, reason });
  res.status(201).json(record);
}));

// Public: free/taken time slots for a department or a single doctor.
router.get('/appointments/slots', asyncHandler(async (req, res) => {
  const { service, doctor, date } = req.query;
  if (!date || (!service && !doctor)) {
    return res.status(400).json({ error: 'date and either service or doctor are required.' });
  }
  res.json(await appointmentService.getSlots({ service, doctor, date }));
}));

// Public: bookable doctors, optionally filtered by department.
router.get('/doctors', asyncHandler(async (req, res) => {
  res.json(await doctorService.listPublic(req.query.specialty || null));
}));

router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'queueless-backend', timestamp: new Date().toISOString() });
});

module.exports = router;
