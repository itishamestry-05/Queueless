import { createContext, useContext, useState, useCallback } from 'react';
import { PATIENT_TOKEN_KEY, DOCTOR_TOKEN_KEY } from '../services/api/client.js';
import { apiPatientLogin, apiPatientRegister, apiDoctorLogin } from '../services/api/hospital.js';
import { useStorageSync } from '../hooks/useStorageSync.js';

// One factory for the two hospital portals: each keeps its own token and user
// in localStorage, separate from the admin and staff sessions.
function makeSession({ tokenKey, userKey }) {
  const Ctx = createContext(null);

  function Provider({ children }) {
    const [account, setAccount] = useState(() => {
      try { return JSON.parse(localStorage.getItem(userKey) || 'null'); } catch { return null; }
    });
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    useStorageSync(userKey, setAccount);

    // `call` returns { token, user } from the backend.
    const run = useCallback(async (call) => {
      setLoading(true);
      setError(null);
      try {
        const data = await call();
        localStorage.setItem(tokenKey, data.token);
        localStorage.setItem(userKey, JSON.stringify(data.user));
        setAccount(data.user);
        return true;
      } catch (e) {
        const details = e.response?.data?.details;
        setError(details?.length ? details.map(d => d.message.replace(/"/g, '')).join(' ') : (e.response?.data?.error || 'Something went wrong. Please try again.'));
        return false;
      } finally {
        setLoading(false);
      }
    }, []);

    const logout = useCallback(() => {
      localStorage.removeItem(tokenKey);
      localStorage.removeItem(userKey);
      setAccount(null);
    }, []);

    const update = useCallback((patch) => {
      setAccount(prev => {
        const next = { ...prev, ...patch };
        localStorage.setItem(userKey, JSON.stringify(next));
        return next;
      });
    }, []);

    return (
      <Ctx.Provider value={{ account, run, logout, update, error, setError, loading }}>
        {children}
      </Ctx.Provider>
    );
  }

  return { Provider, use: () => useContext(Ctx) };
}

const patientSession = makeSession({ tokenKey: PATIENT_TOKEN_KEY, userKey: 'queueless.patientUser' });
const doctorSession  = makeSession({ tokenKey: DOCTOR_TOKEN_KEY,  userKey: 'queueless.doctorUser' });

export const PatientProvider = patientSession.Provider;
export const DoctorProvider  = doctorSession.Provider;

export function usePatient() {
  const s = patientSession.use();
  return {
    ...s,
    patient: s.account,
    login: (email, password) => s.run(() => apiPatientLogin(email, password)),
    register: (data) => s.run(() => apiPatientRegister(data)),
  };
}

export function useDoctor() {
  const s = doctorSession.use();
  return {
    ...s,
    doctor: s.account,
    login: (username, password) => s.run(() => apiDoctorLogin(username, password)),
  };
}
