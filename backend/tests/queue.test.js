/**
 * Backend smoke tests.
 * Owner: Sufiyan (Deployment, CI/CD & Testing module).
 *
 * Strategy: mock the Firebase config layer entirely. We are not testing
 * Firebase here - we are testing that our HTTP layer wires up correctly and
 * that the queue service's pure logic behaves under known inputs.
 *
 * For full integration tests against real Firebase, see /tests/integration/
 * (added in v2 once a test project is provisioned).
 */

// Set required env vars BEFORE importing anything that reads them.
process.env.NODE_ENV = 'test';
process.env.PORT = '0';
process.env.CORS_ORIGIN = 'http://localhost:5173';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-test-secret-1234';
process.env.JWT_EXPIRES_IN = '1h';
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_PASSWORD = 'testpassword123';
process.env.FIREBASE_PROJECT_ID = 'test-project';
process.env.FIREBASE_CLIENT_EMAIL = 'test@test.iam.gserviceaccount.com';
process.env.FIREBASE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\\nfake\\n-----END PRIVATE KEY-----\\n';
process.env.FIREBASE_DATABASE_URL = 'https://test.firebaseio.com';
process.env.ANALYTICS_SINK = 'csv';
process.env.ANALYTICS_CSV_PATH = '/tmp/queueless_test_events.csv';

// Mock Firebase Admin entirely. A simple in-memory store mirrors the parts of
// the API our service uses: ref().once(), .set(), .update(), .remove(),
// .transaction().
jest.mock('../src/config/firebase', () => {
  const store = {};
  function get(path) {
    return path.split('/').reduce((acc, key) => (acc ? acc[key] : undefined), store);
  }
  function set(path, value) {
    const keys = path.split('/');
    let node = store;
    for (let i = 0; i < keys.length - 1; i++) {
      node[keys[i]] = node[keys[i]] || {};
      node = node[keys[i]];
    }
    node[keys[keys.length - 1]] = value;
  }
  function remove(path) {
    const keys = path.split('/');
    let node = store;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!node[keys[i]]) return;
      node = node[keys[i]];
    }
    delete node[keys[keys.length - 1]];
  }
  function makeRef(path) {
    return {
      once: async () => ({
        exists: () => get(path) !== undefined,
        val: () => get(path) ?? null,
      }),
      set: async (val) => set(path, val),
      update: async (patch) => set(path, { ...(get(path) || {}), ...patch }),
      remove: async () => remove(path),
      // Mirrors the Firebase SDK: the first pass sees the (empty) local cache,
      // i.e. null; if the server holds something else it retries with that.
      transaction: async (fn) => {
        const actual = get(path) ?? null;
        let next = fn(null);
        if (next === undefined) return { committed: false, snapshot: { val: () => actual } };
        if (actual !== null) {
          next = fn(JSON.parse(JSON.stringify(actual)));
          if (next === undefined) return { committed: false, snapshot: { val: () => actual } };
        }
        set(path, next);
        return { committed: true, snapshot: { val: () => next } };
      },
    };
  }
  return {
    admin: {},
    db: { ref: makeRef },
    // Real path table (with its id validation) over the in-memory store.
    refs: jest.requireActual('../src/config/refs').buildRefs({ ref: makeRef }),
    __resetStore: () => Object.keys(store).forEach(k => delete store[k]),
  };
});

const request = require('supertest');
const buildApp = require('../src/app');
const queueService = require('../src/services/queue.service');
const authService = require('../src/services/auth.service');
const notificationService = require('../src/services/notification.service');
const fs = require('fs');

let app;

beforeAll(async () => {
  await authService.bootstrapAdmin();
  await queueService.ensureInitialized();
  app = buildApp();
});

afterAll(() => {
  // Clean up test CSV.
  try { fs.unlinkSync('/tmp/queueless_test_events.csv'); } catch {}
});

