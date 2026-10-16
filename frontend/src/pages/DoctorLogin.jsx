import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useDoctor } from '../context/HospitalAuthContext.jsx';
import { FIELD } from '../utils/appointments.js';

export default function DoctorLogin() {
  const { doctor, login, error, setError, loading } = useDoctor();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => { setError(null); }, [setError]);
  useEffect(() => { if (doctor) navigate('/doctor', { replace: true }); }, [doctor, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    await login(username.trim().toLowerCase(), password);
  };

  return (
    <div className="max-w-sm mx-auto px-6 py-24">
      <div className="label mb-4">Doctor portal</div>
      <h1 className="font-display text-5xl tracking-tightest leading-[0.95] mb-10">Doctor sign in</h1>

      {location.state?.sessionExpired && (
        <div role="status" className="mb-6 p-3 border border-warn/40 bg-warn/10 text-warn text-sm">
          Your session has expired. Please sign in again.
        </div>
      )}
      {location.state?.signedOut && (
        <div role="status" className="mb-6 p-3 border border-success/30 bg-success/10 text-success text-sm">
          You have been signed out successfully.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="doctor-username" className="label block mb-2">Username</label>
          <input id="doctor-username" value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" required className={FIELD} />
        </div>
        <div>
          <label htmlFor="doctor-password" className="label block mb-2">Password</label>
          <input id="doctor-password" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required className={FIELD} />
        </div>
        {error && <div className="p-3 border border-accent bg-accent/5 text-accent-deep text-sm">{error}</div>}
        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? 'Signing in…' : 'Sign in →'}
        </button>
      </form>

      <p className="mt-8 text-xs text-graphite">
        No account yet? The hospital admin creates doctor accounts. <Link to="/patient/login" className="underline hover:text-ink">Patient sign in</Link>
      </p>
    </div>
  );
}
