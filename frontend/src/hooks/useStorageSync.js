import { useEffect } from 'react';

/**
 * Mirrors a signed-in user stored under `key` when another tab changes it, so
 * signing out (or in) in one tab updates every open tab instead of leaving
 * them showing a session that no longer exists.
 */
export function useStorageSync(key, setValue) {
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== key && e.key !== null) return; // null: storage was cleared
      try { setValue(JSON.parse(localStorage.getItem(key) || 'null')); } catch { setValue(null); }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [key, setValue]);
}
