import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { usePatient } from '../context/HospitalAuthContext.jsx';
import { apiPatientBook, apiListDoctors, apiAppointmentSlots, apiPatientAppointments } from '../services/api.js';
import { getSpecialties } from '../utils/industry.js';
import { localDate, addDays, isPastSlot, formatDate, FIELD, apiError, STATUS_LABEL, STATUS_STYLE } from '../utils/appointments.js';
import { fmtSlot } from '../utils/format.js';
import BookingQr from '../components/BookingQr.jsx';

const MAX_DAYS_AHEAD = 60;
const QUICK_DAYS = 7;
const STATUS_POLL_MS = 5000;

// "29" and "Tue" for a YYYY-MM-DD, read as a calendar date (no time-zone shift).
function dayChip(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return {
    weekday: d.toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' }),
    day: d.getUTCDate(),
    month: d.toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' }),
  };
}

function initials(name = '') {
  return name.replace(/^dr\.?\s+/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || 'DR';
}

function DoctorCard({ doctor, specialtyTitle, selected, onPick }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onPick}
      className={`text-left p-4 border flex items-center gap-4 transition-all ${selected ? 'border-ink bg-ink text-paper' : 'border-rule bg-cream hover:border-ink'}`}
    >
      <span className={`shrink-0 w-12 h-12 rounded-full flex items-center justify-center font-medium ${selected ? 'bg-paper text-ink' : 'bg-ink text-paper'}`}>
        {initials(doctor.displayName)}
      </span>
      <span className="min-w-0">
        <span className="block font-medium leading-tight">{doctor.displayName}</span>
        {doctor.qualification && <span className="block text-xs opacity-70 mt-0.5">{doctor.qualification}</span>}
        {specialtyTitle && <span className="block text-xs opacity-60 mt-0.5">{specialtyTitle}</span>}
      </span>
    </button>
  );
}

function Step({ n, title, children }) {
  return (
    <section>
      <h2 className="flex items-center gap-3 mb-4">
        <span className="w-7 h-7 rounded-full border border-ink flex items-center justify-center text-sm font-mono">{n}</span>
        <span className="font-display text-2xl tracking-tight">{title}</span>
      </h2>
      {children}
    </section>
  );
}

function Booked({ booked, specialtyTitle, onAnother }) {
  const [status, setStatus] = useState(booked.status);

  // Reception confirms by scanning the QR code; show that here as it happens.
  useEffect(() => {
    if (status !== 'pending') return undefined;
    const t = setInterval(() => {
      apiPatientAppointments()
        .then(list => { const a = list.find(x => x.id === booked.id); if (a) setStatus(a.status); })
        .catch(() => {});
    }, STATUS_POLL_MS);
    return () => clearInterval(t);
  }, [booked.id, status]);

  const confirmed = status === 'confirmed';

  return (
    <div className="max-w-xl mx-auto px-6 py-16 text-center">
      <div className="label">Appointment booked</div>
      <h1 className="font-display text-4xl tracking-tightest mt-2">Show this at reception</h1>
      <p className="mt-3 text-graphite text-sm">Reception scans this code to confirm your visit. You can find it again under My appointments.</p>

      <div className="mt-8"><BookingQr bookingNo={booked.bookingNo} /></div>

      <div role="status" className={`mt-6 inline-block text-sm px-3 py-1.5 border ${STATUS_STYLE[status] || ''}`}>
        {confirmed ? 'Confirmed by reception' : status === 'pending' ? 'Waiting for reception to scan' : STATUS_LABEL[status] || status}
      </div>

      <div className="mt-8 p-6 border border-rule bg-cream text-sm text-left">
        <div className="grid grid-cols-2 gap-4">
          <div><span className="label block">Patient</span>{booked.name}</div>
          <div><span className="label block">Speciality</span>{specialtyTitle}</div>
          <div><span className="label block">Doctor</span>{booked.doctorName || 'Assigned at the hospital'}</div>
          <div><span className="label block">When</span>{formatDate(booked.date)}, {fmtSlot(booked.timeSlot)}</div>
        </div>
      </div>

      <div className="mt-8 flex gap-4 justify-center">
        <Link to="/patient" className="btn-primary">My appointments</Link>
        <button onClick={onAnother} className="btn-secondary">Book another</button>
      </div>
    </div>
  );
}

