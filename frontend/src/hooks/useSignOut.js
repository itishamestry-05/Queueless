import { startTransition, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useStaff } from '../context/StaffContext.jsx';
import { usePatient, useDoctor } from '../context/HospitalAuthContext.jsx';

export const LOGIN_PATH = {
  admin: '/admin/login',
  staff: '/staff/login',
  patient: '/patient/login',
  doctor: '/doctor/login',
};

/**
 * Session teardown shared by the header, dashboards and the expiry watchdog.
 *
 * React Router 7 applies navigation inside a React transition. Clearing a
 * session with a plain state update therefore renders the current page first,
 * with nobody signed in, and that page's own guard redirects somewhere else
 * (a staff member signing out on /notifications landed on the admin sign-in).
 * Running the logout and the navigation in one transition commits them
 * together, so the chosen sign-in page always wins.
 */
export function useSignOut() {
  const navigate = useNavigate();
  const { logout: adminLogout } = useAuth();
  const { logout: staffLogout } = useStaff();
  const { logout: patientLogout } = usePatient();
  const { logout: doctorLogout } = useDoctor();

  const endSession = useCallback((role) => {
    ({ admin: adminLogout, staff: staffLogout, patient: patientLogout, doctor: doctorLogout })[role]();
  }, [adminLogout, staffLogout, patientLogout, doctorLogout]);

  /**
   * Manual sign-out: ends every session in this browser, not just the one on
   * screen. Otherwise a second login (an admin who also opened a staff counter)
   * takes over the header and the person still looks signed in.
   */
  const signOut = useCallback((role) => {
    startTransition(() => {
      Object.keys(LOGIN_PATH).forEach(endSession);
      navigate(LOGIN_PATH[role], { replace: true, state: { signedOut: true } });
    });
  }, [endSession, navigate]);

  /** Expired token: ends only that session; redirects only when asked to. */
  const expire = useCallback((role, { redirect = true, from } = {}) => {
    startTransition(() => {
      endSession(role);
      if (redirect) navigate(LOGIN_PATH[role], { replace: true, state: { sessionExpired: true, from } });
    });
  }, [endSession, navigate]);

  return { signOut, expire };
}
