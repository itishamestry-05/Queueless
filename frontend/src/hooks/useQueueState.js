/**
 * Live queue data for every screen.
 *
 * Preferred source is the Firebase live feed (instant push). When that is not
 * configured, is refused, or stays silent, the hook polls the backend every
 * few seconds instead, so screens keep updating either way. `mode` says which
 * one is in use so the badge can tell the truth:
 *   'connecting' - starting up
 *   'live'       - Firebase is pushing changes instantly
 *   'refresh'    - updating from the server every REFRESH_MS
 *   'offline'    - neither source is reachable right now
 */
import { useEffect, useRef, useState } from 'react';
import { db, ref, onValue, liveEnabled } from '../firebase.js';
import { api } from '../services/api/client.js';

export const REFRESH_MS = 5000;
// How long to wait for the first Firebase snapshot before falling back.
const FIRST_SNAPSHOT_TIMEOUT_MS = 6000;

/**
 * Firebase subscription with a polling fallback. `subscribe(onData, onError)`
 * wires Firebase and returns an unsubscribe; `poll()` fetches the same data
 * over HTTP. Returns the current mode.
 */
function useLiveSource(subscribe, poll, deps) {
  const [mode, setMode] = useState('connecting');
  const gotLiveData = useRef(false);

  useEffect(() => {
    let alive = true;
    let timer = null;
    let failures = 0;
    gotLiveData.current = false;

    const runPoll = async () => {
      try {
        await poll();
        failures = 0;
        if (alive && !gotLiveData.current) setMode('refresh');
      } catch {
        failures += 1;
        if (alive && !gotLiveData.current && failures >= 2) setMode('offline');
      }
    };
    const startPolling = () => {
      if (timer || !alive || gotLiveData.current) return;
      runPoll();
      timer = setInterval(runPoll, REFRESH_MS);
    };
    const stopPolling = () => { if (timer) { clearInterval(timer); timer = null; } };

    let unsubscribe = () => {};
    if (liveEnabled && db) {
      unsubscribe = subscribe(
        () => { gotLiveData.current = true; stopPolling(); if (alive) setMode('live'); },
        () => { gotLiveData.current = false; startPolling(); },
      );
    }
    // After this browser changes the queue (call next, skip, new token...),
    // refresh at once instead of waiting for the next tick.
    const onChanged = () => { if (timer) runPoll(); };
    window.addEventListener('queueless:queue-changed', onChanged);

    // One immediate fetch so the screen has numbers while Firebase connects;
    // it does not change the badge (Firebase may still take over).
    if (liveEnabled && db) poll().catch(() => {});

    // No Firebase at all: poll straight away. Otherwise give it a moment.
    const fallback = setTimeout(startPolling, liveEnabled && db ? FIRST_SNAPSHOT_TIMEOUT_MS : 0);

    return () => {
      alive = false;
      clearTimeout(fallback);
      window.removeEventListener('queueless:queue-changed', onChanged);
      stopPolling();
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return mode;
}

/**
 * @param {{ detailsFrom?: 'admin' | 'staff' }} [options]
 *   Signed-in screens pass detailsFrom so patient names and notes are merged
 *   in. Those details are not in the public feed; they are fetched through the
 *   signed-in API whenever the set of active tokens changes.
 */
export function useQueueState({ detailsFrom } = {}) {
  const [data, setData] = useState({ state: null, tokens: {}, announcement: null, loading: true, error: null });
  const [details, setDetails] = useState({});

  const mode = useLiveSource(
    (onData, onError) => {
      const fail = (err) => { setData(d => ({ ...d, error: err?.message || 'Live updates unavailable.' })); onError(); };
      const u1 = onValue(ref(db, 'queue/state'), (snap) => { setData(d => ({ ...d, state: snap.val(), loading: false, error: null })); onData(); }, fail);
      const u2 = onValue(ref(db, 'queue/tokens'), (snap) => { setData(d => ({ ...d, tokens: snap.val() || {}, loading: false })); onData(); }, fail);
      const u3 = onValue(ref(db, 'queue/announcement'), (snap) => setData(d => ({ ...d, announcement: snap.val() })), () => {});
      return () => { u1(); u2(); u3(); };
    },
    async () => {
      const r = await api.get('/queue/live');
      setData({ state: r.data.state, tokens: r.data.tokens || {}, announcement: r.data.announcement || null, loading: false, error: null });
    },
    [],
  );

  // Refetch details only when tokens join/leave the active set or change status.
  const activeKey = detailsFrom
    ? Object.values(data.tokens || {})
        .filter(t => t && (t.status === 'waiting' || t.status === 'called'))
        .map(t => `${t.id}:${t.status}:${t.service}`).sort().join('|')
    : '';

  useEffect(() => {
    if (!detailsFrom || !activeKey) return undefined;
    let alive = true;
    api.get(`/${detailsFrom}/queue/details`)
      .then(r => { if (alive) setDetails(r.data || {}); })
      .catch(() => {});
    return () => { alive = false; };
  }, [detailsFrom, activeKey]);

  if (!detailsFrom) return { ...data, mode };
  const merged = {};
  for (const [id, t] of Object.entries(data.tokens || {})) merged[id] = details[id] ? { ...t, ...details[id] } : t;
  return { ...data, tokens: merged, mode };
}

/**
 * Live status for a single token: Firebase push when available, otherwise the
 * public status endpoint every few seconds. Returns the public token record.
 */
export function useTokenLive(tokenId) {
  const [token, setToken] = useState(null);
  useLiveSource(
    (onData, onError) => (tokenId
      ? onValue(ref(db, `queue/tokens/${tokenId}`), (snap) => { setToken(snap.val()); onData(); }, onError)
      : () => {}),
    async () => {
      if (!tokenId) return;
      const r = await api.get(`/tokens/${tokenId}`);
      setToken(r.data);
    },
    [tokenId],
  );
  return token;
}
