import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext(null);
const KEY = 'queueless.theme';
const THEME_COLOR = { light: '#F7F3EC', dark: '#1C1A18' };
const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)');

// The saved value is the person's choice: 'light' or 'dark'. No saved value
// means 'system', which keeps following the device setting as it changes.
// index.html runs the same rule before first paint to avoid a light flash.
function readPref() {
  const saved = localStorage.getItem(KEY);
  return saved === 'light' || saved === 'dark' ? saved : 'system';
}

export function ThemeProvider({ children }) {
  const [pref, setPrefState] = useState(readPref);
  const [systemDark, setSystemDark] = useState(() => darkQuery().matches);
  const dark = pref === 'system' ? systemDark : pref === 'dark';

  useEffect(() => {
    const mq = darkQuery();
    const onChange = (e) => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Keep every open tab on the same theme.
  useEffect(() => {
    const onStorage = (e) => { if (e.key === KEY || e.key === null) setPrefState(readPref()); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    document.querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', dark ? THEME_COLOR.dark : THEME_COLOR.light);
  }, [dark]);

  const setPref = useCallback((next) => {
    if (next === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, next);
    setPrefState(next);
  }, []);

  const toggle = useCallback(() => setPref(dark ? 'light' : 'dark'), [dark, setPref]);

  return (
    <ThemeContext.Provider value={{ dark, pref, setPref, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
