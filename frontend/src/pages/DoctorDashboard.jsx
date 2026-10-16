import { useEffect, useState, useCallback, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useDoctor } from '../context/HospitalAuthContext.jsx';
import { useAppConfig } from '../hooks/useAppConfig.js';
import { getServiceLabel } from '../utils/industry.js';
import { apiDoctorAppointments, apiDoctorSetOutcome } from '../services/api.js';
import { STATUS_LABEL, STATUS_STYLE, OPEN_STATUSES, localDate, addDays, formatDate, FIELD, FIELD_INLINE, apiError } from '../utils/appointments.js';
import { fmtSlot } from '../utils/format.js';
import { showAlert, askConfirm } from '../components/Dialog.jsx';
import { PrescriptionEditor } from '../components/Prescription.jsx';

// Statuses a prescription can be written or corrected for (matches the server).
const RX_STATUSES = ['pending', 'confirmed', 'completed'];

export default function DoctorDashboard() {
  const { doctor } = useDoctor();
  const cfg = useAppConfig();
  const [date, setDate] = useState(localDate());
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [nextDate, setNextDate] = useState(null);
  const [editing, setEditing] = useState(null);

  // Only the latest request may update the screen (fast date clicks overlap).
  const reqId = useRef(0);
  const reload = useCallback(() => {
    const id = ++reqId.current;
    const current = () => id === reqId.current;
    setLoading(true);
    apiDoctorAppointments(date)
      .then(data => { if (current()) { setItems(data); setError(null); } })
      .catch(e => { if (current()) setError(apiError(e, 'Could not load appointments.')); })
      .finally(() => { if (current()) setLoading(false); });
    // Next day with an open appointment, so an empty day is not a dead end.
    apiDoctorAppointments()
      .then(all => {
        if (!current()) return;
        const next = all.filter(a => OPEN_STATUSES.includes(a.status) && a.date > date && a.date >= localDate())
          .map(a => a.date).sort()[0];
        setNextDate(next || null);
      })
      .catch(() => { if (current()) setNextDate(null); });
  }, [date]);

  // Ignore responses that arrive after the page is closed.
  useEffect(() => () => { reqId.current++; }, []);

  useEffect(() => { if (doctor) reload(); }, [doctor, reload]);

  if (!doctor) return <Navigate to="/doctor/login" replace />;

  const active = items.filter(a => a.status !== 'cancelled');
  const waiting = active.filter(a => OPEN_STATUSES.includes(a.status)).length;

  const setOutcome = async (a, status) => {
    if (status === 'no_show' && !(await askConfirm({ title: 'Mark as missed', message: `Mark ${a.name} as missed? This cannot be changed later.`, okLabel: 'Mark missed', danger: true }))) return;
    setBusyId(a.id);
    try { await apiDoctorSetOutcome(a.id, status); reload(); }
    catch (e) { showAlert(apiError(e, 'Could not update this appointment.')); }
    finally { setBusyId(null); }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
      <div className="flex items-end justify-between flex-wrap gap-4 mb-8">
        <div>
          <div className="label">Doctor portal · {getServiceLabel(doctor.specialty, cfg.industry)}</div>
          <h1 className="font-display text-5xl tracking-tightest leading-none mt-2">{doctor.displayName}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setDate(d => addDays(d, -1))} className="btn-secondary text-sm px-3" aria-label="Previous day">←</button>
          <input type="date" value={date} onChange={e => e.target.value && setDate(e.target.value)} className={FIELD_INLINE} />
          <button onClick={() => setDate(d => addDays(d, 1))} className="btn-secondary text-sm px-3" aria-label="Next day">→</button>
          {date !== localDate() && <button onClick={() => setDate(localDate())} className="text-xs underline text-graphite hover:text-ink">Today</button>}
        </div>
      </div>

      <div className="mb-6 text-sm text-graphite">
        {/* Counts only once this day's list has arrived, never "0" while loading. */}
        {formatDate(date)}:{' '}
        {loading ? 'loading appointments…' : (
          <><strong className="text-ink">{active.length}</strong> appointment{active.length === 1 ? '' : 's'}, <strong className="text-ink">{waiting}</strong> still to see</>
        )}
      </div>

      {error && <div className="mb-6 p-3 border border-accent bg-accent/5 text-accent-deep text-sm">{error}</div>}

      {loading ? (
        <div className="text-graphite text-sm">Loading…</div>
      ) : items.length === 0 ? (
        <div className="p-8 border border-dashed border-rule text-sm text-graphite text-center">
          No appointments on this day.
          {nextDate && (
            <div className="mt-3">
              <button onClick={() => setDate(nextDate)} className="btn-secondary text-xs px-3 py-1.5">Go to next appointment day: {formatDate(nextDate)}</button>
            </div>
          )}
        </div>
      ) : (
        <div className="border border-rule divide-y divide-rule">
          {items.map(a => (
            <div key={a.id} className={`p-4 sm:p-5 flex flex-wrap items-start gap-4 ${a.status === 'cancelled' ? 'opacity-50' : ''}`}>
              <div className="w-20 shrink-0 font-mono text-base">{fmtSlot(a.timeSlot)}</div>
              <div className="flex-1 min-w-[12rem]">
                <div className="font-medium">{a.name}</div>
                <div className="text-xs text-graphite mt-0.5">
                  <span className="font-mono">{a.bookingNo || a.id.slice(0, 8)}</span>
                  {a.phone && <> · {a.phone}</>}
                </div>
                {a.reason && <div className="text-sm mt-2">Reason: {a.reason}</div>}
                {a.prescription && (
                  <div className="text-xs mt-2 text-success">
                    Prescription written{a.prescription.diagnosis ? `: ${a.prescription.diagnosis}` : ''}
                    {a.prescription.medicines?.length ? ` · ${a.prescription.medicines.length} medicine${a.prescription.medicines.length > 1 ? 's' : ''}` : ''}
                  </div>
                )}
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className={`text-xs px-2 py-1 border ${STATUS_STYLE[a.status] || ''}`}>{STATUS_LABEL[a.status] || a.status}</span>
                {/* Outcomes and prescriptions only on or after the appointment day. */}
                {RX_STATUSES.includes(a.status) && a.date <= localDate() && (
                  <button onClick={() => setEditing(a)} disabled={busyId === a.id} className={`${a.prescription ? 'btn-secondary' : 'btn-primary'} text-xs px-3 py-1.5`}>
                    {a.prescription ? 'Edit prescription' : 'Write prescription'}
                  </button>
                )}
                {OPEN_STATUSES.includes(a.status) && a.date <= localDate() && (
                  <div className="flex gap-2">
                    <button onClick={() => setOutcome(a, 'completed')} disabled={busyId === a.id} className="btn-secondary text-xs px-3 py-1.5">Mark seen</button>
                    <button onClick={() => setOutcome(a, 'no_show')} disabled={busyId === a.id} className="btn-secondary text-xs px-3 py-1.5">Missed</button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <PrescriptionEditor
          appt={editing}
          canComplete={OPEN_STATUSES.includes(editing.status)}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }}
        />
      )}
    </div>
  );
}
