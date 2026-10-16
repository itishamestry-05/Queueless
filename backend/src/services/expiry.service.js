const { refs } = require('../config/firebase');
const analytics = require('./analytics.service');

const SWEEP_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes
let sweepTimer = null;

function isStale(t, now) {
  // Referred patients are physically in the building (transferred between
  // counters) — never auto-expire them, even if their clock lapses.
  return t && t.status === 'waiting' && t.referred !== true && t.expiresAt && t.expiresAt < now;
}

function logExpiry(token, at) {
  analytics.logEvent({
    event_type: 'token_expired',
    token_id: token.id,
    token_number: token.number,
    service: token.service,
    timestamp: at,
  }).catch(() => {});
  analytics.upsertTokenRecord({ ...token, status: 'expired', expiredAt: at }).catch(() => {});
}

async function sweepExpiredTokens() {
  try {
    const all = (await refs.tokens().once('value')).val() || {};
    const now = Date.now();
    let count = 0;

    for (const [id, token] of Object.entries(all)) {
      if (isStale(token, now)) {
        // Re-check inside the transaction: the token may have been called since the read.
        // cur is null on the SDK's first (uncached) pass: return null so it
        // fetches the real value and calls us again instead of aborting.
        const result = await refs.token(id).transaction(cur =>
          (cur === null ? null : isStale(cur, now) ? { ...cur, status: 'expired', expiredAt: now, expiryLogged: true } : undefined));
        if (result?.committed) { count++; logExpiry(token, now); }
      } else if (token?.status === 'expired' && token.expiryLogged !== true) {
        // Expired by the Cloud Function: record it in analytics once.
        await refs.token(id).update({ expiryLogged: true });
        logExpiry(token, token.expiredAt || now);
      }
    }
    if (count > 0) console.log(`[expiry] Marked ${count} token(s) as expired.`);
  } catch (err) {
    console.error('[expiry] Sweep failed (non-fatal):', err.message);
  }
}

function startExpirySweep() {
  if (sweepTimer) return;
  // Run once immediately on boot, then on interval.
  sweepExpiredTokens();
  sweepTimer = setInterval(sweepExpiredTokens, SWEEP_INTERVAL_MS);
  console.log('[expiry] Token expiry sweeper started (every 5 min).');
}

function stopExpirySweep() {
  if (sweepTimer) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
}

module.exports = { startExpirySweep, stopExpirySweep, sweepExpiredTokens };
