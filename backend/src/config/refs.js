/**
 * Every RTDB path the backend touches, built from one place.
 *
 * Ids come from URLs and request bodies. RTDB treats '/' as a path separator
 * and collapses empty segments, so an id of '/' would turn 'shares/<id>' into
 * the whole 'shares' node. k() rejects anything that is not a single, legal key.
 */
const SAFE_KEY = /^[^/.#$[\]\u0000-\u001F\u007F]{1,128}$/;

function k(value) {
  const s = String(value ?? '');
  if (!SAFE_KEY.test(s)) throw Object.assign(new Error('Invalid id.'), { statusCode: 400 });
  return s;
}

function buildRefs(db) {
  return {
    queueState: () => db.ref('queue/state'),
    tokens: () => db.ref('queue/tokens'),
    token: (id) => db.ref(`queue/tokens/${k(id)}`),
    // Personal details for a token (patient name, referral notes). Kept out of
    // queue/tokens because that node is publicly readable for the live board.
    tokenPrivateAll: () => db.ref('queue/tokenPrivate'),
    tokenPrivate: (id) => db.ref(`queue/tokenPrivate/${k(id)}`),
    counter: () => db.ref('queue/counter'),
    callLock: () => db.ref('queue/callLock'),
    admins: () => db.ref('admins'),
    admin: (username) => db.ref(`admins/${k(username)}`),
    staff: () => db.ref('staff'),
    staffMember: (username) => db.ref(`staff/${k(username)}`),
    presence: () => db.ref('presence'),
    presenceMember: (username) => db.ref(`presence/${k(username)}`),
    appConfig: () => db.ref('config'),
    queues: () => db.ref('queues'),
    queueDef: (id) => db.ref(`queues/${k(id)}`),
    // Messaging — content lives here but is served only via the JWT API (never
    // client-readable). `messageSignals` is a content-free real-time trigger.
    conversations: () => db.ref('conversations'),
    conversationMeta: (id) => db.ref(`conversations/${k(id)}/meta`),
    conversationMessages: (id) => db.ref(`conversations/${k(id)}/messages`),
    conversationMessage: (id, mid) => db.ref(`conversations/${k(id)}/messages/${k(mid)}`),
    conversationReads: (id) => db.ref(`conversations/${k(id)}/reads`),
    conversationRead: (id, username) => db.ref(`conversations/${k(id)}/reads/${k(username)}`),
    messageSignal: (id) => db.ref(`messageSignals/${k(id)}`),
    // Notifications — content via JWT API only; `notificationSignals` is the
    // content-free real-time trigger (client-readable).
    notifications: (username) => db.ref(`notifications/${k(username)}`),
    notification: (username, id) => db.ref(`notifications/${k(username)}/${k(id)}`),
    notificationSignalsAll: () => db.ref('notificationSignals'),
    notificationSignal: (username) => db.ref(`notificationSignals/${k(username)}`),
    // AI conversation workspace — per-user persistent chats (served via JWT API).
    aiConversations: (u) => db.ref(`aiConversations/${k(u)}`),
    aiConversation: (u, cid) => db.ref(`aiConversations/${k(u)}/${k(cid)}`),
    aiConversationMeta: (u, cid) => db.ref(`aiConversations/${k(u)}/${k(cid)}/meta`),
    aiConversationMessages: (u, cid) => db.ref(`aiConversations/${k(u)}/${k(cid)}/messages`),
    aiConversationMessage: (u, cid, mid) => db.ref(`aiConversations/${k(u)}/${k(cid)}/messages/${k(mid)}`),
    // Secure shares (capability links) + audit log.
    shares: () => db.ref('shares'),
    share: (id) => db.ref(`shares/${k(id)}`),
    auditLogs: () => db.ref('auditLogs'),
    auditLog: (id) => db.ref(`auditLogs/${k(id)}`),
    // Shared files — stored in RTDB (free on the Spark plan; no Cloud Storage /
    // Blaze required). Metadata is indexed separately so listing never pulls blobs.
    uploads: () => db.ref('uploads'),
    upload: (id) => db.ref(`uploads/${k(id)}`),
    uploadIndex: (owner) => db.ref(`uploadIndex/${k(owner)}`),
    uploadIndexEntry: (owner, id) => db.ref(`uploadIndex/${k(owner)}/${k(id)}`),
    feedback: () => db.ref('feedback'),
    feedbackEntry: (tokenId) => db.ref(`feedback/${k(tokenId)}`),
    announcement: () => db.ref('queue/announcement'),
    appointments: () => db.ref('appointments'),
    appointment: (id) => db.ref(`appointments/${k(id)}`),
    // Hospital: patient accounts (keyed by a hash of the email), doctors (keyed by
    // username), per-day booking-number counters, booking-number lookup, and
    // per-doctor slot locks that stop two patients taking the same time.
    patients: () => db.ref('patients'),
    patient: (id) => db.ref(`patients/${k(id)}`),
    doctors: () => db.ref('doctors'),
    doctor: (username) => db.ref(`doctors/${k(username)}`),
    bookingCounter: (day) => db.ref(`bookingCounters/${k(day)}`),
    bookingIndex: (no) => db.ref(`bookingIndex/${k(no)}`),
    slotLock: (doctor, date, slot) => db.ref(`slotLocks/${k(doctor)}/${k(date)}/${k(slot)}`),
    slotLocksForDay: (doctor, date) => db.ref(`slotLocks/${k(doctor)}/${k(date)}`),

  };
}

module.exports = { buildRefs, safeKey: k };
