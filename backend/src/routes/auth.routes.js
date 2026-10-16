const router = require('express').Router();
const Joi = require('joi');
const { validate } = require('../middleware/validate');
const { normalizeUsername } = require('../middleware/username');
const asyncHandler = require('../utils/asyncHandler');
const controller = require('../controllers/auth.controller');

const loginSchema = Joi.object({
  username: Joi.string().min(3).max(50).required(),
  password: Joi.string().min(8).max(200).required(),
});

router.post('/login', normalizeUsername(), validate(loginSchema), asyncHandler(controller.login));

module.exports = router;
