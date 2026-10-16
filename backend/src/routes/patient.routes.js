const router = require('express').Router();
const Joi = require('joi');
const rateLimit = require('express-rate-limit');
const { validate } = require('../middleware/validate');
const { requirePatient } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const patientService = require('../services/patient.service');
const appointmentService = require('../services/appointment.service');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please retry in 15 minutes.' },
});

// Patients register with an Indian mobile number (stored as "+91 98765 43210").
const { indianMobile: phone } = require('../utils/phone');
const clock = require('../utils/clock');
// Birth date must be a real day between 1900 and today (hospital's day); tomorrow onward is refused.
const dob = Joi.string().allow('', null).custom((v, h) => {
  if (!v) return v;
  if (!clock.isValidDate(v)) return h.message('Date of birth must be a real date.');
  if (v > clock.today()) return h.message('Date of birth cannot be in the future.');
  if (v < '1900-01-01') return h.message('Date of birth must be after 1900.');
  return v;
});
const gender = Joi.string().valid('male', 'female', 'other').allow('', null);

const registerSchema = Joi.object({
  name: Joi.string().trim().min(2).max(80).required(),
  email: Joi.string().trim().email().max(120).required(),
  phone: phone.required(),
  password: Joi.string().min(8).max(200).required(),
  gender,
  dob,
});

const loginSchema = Joi.object({
  email: Joi.string().trim().email().required(),
  password: Joi.string().min(1).max(200).required(),
});

const profileSchema = Joi.object({
  name: Joi.string().trim().min(2).max(80),
  phone,
  gender,
  dob,
});

const passwordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(8).max(200).required(),
});

const bookSchema = Joi.object({
  service: Joi.string().pattern(/^[a-z0-9_-]{1,50}$/).required(),
  doctorId: Joi.string().pattern(/^[A-Za-z0-9_-]{3,30}$/).allow('', null),
  date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
  timeSlot: Joi.string().pattern(/^\d{2}:\d{2}$/).required(),
  reason: Joi.string().trim().max(300).allow('', null),
});

router.post('/register', authLimiter, validate(registerSchema), asyncHandler(async (req, res) => {
  res.status(201).json(await patientService.register(req.body));
}));

router.post('/login', authLimiter, validate(loginSchema), asyncHandler(async (req, res) => {
  res.json(await patientService.login(req.body.email, req.body.password));
}));

router.get('/me', requirePatient, asyncHandler(async (req, res) => {
  res.json(await patientService.getProfile(req.user.sub));
}));

router.put('/me', requirePatient, validate(profileSchema), asyncHandler(async (req, res) => {
  res.json(await patientService.updateProfile(req.user.sub, req.body));
}));

router.post('/me/change-password', requirePatient, validate(passwordSchema), asyncHandler(async (req, res) => {
  await patientService.changePassword(req.user.sub, req.body.currentPassword, req.body.newPassword);
  res.json({ message: 'Password updated.' });
}));

router.get('/me/appointments', requirePatient, asyncHandler(async (req, res) => {
  res.json(await appointmentService.listForPatient(req.user.sub));
}));

router.post('/me/appointments', requirePatient, validate(bookSchema), asyncHandler(async (req, res) => {
  const patient = await patientService.getRecord(req.user.sub);
  const record = await appointmentService.createAppointment({ ...req.body, patient });
  res.status(201).json(record);
}));

router.put('/me/appointments/:id/cancel', requirePatient, asyncHandler(async (req, res) => {
  res.json(await appointmentService.cancelAppointment(req.params.id, { patientId: req.user.sub }));
}));

module.exports = router;
