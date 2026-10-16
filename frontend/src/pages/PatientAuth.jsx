import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { usePatient } from '../context/HospitalAuthContext.jsx';
import { FIELD, localDate } from '../utils/appointments.js';

// Patient sign-in and sign-up share one page; `mode` picks the form.
export default function PatientAuth({ mode = 'login' }) {
  const { patient, login, register, error, setError, loading } = usePatient();
  const navigate = useNavigate();
  const location = useLocation();
  const next = location.state?.from || '/patient';
  const isRegister = mode === 'register';

  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', confirm: '', gender: '', dob: '' });
  const [localError, setLocalError] = useState(null);
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  useEffect(() => { setError(null); setLocalError(null); }, [mode, setError]);
  useEffect(() => { if (patient) navigate(next, { replace: true }); }, [patient, navigate, next]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError(null);
    if (isRegister) {
      if (form.password !== form.confirm) { setLocalError('The two passwords do not match.'); return; }
      // Typing a date can slip past the picker's max, so check again here.
      if (form.dob && form.dob > localDate()) { setLocalError('Date of birth cannot be in the future.'); return; }
      if (form.dob && form.dob < '1900-01-01') { setLocalError('Date of birth must be after 1900.'); return; }
      const { confirm, ...data } = form;
      await register({ ...data, gender: data.gender || null, dob: data.dob || null });
    } else {
      await login(form.email, form.password);
    }
  };

  const shownError = localError || error;

  return (
    <div className="max-w-md mx-auto px-6 py-20">
      {location.state?.sessionExpired ? (
        <div role="status" className="mb-6 p-3 border border-warn/40 bg-warn/10 text-warn text-sm">
          Your session has expired. Please sign in again.
        </div>
      ) : location.state?.signedOut ? (
        <div role="status" className="mb-6 p-3 border border-success/30 bg-success/10 text-success text-sm">
          You have been signed out successfully.
        </div>
      ) : location.state?.from && (
        <div className="mb-6 p-3 border border-warn/40 bg-warn/10 text-warn text-sm">
          Sign in or create an account to book an appointment.
        </div>
      )}
      <div className="label mb-4">Patient portal</div>
      <h1 className="font-display text-5xl tracking-tightest leading-[0.95] mb-10">
        {isRegister ? 'Create account' : 'Patient sign in'}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        {isRegister && (
          <div>
            <label htmlFor="patient-name" className="label block mb-2">Full name</label>
            <input id="patient-name" value={form.name} onChange={set('name')} required minLength={2} maxLength={80} autoComplete="name" className={FIELD} />
          </div>
        )}
        <div>
          <label htmlFor="patient-email" className="label block mb-2">Email</label>
          <input id="patient-email" type="email" value={form.email} onChange={set('email')} required autoComplete="email" className={FIELD} />
        </div>
        {isRegister && (
          <>
            <div>
              <label htmlFor="patient-phone" className="label block mb-2">Mobile number</label>
              <input id="patient-phone" type="tel" value={form.phone} onChange={set('phone')} required autoComplete="tel" placeholder="+91 98765 43210" className={FIELD} />
            </div>
            {/* items-end keeps the two fields level when one label wraps */}
            <div className="grid grid-cols-2 gap-4 items-end">
              <div>
                <label htmlFor="patient-gender" className="label block mb-2">Gender (optional)</label>
                <select id="patient-gender" value={form.gender} onChange={set('gender')} className={FIELD}>
                  <option value="">Prefer not to say</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label htmlFor="patient-dob" className="label block mb-2">Date of birth (optional)</label>
                <input id="patient-dob" type="date" value={form.dob} onChange={set('dob')} min="1900-01-01" max={localDate()} className={FIELD} />
              </div>
            </div>
          </>
        )}
        <div>
          <label htmlFor="patient-password" className="label block mb-2">Password</label>
          <input id="patient-password" type="password" value={form.password} onChange={set('password')} required minLength={isRegister ? 8 : 1}
            autoComplete={isRegister ? 'new-password' : 'current-password'} className={FIELD} />
          {isRegister && <p className="mt-1.5 text-xs text-graphite">At least 8 characters.</p>}
        </div>
        {isRegister && (
          <div>
            <label htmlFor="patient-confirm" className="label block mb-2">Confirm password</label>
            <input id="patient-confirm" type="password" value={form.confirm} onChange={set('confirm')} required autoComplete="new-password" className={FIELD} />
          </div>
        )}

        {shownError && <div className="p-3 border border-accent bg-accent/5 text-accent-deep text-sm">{shownError}</div>}

        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? 'Please wait…' : isRegister ? 'Create account →' : 'Sign in →'}
        </button>
      </form>

      <div className="mt-8 text-xs text-graphite">
        {isRegister ? (
          <>Already registered? <Link to="/patient/login" state={location.state} className="underline hover:text-ink">Sign in</Link></>
        ) : (
          <>New patient? <Link to="/patient/register" state={location.state} className="underline hover:text-ink">Create an account</Link></>
        )}
      </div>
    </div>
  );
}
