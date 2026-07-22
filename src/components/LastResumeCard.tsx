interface LastResumeCardProps {
  fileName: string;
  /** Saved resume being reused — renders "Last used 3d ago". */
  uploadedAt?: number;
  /** Freshly picked file that hasn't been uploaded yet — renders its size instead. */
  sizeBytes?: number;
  onReplace: () => void;
  onRemove: () => void;
}

function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export function LastResumeCard({ fileName, uploadedAt, sizeBytes, onReplace, onRemove }: LastResumeCardProps) {
  const meta =
    uploadedAt !== undefined
      ? `Last used ${formatRelativeTime(uploadedAt)}`
      : sizeBytes !== undefined
        ? `${(sizeBytes / 1024).toFixed(1)} KB`
        : '';

  return (
    <div className="resume-pick">
      <div className="resume-pill">
        <span className="resume-pill__icon">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <path d="M4 2h5l3 3v9H4V2Z" stroke="var(--pill-success-text)" strokeWidth="1.3" strokeLinejoin="round" />
            <path d="M9 2v3h3M6 9h4M6 11.5h4" stroke="var(--pill-success-text)" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </span>
        <span className="resume-pill__body">
          <span className="resume-pill__name">{fileName}</span>
          <span className="resume-pill__meta">
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <polyline
                points="2,6.5 4.7,9 10,3"
                stroke="var(--success-alt)"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {meta}
          </span>
        </span>
      </div>

      <div className="resume-pick__actions">
        <button type="button" className="resume-pick__replace" onClick={onReplace}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path
              d="M13 8a5 5 0 1 1-1.5-3.5M13 2.5V5h-2.5"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Replace
        </button>
        <button type="button" className="resume-pick__remove" onClick={onRemove} title="Remove resume">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path
              d="M3 4h10M6 4V2.5h4V4M5 4l.5 9h5L11 4"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Remove
        </button>
      </div>
    </div>
  );
}
