import { useEffect, useState, useCallback } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { usePatient } from '../context/HospitalAuthContext.jsx';
import { useAppConfig } from '../hooks/useAppConfig.js';
import { getServiceLabel } from '../utils/industry.js';
import { apiPatientAppointments, apiPatientCancel } from '../services/api.js';
import { STATUS_LABEL, STATUS_STYLE, OPEN_STATUSES, localDate, formatDate, apiError } from '../utils/appointments.js';
import { fmtSlot } from '../utils/format.js';
import BookingQr from '../components/BookingQr.jsx';
import { PrescriptionView } from '../components/Prescription.jsx';
import { showAlert, askConfirm } from '../components/Dialog.jsx';

// Module level so it keeps its identity between renders (no remount, focus kept).
// `onCancel` is only passed for bookings that can still be cancelled.
function Card({ a, industry, orgName, onCancel, busy }) {
  const [qrOpen, setQrOpen] = useState(false);
  const [rxOpen, setRxOpen] = useState(false);
  const canShowQr = a.bookingNo && OPEN_STATUSES.includes(a.status);
  const rx = a.prescription;
  return (
    <div className="border border-rule bg-cream p-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="font-mono text-sm tracking-wider">{a.bookingNo || a.id.slice(0, 8)}</div>
        <div className="mt-1 font-medium">{getServiceLabel(a.service, industry)}</div>
        <div className="text-sm text-graphite">{a.doctorName || 'Doctor to be assigned'}</div>
        <div className="mt-2 text-sm">{formatDate(a.date)} · <strong>{fmtSlot(a.timeSlot)}</strong></div>
        {a.reason && <div className="mt-1 text-xs text-graphite">Reason: {a.reason}</div>}
        {rx && (
          <div className="mt-2 text-xs text-success">
            Prescription from {rx.doctorName || a.doctorName}
            {rx.medicines?.length ? ` · ${rx.medicines.length} medicine${rx.medicines.length > 1 ? 's' : ''}` : ''}
            {rx.followUpDate ? ` · follow-up ${formatDate(rx.followUpDate)}` : ''}
          </div>
        )}
      </div>
      <div className="flex flex-col items-end gap-2">
        <span className={`text-xs px-2 py-1 border ${STATUS_STYLE[a.status] || ''}`}>{STATUS_LABEL[a.status] || a.status}</span>
        {rx && (
          <button onClick={() => setRxOpen(v => !v)} aria-expanded={rxOpen} className="text-xs btn-primary px-3 py-1">
            {rxOpen ? 'Hide prescription' : 'View prescription'}
          </button>
        )}
        {canShowQr && (
          <button onClick={() => setQrOpen(v => !v)} aria-expanded={qrOpen} className="text-xs border border-ink px-3 py-1 hover:bg-ink hover:text-paper transition-colors">
            {qrOpen ? 'Hide QR code' : 'Show QR code'}
          </button>
        )}
        {onCancel && (
          <button onClick={() => onCancel(a)} disabled={busy} className="text-xs text-graphite hover:text-accent underline disabled:opacity-50">
            {busy ? 'Cancelling…' : 'Cancel booking'}
          </button>
        )}
      </div>
    </div>
    {qrOpen && canShowQr && (
      <div className="mt-5 pt-5 border-t border-rule text-center">
        <BookingQr bookingNo={a.bookingNo} size={200} />
        <p className="mt-2 text-xs text-graphite">Show this at reception. They scan it to confirm your visit.</p>
      </div>
    )}
    {rxOpen && rx && (
      <div className="mt-5 pt-5 border-t border-rule">
        <PrescriptionView appt={a} orgName={orgName} industry={industry} />
        <div className="mt-3 flex justify-end">
          <Link to={`/patient/prescription/${a.id}`} className="btn-secondary text-xs px-3 py-1.5">Open printable copy</Link>
        </div>
      </div>
    )}
    </div>
  );
}

export default function PatientDashboard() {
  const { patient } = usePatient();
  const cfg = useAppConfig();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const reload = useCallback(() => {
    apiPatientAppointments()
      .then(data => { setItems(data); setError(null); })
      .catch(e => setError(apiError(e, 'Could not load your appointments.')))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { if (patient) reload(); }, [patient, reload]);

  if (!patient) return <Navigate to="/patient/login" replace />;

  const today = localDate();
  const upcoming = items.filter(a => OPEN_STATUSES.includes(a.status) && a.date >= today)
    .sort((a, b) => `${a.date}${a.timeSlot}`.localeCompare(`${b.date}${b.timeSlot}`));
  const past = items.filter(a => !upcoming.includes(a));

  const handleCancel = async (a) => {
    if (!(await askConfirm({ title: 'Cancel booking', message: `Cancel ${a.bookingNo || 'your booking'} on ${formatDate(a.date)} at ${fmtSlot(a.timeSlot)}?`, okLabel: 'Cancel booking', cancelLabel: 'Keep it', danger: true }))) return;
    setBusyId(a.id);
    try { await apiPatientCancel(a.id); reload(); }
    catch (e) { showAlert(apiError(e, 'Could not cancel this booking.')); }
    finally { setBusyId(null); }
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-14">
      <div className="flex items-end justify-between flex-wrap gap-4 mb-10">
        <div>
          <div className="label">Patient portal</div>
          <h1 className="font-display text-5xl tracking-tightest leading-none mt-2">Hello, {patient.name?.split(' ')[0]}</h1>
        </div>
        <Link to="/book" className="btn-primary">Book appointment →</Link>
      </div>

      {error && <div className="mb-6 p-3 border border-accent bg-accent/5 text-accent-deep text-sm">{error}</div>}

      <h2 className="label mb-3">Upcoming</h2>
      {loading ? (
        <div className="text-graphite text-sm">Loading…</div>
      ) : upcoming.length === 0 ? (
        <div className="p-6 border border-dashed border-rule text-sm text-graphite">
          No upcoming appointments. <Link to="/book" className="underline hover:text-ink">Book one now</Link>.
        </div>
      ) : (
        <div className="space-y-3">{upcoming.map(a => (
          <Card key={a.id} a={a} industry={cfg.industry} orgName={cfg.orgName} onCancel={handleCancel} busy={busyId === a.id} />
        ))}</div>
      )}

      {past.length > 0 && (
        <>
          <h2 className="label mt-12 mb-3">History</h2>
          <div className="space-y-3">{past.map(a => <Card key={a.id} a={a} industry={cfg.industry} orgName={cfg.orgName} />)}</div>
        </>
      )}
    </div>
  );
}
