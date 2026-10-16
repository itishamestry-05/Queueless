const { refs } = require('../config/firebase');
const queueService = require('./queue.service');
const clock = require('../utils/clock');

const INTERVAL_MS = 60 * 1000;
let timer = null;
let lastAutoResetDate = null;

// The reset fires on the first tick inside this window after autoResetTime,
// so a tick that lands a few seconds late does not skip the day.
const RESET_WINDOW_MINUTES = 10;

async function tick() {
  try {
    const cfgSnap = await refs.appConfig().once('value');
    const cfg = cfgSnap.val() || {};
    const autoResetTime = cfg.autoResetTime;
    if (!autoResetTime || !/^\d{2}:\d{2}$/.test(autoResetTime)) return;

    const today = clock.today();
    const since = clock.nowMinutes() - clock.toMinutes(autoResetTime);
    const alreadyDone = lastAutoResetDate === today || cfg.lastAutoResetDate === today;

    if (since >= 0 && since < RESET_WINDOW_MINUTES && !alreadyDone) {
      console.log(`[scheduler] Auto-reset triggered for ${autoResetTime} on ${today}.`);
      lastAutoResetDate = today;
      await refs.appConfig().update({ lastAutoResetDate: today });
      await queueService.resetQueue();
      console.log('[scheduler] Auto-reset completed.');
    }
  } catch (err) {
    console.error('[scheduler] tick error (non-fatal):', err.message);
  }
}

function startScheduler() {
  if (timer) return;
  timer = setInterval(tick, INTERVAL_MS);
  tick();
  console.log('[scheduler] Auto-reset scheduler started (checks every minute).');
}

function stopScheduler() {
  if (timer) { clearInterval(timer); timer = null; }
}

module.exports = { startScheduler, stopScheduler };
