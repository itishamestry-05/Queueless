import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

/**
 * In-app popups that replace the browser's alert(), confirm() and prompt().
 *
 *   await showAlert('Could not save.')                        -> resolves on OK
 *   if (!(await askConfirm({ message: 'Remove X?', danger: true }))) return;
 *   const pw = await askText({ title: 'New password', minLength: 8, type: 'password' }); // null on cancel
 *
 * One queue lives at module level so any handler can call these without
 * prop drilling; <DialogHost /> is mounted once at the app root and shows
 * the first open request. Requests made while one is open wait their turn.
 */
let queue = [];
const listeners = new Set();
const emit = () => listeners.forEach(l => l());
const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };
const current = () => queue[0] || null;

function open(req) {
  return new Promise(resolve => {
    queue = [...queue, { ...req, id: Math.random().toString(36).slice(2), resolve }];
    emit();
  });
}

function close(value) {
  const [head, ...rest] = queue;
  if (!head) return;
  queue = rest;
  emit();
  head.resolve(value);
}

const asOptions = (arg) => (typeof arg === 'string' ? { message: arg } : arg || {});

/** A message with one OK button. */
export function showAlert(arg, title) {
  const o = asOptions(arg);
  return open({ kind: 'alert', title: title || o.title || 'Something went wrong', message: o.message, okLabel: o.okLabel || 'OK' }).then(() => undefined);
}

/** Yes/no question. Resolves true only when the person confirms. */
export function askConfirm(arg) {
  const o = asOptions(arg);
  return open({
    kind: 'confirm',
    title: o.title || 'Are you sure?',
    message: o.message,
    okLabel: o.okLabel || 'Confirm',
    cancelLabel: o.cancelLabel || 'Cancel',
    danger: !!o.danger,
  }).then(Boolean);
}

/** Ask for one line of text. Resolves the text, or null when cancelled. */
export function askText(arg) {
  const o = asOptions(arg);
  return open({
    kind: 'prompt',
    title: o.title || 'Enter a value',
    message: o.message,
    okLabel: o.okLabel || 'Save',
    cancelLabel: o.cancelLabel || 'Cancel',
    type: o.type || 'text',
    placeholder: o.placeholder || '',
    minLength: o.minLength || 0,
    tooShort: o.tooShort,
  }).then(v => (typeof v === 'string' ? v : null));
}

export default function DialogHost() {
  const req = useSyncExternalStore(subscribe, current, current);
  const [value, setValue] = useState('');
  const [error, setError] = useState(null);
  const okRef = useRef(null);
  const inputRef = useRef(null);
  const lastFocus = useRef(null);

  // Fresh state per popup; focus the input or the main button, and give focus
  // back to whatever had it once the popup closes.
  useEffect(() => {
    if (!req) return undefined;
    lastFocus.current = document.activeElement;
    setValue('');
    setError(null);
    const t = setTimeout(() => (inputRef.current || okRef.current)?.focus(), 0);
    return () => { clearTimeout(t); lastFocus.current?.focus?.(); };
  }, [req?.id]);

  useEffect(() => {
    if (!req) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  if (!req) return null;

  const cancel = () => close(req.kind === 'prompt' ? null : req.kind === 'confirm' ? false : undefined);
  const ok = (e) => {
    e?.preventDefault();
    if (req.kind === 'prompt') {
      if (value.length < req.minLength) { setError(req.tooShort || `Enter at least ${req.minLength} characters.`); return; }
      close(value);
    } else {
      close(req.kind === 'confirm' ? true : undefined);
    }
  };

  const okClass = req.danger
    ? 'inline-flex items-center justify-center px-5 py-2.5 bg-accent text-paper font-medium hover:bg-accent-deep transition-colors'
    : 'btn-primary';

  return (
    <div className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center p-4 print:hidden" onMouseDown={e => { if (e.target === e.currentTarget) cancel(); }}>
      <form
        role={req.kind === 'alert' ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby="app-dialog-title"
        aria-describedby={req.message ? 'app-dialog-message' : undefined}
        onSubmit={ok}
        className="bg-paper border border-rule shadow-2xl w-full max-w-md p-6"
      >
        <h2 id="app-dialog-title" className="font-display text-2xl tracking-tight">{req.title}</h2>
        {req.message && <p id="app-dialog-message" className="mt-3 text-sm text-graphite whitespace-pre-line">{req.message}</p>}

        {req.kind === 'prompt' && (
          <div className="mt-4">
            <input
              ref={inputRef}
              type={req.type}
              value={value}
              onChange={e => { setValue(e.target.value); setError(null); }}
              placeholder={req.placeholder}
              aria-label={req.title}
              aria-invalid={!!error}
              autoComplete={req.type === 'password' ? 'new-password' : 'off'}
              className="w-full border border-rule bg-cream px-3 py-2.5 focus:outline-none focus:border-ink"
            />
            {error && <p className="mt-2 text-sm text-accent-deep">{error}</p>}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          {req.kind !== 'alert' && (
            <button type="button" onClick={cancel} className="btn-secondary">{req.cancelLabel}</button>
          )}
          <button ref={okRef} type="submit" className={okClass}>{req.okLabel}</button>
        </div>
      </form>
    </div>
  );
}