export default function BookAppointment() {
  const { patient } = usePatient();
  const today = localDate();

  const [allDoctors, setAllDoctors] = useState(null);
  const [doctorsError, setDoctorsError] = useState(null);
  const [doctorsReload, setDoctorsReload] = useState(0);

  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [specialty, setSpecialty] = useState('');
  const [doctorId, setDoctorId] = useState('');
  // After the last slot of the day (17:00) start on tomorrow instead of a
  // day where every time is already greyed out.
  const [date, setDate] = useState(() => (isPastSlot(today, '17:00') ? addDays(today, 1) : today));
  const [timeSlot, setTimeSlot] = useState('');
  const [reason, setReason] = useState('');

  const [slots, setSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState(null);
  const [refresh, setRefresh] = useState(0);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [booked, setBooked] = useState(null);

  useEffect(() => {
    let alive = true;
    apiListDoctors()
      .then(d => { if (alive) { setAllDoctors(d); setDoctorsError(null); } })
      .catch(e => {
        if (!alive) return;
        setAllDoctors(prev => prev ?? []);
        setDoctorsError(apiError(e, 'Could not load the list of doctors.'));
      });
    return () => { alive = false; };
  }, [doctorsReload]);

  const doctors = allDoctors || [];
  const hasDoctors = doctors.length > 0;
  const specialties = useMemo(() => {
    const list = getSpecialties(doctors).map(s => ({ ...s, count: doctors.filter(d => d.specialty === s.id).length }));
    // Specialities with doctors first; the rest keep their usual order.
    return [...list.filter(s => s.count), ...list.filter(s => !s.count)];
  }, [doctors]);
  const titleOf = (id) => specialties.find(s => s.id === id)?.title || id;

  // With no doctors added yet every speciality books unassigned; once doctors
  // exist, only specialities that have one can be booked.
  const bookable = (s) => !hasDoctors || s.count > 0;
  const staffedCount = specialties.filter(bookable).length;
  const shownSpecialties = showAll || !hasDoctors ? specialties : specialties.filter(bookable);

  const q = search.trim().toLowerCase();
  const searchResults = q
    ? doctors.filter(d => `${d.displayName} ${d.qualification || ''} ${titleOf(d.specialty)}`.toLowerCase().includes(q))
    : [];
  const matchingSpecialties = q ? specialties.filter(s => bookable(s) && `${s.title} ${s.desc}`.toLowerCase().includes(q)) : [];

  const specialtyDoctors = doctors.filter(d => d.specialty === specialty);
  const chosenDoctor = doctors.find(d => d.username === doctorId) || null;

  const pickSpecialty = (id) => {
    setSpecialty(id);
    if (chosenDoctor?.specialty !== id) setDoctorId('');
    setError(null);
  };
  const pickDoctor = (d) => {
    setSpecialty(d.specialty);
    setDoctorId(d.username);
    setSearch('');
    setError(null);
  };

  // Free/taken slots whenever speciality, doctor or date changes.
  useEffect(() => {
    if (!date || !specialty) { setSlots([]); return undefined; }
    let alive = true;
    setSlotsLoading(true);
    setSlotsError(null);
    setTimeSlot('');
    apiAppointmentSlots({ service: specialty, doctor: doctorId, date })
      .then(s => { if (alive) setSlots(s); })
      .catch(e => { if (alive) { setSlots([]); setSlotsError(apiError(e, 'Could not load free times.')); } })
      .finally(() => { if (alive) setSlotsLoading(false); });
    return () => { alive = false; };
  }, [specialty, doctorId, date, refresh]);

  if (!patient) return <Navigate to="/patient/login" replace state={{ from: '/book' }} />;

  if (booked) {
    return (
      <Booked
        booked={booked}
        specialtyTitle={titleOf(booked.service)}
        onAnother={() => { setBooked(null); setReason(''); setTimeSlot(''); setRefresh(n => n + 1); }}
      />
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!specialty) { setError('Choose a speciality.'); return; }
    if (!timeSlot) { setError('Pick a time.'); return; }
    setSubmitting(true);
    setError(null);
    try {
      setBooked(await apiPatientBook({ service: specialty, doctorId: doctorId || null, date, timeSlot, reason }));
      window.scrollTo({ top: 0 });
    } catch (err) {
      setError(apiError(err, 'Could not book the appointment. Please try again.'));
      // Someone may have just taken the slot: show the current picture.
      if (err.response?.status === 409) setRefresh(n => n + 1);
    } finally {
      setSubmitting(false);
    }
  };

  const quickDays = Array.from({ length: QUICK_DAYS }, (_, i) => addDays(today, i));
  const allTaken = slots.length > 0 && slots.every(s => !s.available || isPastSlot(date, s.time));

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="label">Appointment booking</div>
          <h1 className="font-display text-5xl tracking-tightest leading-[0.95] mt-2">Find a specialist</h1>
          <p className="mt-3 text-graphite">Booking for <strong>{patient.name}</strong>. Choose a speciality, then your doctor and a time.</p>
        </div>
        <div className="w-full sm:w-80">
          <label htmlFor="book-search" className="sr-only">Search doctors or specialities</label>
          <input
            id="book-search"
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search a doctor or speciality"
            className={FIELD}
          />
        </div>
      </div>

      {doctorsError && (
        <div className="mt-6 p-3 border border-accent bg-accent/5 text-accent-deep text-sm flex flex-wrap items-center justify-between gap-3">
          <span>{doctorsError}</span>
          <button type="button" onClick={() => setDoctorsReload(n => n + 1)} className="btn-secondary text-xs px-3 py-1.5">Try again</button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-10 grid lg:grid-cols-[1fr_320px] gap-10 items-start">
        <div className="space-y-12 min-w-0">
          {q ? (
            <section aria-live="polite">
              <div className="label mb-3">Search results</div>
              {searchResults.length === 0 && matchingSpecialties.length === 0 ? (
                <div className="p-6 border border-dashed border-rule text-sm text-graphite">No doctor or speciality matches “{search.trim()}”.</div>
              ) : (
                <div className="space-y-6">
                  {matchingSpecialties.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {matchingSpecialties.map(s => (
                        <button key={s.id} type="button" onClick={() => { pickSpecialty(s.id); setSearch(''); }} className="px-3 py-1.5 text-sm border border-rule hover:border-ink">
                          {s.title}
                        </button>
                      ))}
                    </div>
                  )}
                  {searchResults.length > 0 && (
                    <div className="grid sm:grid-cols-2 gap-3">
                      {searchResults.map(d => (
                        <DoctorCard key={d.username} doctor={d} specialtyTitle={titleOf(d.specialty)} selected={doctorId === d.username} onPick={() => pickDoctor(d)} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>
          ) : (
            <Step n={1} title="Choose a speciality">
              {allDoctors === null ? (
                <div className="text-sm text-graphite">Loading specialities…</div>
              ) : (
                <>
                  {!hasDoctors && (
                    <p className="mb-4 text-sm text-graphite">The hospital assigns your doctor when you arrive.</p>
                  )}
                  <div role="group" aria-label="Speciality" className="grid gap-3 grid-cols-2 md:grid-cols-3">
                    {shownSpecialties.map(s => {
                      const selected = specialty === s.id;
                      const enabled = bookable(s);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          aria-pressed={selected}
                          disabled={!enabled}
                          onClick={() => pickSpecialty(s.id)}
                          className={`text-left p-4 border transition-all ${
                            selected ? 'border-ink bg-ink text-paper'
                              : enabled ? 'border-rule bg-cream hover:border-ink'
                                : 'border-rule opacity-40 cursor-not-allowed'
                          }`}
                        >
                          <div className="font-medium text-sm leading-tight">{s.title}</div>
                          {s.desc && <div className="text-xs opacity-60 mt-1 leading-snug">{s.desc}</div>}
                          {hasDoctors && (
                            <div className="text-xs mt-2 font-mono opacity-80">
                              {s.count ? `${s.count} doctor${s.count > 1 ? 's' : ''}` : 'No doctor yet'}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {hasDoctors && staffedCount < specialties.length && (
                    <button type="button" onClick={() => setShowAll(v => !v)} className="mt-3 text-sm text-graphite underline underline-offset-2 hover:text-ink">
                      {showAll ? 'Show only specialities with doctors' : `Show all ${specialties.length} specialities`}
                    </button>
                  )}
                </>
              )}
            </Step>
          )}

          {specialty && !q && (
            <Step n={2} title={`Choose your doctor · ${titleOf(specialty)}`}>
              {specialtyDoctors.length === 0 ? (
                <p className="text-sm text-graphite">No doctors listed for this speciality yet. The hospital assigns one when you arrive.</p>
              ) : (
                <div className="grid sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    aria-pressed={!doctorId}
                    onClick={() => setDoctorId('')}
                    className={`text-left p-4 border flex items-center gap-4 transition-all ${!doctorId ? 'border-ink bg-ink text-paper' : 'border-rule bg-cream hover:border-ink'}`}
                  >
                    <span className={`shrink-0 w-12 h-12 rounded-full border flex items-center justify-center text-lg ${!doctorId ? 'border-paper' : 'border-ink'}`}>*</span>
                    <span>
                      <span className="block font-medium leading-tight">Any available doctor</span>
                      <span className="block text-xs opacity-70 mt-0.5">Shows every free time in {titleOf(specialty)}</span>
                    </span>
                  </button>
                  {specialtyDoctors.map(d => (
                    <DoctorCard key={d.username} doctor={d} selected={doctorId === d.username} onPick={() => setDoctorId(d.username)} />
                  ))}
                </div>
              )}
            </Step>
          )}

          {specialty && !q && (
            <Step n={3} title="Pick a date and time">
              <div className="flex flex-wrap items-stretch gap-2">
                {quickDays.map(d => {
                  const c = dayChip(d);
                  const selected = date === d;
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setDate(d)}
                      className={`w-16 py-2 border text-center transition-all ${selected ? 'border-ink bg-ink text-paper' : 'border-rule bg-cream hover:border-ink'}`}
                    >
                      <div className="text-[11px] uppercase opacity-70">{d === today ? 'Today' : c.weekday}</div>
                      <div className="font-display text-xl leading-none mt-1">{c.day}</div>
                      <div className="text-[11px] opacity-70">{c.month}</div>
                    </button>
                  );
                })}
                <div className="flex flex-col justify-center">
                  <label htmlFor="book-date" className="sr-only">Another date</label>
                  <input
                    id="book-date"
                    type="date"
                    value={date}
                    min={today}
                    max={addDays(today, MAX_DAYS_AHEAD)}
                    onChange={e => e.target.value && setDate(e.target.value)}
                    className={`${FIELD} !py-2`}
                    title="Pick another date"
                  />
                </div>
              </div>

              <div role="group" aria-label="Time" className="mt-6">
                {slotsLoading ? (
                  <div className="text-sm text-graphite">Checking free times…</div>
                ) : slotsError ? (
                  <div className="p-3 border border-accent bg-accent/5 text-accent-deep text-sm flex flex-wrap items-center justify-between gap-3">
                    <span>{slotsError}</span>
                    <button type="button" onClick={() => setRefresh(n => n + 1)} className="btn-secondary text-xs px-3 py-1.5">Try again</button>
                  </div>
                ) : slots.length === 0 ? (
                  <div className="text-sm text-graphite">No times available for this date.</div>
                ) : (
                  <>
                    {allTaken && (
                      <div className="mb-3 text-sm text-graphite">
                        No free times left on this day.{' '}
                        <button type="button" onClick={() => setDate(d => addDays(d, 1))} className="underline hover:text-ink">Try the next day</button>
                      </div>
                    )}
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                      {slots.map(s => {
                        const disabled = !s.available || isPastSlot(date, s.time);
                        const selected = timeSlot === s.time;
                        return (
                          <button
                            key={s.time}
                            type="button"
                            disabled={disabled}
                            aria-pressed={selected}
                            onClick={() => setTimeSlot(s.time)}
                            title={disabled ? 'Not available' : undefined}
                            className={`py-2 text-sm border font-mono transition-all ${
                              selected ? 'border-ink bg-ink text-paper'
                                : disabled ? 'border-rule text-ash line-through cursor-not-allowed opacity-50'
                                  : 'border-rule bg-cream hover:border-ink'
                            }`}
                          >
                            {fmtSlot(s.time)}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              <div className="mt-8">
                <label htmlFor="book-reason" className="label block mb-2">Reason for visit (optional)</label>
                <textarea id="book-reason" value={reason} onChange={e => setReason(e.target.value)} maxLength={300} rows={2}
                  placeholder="e.g. Chest pain for 3 days" className={FIELD} />
              </div>
            </Step>
          )}
        </div>

        <aside className="lg:sticky lg:top-24 border border-rule bg-cream p-6">
          <div className="label mb-4">Your appointment</div>
          <dl className="space-y-3 text-sm">
            <div><dt className="text-graphite text-xs">Speciality</dt><dd className="font-medium">{specialty ? titleOf(specialty) : 'Not chosen'}</dd></div>
            <div><dt className="text-graphite text-xs">Doctor</dt><dd className="font-medium">{chosenDoctor ? chosenDoctor.displayName : specialty ? 'Any available doctor' : 'Not chosen'}</dd></div>
            <div><dt className="text-graphite text-xs">Date</dt><dd className="font-medium">{formatDate(date)}</dd></div>
            <div><dt className="text-graphite text-xs">Time</dt><dd className="font-medium">{timeSlot ? fmtSlot(timeSlot) : 'Not chosen'}</dd></div>
          </dl>
          {error && <div className="mt-4 p-3 border border-accent bg-accent/5 text-accent-deep text-sm">{error}</div>}
          <button type="submit" disabled={submitting || !specialty || !timeSlot} className="btn-primary w-full mt-6">
            {submitting ? 'Booking…' : 'Confirm booking'}
          </button>
          <p className="mt-3 text-xs text-graphite">You get a QR code to show at reception.</p>
          <Link to="/patient" className="mt-4 inline-block text-sm text-graphite hover:text-ink underline underline-offset-2">My appointments</Link>
        </aside>
      </form>
    </div>
  );
}
