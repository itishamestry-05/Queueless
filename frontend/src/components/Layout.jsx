import { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useStaff } from '../context/StaffContext.jsx';
import { usePatient, useDoctor } from '../context/HospitalAuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { useAppConfig } from '../hooks/useAppConfig.js';
import { useSessionExpiry, isPatientPath, isDoctorPath } from '../hooks/useSessionExpiry.js';
import { useSignOut } from '../hooks/useSignOut.js';
import ThemeSwitch from './ThemeSwitch.jsx';
import AssistantDock from './AssistantDock.jsx';
import MessagingDeck from './MessagingDeck.jsx';
import NotificationBell from './NotificationBell.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import { RELEASE_BADGE } from '../config/release.js';

export default function Layout({ children }) {
  const { user } = useAuth();
  const { staff } = useStaff();
  const { patient } = usePatient();
  const { doctor } = useDoctor();
  const { dark, toggle: toggleTheme } = useTheme();
  const { signOut } = useSignOut();
  const loc = useLocation();
  const onDisplay = loc.pathname === '/display';
  // Patient/doctor links show on their own pages even when an admin or staff
  // session is also active on this PC; elsewhere only when neither is signed in.
  const portalHere = isDoctorPath(loc.pathname) && doctor ? 'doctor'
    : isPatientPath(loc.pathname) && patient ? 'patient'
      : null;
  const portal = portalHere || (!user && !staff ? (doctor ? 'doctor' : patient ? 'patient' : null) : null);
  // On a patient/doctor page, hide the admin/staff link row so the header fits.
  const hideStaffNav = Boolean(portalHere);
  // Signed-out visitors get the public links everywhere, including the admin
  // and staff sign-in pages they land on after signing out.
  const showPublicNav = !user && !staff && !portal;
  const portalLinks = portal === 'doctor'
    ? [{ to: '/doctor', label: 'My appointments' }]
    : portal === 'patient'
      ? [{ to: '/patient', label: 'My appointments' }, { to: '/book', label: 'Book appointment' }]
      : [];
  const [mobileOpen, setMobileOpen] = useState(false);
  const [adminDropOpen, setAdminDropOpen] = useState(false);
  const dropRef = useRef(null);

  const cfg = useAppConfig();

  // Auto-logout with a "session expired" notice when the JWT lapses.
  useSessionExpiry();

  const logoTarget = user ? '/admin' : staff ? '/staff' : portal ? `/${portal}` : '/';
  const logoSrc = dark
    ? '/svg/queueless-wordmark-dark.svg'
    : '/svg/queueless-wordmark-light.svg';

  // `role` picks which sign-in page to land on; every session ends.
  const handleSignOut = (role) => {
    setMobileOpen(false);
    setAdminDropOpen(false);
    signOut(role);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target)) {
        setAdminDropOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Close dropdown on Escape
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') setAdminDropOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // The display screen has no chrome. Kept below every hook (rules of hooks).
  if (onDisplay) return <ErrorBoundary key={loc.pathname}>{children}</ErrorBoundary>;

  const adminNavLinks = [
    { to: '/admin', label: 'Dashboard' },
    { to: '/admin/queues', label: 'Queues' },
    { to: '/admin/analytics', label: 'Analytics' },
    { to: '/admin/staff', label: 'Staff' },
    { to: '/admin/doctors', label: 'Doctors' },
    { to: '/admin/appointments', label: 'Appointments' },
    { to: '/admin/scan', label: 'Scan QR' },
    { to: '/files', label: 'Files' },
    { to: '/admin/manage', label: 'Admins' },
    { to: '/admin/audit', label: 'Activity' },
    { to: '/admin/setup', label: 'Settings' },
  ];

  return (
    <div className="min-h-screen flex flex-col pb-20">
      <header className="border-b border-rule sticky top-0 z-40 bg-paper print:hidden">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 xl:px-10 py-3 flex items-center justify-between gap-4">
          {/* Logo only — org identity lives in the footer status bar */}
          <Link to={logoTarget} className="flex items-center shrink-0 group">
            <img
              src={logoSrc}
              alt="QueueLess"
              className="h-6 sm:h-7 w-auto transition-opacity duration-200"
            />
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1 text-sm flex-1 justify-center">
            {showPublicNav && (
              <>
                <Link to="/book" className="px-3 py-1.5 text-graphite hover:text-ink transition-colors rounded">Book appointment</Link>
                <Link to="/patient/login" className="px-3 py-1.5 text-graphite hover:text-ink transition-colors rounded">Patient</Link>
                <Link to="/doctor/login" className="px-3 py-1.5 text-graphite hover:text-ink transition-colors rounded">Doctor</Link>
                <Link to="/history" className="px-3 py-1.5 text-graphite hover:text-ink transition-colors rounded">My tokens</Link>
                <Link to="/staff/login" className="px-3 py-1.5 text-graphite hover:text-ink transition-colors rounded">Staff</Link>
                <Link to="/admin/login" className="px-3 py-1.5 text-graphite hover:text-ink transition-colors rounded">Admin</Link>
              </>
            )}
            {user && !hideStaffNav && adminNavLinks.map(l => (
              <Link
                key={l.to}
                to={l.to}
                className={`px-3 py-1.5 transition-colors rounded font-medium ${
                  loc.pathname === l.to
                    ? 'text-ink bg-ink/5'
                    : 'text-graphite hover:text-ink hover:bg-ink/5'
                }`}
              >
                {l.label}
              </Link>
            ))}
            {staff && !user && !hideStaffNav && (
              <Link to="/staff" className="px-3 py-1.5 text-graphite hover:text-ink transition-colors rounded font-medium">My Queue</Link>
            )}
            {portalLinks.map(l => (
              <Link
                key={l.to}
                to={l.to}
                className={`px-3 py-1.5 transition-colors rounded font-medium ${loc.pathname === l.to ? 'text-ink bg-ink/5' : 'text-graphite hover:text-ink hover:bg-ink/5'}`}
              >
                {l.label}
              </Link>
            ))}
          </nav>

          {/* Right side controls */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Notification center (self-hides unless an admin/staff is signed in) */}
            {(user || staff) && <NotificationBell />}

            {/* Quick theme toggle when there is no account menu to hold it */}
            {!user && !staff && (
              <button
                onClick={toggleTheme}
                className="p-2 text-graphite hover:text-ink transition-colors"
                aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
                title={dark ? 'Light mode' : 'Dark mode'}
              >
                {dark ? '☀' : '◑'}
              </button>
            )}

            {/* Staff dropdown (not admin) */}
            {staff && !user && (
              <div className="relative hidden md:block" ref={dropRef}>
                <button
                  onClick={() => setAdminDropOpen(o => !o)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 border transition-colors text-xs font-medium tracking-wide ${
                    adminDropOpen
                      ? 'border-ink bg-ink text-paper'
                      : 'border-rule text-graphite hover:border-ink hover:text-ink'
                  }`}
                  aria-expanded={adminDropOpen}
                  aria-haspopup="true"
                >
                  <span>{(staff.displayName || staff.username || 'STAFF').toUpperCase()}</span>
                  <img
                    src="/svg/chevron-down.svg"
                    alt=""
                    aria-hidden="true"
                    className={`w-3 h-3 transition-transform ${adminDropOpen ? 'rotate-180 brightness-0 invert dark:invert-0' : ''}`}
                  />
                </button>

                {adminDropOpen && (
                  <div className="absolute right-0 top-full mt-1 w-52 bg-paper border border-rule shadow-lg z-50">
                    <div className="px-4 py-3 border-b border-rule">
                      <div className="label mb-2">Theme</div>
                      <ThemeSwitch />
                    </div>
                    <div className="py-1">
                      <Link to="/staff" onClick={() => setAdminDropOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-graphite hover:text-ink hover:bg-cream transition-colors">
                        <span className="text-base leading-none">🖥</span>
                        <span>My queue</span>
                      </Link>
                      <Link to="/staff/profile" onClick={() => setAdminDropOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-graphite hover:text-ink hover:bg-cream transition-colors">
                        <span className="text-base leading-none">👤</span>
                        <span>My profile</span>
                      </Link>
                      <Link to="/staff/change-password" onClick={() => setAdminDropOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-graphite hover:text-ink hover:bg-cream transition-colors">
                        <span className="text-base leading-none">🔑</span>
                        <span>Change password</span>
                      </Link>
                      <Link to="/assistant" onClick={() => setAdminDropOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-graphite hover:text-ink hover:bg-cream transition-colors">
                        <span className="text-base leading-none">✦</span>
                        <span>AI Workspace</span>
                      </Link>
                      <Link to="/files" onClick={() => setAdminDropOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-graphite hover:text-ink hover:bg-cream transition-colors">
                        <span className="text-base leading-none">📁</span>
                        <span>Shared files</span>
                      </Link>
                      <Link to="/notifications" onClick={() => setAdminDropOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-graphite hover:text-ink hover:bg-cream transition-colors">
                        <span className="text-base leading-none">🔔</span>
                        <span>Notifications</span>
                      </Link>
                    </div>
                    <div className="border-t border-rule py-1">
                      <button
                        onClick={() => handleSignOut('staff')}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-graphite hover:text-accent hover:bg-accent/5 transition-colors"
                      >
                        <span className="text-base leading-none">↩</span>
                        <span>Sign out</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Admin dropdown */}
            {user && (
              <div className="relative hidden md:block" ref={dropRef}>
                <button
                  onClick={() => setAdminDropOpen(o => !o)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 border transition-colors text-xs font-medium tracking-wide ${
                    adminDropOpen
                      ? 'border-ink bg-ink text-paper'
                      : 'border-rule text-graphite hover:border-ink hover:text-ink'
                  }`}
                  aria-expanded={adminDropOpen}
                  aria-haspopup="true"
                >
                  <span>{user.username?.toUpperCase() || 'ADMIN'}</span>
                  <img
                    src="/svg/chevron-down.svg"
                    alt=""
                    aria-hidden="true"
                    className={`w-3 h-3 transition-transform ${adminDropOpen ? 'rotate-180 brightness-0 invert dark:invert-0' : ''}`}
                  />
                </button>

                {adminDropOpen && (
                  <div className="absolute right-0 top-full mt-1 w-52 bg-paper border border-rule shadow-lg z-50">
                    <div className="px-4 py-3 border-b border-rule">
                      <div className="label mb-2">Theme</div>
                      <ThemeSwitch />
                    </div>

                    {/* Menu items */}
                    <div className="py-1">
                      <Link
                        to="/admin/profile"
                        onClick={() => setAdminDropOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-graphite hover:text-ink hover:bg-cream transition-colors"
                      >
                        <span className="text-base leading-none">👤</span>
                        <span>My profile</span>
                      </Link>
                      <Link
                        to="/admin/change-password"
                        onClick={() => setAdminDropOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-graphite hover:text-ink hover:bg-cream transition-colors"
                      >
                        <span className="text-base leading-none">🔑</span>
                        <span>Change password</span>
                      </Link>
                      <Link
                        to="/assistant"
                        onClick={() => setAdminDropOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-graphite hover:text-ink hover:bg-cream transition-colors"
                      >
                        <span className="text-base leading-none">✦</span>
                        <span>AI Workspace</span>
                      </Link>
                      <Link
                        to="/notifications"
                        onClick={() => setAdminDropOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-graphite hover:text-ink hover:bg-cream transition-colors"
                      >
                        <span className="text-base leading-none">🔔</span>
                        <span>Notifications</span>
                      </Link>
                    </div>

                    <div className="border-t border-rule py-1">
                      <button
                        onClick={() => handleSignOut('admin')}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-graphite hover:text-accent hover:bg-accent/5 transition-colors"
                      >
                        <span className="text-base leading-none">↩</span>
                        <span>Sign out</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {portal && (
              <div className="hidden md:flex items-center gap-3 text-xs">
                <span className="text-graphite">{(portal === 'doctor' ? doctor.displayName : patient.name) || ''}</span>
                <button onClick={() => handleSignOut(portal)} className="px-3 py-1.5 border border-rule text-graphite hover:text-accent hover:border-accent transition-colors">Sign out</button>
              </div>
            )}

            {/* Mobile hamburger */}
            <button
              className="md:hidden p-2 text-graphite hover:text-ink"
              onClick={() => setMobileOpen(o => !o)}
              aria-label="Menu"
            >
              {mobileOpen ? '✕' : '☰'}
            </button>
          </div>
        </div>

        {/* Mobile dropdown */}
        {mobileOpen && (
          <div className="md:hidden border-t border-rule bg-paper">
            <nav className="flex flex-col px-4 py-3 gap-1 text-sm">
              {showPublicNav && (
                <>
                  <Link to="/book" onClick={() => setMobileOpen(false)} className="py-2 text-graphite hover:text-ink">Book appointment</Link>
                  <Link to="/patient/login" onClick={() => setMobileOpen(false)} className="py-2 text-graphite hover:text-ink">Patient sign in</Link>
                  <Link to="/doctor/login" onClick={() => setMobileOpen(false)} className="py-2 text-graphite hover:text-ink">Doctor sign in</Link>
                  <Link to="/history" onClick={() => setMobileOpen(false)} className="py-2 text-graphite hover:text-ink">My tokens</Link>
                  <Link to="/staff/login" onClick={() => setMobileOpen(false)} className="py-2 text-graphite hover:text-ink">Staff portal</Link>
                  <Link to="/admin/login" onClick={() => setMobileOpen(false)} className="py-2 text-graphite hover:text-ink">Admin portal</Link>
                </>
              )}
              {user && adminNavLinks.map(l => (
                <Link key={l.to} to={l.to} onClick={() => setMobileOpen(false)} className="py-2 text-graphite hover:text-ink font-medium">{l.label}</Link>
              ))}
              {user && (
                <>
                  <div className="py-2 border-t border-rule mt-1">
                    <div className="label mb-2">Theme</div>
                    <ThemeSwitch />
                  </div>
                  <Link to="/admin/profile" onClick={() => setMobileOpen(false)} className="py-2 text-graphite hover:text-ink">My profile</Link>
                  <Link to="/admin/change-password" onClick={() => setMobileOpen(false)} className="py-2 text-graphite hover:text-ink">Change password</Link>
                  <Link to="/assistant" onClick={() => setMobileOpen(false)} className="py-2 text-graphite hover:text-ink">AI Workspace</Link>
                  <Link to="/notifications" onClick={() => setMobileOpen(false)} className="py-2 text-graphite hover:text-ink">Notifications</Link>
                  <button onClick={() => handleSignOut('admin')} className="text-left py-2 text-graphite hover:text-accent">
                    Sign out
                  </button>
                </>
              )}
              {staff && !user && (
                <>
                  <Link to="/staff" onClick={() => setMobileOpen(false)} className="py-2 text-graphite hover:text-ink font-medium">My Queue</Link>
                  <Link to="/staff/profile" onClick={() => setMobileOpen(false)} className="py-2 text-graphite hover:text-ink">My profile</Link>
                  <Link to="/staff/change-password" onClick={() => setMobileOpen(false)} className="py-2 text-graphite hover:text-ink">Change password</Link>
                  <Link to="/assistant" onClick={() => setMobileOpen(false)} className="py-2 text-graphite hover:text-ink">AI Workspace</Link>
                  <Link to="/files" onClick={() => setMobileOpen(false)} className="py-2 text-graphite hover:text-ink">Shared files</Link>
                  <Link to="/notifications" onClick={() => setMobileOpen(false)} className="py-2 text-graphite hover:text-ink">Notifications</Link>
                  <div className="py-2 border-t border-rule mt-1">
                    <div className="label mb-2">Theme</div>
                    <ThemeSwitch />
                  </div>
                  <button onClick={() => handleSignOut('staff')} className="text-left py-2 text-graphite hover:text-accent">
                    Sign out
                  </button>
                </>
              )}
              {portal && (
                <>
                  {portalLinks.map(l => (
                    <Link key={l.to} to={l.to} onClick={() => setMobileOpen(false)} className="py-2 text-graphite hover:text-ink font-medium">{l.label}</Link>
                  ))}
                  <button onClick={() => handleSignOut(portal)} className="text-left py-2 text-graphite hover:text-accent">Sign out</button>
                </>
              )}
              {!user && !staff && (
                <div className="py-2 border-t border-rule mt-1">
                  <div className="label mb-2">Theme</div>
                  <ThemeSwitch />
                </div>
              )}
            </nav>
          </div>
        )}
      </header>

      <main className="flex-1"><ErrorBoundary key={loc.pathname}>{children}</ErrorBoundary></main>

      <footer className="border-t border-rule mt-12 print:hidden">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 xl:px-10 py-4 flex flex-col sm:flex-row gap-2 sm:gap-6 items-start sm:items-center justify-between text-xs text-graphite">
          <div className="flex items-center gap-2 min-w-0">
            {cfg?.orgName && cfg.orgName !== 'QueueLess' ? (
              <span
                className="flex items-center gap-1.5 min-w-0 truncate"
                title={cfg.location ? `${cfg.orgName} · ${cfg.location}` : cfg.orgName}
              >
                <img src="/svg/location-pin.svg" alt="" aria-hidden="true" className="w-3 h-3 shrink-0 opacity-70" />
                <span className="font-medium text-ink">{cfg.orgName}</span>
                {cfg.location && (
                  <>
                    <span className="text-rule">·</span>
                    <span className="text-graphite font-normal">{cfg.location}</span>
                  </>
                )}
              </span>
            ) : (
              <span className="font-medium text-ink">QueueLess</span>
            )}
          </div>
          <span className="flex items-center gap-3">
            <Link to="/credits" className="hover:text-ink transition-colors underline underline-offset-2">Credits</Link>
            <span className="font-mono">{RELEASE_BADGE} · cloud-native token qms</span>
          </span>
        </div>
      </footer>

      {/* Global floating docks (self-hide unless an admin/staff is signed in) */}
      <AssistantDock />
      <MessagingDeck />
    </div>
  );
}
