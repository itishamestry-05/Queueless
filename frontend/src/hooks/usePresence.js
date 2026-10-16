import { useEffect } from 'react';
import { api } from '../services/api/client.js';

// Staff "online" status. The browser used to write presence/<username>
// straight into the database, which let anyone mark any staff member online or
// offline. Now it sends a signed-in heartbeat; the backend writes presence and
// anyone silent for longer than PRESENCE_STALE_MS counts as offline.
export const HEARTBEAT_MS = 30 * 1000;
export const PRESENCE_STALE_MS = 90 * 1000;

export function isOnline(p) {
  return !!(p && p.online && p.lastSeen && Date.now() - p.lastSeen < PRESENCE_STALE_MS);
}

export function usePresence(username, service) {
  useEffect(() => {
    if (!username) return undefined;
    const beat = (online) => api.post('/staff/presence', { online }).catch(() => {});
    beat(true);
    const timer = setInterval(() => beat(true), HEARTBEAT_MS);
    const onHide = () => { if (document.visibilityState === 'visible') beat(true); };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onHide);
      beat(false);
    };
  }, [username, service]);
}
