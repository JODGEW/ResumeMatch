import { useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { NormalizedAnalysisStatus } from '../hooks/usePolling';
import { markAnalysisNew } from '../utils/newAnalyses';
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

const STEPS: ReadonlyArray<{ label: string; detail: string }> = [
  { label: 'Upload received', detail: 'Reading your resume file' },
  { label: 'Preparing your resume', detail: 'Extracting skills, roles, and keywords' },
  { label: 'Analyzing against the job description', detail: 'Scoring match and finding gaps' },
  { label: 'Saving your report to History', detail: 'Finalizing and storing your results' },
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

/**
 * Determinate progress, read as "you're on step N of 4" rather than "N steps
 * finished".
 *
 * Counting only finished steps made the bar jump 50% -> 100%: the Lambda writes
 * `status = 'completed'` and `matchScore` in one atomic update, so saving to
 * History is never observable as in-flight and steps 3 and 4 always land
 * together. Counting the active step instead gives even 25-point increments
 * (50 -> 75 -> 100) off the same backend signals, with nothing simulated.
 */
function getPercent(steps: StepState[]): number {
  const activeIndex = steps.indexOf('active');
  const reached = activeIndex === -1 ? steps.length : activeIndex + 1;
  return Math.round((reached / steps.length) * 100);
}

function Stepper({ steps }: { steps: StepState[] }) {
  return (
    <ol className="apc-steps">
      {STEPS.map((step, i) => {
        const state = steps[i];
        const hasRail = i < STEPS.length - 1;
        return (
          <li
            key={step.label}
            className={`apc-step apc-step--${state}`}
            aria-current={state === 'active' ? 'step' : undefined}
          >
            <div className="apc-step__gutter" aria-hidden="true">
              <span className="apc-step__marker">
                {state === 'done' && (
                  <svg width="12" height="12" viewBox="0 0 12 12">
                    <polyline points="2.5,6.2 5,8.5 9.5,3.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
                {state === 'active' && (
                  <svg className="apc-spin" width="14" height="14" viewBox="0 0 16 16">
                    <circle cx="8" cy="8" r="6" stroke="var(--accent-border)" strokeWidth="2" fill="none" opacity="0.4" />
                    <path d="M8 2a6 6 0 0 1 6 6" stroke="var(--accent-hover)" strokeWidth="2" strokeLinecap="round" fill="none" />
                  </svg>
                )}
                {state === 'pending' && <span className="apc-step__dot" />}
              </span>
              {hasRail && <span className="apc-step__rail" />}
            </div>
            <div className="apc-step__body">
              <div className="apc-step__label">
                <span className="sr-only">{STEP_SR_PREFIX[state]}</span>
                {step.label}
              </div>
              {state === 'active' && <div className="apc-step__detail">{step.detail}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function AnalysisProgressCard({
  mode,
  status,
  analysisId,
  fileName,
  roleLabel,
  errorMessage,
  longRunningAfterMs = LONG_RUNNING_AFTER_MS,
  stalledAfterMs = STALLED_AFTER_MS,
  onViewReport,
}: {
  mode: AnalysisProgressMode;
  status?: NormalizedAnalysisStatus;
  analysisId?: string;
  fileName?: string;
  roleLabel?: string;
  errorMessage?: string | null;
  longRunningAfterMs?: number;
  stalledAfterMs?: number;
  onViewReport?: () => void;
}) {
  const [longRunning, setLongRunning] = useState(longRunningAfterMs <= 0);
  const [stalled, setStalled] = useState(stalledAfterMs <= 0);
  const [elapsed, setElapsed] = useState(0);

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

  // Display only — the stepper and the bar are driven by backend status, never
  // by this counter.
  useEffect(() => {
    if (mode !== 'active' && mode !== 'finalizing') return;
    const timer = setInterval(() => setElapsed(seconds => seconds + 1), 1000);
    return () => clearInterval(timer);
  }, [mode]);

  // Flag the finished analysis so History can badge it as new. Cleared when the
  // user opens it from History, not by the auto-reveal that follows completion.
  useEffect(() => {
    if (mode === 'complete' && analysisId) markAnalysisNew(analysisId);
  }, [mode, analysisId]);

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

  const isComplete = mode === 'complete';
  const stalledComplete = isComplete && stalled;
  const steps = getStepStates(mode, status);
  const percent = getPercent(steps);

  const title = isComplete ? 'Analysis complete' : 'Resume analysis in progress';
  const subtitle = isComplete
    ? 'Your match score and targeted suggestions are ready.'
    : 'We\'re comparing your resume against the job description and preparing targeted improvement suggestions.';
  const compareLine = isComplete && roleLabel
    ? `vs. ${roleLabel}`
    : 'Comparing with your job description';

  return (
    <section
      className={`apc${isComplete ? ' apc--complete' : ''}`}
      style={isComplete ? COMPLETION_BEAT_STYLE : undefined}
      role="status"
      aria-live="polite"
    >
      <div className="apc__head">
        {isComplete ? (
          <div className="apc__badge apc__badge--done" aria-hidden="true">
            <span className="apc__badge-face">
              <svg width="26" height="26" viewBox="0 0 26 26">
                <polyline points="7,13.5 11.5,18 19,8.5" fill="none" stroke="var(--success-alt)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </div>
        ) : (
          <div className="apc__badge" aria-hidden="true">
            <span className="apc__badge-pulse" />
            <span className="apc__badge-face">
              <svg className="apc-spin" width="26" height="26" viewBox="0 0 26 26">
                <circle cx="13" cy="13" r="9.5" stroke="var(--accent-border)" strokeWidth="2.4" fill="none" opacity="0.4" />
                <path d="M13 3.5a9.5 9.5 0 0 1 9.5 9.5" stroke="var(--accent-hover)" strokeWidth="2.4" strokeLinecap="round" fill="none" />
              </svg>
            </span>
          </div>
        )}
        <h1 className="apc__title">{title}</h1>
        <p className="apc__subtitle">{subtitle}</p>
      </div>

      <div className="apc__context">
        <span className="apc__context-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 18 18">
            <path d="M4.5 2.5h6l3.5 3.5v9.5h-9.5V2.5Z" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinejoin="round" />
            <path d="M10.5 2.5v3.5h3.5" stroke="currentColor" strokeWidth="1.3" fill="none" />
          </svg>
        </span>
        <div className="apc__context-body">
          <div className="apc__context-file">{fileName || 'Your resume'}</div>
          <div className="apc__context-line">{compareLine}</div>
        </div>
        <span className="apc__context-pct">{percent}%</span>
      </div>

      <div className="apc__bar" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
        <div className="apc__bar-fill" style={{ width: `${percent}%` }} />
      </div>

      <Stepper steps={steps} />

      <div className="apc__footer">
        {isComplete ? (
          <>
            <p className="apc__footer-note">
              {stalledComplete ? 'Opening your report is taking longer than expected.' : 'Redirecting to your report…'}
            </p>
            <button type="button" className="apc__cta" onClick={onViewReport}>
              View results now
              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M3 8h9M8.5 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </svg>
            </button>
          </>
        ) : (
          <>
            <p className="apc__footer-note">
              {longRunning
                ? 'This is taking longer than usual — you can still safely leave; your report saves automatically and will appear in your History.'
                : 'You can safely leave — your report saves automatically and will appear in your History.'}
            </p>
            <p className="apc__footer-meta">Usually about 30 seconds · {elapsed}s elapsed</p>
            <div className="apc__footer-links">
              <Link to="/history" state={{ pendingAnalysisId: analysisId }}>Go to History</Link>
              <span className="apc__footer-divider" />
              <Link to="/upload">Start another analysis</Link>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
