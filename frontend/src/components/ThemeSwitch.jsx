import { useTheme } from '../context/ThemeContext.jsx';

const OPTIONS = [
  { value: 'light', label: 'Light', title: 'Always use light mode' },
  { value: 'dark', label: 'Dark', title: 'Always use dark mode' },
  { value: 'system', label: 'Auto', title: 'Match your device setting' },
];

/** Light / Dark / Auto picker used in the account menus and the mobile menu. */
export default function ThemeSwitch() {
  const { pref, setPref } = useTheme();
  return (
    <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 border border-rule text-xs">
      {OPTIONS.map(o => {
        const on = pref === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            title={o.title}
            onClick={() => setPref(o.value)}
            className={`py-1.5 font-medium transition-colors ${on ? 'bg-ink text-paper' : 'text-graphite hover:text-ink hover:bg-cream'}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
