/**
 * Firebase client SDK initialization.
 *
 * Uses Realtime Database for live queue state. Read access is governed by
 * the rules in /firebase/database.rules.json - clients can READ the queue
 * but not WRITE (writes go through our backend, which uses Admin SDK).
 */
import { initializeApp } from 'firebase/app';
import {
  getDatabase, ref as dbRef, onValue as dbOnValue, off as dbOff, set as dbSet, onDisconnect as dbOnDisconnect,
} from 'firebase/database';
import { getAnalytics, isSupported as analyticsIsSupported } from "firebase/analytics";

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  databaseURL:       import.meta.env.VITE_FIREBASE_DATABASE_URL,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId:     import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// Without the VITE_FIREBASE_* settings getDatabase() throws while this module
// loads, which blanks every page. Start only when configured; otherwise live
// updates are off and the REST-backed pages keep working.
export const liveEnabled = Boolean(firebaseConfig.databaseURL && firebaseConfig.apiKey && firebaseConfig.projectId);

let app = null;
let db = null;
if (liveEnabled) {
  try {
    app = initializeApp(firebaseConfig);
    db = getDatabase(app);
  } catch (e) {
    console.error('[firebase] Could not start live updates:', e);
  }
} else {
  console.warn('[firebase] VITE_FIREBASE_* settings are missing; live updates are off.');
}

const noop = () => {};
// Same signatures as the SDK so call sites need no changes; each is a no-op
// (or reports an error to the listener) when live updates are off.
const ref = (database, path) => (database ? dbRef(database, path) : null);
const onValue = (r, cb, onError) => {
  if (!r) { onError?.(new Error('Live updates are unavailable.')); return noop; }
  return dbOnValue(r, cb, onError);
};
const off = (r, ...rest) => { if (r) dbOff(r, ...rest); };
const set = (r, value) => (r ? dbSet(r, value) : Promise.resolve());
const onDisconnect = (r) => (r ? dbOnDisconnect(r) : { set: () => Promise.resolve(), cancel: () => Promise.resolve(), remove: () => Promise.resolve() });

// Analytics is browser-only and requires a valid measurementId. Initialize it
// lazily and defensively so a missing config value or unsupported environment
// (SSR, some browsers) never throws and breaks the app shell.
let analytics = null;
if (app && firebaseConfig.measurementId) {
  analyticsIsSupported()
    .then((supported) => {
      if (supported) analytics = getAnalytics(app);
    })
    .catch(() => { /* analytics unavailable - non-fatal */ });
}

export { db, ref, onValue, off, set, onDisconnect, app, analytics };
