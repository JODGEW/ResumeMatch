interface LastResumeCardProps {
  fileName: string;
  uploadedAt: number;
  onReplace: () => void;
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

export function LastResumeCard({ fileName, uploadedAt, onReplace }: LastResumeCardProps) {
  return (
    <div className="last-resume-card">
      <div className="last-resume-card__content">
        <span className="last-resume-card__context">Using this resume</span>
        <div className="last-resume-card__icon">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
            <rect x="8" y="4" width="24" height="32" rx="4" stroke="var(--success)" strokeWidth="2" />
            <path d="M14 16h12M14 22h12M14 28h8" stroke="var(--success)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
        <span className="last-resume-card__filename">{fileName}</span>
        <span className="last-resume-card__time">Last used {formatRelativeTime(uploadedAt)}</span>

        <div className="last-resume-card__actions">
          <div className="last-resume-card__selected-badge">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 7l3 3 5-6" stroke="var(--success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Resume selected
          </div>
          <button type="button" className="last-resume-card__replace" onClick={onReplace}>
            Change resume
          </button>
        </div>
      </div>
    </div>
  );
}
