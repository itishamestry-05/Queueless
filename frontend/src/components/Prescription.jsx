import { useEffect, useState } from 'react';
import { apiDoctorSavePrescription } from '../services/api.js';
import { getServiceLabel } from '../utils/industry.js';
import { formatDate, apiError, addDays, FIELD } from '../utils/appointments.js';
import { fmtSlot, fmtDate } from '../utils/format.js';

export const TIMING_LABEL = {
  before_food: 'Before food',
  after_food: 'After food',
  with_food: 'With food',
  empty_stomach: 'Empty stomach',
  bedtime: 'At bedtime',
  as_needed: 'Only when needed',
};

const FREQUENCIES = ['1-0-0', '0-0-1', '1-0-1', '1-1-1', '0-1-0', '1-1-1-1', 'Once a week', 'SOS'];
const DURATIONS = ['3 days', '5 days', '7 days', '10 days', '14 days', '1 month', '3 months', 'Continue'];

// "1-0-1" is how Indian prescriptions write doses: morning-afternoon-night
// (four parts add evening). Spell it out so the patient cannot misread it.
export function describeFrequency(f) {
  if (!f) return '';
  const parts = String(f).trim().split('-');
  if (!(parts.length === 3 || parts.length === 4) || !parts.every(p => /^\d+(\.\d+)?$/.test(p) || p === '½')) return f;
  const names = parts.length === 3 ? ['morning', 'afternoon', 'night'] : ['morning', 'afternoon', 'evening', 'night'];
  const taken = parts.map((p, i) => (p !== '0' ? (p === '1' ? names[i] : `${p} in the ${names[i]}`) : null)).filter(Boolean);
  if (!taken.length) return f;
  const text = taken.join(', ');
  return `${text.charAt(0).toUpperCase()}${text.slice(1)} (${f})`;
}

const EMPTY_MED = { name: '', dosage: '', frequency: '', timing: 'after_food', duration: '', notes: '' };

function fromAppointment(appt) {
  const rx = appt.prescription || {};
  return {
    diagnosis: rx.diagnosis || '',
    medicines: rx.medicines?.length ? rx.medicines.map(m => ({ ...EMPTY_MED, ...Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v ?? ''])) })) : [{ ...EMPTY_MED }],
    tests: rx.tests || '',
    advice: rx.advice || '',
    followUpDate: rx.followUpDate || '',
  };
}

