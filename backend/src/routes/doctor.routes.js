// Doctor portal (/doctor). Public doctor listing lives at GET /doctors in index.js.
const router = require('express').Router();
const Joi = require('joi');
const rateLimit = require('express-rate-limit');
const { validate } = require('../middleware/validate');
const { requireDoctor } = require('../middleware/auth');
const { normalizeUsername } = require('../middleware/username');
const asyncHandler = require('../utils/asyncHandler');
const doctorService = require('../services/doctor.service');
const appointmentService = require('../services/appointment.service');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please retry in 15 minutes.' },
});

const loginSchema = Joi.object({
  username: Joi.string().trim().min(3).max(30).required(),
  password: Joi.string().min(1).max(200).required(),
});

const profileSchema = Joi.object({
  displayName: Joi.string().trim().min(2).max(60),
  qualification: Joi.string().trim().max(120).allow('', null),
  phone: Joi.string().trim().max(20).allow('', null),
});

const passwordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(8).max(200).required(),
});

const listQuery = Joi.object({
  date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).allow(''),
});

const outcomeSchema = Joi.object({
  status: Joi.string().valid('completed', 'no_show').required(),
});

router.post('/login', loginLimiter, normalizeUsername({ lowercase: true }), validate(loginSchema), asyncHandler(async (req, res) => {
  res.json(await doctorService.login(req.body.username, req.body.password));
}));

router.get('/me', requireDoctor, asyncHandler(async (req, res) => {
  res.json(await doctorService.getProfile(req.user.sub));
}));

router.put('/me', requireDoctor, validate(profileSchema), asyncHandler(async (req, res) => {
  res.json(await doctorService.updateOwnProfile(req.user.sub, req.body));
}));

router.post('/me/change-password', requireDoctor, validate(passwordSchema), asyncHandler(async (req, res) => {
  await doctorService.changePassword(req.user.sub, req.body.currentPassword, req.body.newPassword);
  res.json({ message: 'Password updated.' });
}));

// Empty/absent date = all of the doctor's appointments.
router.get('/appointments', requireDoctor, validate(listQuery, 'query'), asyncHandler(async (req, res) => {
  res.json(await appointmentService.listForDoctor(req.user.sub, req.query.date || null));
}));

router.put('/appointments/:id/status', requireDoctor, validate(outcomeSchema), asyncHandler(async (req, res) => {
  res.json(await appointmentService.setDoctorOutcome(req.params.id, req.user.sub, req.body.status));
}));

const rxText = (max) => Joi.string().trim().max(max).allow('', null);
const medicineSchema = Joi.object({
  name: Joi.string().trim().min(1).max(100).required(),
  dosage: rxText(50),
  frequency: rxText(50),
  timing: Joi.string().valid('before_food', 'after_food', 'with_food', 'empty_stomach', 'bedtime', 'as_needed', '').allow(null),
  duration: rxText(50),
  notes: rxText(200),
});
const prescriptionSchema = Joi.object({
  diagnosis: rxText(500),
  medicines: Joi.array().items(medicineSchema).max(30).default([]),
  tests: rxText(500),
  advice: rxText(1000),
  followUpDate: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).allow('', null),
  // Also close the appointment as seen.
  complete: Joi.boolean().default(false),
});

router.put('/appointments/:id/prescription', requireDoctor, validate(prescriptionSchema), asyncHandler(async (req, res) => {
  const { complete, ...rx } = req.body;
  res.json(await appointmentService.savePrescription(req.params.id, req.user.sub, rx, { complete }));
}));

module.exports = router;
