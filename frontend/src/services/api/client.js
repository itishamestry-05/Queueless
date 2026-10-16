import axios from 'axios';

const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api/v1';

export const api = axios.create({
  baseURL,
  timeout: 10_000,
  headers: { 'Content-Type': 'application/json' },
});

export const ADMIN_TOKEN_KEY = 'queueless.adminToken';
export const STAFF_TOKEN_KEY  = 'queueless.staffToken';
export const PATIENT_TOKEN_KEY = 'queueless.patientToken';
export const DOCTOR_TOKEN_KEY  = 'queueless.doctorToken';
// Legacy alias kept for AuthContext compatibility
export const TOKEN_KEY = ADMIN_TOKEN_KEY;

// Hospital portals carry their own tokens so a patient or doctor session never
// mixes with an admin/staff session in the same browser.
const isPatientRoute = (url) => url.startsWith('/patients/me');
const isDoctorRoute  = (url) => url.startsWith('/doctor/');
const isLoginRoute   = (url) => /\/(login|register)(\/|$)/.test(url);

// A stored token past its expiry is treated as absent, so an old admin
// session cannot shadow a valid staff session on shared routes.
function liveToken(key) {
  const token = localStorage.getItem(key);
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.exp && payload.exp * 1000 <= Date.now()) return null;
  } catch { /* not a JWT we can read: let the server decide */ }
  return token;
}

api.interceptors.request.use((config) => {
  const url = config.url || '';
  // Staff routes must always use the staff JWT (it carries the service claim).
  // All other routes use the admin token first, falling back to staff token.
  let token;
  if (isPatientRoute(url)) token = liveToken(PATIENT_TOKEN_KEY);
  else if (isDoctorRoute(url)) token = liveToken(DOCTOR_TOKEN_KEY);
  else if (url.startsWith('/staff/')) token = liveToken(STAFF_TOKEN_KEY);
  else if (window.location.pathname.startsWith('/staff') || window.location.pathname === '/kiosk') {
    // Shared features (messaging, notifications, files) act as whoever owns
    // the page: on staff pages that is the staff member, not a leftover admin.
    token = liveToken(STAFF_TOKEN_KEY) || liveToken(ADMIN_TOKEN_KEY);
  } else {
    token = liveToken(ADMIN_TOKEN_KEY) || liveToken(STAFF_TOKEN_KEY);
  }
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => {
    // Tell live screens a queue change just succeeded so they refresh now.
    const method = (res.config?.method || 'get').toLowerCase();
    if (method !== 'get' && /^\/(admin\/queue|staff\/queue|tokens|appointments|patients\/me\/appointments)/.test(res.config?.url || '')) {
      window.dispatchEvent(new Event('queueless:queue-changed'));
    }
    return res;
  },
  (err) => {
    // Only force-logout on 401 from protected routes, not public endpoints.
    // This prevents a cold-start backend error from silently wiping the session.
    const url = err.config?.url || '';
    // A wrong password on a sign-in form is a 401 too; that must show the
    // error on the form, not bounce the page.
    // /staff/presence: the sign-out heartbeat fires after the token is cleared.
    if (err.response?.status === 401 && !isLoginRoute(url) && url !== '/staff/presence') {
      if (isPatientRoute(url) || isDoctorRoute(url)) {
        const patient = isPatientRoute(url);
        localStorage.removeItem(patient ? PATIENT_TOKEN_KEY : DOCTOR_TOKEN_KEY);
        localStorage.removeItem(patient ? 'queueless.patientUser' : 'queueless.doctorUser');
        window.location.href = patient ? '/patient/login' : '/doctor/login';
        return Promise.reject(err);
      }
      const isProtected = url.startsWith('/admin/') || url.startsWith('/staff/');
      if (isProtected) {
        // Clear only the session that failed: an expired staff login must not
        // also sign out an admin working in the same browser.
        const isStaff = url.startsWith('/staff/');
        localStorage.removeItem(isStaff ? STAFF_TOKEN_KEY : ADMIN_TOKEN_KEY);
        localStorage.removeItem(isStaff ? 'queueless.staffUser' : 'queueless.adminUser');
        // Hard redirect so React state resets cleanly.
        window.location.href = isStaff ? '/staff/login' : '/admin/login';
      }
    }
    return Promise.reject(err);
  }
);