/** Doctor: write or correct the prescription for one appointment. */
export function PrescriptionEditor({ appt, canComplete, onSaved, onClose }) {
  const [form, setForm] = useState(() => fromAppointment(appt));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !saving) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const setMed = (i, k) => (e) => setForm(f => ({ ...f, medicines: f.medicines.map((m, j) => (j === i ? { ...m, [k]: e.target.value } : m)) }));
  const addMed = () => setForm(f => ({ ...f, medicines: [...f.medicines, { ...EMPTY_MED }] }));
  const removeMed = (i) => setForm(f => ({ ...f, medicines: f.medicines.length > 1 ? f.medicines.filter((_, j) => j !== i) : [{ ...EMPTY_MED }] }));

  const save = async (complete) => {
    setError(null);
    const half = form.medicines.find(m => !m.name.trim() && (m.dosage || m.frequency || m.duration || m.notes));
    if (half) { setError('Every medicine needs a name. Remove the empty row or fill in the name.'); return; }
    setSaving(true);
    try {
      const payload = { ...form, medicines: form.medicines.filter(m => m.name.trim()) };
      onSaved(await apiDoctorSavePrescription(appt.id, payload, complete));
    } catch (e) {
      setError(apiError(e, 'Could not save the prescription.'));
    } finally {
      setSaving(false);
    }
  };

  const cell = 'w-full border border-rule bg-cream px-2 py-2 text-sm focus:outline-none focus:border-ink';

  return (
    <div className="fixed inset-0 z-[75] bg-black/50 overflow-y-auto p-4 sm:p-8" onMouseDown={e => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="rx-title" className="bg-paper border border-rule shadow-2xl w-full max-w-4xl mx-auto p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="label">Prescription</div>
            <h2 id="rx-title" className="font-display text-3xl tracking-tight mt-1">{appt.name}</h2>
            <div className="text-sm text-graphite mt-1">
              <span className="font-mono">{appt.bookingNo}</span> · {formatDate(appt.date)}, {fmtSlot(appt.timeSlot)}
              {appt.reason && <> · Reason: {appt.reason}</>}
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="text-graphite hover:text-ink text-lg" aria-label="Close">✕</button>
        </div>

        <div className="mt-6 space-y-6">
          <div>
            <label htmlFor="rx-diagnosis" className="label block mb-2">Diagnosis</label>
            <input id="rx-diagnosis" value={form.diagnosis} onChange={set('diagnosis')} maxLength={500} placeholder="e.g. Acute viral fever" className={FIELD} />
          </div>

          <div>
            <div className="label mb-2">Medicines</div>
            <datalist id="rx-frequencies">{FREQUENCIES.map(f => <option key={f} value={f} />)}</datalist>
            <datalist id="rx-durations">{DURATIONS.map(d => <option key={d} value={d} />)}</datalist>
            <div className="space-y-3">
              {form.medicines.map((m, i) => (
                <div key={i} className="border border-rule p-3 grid grid-cols-2 md:grid-cols-12 gap-2 items-start">
                  <div className="col-span-2 md:col-span-4">
                    <input value={m.name} onChange={setMed(i, 'name')} maxLength={100} placeholder="Medicine, e.g. Paracetamol 650" aria-label={`Medicine ${i + 1} name`} className={cell} />
                  </div>
                  <input value={m.dosage} onChange={setMed(i, 'dosage')} maxLength={50} placeholder="Dose, e.g. 1 tablet" aria-label={`Medicine ${i + 1} dose`} className={`${cell} md:col-span-2`} />
                  <input value={m.frequency} onChange={setMed(i, 'frequency')} maxLength={50} list="rx-frequencies" placeholder="When, e.g. 1-0-1" aria-label={`Medicine ${i + 1} how often`} className={`${cell} md:col-span-2`} />
                  <select value={m.timing} onChange={setMed(i, 'timing')} aria-label={`Medicine ${i + 1} with food`} className={`${cell} md:col-span-2`}>
                    <option value="">Food: any</option>
                    {Object.entries(TIMING_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <input value={m.duration} onChange={setMed(i, 'duration')} maxLength={50} list="rx-durations" placeholder="For, e.g. 5 days" aria-label={`Medicine ${i + 1} duration`} className={`${cell} md:col-span-2`} />
                  <input value={m.notes} onChange={setMed(i, 'notes')} maxLength={200} placeholder="Note for the patient (optional)" aria-label={`Medicine ${i + 1} note`} className={`${cell} col-span-2 md:col-span-11`} />
                  <button type="button" onClick={() => removeMed(i)} className="text-xs text-graphite hover:text-accent underline md:col-span-1 self-center" aria-label={`Remove medicine ${i + 1}`}>Remove</button>
                  {m.frequency && describeFrequency(m.frequency) !== m.frequency && (
                    <div className="col-span-2 md:col-span-12 text-xs text-graphite">Patient sees: {describeFrequency(m.frequency)}</div>
                  )}
                </div>
              ))}
            </div>
            <button type="button" onClick={addMed} disabled={form.medicines.length >= 30} className="mt-3 btn-secondary text-sm px-3 py-1.5">Add medicine</button>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="rx-tests" className="label block mb-2">Tests advised</label>
              <textarea id="rx-tests" value={form.tests} onChange={set('tests')} maxLength={500} rows={3} placeholder="e.g. CBC, Dengue NS1" className={FIELD} />
            </div>
            <div>
              <label htmlFor="rx-advice" className="label block mb-2">Advice</label>
              <textarea id="rx-advice" value={form.advice} onChange={set('advice')} maxLength={1000} rows={3} placeholder="e.g. Drink plenty of fluids, rest for 3 days" className={FIELD} />
            </div>
          </div>

          <div className="max-w-xs">
            <label htmlFor="rx-followup" className="label block mb-2">Follow-up date (optional)</label>
            <input id="rx-followup" type="date" value={form.followUpDate} min={addDays(appt.date, 1)} onChange={set('followUpDate')} className={FIELD} />
          </div>
        </div>

        {error && <div className="mt-6 p-3 border border-accent bg-accent/5 text-accent-deep text-sm">{error}</div>}

        <div className="mt-8 pt-6 border-t border-rule flex flex-wrap justify-end gap-3">
          <button type="button" onClick={onClose} disabled={saving} className="btn-secondary">Cancel</button>
          <button type="button" onClick={() => save(false)} disabled={saving} className={canComplete ? 'btn-secondary' : 'btn-primary'}>
            {saving ? 'Saving…' : 'Save prescription'}
          </button>
          {canComplete && (
            <button type="button" onClick={() => save(true)} disabled={saving} className="btn-primary">
              {saving ? 'Saving…' : 'Save and mark seen'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Read-only prescription, laid out to print on one page. */
export function PrescriptionView({ appt, orgName, industry }) {
  const rx = appt.prescription;
  if (!rx) return null;
  const meds = rx.medicines || [];
  return (
    <article className="rx-print bg-paper border border-rule p-6 sm:p-8 text-left print:border-0 print:p-0">
      <header className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b-2 border-ink">
        <div>
          <div className="font-display text-2xl tracking-tight">{orgName || 'Hospital'}</div>
          <div className="text-sm mt-1"><strong>{rx.doctorName || appt.doctorName}</strong>{rx.doctorQualification && <>, {rx.doctorQualification}</>}</div>
          <div className="text-xs text-graphite">{getServiceLabel(appt.service, industry)}</div>
        </div>
        <div className="text-right text-sm">
          <div className="label">Prescription</div>
          <div className="mt-1">{formatDate(appt.date)}</div>
          <div className="font-mono text-xs text-graphite">{appt.bookingNo}</div>
        </div>
      </header>

      <div className="py-4 border-b border-rule text-sm">
        <span className="label mr-2">Patient</span>{appt.name}
        {appt.reason && <span className="text-graphite"> · Came for: {appt.reason}</span>}
      </div>

      {rx.diagnosis && (
        <section className="py-4 border-b border-rule">
          <div className="label mb-1">Diagnosis</div>
          <p className="text-sm">{rx.diagnosis}</p>
        </section>
      )}

      {meds.length > 0 && (
        <section className="py-4 border-b border-rule">
          <div className="flex items-baseline gap-2 mb-3">
            <span className="font-display text-3xl leading-none">℞</span>
            <span className="label">Medicines</span>
          </div>
          <ol className="space-y-3">
            {meds.map((m, i) => (
              <li key={i} className="text-sm grid grid-cols-[1.5rem_1fr] gap-x-2">
                <span className="font-mono text-graphite">{i + 1}.</span>
                <div>
                  <div className="font-medium">{m.name}{m.dosage && <span className="font-normal"> · {m.dosage}</span>}</div>
                  <div className="text-graphite">
                    {[describeFrequency(m.frequency), TIMING_LABEL[m.timing], m.duration && `for ${m.duration}`].filter(Boolean).join(' · ') || 'As directed'}
                  </div>
                  {m.notes && <div className="text-xs text-graphite mt-0.5">{m.notes}</div>}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {rx.tests && (
        <section className="py-4 border-b border-rule">
          <div className="label mb-1">Tests advised</div>
          <p className="text-sm whitespace-pre-line">{rx.tests}</p>
        </section>
      )}

      {rx.advice && (
        <section className="py-4 border-b border-rule">
          <div className="label mb-1">Advice</div>
          <p className="text-sm whitespace-pre-line">{rx.advice}</p>
        </section>
      )}

      {rx.followUpDate && (
        <section className="py-4 border-b border-rule text-sm">
          <span className="label mr-2">Follow-up</span>{formatDate(rx.followUpDate)}
        </section>
      )}

      <footer className="pt-4 text-xs text-graphite">
        Issued by {rx.doctorName || appt.doctorName} on {fmtDate(rx.writtenAt)}
        {rx.updatedAt && rx.updatedAt !== rx.writtenAt && <>, updated {fmtDate(rx.updatedAt)}</>}.
        Take medicines only as prescribed. Contact the hospital if symptoms get worse.
      </footer>
    </article>
  );
}
