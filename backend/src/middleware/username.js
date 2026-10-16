/**
 * Usernames double as database keys, and the database cannot store a dot in a
 * key. People naturally type "dr.mehta", so dots become underscores on the way
 * in, for sign-in and account creation alike: "dr.mehta" and "dr_mehta" are
 * the same account. Without this, a dotted username failed with "Invalid id."
 */
function normalizeUsername({ lowercase = false } = {}) {
  return (req, res, next) => {
    if (req.body && typeof req.body.username === 'string') {
      let u = req.body.username.trim().replace(/\./g, '_');
      if (lowercase) u = u.toLowerCase();
      req.body.username = u;
    }
    next();
  };
}

module.exports = { normalizeUsername };
