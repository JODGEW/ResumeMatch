import { useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { NormalizedAnalysisStatus } from '../hooks/usePolling';
import './AnalysisProgressCard.css';

export type AnalysisProgressMode = 'active' | 'finalizing' | 'complete' | 'timeout' | 'failed';

// Single source of truth for the completion beat: Results.tsx holds the
// complete card for exactly this long, and AnalysisProgressCard.css derives
// every pop/draw/ripple duration from it via --completion-beat.
export const COMPLETION_BEAT_MS = 1400;

const COMPLETION_BEAT_STYLE = { '--completion-beat': `${COMPLETION_BEAT_MS}ms` } as CSSProperties;

type StepState = 'done' | 'active' | 'pending';

const LONG_RUNNING_AFTER_MS = 45_000;
const STALLED_AFTER_MS = 3_000;

const STEP_LABELS = [
  'Upload received',
  'Preparing your resume',
  'Analyzing against the job description',
  'Saving your report to History',
];

const STEP_SR_PREFIX: Record<StepState, string> = {
  done: 'Completed: ',
  active: 'In progress: ',
  pending: 'Waiting: ',
};

// Steps are driven only by signals the backend actually reports
// (pending_upload/pending -> processing -> completed); nothing is simulated.
function getStepStates(mode: AnalysisProgressMode, status?: NormalizedAnalysisStatus): StepState[] {
  if (mode === 'complete') {
    return ['done', 'done', 'done', 'done'];
  }
  if (mode === 'finalizing') {
    return ['done', 'done', 'done', 'active'];
  }
  const analyzing = status === 'processing';
  return [
    'done',
    analyzing ? 'done' : 'active',
    analyzing ? 'active' : 'pending',
    'pending',
  ];
}

function StepChecklist({ steps }: { steps: StepState[] }) {
  const activeIndex = steps.indexOf('active');
  const activeStep = activeIndex === -1 ? steps.length : activeIndex + 1;
  return (
    <div className="analysis-progress-card__progress">
      <p className="analysis-progress-card__step-label">Step {activeStep} of {steps.length}</p>
      <ol className="analysis-progress-card__steps">
        {STEP_LABELS.map((label, i) => (
          <li
            key={label}
            className={`analysis-progress-card__step analysis-progress-card__step--${steps[i]}`}
            aria-current={steps[i] === 'active' ? 'step' : undefined}
          >
            <span className="analysis-progress-card__marker" aria-hidden="true">
              {steps[i] === 'done' ? (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M3 7.5l2.5 2.5L11 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <span className="analysis-progress-card__dot" />
              )}
            </span>
            <span className="sr-only">{STEP_SR_PREFIX[steps[i]]}</span>
            {label}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function AnalysisProgressCard({
  mode,
  status,
  analysisId,
  errorMessage,
  longRunningAfterMs = LONG_RUNNING_AFTER_MS,
  stalledAfterMs = STALLED_AFTER_MS,
  onViewReport,
}: {
  mode: AnalysisProgressMode;
  status?: NormalizedAnalysisStatus;
  analysisId?: string;
  errorMessage?: string | null;
  longRunningAfterMs?: number;
  stalledAfterMs?: number;
  onViewReport?: () => void;
}) {
  const [longRunning, setLongRunning] = useState(longRunningAfterMs <= 0);
  const [stalled, setStalled] = useState(stalledAfterMs <= 0);

  useEffect(() => {
    if (mode !== 'active' || longRunningAfterMs <= 0) return;
    const timer = setTimeout(() => setLongRunning(true), longRunningAfterMs);
    return () => clearTimeout(timer);
  }, [mode, longRunningAfterMs]);

  useEffect(() => {
    if (mode !== 'complete' || stalledAfterMs <= 0) return;
    const timer = setTimeout(() => setStalled(true), stalledAfterMs);
    return () => clearTimeout(timer);
  }, [mode, stalledAfterMs]);

  if (mode === 'failed') {
    const isLimit = errorMessage?.toLowerCase().includes('limit');
    return (
      <section className="analysis-progress-card" role="alert">
        <span className="analysis-progress-card__status-icon analysis-progress-card__status-icon--danger" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 5v3.5M8 10.75v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </span>
        <h2>Analysis could not be completed</h2>
        <p className="analysis-progress-card__desc">
          {errorMessage || 'We couldn\'t process this resume. Please upload the file again or try a different PDF export.'}
        </p>
        <div className="analysis-progress-card__actions">
          <Link to="/upload" className="btn btn-primary">
            {isLimit ? 'Back to Upload' : 'Upload again'}
          </Link>
          <Link to="/history" className="btn btn-outline">Go to History</Link>
        </div>
      </section>
    );
  }

  if (mode === 'timeout') {
    return (
      <section className="analysis-progress-card" role="status">
        <h2>Still working on it</h2>
        <p className="analysis-progress-card__desc">
          The analysis is taking longer than expected, but it's still running in the background.
        </p>
        <div className="analysis-progress-card__notice">
          <p className="analysis-progress-card__notice-primary">
            You can safely leave this page — when it finishes, your result will appear in <strong>History</strong>.
          </p>
        </div>
        <div className="analysis-progress-card__actions">
          <Link to="/history" state={{ pendingAnalysisId: analysisId }} className="btn btn-primary">
            Go to History
          </Link>
          <button type="button" className="btn btn-outline" onClick={() => window.location.reload()}>
            Refresh
          </button>
        </div>
      </section>
    );
  }

  const stalledComplete = mode === 'complete' && stalled;
  const title = mode === 'complete'
    ? 'Analysis complete'
    : mode === 'finalizing'
      ? 'Finalizing results'
      : 'Resume analysis in progress';
  const description = stalledComplete
    ? 'Opening your report is taking longer than expected.'
    : mode === 'complete'
      ? 'Opening your report...'
      : mode === 'finalizing'
        ? 'Analysis complete — putting your report together...'
        : 'We\'re comparing your resume against the job description and preparing targeted improvement suggestions.';

  return (
    <section
      className={`analysis-progress-card${mode === 'complete' ? ' analysis-progress-card--complete' : ''}`}
      style={mode === 'complete' ? COMPLETION_BEAT_STYLE : undefined}
      role="status"
      aria-live="polite"
    >
      {mode === 'complete' && (
        <span className="analysis-progress-card__success-check" aria-hidden="true">
          <svg width="40" height="40" viewBox="0 0 52 52" fill="none">
            <path
              className="analysis-progress-card__success-path"
              pathLength="1"
              d="M15 27.5l7.5 7.5L37 19.5"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      )}
      <h2>{title}</h2>
      <p className="analysis-progress-card__desc">{description}</p>
      <StepChecklist steps={getStepStates(mode, status)} />
      {stalledComplete && (
        <div className="analysis-progress-card__actions">
          <button type="button" className="btn btn-primary" onClick={onViewReport}>
            View report
          </button>
          <Link to="/history" className="btn btn-outline">Go to History</Link>
        </div>
      )}
      {mode === 'active' && (
        <>
          <div className="analysis-progress-card__notice">
            {longRunning ? (
              <>
                <p className="analysis-progress-card__notice-primary">This is taking longer than usual.</p>
                <p className="analysis-progress-card__notice-secondary">
                  You can still safely leave this page — we'll save your result to <strong>History</strong> when it finishes.
                </p>
              </>
            ) : (
              <>
                <p className="analysis-progress-card__notice-primary">
                  You can safely leave this page — your result will be saved automatically and available in <strong>History</strong>.
                </p>
                <p className="analysis-progress-card__notice-secondary">Usually takes about 30 seconds.</p>
              </>
            )}
          </div>
          <div className="analysis-progress-card__actions">
            <Link to="/history" state={{ pendingAnalysisId: analysisId }} className="btn btn-primary">
              Go to History
            </Link>
            <Link to="/upload" className="btn btn-outline">Start another analysis</Link>
          </div>
        </>
      )}
    </section>
  );
}
