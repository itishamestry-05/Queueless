/**
 * Notification Center (v1.3.5 Phase 3).
 *
 * Subscribes to the event bus and turns domain events into per-user
 * notifications. Like messaging, notification content is stored in RTDB but
 * served only through the JWT API; a content-free `notificationSignals/$user`
 * node drives real-time delivery.
 */
const crypto = require('crypto');
const { refs } = require('../config/firebase');
const config = require('../config/env');

// The signal node is publicly readable, so it is keyed by an opaque HMAC of the
// username instead of the username itself (which would list every account).
function signalKeyFor(username) {
  return crypto.createHmac('sha256', config.jwt.secret).update(`notify:${username}`).digest('hex').slice(0, 32);
}

async function adminUsernames() {
  const snap = await refs.admins().once('value');
  return Object.keys(snap.val() || {});
}

async function createNotification({ recipients = [], type = 'system', title, body = null, link = null }) {
  const unique = [...new Set(recipients.filter(Boolean))];
  const now = Date.now();
  await Promise.all(unique.map(async (username) => {
    const id = crypto.randomUUID();
    await refs.notification(username, id).set({
      id, type, title, body, link, read: false, createdAt: now,
    });
    await refs.notificationSignal(signalKeyFor(username)).set({ updatedAt: now });
  }));
  return { delivered: unique.length };
}

async function listFor(username) {
  const snap = await refs.notifications(username).once('value');
  const items = Object.values(snap.val() || {}).sort((a, b) => b.createdAt - a.createdAt);
  return { items, unread: items.filter(n => !n.read).length };
}

async function markRead(username, id) {
  const snap = await refs.notification(username, id).once('value');
  if (!snap.exists()) throw Object.assign(new Error('Notification not found.'), { statusCode: 404 });
  await refs.notification(username, id).update({ read: true });
  await refs.notificationSignal(signalKeyFor(username)).set({ updatedAt: Date.now() });
  return { id, read: true };
}

async function markAllRead(username) {
  const snap = await refs.notifications(username).once('value');
  const all = snap.val() || {};
  const ids = Object.keys(all).filter(id => !all[id].read);
  await Promise.all(ids.map(id => refs.notification(username, id).update({ read: true })));
  if (ids.length) await refs.notificationSignal(signalKeyFor(username)).set({ updatedAt: Date.now() });
  return { marked: ids.length };
}

// ---- Event handlers (registered in events/index.js) ----

async function onTokenReferred(p) {
  await createNotification({
    recipients: await adminUsernames(),
    type: 'queue',
    title: 'Token referred',
    body: `#${p.number} moved ${p.from} → ${p.to}`,
    link: '/admin',
  });
}

async function onQueueCreated(p) {
  await createNotification({
    recipients: await adminUsernames(),
    type: 'queue',
    title: 'Queue created',
    body: `“${p.label}” was added`,
    link: '/admin/queues',
  });
}

async function onQueueArchived(p) {
  await createNotification({
    recipients: await adminUsernames(),
    type: 'queue',
    title: 'Queue archived',
    body: `“${p.label}” was archived`,
    link: '/admin/queues',
  });
}

async function onMessageSent(p) {
  const recipients = (p.members || []).filter(u => u !== p.sender);
  if (!recipients.length) return;
  await createNotification({
    recipients,
    type: 'message',
    title: `New message from ${p.senderName}`,
    body: String(p.text || '').slice(0, 100),
    link: '#messages',
  });
}

/** One-time cleanup: signal nodes keyed by plain usernames (older versions). */
async function removeLegacySignals() {
  const all = (await refs.notificationSignalsAll().once('value')).val() || {};
  for (const key of Object.keys(all)) {
    if (!/^[0-9a-f]{32}$/.test(key)) await refs.notificationSignal(key).remove().catch(() => {});
  }
}

module.exports = { signalKeyFor, removeLegacySignals,
  createNotification, listFor, markRead, markAllRead,
  onTokenReferred, onQueueCreated, onQueueArchived, onMessageSent,
};
