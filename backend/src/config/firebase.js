const admin = require('firebase-admin');
const { getDatabase } = require('firebase-admin/database');
const config = require('./env');
const { buildRefs } = require('./refs');

if (!admin.getApps().length) {
  admin.initializeApp({
    credential: admin.cert({
      projectId: config.firebase.projectId,
      clientEmail: config.firebase.clientEmail,
      privateKey: config.firebase.privateKey,
    }),
    databaseURL: config.firebase.databaseURL,
  });
}

const db = getDatabase();

const refs = buildRefs(db);

module.exports = { admin, db, refs };
