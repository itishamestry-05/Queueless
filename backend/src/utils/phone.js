/**
 * Indian mobile numbers. Accepts what people actually type ("98765 43210",
 * "+91-98765-43210", "09876543210", "919876543210") and stores one form:
 * "+91 98765 43210". Mobile numbers in India are 10 digits starting 6-9.
 */
const Joi = require('joi');

function normalizeIndianMobile(input) {
  const digits = String(input ?? '').replace(/[\s\-().]/g, '');
  const m = digits.match(/^(?:\+?91|0)?([6-9]\d{9})$/);
  if (!m) return null;
  return `+91 ${m[1].slice(0, 5)} ${m[1].slice(5)}`;
}

// Joi field: validates and converts to the stored form.
const indianMobile = Joi.string().trim().max(20).custom((value, helpers) => {
  const normalized = normalizeIndianMobile(value);
  return normalized || helpers.error('phone.invalid');
}).messages({ 'phone.invalid': 'Enter a 10-digit Indian mobile number, e.g. 98765 43210.' });

module.exports = { normalizeIndianMobile, indianMobile };