describe('Health check', () => {
  test('GET /api/v1/health returns 200', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('Public token endpoints', () => {
  test('POST /api/v1/tokens issues a token with sequential number', async () => {
    const res1 = await request(app).post('/api/v1/tokens').send({});
    expect(res1.status).toBe(201);
    expect(res1.body.token.number).toBeGreaterThan(0);
    expect(res1.body.token.status).toBe('waiting');

    const res2 = await request(app).post('/api/v1/tokens').send({});
    expect(res2.body.token.number).toBe(res1.body.token.number + 1);
  });

  test('GET /api/v1/tokens/:id returns position and ETA', async () => {
    const issue = await request(app).post('/api/v1/tokens').send({});
    const id = issue.body.token.id;

    const res = await request(app).get(`/api/v1/tokens/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.positionInQueue).toBeGreaterThanOrEqual(1);
    expect(res.body.estimatedWaitSeconds).toBeGreaterThanOrEqual(0);
  });

  test('GET /api/v1/tokens/:id returns 404 for unknown token', async () => {
    const res = await request(app).get('/api/v1/tokens/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });
});

describe('Admin authentication', () => {
  test('POST /api/v1/auth/login with correct credentials returns JWT', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({
      username: 'admin',
      password: 'testpassword123',
    });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.username).toBe('admin');
  });

  test('POST /api/v1/auth/login with wrong password returns 401', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({
      username: 'admin',
      password: 'wrongpassword',
    });
    expect(res.status).toBe(401);
  });

  test('Admin route without token returns 401', async () => {
    const res = await request(app).get('/api/v1/admin/queue');
    expect(res.status).toBe(401);
  });
});

describe('Admin queue control', () => {
  let token;

  beforeAll(async () => {
    const res = await request(app).post('/api/v1/auth/login').send({
      username: 'admin',
      password: 'testpassword123',
    });
    token = res.body.token;
  });

  test('Pause then issue token returns 423', async () => {
    await request(app).post('/api/v1/admin/queue/pause').set('Authorization', `Bearer ${token}`);
    const res = await request(app).post('/api/v1/tokens').send({});
    expect(res.status).toBe(423);
    await request(app).post('/api/v1/admin/queue/resume').set('Authorization', `Bearer ${token}`);
  });

  test('Call-next promotes lowest-numbered waiting token', async () => {
    const res = await request(app)
      .post('/api/v1/admin/queue/call-next')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.called).toBeDefined();
    expect(res.body.called.status).toBe('called');
  });
});

describe('Token referral', () => {
  let adminToken;

  beforeAll(async () => {
    const res = await request(app).post('/api/v1/auth/login').send({
      username: 'admin',
      password: 'testpassword123',
    });
    adminToken = res.body.token;
  });

  test('issuing a token accepts an optional patient name', async () => {
    const res = await request(app).post('/api/v1/tokens').send({ service: 'general', patientName: 'Jane Doe' });
    expect(res.status).toBe(201);
    expect(res.body.token.patientName).toBe('Jane Doe');
    expect(res.body.token.referred).toBe(false);
  });

  test('refers an active token to another counter, keeping its number and flagging it', async () => {
    const issue = await request(app).post('/api/v1/tokens').send({ service: 'general', patientName: 'John Roe' });
    const t = issue.body.token;

    const res = await request(app)
      .post(`/api/v1/admin/queue/refer/${t.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ toService: 'eye', reason: 'prescribed eye exam' });

    expect(res.status).toBe(200);
    expect(res.body.referred.service).toBe('eye');
    expect(res.body.referred.number).toBe(t.number);  // same number follows the patient
    expect(res.body.referred.referred).toBe(true);
    expect(res.body.from).toBe('general');
    expect(res.body.to).toBe('eye');

    // The token is now merged into the eye counter's queue as waiting.
    const status = await request(app).get(`/api/v1/tokens/${t.id}`);
    expect(status.body.service).toBe('eye');
    expect(status.body.status).toBe('waiting');
    // The public status never carries the name; signed-in staff get it from details.
    expect(status.body.patientName).toBeUndefined();
    const details = await request(app).get('/api/v1/admin/queue/details').set('Authorization', `Bearer ${adminToken}`);
    expect(details.body[t.id].patientName).toBe('John Roe');
  });

  test('rejects referral to the same counter', async () => {
    const issue = await request(app).post('/api/v1/tokens').send({ service: 'general' });
    const res = await request(app)
      .post(`/api/v1/admin/queue/refer/${issue.body.token.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ toService: 'general' });
    expect(res.status).toBe(400);
  });

  test('rejects referral of an unknown token', async () => {
    const res = await request(app)
      .post('/api/v1/admin/queue/refer/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ toService: 'eye' });
    expect(res.status).toBe(404);
  });
});

describe('Queue management (custom queues)', () => {
  let adminToken;

  beforeAll(async () => {
    const res = await request(app).post('/api/v1/auth/login').send({
      username: 'admin',
      password: 'testpassword123',
    });
    adminToken = res.body.token;
  });

  test('GET /admin/queues/overview resolves (200 with auth, 401 without — never 404)', async () => {
    const noAuth = await request(app).get('/api/v1/admin/queues/overview');
    expect(noAuth.status).toBe(401); // route exists → auth required (not "Route not found")

    const ok = await request(app).get('/api/v1/admin/queues/overview').set('Authorization', `Bearer ${adminToken}`);
    expect(ok.status).toBe(200);
    expect(Array.isArray(ok.body)).toBe(true);
  });

  test('creates a queue with a derived key and prefix', async () => {
    const res = await request(app)
      .post('/api/v1/admin/queues')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ label: 'Eye Specialist', prefix: 'EY', avgServiceSeconds: 240 });
    expect(res.status).toBe(201);
    expect(res.body.queue.key).toBe('eye_specialist');
    expect(res.body.queue.prefix).toBe('EY');
    expect(res.body.queue.enabled).toBe(true);
    expect(res.body.queue.archived).toBe(false);
  });

  test('fetches a single queue with live stats by id', async () => {
    const create = await request(app)
      .post('/api/v1/admin/queues')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ label: 'Radiology Desk' });
    const id = create.body.queue.id;

    const res = await request(app).get(`/api/v1/admin/queues/${id}`).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(id);
    expect(res.body).toHaveProperty('waitingCount');

    const missing = await request(app).get('/api/v1/admin/queues/does-not-exist').set('Authorization', `Bearer ${adminToken}`);
    expect(missing.status).toBe(404);
  });

  test('rejects a duplicate queue key', async () => {
    const res = await request(app)
      .post('/api/v1/admin/queues')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ label: 'Eye Specialist' });
    expect(res.status).toBe(409);
  });

  test('lists created queues and exposes them on the public config', async () => {
    const list = await request(app).get('/api/v1/admin/queues').set('Authorization', `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    expect(list.body.some(q => q.key === 'eye_specialist')).toBe(true);

    const cfg = await request(app).get('/api/v1/config');
    expect(Array.isArray(cfg.body.queues)).toBe(true);
    expect(cfg.body.queues.some(q => q.key === 'eye_specialist')).toBe(true);
  });

  test('blocks deleting a queue that still has active tokens, allows after it clears', async () => {
    const create = await request(app)
      .post('/api/v1/admin/queues')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ label: 'Pharmacy Desk' });
    const queue = create.body.queue;

    // Seed a live token in that queue via the service (bypasses the HTTP
    // rate limiter, which isn't under test here).
    await queueService.issueToken({ service: queue.key });

    const blocked = await request(app)
      .delete(`/api/v1/admin/queues/${queue.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(blocked.status).toBe(400);

    // Archiving is always allowed.
    const archived = await request(app)
      .put(`/api/v1/admin/queues/${queue.id}/archive`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(archived.status).toBe(200);
    expect(archived.body.archived).toBe(true);
  });

  test('assigns a staff member to a queue and lists them', async () => {
    const create = await request(app)
      .post('/api/v1/admin/queues')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ label: 'Cardiology Desk' });
    const queue = create.body.queue;

    await request(app)
      .post('/api/v1/admin/staff')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ username: 'drcardio', password: 'staffpass123', service: 'general', displayName: 'Dr Cardio' });

    const assign = await request(app)
      .put('/api/v1/admin/staff/drcardio/service')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ service: queue.key });
    expect(assign.status).toBe(200);
    expect(assign.body.service).toBe(queue.key);

    const list = await request(app)
      .get(`/api/v1/admin/queues/${queue.id}/staff`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    expect(list.body.some(m => m.username === 'drcardio')).toBe(true);
  });
});

describe('Predictive insights', () => {
  let adminToken;

  beforeAll(async () => {
    const res = await request(app).post('/api/v1/auth/login').send({
      username: 'admin',
      password: 'testpassword123',
    });
    adminToken = res.body.token;
  });

  test('returns an explainable, deterministic prediction payload', async () => {
    const res = await request(app).get('/api/v1/admin/predictions').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('coldStart');
    expect(res.body).toHaveProperty('sampleSize');
    expect(Array.isArray(res.body.queues)).toBe(true);
    expect(Array.isArray(res.body.congestion)).toBe(true);
    expect(Array.isArray(res.body.recommendations)).toBe(true);
    // Every per-queue prediction must carry an explainable basis + confidence.
    res.body.queues.forEach(q => {
      expect(q).toHaveProperty('basis');
      expect(['low', 'medium', 'high']).toContain(q.confidence);
    });
  });

  test('requires authentication', async () => {
    const res = await request(app).get('/api/v1/admin/predictions');
    expect(res.status).toBe(401);
  });
});

describe('AI assistant', () => {
  let adminToken;

  beforeAll(async () => {
    const res = await request(app).post('/api/v1/auth/login').send({
      username: 'admin',
      password: 'testpassword123',
    });
    adminToken = res.body.token;
  });

  test('answers a grounded question from verified data', async () => {
    const res = await request(app)
      .post('/api/v1/assistant')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ question: 'Which queue has the longest waiting time?' });
    expect(res.status).toBe(200);
    expect(typeof res.body.answer).toBe('string');
    expect(res.body.answer.length).toBeGreaterThan(0);
    expect(res.body.provider).toBe('grounded');     // default zero-config provider
    expect(res.body.sources).toContain('queues_overview');
  });

  test('rejects an empty question', async () => {
    const res = await request(app)
      .post('/api/v1/assistant')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ question: '   ' });
    expect(res.status).toBe(400);
  });

  test('persists turns to a saved conversation (workspace)', async () => {
    const create = await request(app)
      .post('/api/v1/assistant/conversations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(create.status).toBe(201);
    const cid = create.body.id;

    const ask = await request(app)
      .post('/api/v1/assistant')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ question: 'How is staff performance?', conversationId: cid });
    expect(ask.status).toBe(200);
    expect(ask.body.conversationId).toBe(cid);

    const conv = await request(app)
      .get(`/api/v1/assistant/conversations/${cid}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(conv.status).toBe(200);
    // user + assistant turns persisted, and the title auto-derived from the question
    expect(conv.body.messages.length).toBe(2);
    expect(conv.body.messages[0].role).toBe('user');
    expect(conv.body.title).toMatch(/staff performance/i);

    const list = await request(app)
      .get('/api/v1/assistant/conversations')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(list.body.some(c => c.id === cid)).toBe(true);

    const del = await request(app)
      .delete(`/api/v1/assistant/conversations/${cid}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(del.status).toBe(200);
  });

  test('requires authentication', async () => {
    const res = await request(app).post('/api/v1/assistant').send({ question: 'hi' });
    expect(res.status).toBe(401);
  });

  // Kept last in this suite: it intentionally exhausts the per-user assistant
  // quota, and nothing after this calls POST /assistant as the admin user.
  test('rate-limits excessive assistant requests', async () => {
    let limited = false;
    for (let i = 0; i < 25; i++) {
      const res = await request(app)
        .post('/api/v1/assistant')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ question: `ping ${i}` });
      if (res.status === 429) { limited = true; break; }
    }
    expect(limited).toBe(true);
  });
});

describe('Internal messaging', () => {
  let adminToken;

  beforeAll(async () => {
    const res = await request(app).post('/api/v1/auth/login').send({
      username: 'admin',
      password: 'testpassword123',
    });
    adminToken = res.body.token;
    // a staff member to chat with
    await request(app).post('/api/v1/admin/staff').set('Authorization', `Bearer ${adminToken}`)
      .send({ username: 'agent1', password: 'staffpass123', service: 'general', displayName: 'Agent One' });
  });

  test('the team directory excludes the requester', async () => {
    const res = await request(app).get('/api/v1/directory').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.some(u => u.username === 'agent1')).toBe(true);
    expect(res.body.some(u => u.username === 'admin')).toBe(false);
  });

  test('creates a group, sends a message, and lists it', async () => {
    const create = await request(app)
      .post('/api/v1/conversations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ type: 'group', name: 'Ops Team', members: ['agent1'] });
    expect(create.status).toBe(201);
    expect(create.body.type).toBe('group');
    expect(create.body.members).toEqual(expect.arrayContaining(['admin', 'agent1']));
    const cid = create.body.id;

    const send = await request(app)
      .post(`/api/v1/conversations/${cid}/messages`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ text: 'Morning team — heavy traffic expected at 1pm.' });
    expect(send.status).toBe(201);
    expect(send.body.sender).toBe('admin');

    const msgs = await request(app).get(`/api/v1/conversations/${cid}/messages`).set('Authorization', `Bearer ${adminToken}`);
    expect(msgs.status).toBe(200);
    expect(msgs.body.length).toBe(1);

    const list = await request(app).get('/api/v1/conversations').set('Authorization', `Bearer ${adminToken}`);
    expect(list.body.some(c => c.id === cid && c.lastMessage)).toBe(true);
  });

  test('rejects a group with fewer than two members', async () => {
    const res = await request(app)
      .post('/api/v1/conversations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ type: 'group', name: 'Solo', members: [] });
    expect(res.status).toBe(400);
  });

  test('non-members cannot read a conversation', async () => {
    const create = await request(app)
      .post('/api/v1/conversations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ type: 'group', name: 'Private', members: ['agent1'] });
    // log in as a different staff member who is NOT a member
    await request(app).post('/api/v1/admin/staff').set('Authorization', `Bearer ${adminToken}`)
      .send({ username: 'outsider', password: 'staffpass123', service: 'general' });
    const login = await request(app).post('/api/v1/staff/login').send({ username: 'outsider', password: 'staffpass123' });
    const res = await request(app)
      .get(`/api/v1/conversations/${create.body.id}/messages`)
      .set('Authorization', `Bearer ${login.body.token}`);
    expect(res.status).toBe(403);
  });

  test('requires authentication', async () => {
    const res = await request(app).get('/api/v1/conversations');
    expect(res.status).toBe(401);
  });

  test('gracefully handles actions on a missing conversation/message', async () => {
    const sendMissing = await request(app)
      .post('/api/v1/conversations/does-not-exist/messages')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ text: 'hello' });
    expect(sendMissing.status).toBe(404);

    const reactMissing = await request(app)
      .put('/api/v1/conversations/does-not-exist/messages/nope/react')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ emoji: '👍' });
    expect(reactMissing.status).toBe(404);
  });

  test('supports reactions, read receipts, and rejects oversized attachments', async () => {
    const create = await request(app)
      .post('/api/v1/conversations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ type: 'group', name: 'Phase4', members: ['agent1'] });
    const cid = create.body.id;

    const send = await request(app)
      .post(`/api/v1/conversations/${cid}/messages`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ text: 'react to me' });
    const mid = send.body.id;

    // Reaction toggle
    const react = await request(app)
      .put(`/api/v1/conversations/${cid}/messages/${mid}/react`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ emoji: '👍' });
    expect(react.status).toBe(200);
    expect(react.body.reactions['👍'].admin).toBe(true);

    // Mark read clears unread for the reader
    await request(app).put(`/api/v1/conversations/${cid}/read`).set('Authorization', `Bearer ${adminToken}`);
    const list = await request(app).get('/api/v1/conversations').set('Authorization', `Bearer ${adminToken}`);
    expect(list.body.find(c => c.id === cid).unread).toBe(0);

    // Oversized attachment rejected (>256KB)
    const bigDataUrl = 'data:image/png;base64,' + 'A'.repeat(400 * 1024);
    const big = await request(app)
      .post(`/api/v1/conversations/${cid}/messages`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ attachment: { name: 'big.png', type: 'image/png', dataUrl: bigDataUrl } });
    expect(big.status).toBe(400);

    // Valid small image attachment accepted
    const okData = 'data:image/png;base64,' + 'A'.repeat(1024);
    const ok = await request(app)
      .post(`/api/v1/conversations/${cid}/messages`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ attachment: { name: 'tiny.png', type: 'image/png', dataUrl: okData } });
    expect(ok.status).toBe(201);
    expect(ok.body.attachment.type).toBe('image/png');
  });
});

describe('Secure sharing', () => {
  let adminToken;

  beforeAll(async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ username: 'admin', password: 'testpassword123' });
    adminToken = res.body.token;
  });

  test('creates a share and serves it via a public capability link', async () => {
    const create = await request(app)
      .post('/api/v1/shares')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ type: 'analytics', title: 'Today snapshot', data: { totalIssued: 42 } });
    expect(create.status).toBe(201);
    expect(create.body.url).toContain('/share/');
    const id = create.body.id;

    // Public — no auth header.
    const pub = await request(app).get(`/api/v1/share/${id}`);
    expect(pub.status).toBe(200);
    expect(pub.body.data.totalIssued).toBe(42);

    // Listed for the creator, payload omitted.
    const list = await request(app).get('/api/v1/shares').set('Authorization', `Bearer ${adminToken}`);
    expect(list.body.some(s => s.id === id && s.data === undefined)).toBe(true);

    // Revoke -> gone.
    await request(app).delete(`/api/v1/shares/${id}`).set('Authorization', `Bearer ${adminToken}`);
    const after = await request(app).get(`/api/v1/share/${id}`);
    expect(after.status).toBe(404);
  });

  test('rejects an invalid share type', async () => {
    const res = await request(app)
      .post('/api/v1/shares')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ type: 'nope', data: {} });
    expect(res.status).toBe(400);
  });

  test('creating a share requires authentication', async () => {
    const res = await request(app).post('/api/v1/shares').send({ type: 'analytics', data: {} });
    expect(res.status).toBe(401);
  });
});

describe('Shared files (Spark-plan, RTDB-backed)', () => {
  let adminToken;

  beforeAll(async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ username: 'admin', password: 'testpassword123' });
    adminToken = res.body.token;
  });

  test('uploads, lists (without blob), downloads, and deletes a file', async () => {
    const dataUrl = 'data:text/csv;base64,' + Buffer.from('a,b,c\n1,2,3').toString('base64');
    const up = await request(app)
      .post('/api/v1/uploads')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'report.csv', type: 'text/csv', dataUrl });
    expect(up.status).toBe(201);
    expect(up.body.dataUrl).toBeUndefined(); // summary omits the blob
    const id = up.body.id;

    const list = await request(app).get('/api/v1/uploads').set('Authorization', `Bearer ${adminToken}`);
    expect(list.body.some(f => f.id === id && f.dataUrl === undefined)).toBe(true);

    const get = await request(app).get(`/api/v1/uploads/${id}`).set('Authorization', `Bearer ${adminToken}`);
    expect(get.body.dataUrl).toBe(dataUrl); // download includes the blob

    const del = await request(app).delete(`/api/v1/uploads/${id}`).set('Authorization', `Bearer ${adminToken}`);
    expect(del.status).toBe(200);
  });

  test('rejects an unsupported file type', async () => {
    const res = await request(app)
      .post('/api/v1/uploads')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'x.exe', type: 'application/x-msdownload', dataUrl: 'data:application/x-msdownload;base64,AAAA' });
    expect(res.status).toBe(400);
  });

  test('requires authentication', async () => {
    const res = await request(app).get('/api/v1/uploads');
    expect(res.status).toBe(401);
  });
});

describe('Audit log', () => {
  let adminToken;

  beforeAll(async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ username: 'admin', password: 'testpassword123' });
    adminToken = res.body.token;
  });

  test('records sensitive actions and exposes them to admins', async () => {
    // Trigger an auditable action.
    await request(app).post('/api/v1/admin/staff').set('Authorization', `Bearer ${adminToken}`)
      .send({ username: 'audit_target', password: 'staffpass123', service: 'general' });
    await request(app).delete('/api/v1/admin/staff/audit_target').set('Authorization', `Bearer ${adminToken}`);
    await new Promise(r => setTimeout(r, 30)); // audit.record is fire-and-forget

    const res = await request(app).get('/api/v1/admin/audit').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.some(e => e.action === 'staff.deleted' && e.target === 'audit_target')).toBe(true);
  });
});

describe('RBAC (roles & permissions)', () => {
  let superToken;
  let managerToken;

  beforeAll(async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ username: 'admin', password: 'testpassword123' });
    superToken = res.body.token;
    // The bootstrap admin is promoted to superadmin.
    expect(res.body.user.role).toBe('superadmin');

    await request(app).post('/api/v1/admin/admins').set('Authorization', `Bearer ${superToken}`)
      .send({ username: 'mgr1', password: 'managerpass1', role: 'manager' });
    const login = await request(app).post('/api/v1/auth/login').send({ username: 'mgr1', password: 'managerpass1' });
    managerToken = login.body.token;
    expect(login.body.user.role).toBe('manager');
  });

  test('a manager can access the admin operations area', async () => {
    const res = await request(app).get('/api/v1/admin/queue').set('Authorization', `Bearer ${managerToken}`);
    expect(res.status).toBe(200);
  });

  test('a manager cannot create admins or change roles', async () => {
    const create = await request(app).post('/api/v1/admin/admins').set('Authorization', `Bearer ${managerToken}`)
      .send({ username: 'sneaky', password: 'whatever1', role: 'admin' });
    expect(create.status).toBe(403);

    const role = await request(app).put('/api/v1/admin/admins/mgr1/role').set('Authorization', `Bearer ${managerToken}`)
      .send({ role: 'superadmin' });
    expect(role.status).toBe(403);
  });

  test('a superadmin can change a role', async () => {
    const res = await request(app).put('/api/v1/admin/admins/mgr1/role').set('Authorization', `Bearer ${superToken}`)
      .send({ role: 'admin' });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('admin');
  });

  test('rejects an invalid role on creation', async () => {
    const res = await request(app).post('/api/v1/admin/admins').set('Authorization', `Bearer ${superToken}`)
      .send({ username: 'bad', password: 'whatever1', role: 'wizard' });
    expect(res.status).toBe(400);
  });
});

describe('Notification center', () => {
  let adminToken;

  beforeAll(async () => {
    const res = await request(app).post('/api/v1/auth/login').send({
      username: 'admin',
      password: 'testpassword123',
    });
    adminToken = res.body.token;
  });

  test('lists notifications with an unread count and marks them read', async () => {
    await notificationService.createNotification({
      recipients: ['admin'],
      type: 'system',
      title: 'Heads up',
      body: 'High traffic expected at 1pm.',
    });

    const list = await request(app).get('/api/v1/notifications').set('Authorization', `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    expect(list.body.items.length).toBeGreaterThanOrEqual(1);
    expect(list.body.unread).toBeGreaterThanOrEqual(1);

    const markAll = await request(app).put('/api/v1/notifications/read-all').set('Authorization', `Bearer ${adminToken}`);
    expect(markAll.status).toBe(200);

    const after = await request(app).get('/api/v1/notifications').set('Authorization', `Bearer ${adminToken}`);
    expect(after.body.unread).toBe(0);
  });

  test('event bus delivers a notification to admins on queue creation', async () => {
    const { registerSubscribers } = require('../src/events');
    registerSubscribers();
    const { emit, EVENTS } = require('../src/events/bus');

    emit(EVENTS.QUEUE_CREATED, { id: 'x', key: 'x', label: 'Triage Desk' });
    // bus.emit defers via setImmediate; wait a tick for the async handler.
    await new Promise(r => setTimeout(r, 50));

    const list = await request(app).get('/api/v1/notifications').set('Authorization', `Bearer ${adminToken}`);
    expect(list.body.items.some(n => /Triage Desk/.test(n.body || ''))).toBe(true);
  });

  test('requires authentication', async () => {
    const res = await request(app).get('/api/v1/notifications');
    expect(res.status).toBe(401);
  });
});

describe('Hospital: patients, doctors and bookings', () => {
  let adminToken;
  let patientToken;
  let doctorToken;
  const future = new Date(Date.now() + 3 * 24 * 3600e3).toISOString().slice(0, 10);
  const auth = (t) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ username: 'admin', password: 'testpassword123' });
    adminToken = res.body.token;
  });

  test('admin creates doctors; bad input is rejected', async () => {
    const bad = await request(app).post('/api/v1/admin/doctors').set(auth(adminToken))
      .send({ username: 'X', password: 'short', displayName: '', specialty: 'ent' });
    expect(bad.status).toBe(400);

    const a = await request(app).post('/api/v1/admin/doctors').set(auth(adminToken))
      .send({ username: 'dr-rao', password: 'doctorpass1', displayName: 'Dr. Rao', specialty: 'ent', qualification: 'MS ENT' });
    expect(a.status).toBe(201);
    expect(a.body.passwordHash).toBeUndefined();
    const b = await request(app).post('/api/v1/admin/doctors').set(auth(adminToken))
      .send({ username: 'dr-iyer', password: 'doctorpass2', displayName: 'Dr. Iyer', specialty: 'ent' });
    expect(b.status).toBe(201);
    const dup = await request(app).post('/api/v1/admin/doctors').set(auth(adminToken))
      .send({ username: 'dr-rao', password: 'doctorpass1', displayName: 'Dr. Rao', specialty: 'ent' });
    expect(dup.status).toBe(409);
  });

  test('public doctor list filters by department and hides private fields', async () => {
    const res = await request(app).get('/api/v1/doctors?specialty=ent');
    expect(res.status).toBe(200);
    expect(res.body.map(d => d.username).sort()).toEqual(['dr-iyer', 'dr-rao']);
    expect(res.body[0].passwordHash).toBeUndefined();
    expect(res.body[0].phone).toBeUndefined();
    const none = await request(app).get('/api/v1/doctors?specialty=cardiology');
    expect(none.body).toEqual([]);
  });

  test('patient registers, signs in, and cannot reach admin or staff routes', async () => {
    const reg = await request(app).post('/api/v1/patients/register')
      .send({ name: 'Asha Patel', email: 'Asha@Example.com', phone: '+91 98765 43210', password: 'patientpass1' });
    expect(reg.status).toBe(201);
    expect(reg.body.user.role).toBe('patient');

    const dup = await request(app).post('/api/v1/patients/register')
      .send({ name: 'Asha 2', email: 'asha@example.com', phone: '9876543210', password: 'patientpass1' });
    expect(dup.status).toBe(409);

    const wrong = await request(app).post('/api/v1/patients/login').send({ email: 'asha@example.com', password: 'nope-nope' });
    expect(wrong.status).toBe(401);

    const login = await request(app).post('/api/v1/patients/login').send({ email: 'ASHA@example.com', password: 'patientpass1' });
    expect(login.status).toBe(200);
    patientToken = login.body.token;

    const me = await request(app).get('/api/v1/patients/me').set(auth(patientToken));
    expect(me.body.email).toBe('asha@example.com');
    expect(me.body.passwordHash).toBeUndefined();

    const admin = await request(app).get('/api/v1/admin/appointments').set(auth(patientToken));
    expect(admin.status).toBe(403);
    const staff = await request(app).get('/api/v1/staff/queue').set(auth(patientToken));
    expect(staff.status).toBe(403);
  });

  test('booking gets a booking number and auto-assigns a free doctor', async () => {
    const first = await request(app).post('/api/v1/patients/me/appointments').set(auth(patientToken))
      .send({ service: 'ent', date: future, timeSlot: '10:00', reason: 'Ear pain' });
    expect(first.status).toBe(201);
    expect(first.body.bookingNo).toMatch(/^BK-\d{6}-001$/);
    expect(first.body.doctorId).toBeTruthy();
    expect(first.body.name).toBe('Asha Patel');

    // Same patient, same time: refused.
    const again = await request(app).post('/api/v1/patients/me/appointments').set(auth(patientToken))
      .send({ service: 'ent', date: future, timeSlot: '10:00' });
    expect(again.status).toBe(409);

    // Guest takes the other ENT doctor at 10:00; a third booking finds no one free.
    const guest = await request(app).post('/api/v1/appointments')
      .send({ name: 'Walk-in Guest', service: 'ent', date: future, timeSlot: '10:00' });
    expect(guest.status).toBe(201);
    expect(guest.body.doctorId).not.toBe(first.body.doctorId);
    expect(guest.body.bookingNo).toMatch(/-002$/);
    const full = await request(app).post('/api/v1/appointments')
      .send({ name: 'Third', service: 'ent', date: future, timeSlot: '10:00' });
    expect(full.status).toBe(409);

    const slots = await request(app).get(`/api/v1/appointments/slots?service=ent&date=${future}`);
    expect(slots.body.find(s => s.time === '10:00').available).toBe(false);
    expect(slots.body.find(s => s.time === '10:30').available).toBe(true);
  });

  test('booking a specific doctor locks only that doctor', async () => {
    const res = await request(app).post('/api/v1/patients/me/appointments').set(auth(patientToken))
      .send({ service: 'ent', doctorId: 'dr-rao', date: future, timeSlot: '11:00' });
    expect(res.status).toBe(201);
    expect(res.body.doctorName).toBe('Dr. Rao');

    const clash = await request(app).post('/api/v1/appointments')
      .send({ name: 'Other', service: 'ent', doctorId: 'dr-rao', date: future, timeSlot: '11:00' });
    expect(clash.status).toBe(409);

    const wrongDept = await request(app).post('/api/v1/appointments')
      .send({ name: 'Other', service: 'eye_specialist', doctorId: 'dr-rao', date: future, timeSlot: '11:30' });
    expect(wrongDept.status).toBe(400);

    const badSlot = await request(app).post('/api/v1/appointments')
      .send({ name: 'Other', service: 'ent', date: future, timeSlot: '10:15' });
    expect(badSlot.status).toBe(400);
    const past = await request(app).post('/api/v1/appointments')
      .send({ name: 'Other', service: 'ent', date: '2020-01-01', timeSlot: '10:00' });
    expect(past.status).toBe(400);
  });

  test('cancelling frees the slot, and patients cannot cancel other bookings', async () => {
    const mine = (await request(app).get('/api/v1/patients/me/appointments').set(auth(patientToken))).body;
    expect(mine.length).toBe(2);
    const at11 = mine.find(a => a.timeSlot === '11:00');

    const other = await request(app).post('/api/v1/patients/register')
      .send({ name: 'Ravi', email: 'ravi@example.com', phone: '9000000000', password: 'patientpass2' });
    const stolen = await request(app).put(`/api/v1/patients/me/appointments/${at11.id}/cancel`).set(auth(other.body.token));
    expect(stolen.status).toBe(404);

    const cancel = await request(app).put(`/api/v1/patients/me/appointments/${at11.id}/cancel`).set(auth(patientToken));
    expect(cancel.status).toBe(200);
    expect(cancel.body.status).toBe('cancelled');

    const rebook = await request(app).post('/api/v1/appointments')
      .send({ name: 'Other', service: 'ent', doctorId: 'dr-rao', date: future, timeSlot: '11:00' });
    expect(rebook.status).toBe(201);
  });

  test('doctor signs in, sees only their bookings, and closes one out', async () => {
    const login = await request(app).post('/api/v1/doctor/login').send({ username: 'dr-rao', password: 'doctorpass1' });
    expect(login.status).toBe(200);
    expect(login.body.user.specialty).toBe('ent');
    doctorToken = login.body.token;

    const list = await request(app).get(`/api/v1/doctor/appointments?date=${future}`).set(auth(doctorToken));
    expect(list.status).toBe(200);
    expect(list.body.length).toBeGreaterThan(0);
    expect(list.body.every(a => a.doctorId === 'dr-rao')).toBe(true);

    const open = list.body.find(a => a.status === 'pending');
    const early = await request(app).put(`/api/v1/doctor/appointments/${open.id}/status`).set(auth(doctorToken))
      .send({ status: 'completed' });
    expect(early.status).toBe(400); // cannot close an appointment before its day

    // Move it to today (hospital time) and close it.
    const { refs } = require('../src/config/firebase');
    await refs.appointment(open.id).update({ date: require('../src/utils/clock').today() });
    const done = await request(app).put(`/api/v1/doctor/appointments/${open.id}/status`).set(auth(doctorToken))
      .send({ status: 'completed' });
    expect(done.status).toBe(200);
    expect(done.body.status).toBe('completed');

    const notMine = (await request(app).get('/api/v1/admin/appointments').set(auth(adminToken))).body
      .find(a => a.doctorId === 'dr-iyer');
    const denied = await request(app).put(`/api/v1/doctor/appointments/${notMine.id}/status`).set(auth(doctorToken))
      .send({ status: 'completed' });
    expect(denied.status).toBe(404);

    const patientsView = await request(app).get('/api/v1/patients/me').set(auth(doctorToken));
    expect(patientsView.status).toBe(403);
  });

  test('admin reassign, delete guard, and switching a doctor off', async () => {
    const all = (await request(app).get('/api/v1/admin/appointments').set(auth(adminToken))).body;
    const iyers = all.find(a => a.doctorId === 'dr-iyer' && a.status === 'pending');
    const clash = await request(app).put(`/api/v1/admin/appointments/${iyers.id}/doctor`).set(auth(adminToken))
      .send({ doctorId: 'dr-rao' });
    expect(clash.status).toBe(409); // Dr. Rao already holds 10:00

    const del = await request(app).delete('/api/v1/admin/doctors/dr-iyer').set(auth(adminToken));
    expect(del.status).toBe(409);

    const off = await request(app).put('/api/v1/admin/doctors/dr-iyer').set(auth(adminToken)).send({ active: false });
    expect(off.status).toBe(200);
    expect(off.body.active).toBe(false);
    const login = await request(app).post('/api/v1/doctor/login').send({ username: 'dr-iyer', password: 'doctorpass2' });
    expect(login.status).toBe(403);
    const listed = await request(app).get('/api/v1/doctors?specialty=ent');
    expect(listed.body.map(d => d.username)).toEqual(['dr-rao']);
  });
});

