import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import jsQR from 'jsqr';
import { useAuth } from '../context/AuthContext.jsx';
import { useAppConfig } from '../hooks/useAppConfig.js';
import { getServiceLabel } from '../utils/industry.js';
import { apiLookupBooking, apiConfirmAppointment } from '../services/api.js';
import { STATUS_LABEL, STATUS_STYLE, localDate, formatDate, FIELD, apiError } from '../utils/appointments.js';
import { fmtSlot, fmtTime } from '../utils/format.js';

const BOOKING_RE = /BK-\d{6}-\d{3,}/i;
const SCAN_EVERY_MS = 200;
const SCAN_WIDTH = 640;

// The QR holds a link like ".../admin/scan?b=BK-260929-002"; a USB scanner or
// a person may give just the number. Pull the booking number out of either.
function bookingFrom(text) {
  const m = String(text || '').match(BOOKING_RE);
  return m ? m[0].toUpperCase() : null;
}

export default function AdminScan() {
  const { user } = useAuth();
  const cfg = useAppConfig();
  const location = useLocation();
  const [params, setParams] = useSearchParams();

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);

  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [typed, setTyped] = useState('');
  const [looking, setLooking] = useState(false);
  const [appt, setAppt] = useState(null);
  const [error, setError] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [justConfirmed, setJustConfirmed] = useState(false);

  const stopCamera = useCallback(() => {
    clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }, []);

  const lookup = useCallback(async (raw) => {
    const no = bookingFrom(raw);
    if (!no) { setError('That code is not a QueueLess booking. Booking numbers look like BK-260929-002.'); return; }
    setLooking(true);
    setError(null);
    setAppt(null);
    setJustConfirmed(false);
    try {
      setAppt(await apiLookupBooking(no));
    } catch (e) {
      setError(apiError(e, 'Could not find that booking.'));
    } finally {
      setLooking(false);
    }
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('The camera only works over a secure (https) link. Type the booking number instead.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      streamRef.current = stream;
      const video = videoRef.current;
      video.srcObject = stream;
      await video.play();
      setCameraOn(true);
      timerRef.current = setInterval(() => {
        const v = videoRef.current;
        const c = canvasRef.current;
        if (!v || !c || v.readyState < 2 || !v.videoWidth) return;
        const scale = Math.min(1, SCAN_WIDTH / v.videoWidth);
        c.width = Math.round(v.videoWidth * scale);
        c.height = Math.round(v.videoHeight * scale);
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(v, 0, 0, c.width, c.height);
        const code = jsQR(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height, { inversionAttempts: 'dontInvert' });
        if (code?.data) {
          navigator.vibrate?.(80);
          stopCamera();
          lookup(code.data);
        }
      }, SCAN_EVERY_MS);
    } catch (e) {
      stopCamera();
      setCameraError(e?.name === 'NotAllowedError'
        ? 'Camera access was blocked. Allow the camera in your browser, or type the booking number.'
        : 'No camera found. Type the booking number, or use a handheld scanner.');
    }
  }, [lookup, stopCamera]);

  // Opened from a phone camera scan: the link carries the booking number.
  useEffect(() => {
    const b = params.get('b');
    if (user && b) {
      lookup(b);
      setParams({}, { replace: true });
    }
  }, [user, params, setParams, lookup]);

  useEffect(() => stopCamera, [stopCamera]);

  if (!user) return <Navigate to="/admin/login" replace state={{ from: `${location.pathname}${location.search}` }} />;

  const submitTyped = (e) => {
    e.preventDefault();
    if (!typed.trim()) return;
    stopCamera();
    lookup(typed);
    setTyped('');
  };

  const confirm = async () => {
    setConfirming(true);
    setError(null);
    try {
      const res = await apiConfirmAppointment(appt.id);
      setAppt(res.appointment || { ...appt, status: 'confirmed', confirmedAt: Date.now() });
      setJustConfirmed(true);
    } catch (e) {
      setError(apiError(e, 'Could not confirm this booking.'));
    } finally {
      setConfirming(false);
    }
  };

  const scanNext = () => {
    setAppt(null);
    setError(null);
    setJustConfirmed(false);
    startCamera();
  };

  const today = localDate();

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 xl:px-10 py-10">
      <div className="flex items-end justify-between mb-8 flex-wrap gap-4">
        <div>
          <div className="label">Admin · Reception</div>
          <h1 className="font-display text-5xl tracking-tightest leading-none mt-2">Scan booking QR</h1>
          <p className="mt-3 text-graphite text-sm">Scan the patient's QR code to check their booking and confirm it.</p>
        </div>
        <Link to="/admin/appointments" className="btn-secondary text-sm">All appointments</Link>
      </div>

      <div className="grid lg:grid-cols-2 gap-8 items-start">
        <section className="border border-rule bg-cream p-5">
          <div className="relative bg-ink aspect-[4/3] overflow-hidden flex items-center justify-center">
            <video ref={videoRef} playsInline muted className={`absolute inset-0 w-full h-full object-cover ${cameraOn ? '' : 'hidden'}`} />
            {cameraOn && <div className="absolute inset-[18%] border-2 border-paper/80 pointer-events-none" aria-hidden="true" />}
            {!cameraOn && (
              <button type="button" onClick={startCamera} className="btn-primary relative">Start camera</button>
            )}
          </div>
          <canvas ref={canvasRef} className="hidden" />
          {cameraOn && (
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="text-graphite">Hold the QR code inside the frame.</span>
              <button type="button" onClick={stopCamera} className="underline text-graphite hover:text-ink">Stop camera</button>
            </div>
          )}
          {cameraError && <div className="mt-3 p-3 border border-warn/40 bg-warn/5 text-warn text-sm">{cameraError}</div>}

          <form onSubmit={submitTyped} className="mt-5">
            <label htmlFor="scan-typed" className="label block mb-2">Or type the booking number</label>
            <div className="flex gap-2">
              <input
                id="scan-typed"
                value={typed}
                onChange={e => setTyped(e.target.value)}
                placeholder="BK-260929-002"
                autoComplete="off"
                className={`${FIELD} font-mono uppercase`}
              />
              <button type="submit" disabled={!typed.trim() || looking} className="btn-secondary shrink-0">Find</button>
            </div>
            <p className="mt-2 text-xs text-graphite">A handheld scanner works here too.</p>
          </form>
        </section>

        <section aria-live="polite">
          {looking ? (
            <div className="p-10 border border-rule text-center text-graphite">Finding booking…</div>
          ) : error ? (
            <div className="p-5 border border-accent bg-accent/5 text-accent-deep text-sm">
              {error}
              <div className="mt-3"><button type="button" onClick={scanNext} className="btn-secondary text-xs px-3 py-1.5">Scan again</button></div>
            </div>
          ) : appt ? (
            <div className={`border p-6 ${appt.status === 'confirmed' ? 'border-success/50' : 'border-rule'} bg-paper`}>
              {justConfirmed && (
                <div role="status" className="mb-5 p-3 border border-success/40 bg-success/10 text-success text-sm font-medium">
                  Booking confirmed. The patient can go to {appt.doctorName || 'the department'}.
                </div>
              )}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-mono text-sm tracking-wider text-graphite">{appt.bookingNo}</div>
                  <div className="font-display text-3xl tracking-tight mt-1">{appt.name}</div>
                </div>
                <span className={`text-xs px-2 py-1 border shrink-0 ${STATUS_STYLE[appt.status] || ''}`}>{STATUS_LABEL[appt.status] || appt.status}</span>
              </div>

              <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
                <div><dt className="label">Speciality</dt><dd>{getServiceLabel(appt.service, cfg.industry)}</dd></div>
                <div><dt className="label">Doctor</dt><dd>{appt.doctorName || 'Not assigned yet'}</dd></div>
                <div><dt className="label">Date</dt><dd className={appt.date !== today ? 'text-warn font-medium' : ''}>{appt.date === today ? 'Today' : formatDate(appt.date)}</dd></div>
                <div><dt className="label">Time</dt><dd>{fmtSlot(appt.timeSlot)}</dd></div>
                {appt.phone && <div><dt className="label">Phone</dt><dd>{appt.phone}</dd></div>}
                {appt.reason && <div className="col-span-2"><dt className="label">Reason</dt><dd>{appt.reason}</dd></div>}
              </dl>

              {appt.date !== today && ['pending', 'confirmed'].includes(appt.status) && (
                <div className="mt-5 p-3 border border-warn/40 bg-warn/5 text-warn text-sm">
                  This booking is for {appt.date < today ? 'a past day' : formatDate(appt.date)}, not today.
                </div>
              )}

              <div className="mt-6 flex flex-wrap gap-3">
                {appt.status === 'pending' && (
                  <button type="button" onClick={confirm} disabled={confirming} className="btn-primary">
                    {confirming ? 'Confirming…' : 'Confirm booking'}
                  </button>
                )}
                {appt.status === 'confirmed' && !justConfirmed && (
                  <span className="text-sm text-success self-center">
                    Already confirmed{appt.confirmedAt ? ` at ${fmtTime(appt.confirmedAt)}` : ''}.
                  </span>
                )}
                <button type="button" onClick={scanNext} className="btn-secondary">Scan next</button>
              </div>
            </div>
          ) : (
            <div className="p-10 border border-dashed border-rule text-center text-graphite text-sm">
              Scan a QR code or type a booking number to see the booking here.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
