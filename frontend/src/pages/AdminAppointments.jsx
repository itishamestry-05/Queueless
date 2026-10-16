import { useEffect, useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useAppConfig } from '../hooks/useAppConfig.js';
import { getServiceLabel } from '../utils/industry.js';
import { apiListAppointments, apiConfirmAppointment, apiCancelAppointment, apiAdminDoctors, apiAssignAppointmentDoctor } from '../services/api.js';
import { STATUS_LABEL, STATUS_STYLE, OPEN_STATUSES, localDate, apiError } from '../utils/appointments.js';
import { fmtSlot } from '../utils/format.js';
import { showAlert, askConfirm } from '../components/Dialog.jsx';

export default function AdminAppointments() {
  const { user } = useAuth();
  const cfg = useAppConfig();
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');
  const [busyId, setBusyId] = useState(null);
  const [doctors, setDoctors] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [doctorsError, setDoctorsError] = useState(null);

  const reload = () => {
    apiListAppointments()
      .then(data => { setAppointments(data); setLoadError(null); })
      .catch(e => setLoadError(apiError(e, 'Could not load appointments.')))
      .finally(() => setLoading(false));
  };

  const loadDoctors = () => {
    apiAdminDoctors()
      .then(data => { setDoctors(data); setDoctorsError(null); })
      .catch(e => setDoctorsError(apiError(e, 'Could not load the doctor list, so doctors cannot be assigned.')));
  };

  const retry = () => { setLoading(true); setLoadError(null); reload(); loadDoctors(); };

  useEffect(() => {
    if (!user) return;
    reload();
    loadDoctors();
  }, [user]);

  if (!user) return <Navigate to="/admin/login" replace />;

  const filtered = appointments.filter(a => filter === 'all' || a.status === filter);
  const counts = { all: appointments.length, pending: 0, confirmed: 0, completed: 0, no_show: 0, cancelled: 0 };
  appointments.forEach(a => { if (counts[a.status] !== undefined) counts[a.status]++; });

  const handleConfirm = async (id) => {
    setBusyId(id);
    try { await apiConfirmAppointment(id); reload(); } catch (e) { showAlert(apiError(e, 'Could not confirm this appointment.')); } finally { setBusyId(null); }
  };

  const handleCancel = async (id) => {
    const a = appointments.find(x => x.id === id);
    const who = a ? `${a.name}'s appointment${a.bookingNo ? ` (${a.bookingNo})` : ''}` : 'this appointment';
    if (!(await askConfirm({ title: 'Cancel appointment', message: `Cancel ${who}? The time slot becomes free again.`, okLabel: 'Cancel appointment', cancelLabel: 'Keep it', danger: true }))) return;
    setBusyId(id);
    try { await apiCancelAppointment(id); reload(); } catch (e) { showAlert(apiError(e, 'Could not cancel this appointment.')); } finally { setBusyId(null); }
  };

  const handleAssign = async (id, doctorId) => {
    if (!doctorId) return;
    setBusyId(id);
    try { await apiAssignAppointmentDoctor(id, doctorId); reload(); }
    catch (e) { showAlert(apiError(e, 'Could not assign that doctor.')); }
    finally { setBusyId(null); }
  };

  const today = localDate();

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 xl:px-10 py-10">
      <div className="flex items-end justify-between mb-10 flex-wrap gap-4">
        <div>
          <div className="label">Admin · Appointments</div>
          <h1 className="font-display text-5xl tracking-tightest leading-none mt-2">Appointments</h1>
        </div>
        <div className="flex gap-3">
          <Link to="/admin/scan" className="btn-primary text-sm">Scan booking QR</Link>
          <Link to="/admin" className="btn-secondary text-sm">Back to dashboard</Link>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-1 mb-6 border-b border-rule pb-3">
        {['all', 'pending', 'confirmed', 'completed', 'no_show', 'cancelled'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 text-sm capitalize whitespace-nowrap transition-colors ${
              filter === f ? 'bg-ink text-paper' : 'text-graphite hover:text-ink'
            }`}
          >
            {f === 'all' ? 'All' : STATUS_LABEL[f]} <span className="ml-1 text-xs opacity-60">({counts[f]})</span>
          </button>
        ))}
      </div>

      {doctorsError && !loadError && (
        <div className="mb-6 p-3 border border-accent bg-accent/5 text-accent-deep text-sm flex flex-wrap items-center justify-between gap-3">
          <span>{doctorsError}</span>
          <button onClick={loadDoctors} className="btn-secondary text-xs px-3 py-1.5">Try again</button>
        </div>
      )}

      {loading ? (
        <div className="py-24 text-center text-graphite">Loading appointments…</div>
      ) : loadError ? (
        <div className="py-16 text-center border border-accent bg-accent/5 text-accent-deep text-sm">
          {loadError}
          <div className="mt-3"><button onClick={retry} className="btn-secondary text-xs px-3 py-1.5">Try again</button></div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-24 text-center border border-rule">
          <div className="font-display text-3xl text-ash">No {filter !== 'all' ? STATUS_LABEL[filter]?.toLowerCase() : ''} appointments</div>
          <p className="mt-2 text-sm text-graphite">Patients book from their account at <code className="font-mono">/book</code>.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(a => {
            const isToday = a.date === today;
            const isPast = a.date < today;
            return (
              <div
                key={a.id}
                className={`border bg-paper p-5 flex flex-col sm:flex-row sm:items-center gap-4 ${
                  isToday ? 'border-accent/40' : 'border-rule'
                } ${a.status === 'cancelled' ? 'opacity-50' : ''}`}
              >
                {/* Date/time */}
                <div className="shrink-0 text-center sm:w-24">
                  <div className={`font-display text-2xl tracking-tightest ${isToday ? 'text-accent' : 'text-ink'}`}>
                    {fmtSlot(a.timeSlot)}
                  </div>
                  <div className={`text-xs mt-0.5 ${isToday ? 'text-accent font-medium' : 'text-graphite'}`}>
                    {isToday ? 'Today' : isPast ? 'Past · ' + a.date : a.date}
                  </div>
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="font-medium">
                    {a.name}
                    {a.bookingNo && <span className="ml-3 font-mono text-xs text-graphite">{a.bookingNo}</span>}
                    {!a.patientId && <span className="ml-2 text-[10px] uppercase text-ash">guest</span>}
                  </div>
                  <div className="text-sm text-graphite mt-0.5">
                    {getServiceLabel(a.service, cfg.industry)}
                    {a.phone && <span className="ml-3">{a.phone}</span>}
                    {a.email && <span className="ml-3">{a.email}</span>}
                  </div>
                  {a.reason && <div className="text-xs text-graphite mt-1">Reason: {a.reason}</div>}
                  <div className="text-sm mt-2">
                    {OPEN_STATUSES.includes(a.status) ? (
                      <select
                        value={a.doctorId || ''}
                        onChange={e => handleAssign(a.id, e.target.value)}
                        disabled={busyId === a.id}
                        aria-label="Doctor"
                        className="border border-rule bg-cream px-2 py-1 text-sm focus:outline-none focus:border-ink"
                      >
                        {!a.doctorId && <option value="">Assign a doctor…</option>}
                        {a.doctorId && !doctors.some(d => d.username === a.doctorId) && <option value={a.doctorId}>{a.doctorName || a.doctorId}</option>}
                        {doctors.filter(d => d.active && d.specialty === a.service).map(d => (
                          <option key={d.username} value={d.username}>{d.displayName}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-graphite">{a.doctorName || 'No doctor'}</span>
                    )}
                  </div>
                </div>

                {/* Status + actions */}
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-xs px-2 py-0.5 border ${STATUS_STYLE[a.status] || ''}`}>
                    {STATUS_LABEL[a.status] || a.status}
                  </span>
                  {a.status === 'pending' && (
                    <>
                      <button
                        onClick={() => handleConfirm(a.id)}
                        disabled={busyId === a.id}
                        className="text-xs text-success border border-success/40 px-3 py-1 hover:bg-success hover:text-paper transition-colors disabled:opacity-40"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => handleCancel(a.id)}
                        disabled={busyId === a.id}
                        className="text-xs text-graphite border border-rule px-3 py-1 hover:border-accent hover:text-accent transition-colors disabled:opacity-40"
                      >
                        Cancel
                      </button>
                    </>
                  )}
                  {a.status === 'confirmed' && !isPast && (
                    <button
                      onClick={() => handleCancel(a.id)}
                      disabled={busyId === a.id}
                      className="text-xs text-graphite border border-rule px-3 py-1 hover:border-accent hover:text-accent transition-colors disabled:opacity-40"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
