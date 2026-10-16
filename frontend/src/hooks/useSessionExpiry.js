import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useStaff } from '../context/StaffContext.jsx';
import { usePatient, useDoctor } from '../context/HospitalAuthContext.jsx';
import { ADMIN_TOKEN_KEY, STAFF_TOKEN_KEY, PATIENT_TOKEN_KEY, DOCTOR_TOKEN_KEY } from '../services/api.js';
import { useSignOut } from './useSignOut.js';

/** Pages that belong to the patient / doctor portals (used to decide whether to redirect). */
export const isPatientPath = (p) => p === '/book' || p === '/patient' || p.startsWith('/patient/');
export const isDoctorPath = (p) => p === '/doctor' || p.startsWith('/doctor/');

const CHECK_INTERVAL_MS = 30_000;

/** Decode a JWT's expiry (seconds epoch) without verifying — display-only use. */
function tokenExpiry(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

function isExpired(key, now) {
  const token = localStorage.getItem(key);
  const exp = token ? tokenExpiry(token) : 0;
  return !token || Boolean(exp && exp <= now);
}

/**
 * Session expiry watchdog. Checks the stored admin, staff, patient and doctor
 * JWTs on mount and every 30 s; when a token has expired it signs that portal
 * out immediately and redirects to the matching login screen with a "session
 * expired" notice — instead of letting the user keep clicking until a request
 * 401s. Patient/doctor redirects only happen while on that portal's pages, so
 * an admin working on the same PC is not pulled away.
 */
export function useSessionExpiry() {
  const { user } = useAuth();
  const { staff } = useStaff();
  const { patient } = usePatient();
  const { doctor } = useDoctor();
  const { expire } = useSignOut();
  const { pathname } = useLocation();
  const pathRef = useRef(pathname);
  useEffect(() => { pathRef.current = pathname; }, [pathname]);

  useEffect(() => {
    if (!user && !staff && !patient && !doctor) return;

    const check = () => {
      const now = Date.now();
      const path = pathRef.current;

      if (user && isExpired(ADMIN_TOKEN_KEY, now)) {
        expire('admin');
        return;
      }

      if (staff && isExpired(STAFF_TOKEN_KEY, now)) {
        expire('staff');
        return;
      }

      if (patient && isExpired(PATIENT_TOKEN_KEY, now)) {
        const onPortal = isPatientPath(path);
        expire('patient', { redirect: onPortal, from: path });
        if (onPortal) return;
      }

      if (doctor && isExpired(DOCTOR_TOKEN_KEY, now)) {
        expire('doctor', { redirect: isDoctorPath(path), from: path });
      }
    };

    check();
    const id = setInterval(check, CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [user, staff, patient, doctor, expire]);
}
