// Queue status badge that tells the truth about how the screen is updating.
// `mode` comes from useQueueState: live | refresh | offline | connecting.

const LOOK = {
  paused:     { label: 'Paused',           style: 'bg-warn/10 text-warn border-warn/30', title: 'The queue is paused' },
  live:       { label: 'Live',             style: 'bg-success/10 text-success border-success/30', title: 'Changes appear instantly', pulse: true },
  refresh:    { label: 'Updating every 5s', style: 'bg-success/10 text-success border-success/30', title: 'Refreshes from the server every 5 seconds' },
  connecting: { label: 'Connecting',       style: 'bg-paper text-graphite border-rule', title: 'Connecting to the queue' },
  offline:    { label: 'Offline',          style: 'bg-accent/10 text-accent-deep border-accent/30', title: 'Can’t reach the server. Retrying.' },
};

export default function LiveBadge({ mode = 'connecting', paused = false }) {
  const look = LOOK[paused && mode !== 'offline' ? 'paused' : mode] || LOOK.connecting;
  return (
    <span
      title={look.title}
      className={`inline-flex items-center gap-2 px-3 py-1 border text-[11px] font-medium tracking-[0.18em] uppercase ${look.style}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full bg-current ${look.pulse ? 'animate-pulse' : ''}`} />
      {look.label}
    </span>
  );
}
