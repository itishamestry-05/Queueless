import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/**
 * The QR code a patient shows at reception. It encodes a link to the admin
 * scan page carrying the booking number, so reception can scan it with the
 * in-app scanner, a USB scanner, or a phone camera that opens the link.
 */
export function bookingScanUrl(bookingNo) {
  return `${window.location.origin}/admin/scan?b=${encodeURIComponent(bookingNo)}`;
}

export default function BookingQr({ bookingNo, size = 220 }) {
  const [src, setSrc] = useState(null);

  useEffect(() => {
    let alive = true;
    // Always dark on white: phone cameras struggle with inverted codes in dark mode.
    QRCode.toDataURL(bookingScanUrl(bookingNo), { width: size, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#111111', light: '#FFFFFF' } })
      .then(d => { if (alive) setSrc(d); })
      .catch(() => { if (alive) setSrc(null); });
    return () => { alive = false; };
  }, [bookingNo, size]);

  return (
    <div className="inline-flex flex-col items-center">
      <div className="bg-white p-3 border border-rule" style={{ width: size + 24, height: size + 24 }}>
        {src && <img src={src} width={size} height={size} alt={`QR code for booking ${bookingNo}`} />}
      </div>
      <div className="mt-3 font-mono text-2xl tracking-wider">{bookingNo}</div>
    </div>
  );
}
