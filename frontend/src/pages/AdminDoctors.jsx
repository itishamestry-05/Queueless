import { useEffect, useState, useCallback } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useAppConfig } from '../hooks/useAppConfig.js';
import { getSpecialties, getServiceLabel } from '../utils/industry.js';
import { apiAdminDoctors, apiAdminCreateDoctor, apiAdminUpdateDoctor, apiAdminDeleteDoctor } from '../services/api.js';
import { FIELD, FIELD_INLINE, apiError } from '../utils/appointments.js';
import { showAlert, askConfirm, askText } from '../components/Dialog.jsx';

const EMPTY = { username: '', password: '', displayName: '', specialty: '', qualification: '', phone: '', email: '' };

export default function AdminDoctors() {
  const { user } = useAuth();
  const cfg = useAppConfig();
  // Managers can see doctors; admin and superadmin can change them.
  const canManage = user && ['admin', 'superadmin'].includes(user.role);

  const [doctors, setDoctors] = useState([]);
  const services = getSpecialties(doctors);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(null);
  const [filter, setFilter] = useState('');
  const [loadError, setLoadError] = useState(null);

  const reload = useCallback(() => {
    apiAdminDoctors()
      .then(data => { setDoctors(data); setLoadError(null); })
      .catch(e => setLoadError(apiError(e, 'Could not load the doctor list.')))
      .finally(() => setLoading(false));
  }, []);

  const retry = () => { setLoading(true); setLoadError(null); reload(); };

  useEffect(() => { if (user) reload(); }, [user, reload]);

  if (!user) return <Navigate to="/admin/login" replace />;

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleCreate = async (e) => {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      await apiAdminCreateDoctor({ ...form, username: form.username.trim().toLowerCase(), specialty: form.specialty || services[0]?.id });
      setForm(EMPTY);
      reload();
    } catch (err) {
      setFormError(apiError(err, 'Could not add the doctor.'));
    } finally {
      setSaving(false);
    }
  };

  const act = async (username, fn) => {
    setBusy(username);
    try { await fn(); reload(); }
    catch (err) { showAlert(apiError(err, 'That did not work. Please try again.')); }
    finally { setBusy(null); }
  };

  const toggleActive = (d) => act(d.username, () => apiAdminUpdateDoctor(d.username, { active: !d.active }));
  const changeDept = (d, specialty) => act(d.username, () => apiAdminUpdateDoctor(d.username, { specialty }));
  const resetPassword = async (d) => {
    const pw = await askText({
      title: 'Reset password',
      message: `Set a new password for ${d.displayName}. Tell them the new password yourself.`,
      type: 'password',
      placeholder: 'At least 8 characters',
      minLength: 8,
      okLabel: 'Set password',
    });
    if (!pw) return;
    act(d.username, () => apiAdminUpdateDoctor(d.username, { password: pw }));
  };
  const remove = async (d) => {
    if (!(await askConfirm({ title: 'Remove doctor', message: `Remove ${d.displayName}? This cannot be undone.`, okLabel: 'Remove', danger: true }))) return;
    act(d.username, () => apiAdminDeleteDoctor(d.username));
  };

  const shown = doctors.filter(d => !filter || d.specialty === filter);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 xl:px-10 py-10">
      <div className="flex items-end justify-between mb-10 flex-wrap gap-4">
        <div>
          <div className="label">Admin · Doctors</div>
          <h1 className="font-display text-5xl tracking-tightest leading-none mt-2">Doctors</h1>
        </div>
        <Link to="/admin/appointments" className="btn-secondary text-sm">Appointments</Link>
      </div>

      {canManage && (
        <form onSubmit={handleCreate} className="mb-12 p-6 border border-rule bg-cream space-y-4">
          <div className="label">Add a doctor</div>
          <div className="grid sm:grid-cols-2 gap-4">
            <input value={form.displayName} onChange={set('displayName')} required placeholder="Name, e.g. Dr. Meera Rao" aria-label="Doctor name" className={FIELD} />
            <select value={form.specialty || services[0]?.id || ''} onChange={set('specialty')} aria-label="Department" className={FIELD}>
              {services.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
            <input value={form.qualification} onChange={set('qualification')} placeholder="Qualification, e.g. MBBS, MS (ENT)" aria-label="Qualification" className={FIELD} />
            <input value={form.phone} onChange={set('phone')} placeholder="Mobile, e.g. 98765 43210 (optional)" aria-label="Mobile number" className={FIELD} />
            <div>
              <input value={form.username} onChange={set('username')} required placeholder="Sign-in username, e.g. dr.rao" pattern="[a-zA-Z0-9_.\-]{3,30}"
                title="3 to 30 letters, digits, dots, - or _" aria-label="Sign-in username" className={FIELD} />
              {form.username.includes('.') && <p className="mt-1 text-xs text-graphite">Saved as {form.username.trim().toLowerCase().replace(/\./g, '_')}. Either spelling signs in.</p>}
            </div>
            <input type="password" value={form.password} onChange={set('password')} required minLength={8} placeholder="Password (8+ characters)" autoComplete="new-password" aria-label="Password" className={FIELD} />
          </div>
          {formError && <div className="p-3 border border-accent bg-accent/5 text-accent-deep text-sm">{formError}</div>}
          <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Adding…' : 'Add doctor'}</button>
        </form>
      )}

      <div className="flex items-center justify-between mb-3 gap-4 flex-wrap">
        <div className="label">{shown.length} doctor{shown.length === 1 ? '' : 's'}</div>
        <select value={filter} onChange={e => setFilter(e.target.value)} aria-label="Filter by department" className={FIELD_INLINE}>
          <option value="">All departments</option>
          {services.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="text-graphite text-sm">Loading…</div>
      ) : loadError ? (
        <div className="p-6 border border-accent bg-accent/5 text-accent-deep text-sm text-center">
          {loadError}
          <div className="mt-3"><button onClick={retry} className="btn-secondary text-xs px-3 py-1.5">Try again</button></div>
        </div>
      ) : shown.length === 0 ? (
        <div className="p-8 border border-dashed border-rule text-sm text-graphite text-center">No doctors yet.</div>
      ) : (
        <div className="border border-rule divide-y divide-rule">
          {shown.map(d => (
            <div key={d.username} className={`p-4 flex flex-wrap items-center gap-4 ${d.active ? '' : 'opacity-60'}`}>
              <div className="flex-1 min-w-[12rem]">
                <div className="font-medium">{d.displayName} {!d.active && <span className="text-xs text-accent-deep ml-2">Switched off</span>}</div>
                <div className="text-xs text-graphite mt-0.5">
                  <span className="font-mono">{d.username}</span>
                  {d.qualification && <> · {d.qualification}</>}
                  {d.phone && <> · {d.phone}</>}
                </div>
              </div>
              {canManage ? (
                <select value={d.specialty} onChange={e => changeDept(d, e.target.value)} disabled={busy === d.username} aria-label={`Department for ${d.displayName}`} className={FIELD_INLINE}>
                  {!services.some(s => s.id === d.specialty) && <option value={d.specialty}>{getServiceLabel(d.specialty, cfg.industry)}</option>}
                  {services.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
                </select>
              ) : (
                <span className="text-sm">{getServiceLabel(d.specialty, cfg.industry)}</span>
              )}
              {canManage && (
                <div className="flex gap-3 text-xs">
                  <button onClick={() => toggleActive(d)} disabled={busy === d.username} className="underline text-graphite hover:text-ink">
                    {d.active ? 'Switch off' : 'Switch on'}
                  </button>
                  <button onClick={() => resetPassword(d)} disabled={busy === d.username} className="underline text-graphite hover:text-ink">Reset password</button>
                  <button onClick={() => remove(d)} disabled={busy === d.username} className="underline text-graphite hover:text-accent">Remove</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
