const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const asyncHandler = require('../utils/asyncHandler');
const { requireStaff } = require('../middleware/auth');
const { normalizeUsername } = require('../middleware/username');
const controller = require('../controllers/staff.controller');
const { refs } = require('../config/firebase');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please retry in 15 minutes.' },
});

router.post('/login',     loginLimiter, normalizeUsername(), asyncHandler(controller.login));
router.post('/login/pin', loginLimiter, asyncHandler(controller.loginPin));
router.get('/queue',      requireStaff, asyncHandler(controller.getQueue));
router.get('/queue/details', requireStaff, asyncHandler(async (req, res) => res.json(await require('../services/queue.service').getActiveTokenDetails())));
router.post('/queue/call-next',           requireStaff, asyncHandler(controller.callNext));
router.put('/queue/tokens/:tokenId/note', requireStaff, asyncHandler(controller.setTokenNote));
router.post('/queue/skip/:tokenId',       requireStaff, asyncHandler(async (req, res) => {
  res.json(await require('../services/queue.service').skipToken(req.params.tokenId));
}));
router.post('/queue/refer/:tokenId',      requireStaff, asyncHandler(controller.referToken));
// Heartbeat from the staff dashboard; the only way presence gets written.
router.post('/presence', requireStaff, asyncHandler(async (req, res) => {
  if (req.user.role !== 'staff') return res.json({ ok: true });
  await refs.presenceMember(req.user.sub).set({
    online: req.body?.online !== false,
    lastSeen: Date.now(),
    service: req.user.service || null,
    username: req.user.sub,
  });
  res.json({ ok: true });
}));
router.get('/profile',                    requireStaff, asyncHandler(controller.getProfile));
router.put('/profile',                    requireStaff, asyncHandler(controller.updateProfile));
router.post('/change-password',           requireStaff, asyncHandler(controller.changePassword));

module.exports = router;
