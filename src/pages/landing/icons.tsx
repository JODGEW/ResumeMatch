export function CircleCheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <circle cx="7" cy="7" r="6" fill="none" className="lp-stroke-success" strokeWidth="1.3" />
      <polyline
        points="4.2,7.2 6.2,9.2 9.8,4.8"
        fill="none"
        className="lp-stroke-success"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CircleXIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <circle cx="7" cy="7" r="6" fill="none" className="lp-stroke-danger" strokeWidth="1.3" />
      <line x1="4.8" y1="4.8" x2="9.2" y2="9.2" className="lp-stroke-danger" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="9.2" y1="4.8" x2="4.8" y2="9.2" className="lp-stroke-danger" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function TrustCheckIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <polyline
        points="1.5,5.5 4,8 8.5,2.5"
        fill="none"
        className="lp-stroke-success"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ListCheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="lp-icon-fixed">
      <polyline
        points="2.5,7.5 5.5,10.5 11.5,3.5"
        fill="none"
        className="lp-stroke-success"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function TagLinesIcon() {
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
      <line x1="1" y1="2" x2="7" y2="2" className="lp-stroke-tint" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="1" y1="4" x2="5" y2="4" className="lp-stroke-tint" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="1" y1="6" x2="6" y2="6" className="lp-stroke-tint" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function MicIcon() {
  return (
    <svg width="11" height="13" viewBox="0 0 11 13" aria-hidden="true">
      <rect x="3.5" y="1" width="4" height="7" rx="2" fill="none" stroke="#fff" strokeWidth="1.2" />
      <line x1="5.5" y1="10" x2="5.5" y2="12" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function DownloadIcon() {
  return (
    <svg width="11" height="12" viewBox="0 0 11 12" aria-hidden="true">
      <line x1="5.5" y1="1" x2="5.5" y2="7.5" className="lp-stroke-ghost" strokeWidth="1.2" strokeLinecap="round" />
      <polyline
        points="2.8,5 5.5,7.8 8.2,5"
        fill="none"
        className="lp-stroke-ghost"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line x1="1.5" y1="10.5" x2="9.5" y2="10.5" className="lp-stroke-ghost" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function ArrowRightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M3 8h9M8.5 4.5 12 8l-3.5 3.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

export function LockIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.3" fill="none" />
      <path d="M5 7V5a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="1.3" fill="none" />
    </svg>
  );
}

/* App-shell tab glyphs. These mirror the real nav in Layout.tsx; they take their
   colour from the tab, so no stroke literals (HANDOFF §0.6). */
const tabIcon = {
  width: 14,
  height: 14,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export function TabUploadIcon() {
  return (
    <svg {...tabIcon} viewBox="0 0 15 15">
      <path d="M7.5 10V3m0 0L4.5 6m3-3 3 3" />
      <path d="M2.5 10.5v1.5a1 1 0 001 1h8a1 1 0 001-1v-1.5" />
    </svg>
  );
}

export function TabHistoryIcon() {
  return (
    <svg {...tabIcon} viewBox="0 0 24 24" strokeWidth={2}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </svg>
  );
}

export function TabInterviewsIcon() {
  return (
    <svg {...tabIcon} viewBox="0 0 15 15">
      <rect x="5" y="1.75" width="5" height="7.5" rx="2.5" />
      <path d="M3.25 7.25c0 2.35 1.9 4.25 4.25 4.25s4.25-1.9 4.25-4.25" />
      <path d="M7.5 11.5v1.75" />
      <path d="M5.5 13.25h4" />
    </svg>
  );
}

export function TabTrackerIcon() {
  return (
    <svg {...tabIcon} viewBox="0 0 15 15">
      <rect x="2" y="2" width="11" height="11" rx="2" />
      <path d="M5 7.5l2 2 3-4" />
    </svg>
  );
}

export function ChevronRightIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <polyline
        points="3,1.5 7.5,5 3,8.5"
        fill="none"
        className="lp-stroke-muted"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
