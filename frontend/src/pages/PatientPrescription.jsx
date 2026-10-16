import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { usePatient } from '../context/HospitalAuthContext.jsx';
import { useAppConfig } from '../hooks/useAppConfig.js';
import { apiPatientAppointments } from '../services/api.js';
import { apiError } from '../utils/appointments.js';
import { PrescriptionView } from '../components/Prescription.jsx';

// Printable copy of one of the signed-in patient's prescriptions.
export default function PatientPrescription() {
  const { id } = useParams();
  const { patient } = usePatient();
  const cfg = useAppConfig();
  const [appt, setAppt] = useState(undefined);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!patient) return undefined;
    let alive = true;
    apiPatientAppointments()
      .then(list => { if (alive) setAppt(list.find(a => a.id === id) || null); })
      .catch(e => { if (alive) setError(apiError(e, 'Could not load this prescription.')); });
    return () => { alive = false; };
  }, [patient, id]);

  if (!patient) return <Navigate to="/patient/login" replace state={{ from: `/patient/prescription/${id}` }} />;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 print:p-0 print:max-w-none">
      <div className="flex items-center justify-between gap-4 mb-6 print:hidden">
        <Link to="/patient" className="text-sm text-graphite hover:text-ink underline underline-offset-2">Back to my appointments</Link>
        {appt?.prescription && <button type="button" onClick={() => window.print()} className="btn-primary text-sm">Print or save as PDF</button>}
      </div>
      {error ? (
        <div className="p-4 border border-accent bg-accent/5 text-accent-deep text-sm">{error}</div>
      ) : appt === undefined ? (
        <div className="text-sm text-graphite">Loading prescription…</div>
      ) : !appt?.prescription ? (
        <div className="p-8 border border-dashed border-rule text-center text-sm text-graphite">
          No prescription yet for this appointment. It appears here once the doctor writes it.
        </div>
      ) : (
        <PrescriptionView appt={appt} orgName={cfg.orgName} industry={cfg.industry} />
      )}
    </div>
  );
}