describe('Security fixes', () => {
  let adminToken;
  const auth = (t) => ({ Authorization: `Bearer ${t}` });
  const { refs } = require('../src/config/firebase');

  beforeAll(async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ username: 'admin', password: 'testpassword123' });
    adminToken = res.body.token;
  });

  test('patient names stay out of the public token record', async () => {
    const res = await request(app).post('/api/v1/tokens').send({ service: 'general', patientName: 'Secret Person' });
    expect(res.status).toBe(201);
    const id = res.body.token.id;
    const pub = (await refs.token(id).once('value')).val();
    expect(pub.patientName).toBeUndefined();

    const details = await request(app).get('/api/v1/admin/queue/details').set(auth(adminToken));
    expect(details.body[id].patientName).toBe('Secret Person');
    const anon = await request(app).get('/api/v1/admin/queue/details');
    expect(anon.status).toBe(401);

    // Token ids are visible in the public feed, so the public status must not
    // reveal the name either.
    const own = await request(app).get(`/api/v1/tokens/${id}`);
    expect(own.status).toBe(200);
    expect(own.body.patientName).toBeUndefined();
  });

  test('staff notes are private', async () => {
    const res = await request(app).post('/api/v1/tokens').send({ service: 'general' });
    const id = res.body.token.id;
    await request(app).put(`/api/v1/admin/queue/tokens/${id}/note`).set(auth(adminToken)).send({ note: 'BP high' });
    expect((await refs.token(id).once('value')).val().note).toBeUndefined();
    const details = await request(app).get('/api/v1/admin/queue/details').set(auth(adminToken));
    expect(details.body[id].note).toBe('BP high');
  });

  test('expiry works when the database cache is empty (real SDK behaviour)', async () => {
    const res = await request(app).post('/api/v1/tokens').send({ service: 'general' });
    const id = res.body.token.id;
    await refs.token(id).update({ expiresAt: Date.now() - 1000 });
    await require('../src/services/expiry.service').sweepExpiredTokens();
    expect((await refs.token(id).once('value')).val().status).toBe('expired');
  });

  test('ids that would escape their path are rejected', async () => {
    const share = await request(app).get('/api/v1/share/%2F');
    expect([400, 404]).toContain(share.status);
    const del = await request(app).delete('/api/v1/admin/staff/%2F').set(auth(adminToken));
    expect(del.status).toBe(400);
    const admins = await request(app).get('/api/v1/admin/admins').set(auth(adminToken));
    expect(admins.body.length).toBeGreaterThan(0);
  });

  test('usernames are unique across admins, staff and doctors', async () => {
    const res = await request(app).post('/api/v1/admin/staff').set(auth(adminToken))
      .send({ username: 'admin', password: 'staffpass123', service: 'general' });
    expect(res.status).toBe(409);
    const slash = await request(app).post('/api/v1/admin/admins').set(auth(adminToken))
      .send({ username: 'admin/', password: 'adminpass123', role: 'manager' });
    expect(slash.status).toBe(400);
  });

  test('staff list never includes PIN hashes, and PINs are unique', async () => {
    const a = await request(app).post('/api/v1/admin/staff').set(auth(adminToken))
      .send({ username: 'pin-one', password: 'staffpass123', service: 'general', pin: 4321 });
    expect(a.status).toBe(201);
    const b = await request(app).post('/api/v1/admin/staff').set(auth(adminToken))
      .send({ username: 'pin-two', password: 'staffpass123', service: 'general', pin: '4321' });
    expect(b.status).toBe(409);
    const list = await request(app).get('/api/v1/admin/staff').set(auth(adminToken));
    const one = list.body.find(s => s.username === 'pin-one');
    expect(one.pinHash).toBeUndefined();
    expect(one.hasPin).toBe(true);
  });

  test('a removed staff member loses access immediately', async () => {
    await request(app).post('/api/v1/admin/staff').set(auth(adminToken))
      .send({ username: 'temp-staff', password: 'staffpass123', service: 'general' });
    const login = await request(app).post('/api/v1/staff/login').send({ username: 'temp-staff', password: 'staffpass123' });
    const before = await request(app).get('/api/v1/staff/profile').set(auth(login.body.token));
    expect(before.status).toBe(200);
    await request(app).delete('/api/v1/admin/staff/temp-staff').set(auth(adminToken));
    const after = await request(app).get('/api/v1/staff/profile').set(auth(login.body.token));
    expect(after.status).toBe(401);
  });

  test('a wrong current password is a 400, not a sign-out', async () => {
    const res = await request(app).post('/api/v1/admin/change-password').set(auth(adminToken))
      .send({ currentPassword: 'not-the-password', newPassword: 'whatever123' });
    expect(res.status).toBe(400);
  });
});

describe('Live fallback feed', () => {
  test('GET /queue/live returns state and tokens without personal details', async () => {
    // Issued through the service: the HTTP route is rate-limited and earlier tests use its budget.
    const token = await queueService.issueToken({ service: 'general', patientName: 'Hidden Name' });
    const issued = { body: { token } };
    const res = await request(app).get('/api/v1/queue/live');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.state.status).toBeDefined();
    const t = res.body.tokens[issued.body.token.id];
    expect(t.number).toBe(issued.body.token.number);
    expect(JSON.stringify(res.body)).not.toContain('Hidden Name');
  });
});
