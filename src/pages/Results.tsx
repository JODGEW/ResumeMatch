import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { usePolling, isInProgress, normalizeAnalysisStatus } from '../hooks/usePolling';
import { ProgressRing } from '../components/ProgressRing';
import { Badge } from '../components/Badge';
import { DiffView } from '../components/DiffView';
import { countSafeEdits } from '../utils/resumeDiff';
import DownloadOptimizedButton from '../components/DownloadOptimizedButton';
import { AnalysisProgressCard, COMPLETION_BEAT_MS } from '../components/AnalysisProgressCard';
import { SignupPromptModal } from '../components/SignupPromptModal';
import { fetchAuthSession } from 'aws-amplify/auth';
import { getResumeUrl } from '../api/upload';
import { getSession, isMissingInterviewSessionError, listSessions } from '../api/interview';
import { clearInterviewPointer, loadInterviewPointer } from '../utils/interviewPointer';
import { getTrackerPrefill } from '../utils/trackerPrefill';
import { useAuth } from '../auth/AuthContext';
import { SAMPLE_ANALYSIS } from '../types/sampleAnalysis';
import './Results.css';

type LastInterview = {
  sessionId: string;
  createdAt?: string;
  completedAt?: string;
};

type SignupPromptContent = {
  title: string;
  body: string;
};

function getLastInterviewTime(session: LastInterview) {
  const timestamp = new Date(session.completedAt || session.createdAt || '').getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function InterviewButton({ resumeText, jobDescription, fileName, analysisId, jobTitle, matchScore, navigate, isDemo, onDemoAction }: {
  resumeText: string;
  jobDescription: string;
  fileName?: string;
  analysisId?: string;
  jobTitle?: string;
  matchScore?: number;
  navigate: ReturnType<typeof useNavigate>;
  isDemo: boolean;
  onDemoAction: (content: SignupPromptContent) => void;
}) {
  const [lastInterviewId, setLastInterviewId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadLastInterview() {
      setLastInterviewId(null);
      // Read-only (shared demo account or signed-out /sample): skip the authed
      // session lookups (listSessions / getSession) entirely.
      if (isDemo) return;
      const candidates: LastInterview[] = [];

      const pointer = loadInterviewPointer(resumeText, jobDescription);
      if (pointer) {
        try {
          const session = await getSession(pointer.sessionId);
          if (cancelled) return;
          if (session.status === 'completed') {
            candidates.push({
              sessionId: session.sessionId,
              createdAt: session.createdAt,
              completedAt: session.completedAt,
            });
          }
        } catch (err) {
          if (cancelled) return;
          if (isMissingInterviewSessionError(err)) {
            clearInterviewPointer(resumeText, jobDescription);
          }
        }
      }

      if (analysisId) {
        try {
          const sessions = await listSessions();
          if (cancelled) return;
          sessions
            .filter(session => session.analysisId === analysisId && session.status === 'completed')
            .forEach(session => candidates.push({
              sessionId: session.sessionId,
              createdAt: session.createdAt,
              completedAt: session.completedAt,
            }));
        } catch (err) {
          console.error('Failed to load interview sessions:', err);
        }
      }

      const latest = candidates.sort((a, b) => getLastInterviewTime(b) - getLastInterviewTime(a))[0];
      if (!cancelled) {
        setLastInterviewId(latest?.sessionId ?? null);
      }
    }

    loadLastInterview();

    return () => {
      cancelled = true;
    };
  }, [resumeText, jobDescription, analysisId, isDemo]);

  return (
    <div className="results-interview-action">
      <button
        className="btn btn-primary"
        title={isDemo ? 'Sign up for full access' : undefined}
        onClick={() => {
          if (isDemo) {
            onDemoAction({
              title: 'Start Your Mock Interview',
              body: 'Create a free account to practice role-specific interview questions and get a detailed interview report.',
            });
            return;
          }
          navigate('/interview', {
            state: { resumeText, jobDescription, fileName, analysisId, jobTitle, matchScore, startFresh: true }
          });
        }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <rect x="3.5" y="1" width="7" height="9" rx="3.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M2 7c0 2.75 2.25 5 5 5s5-2.25 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M7 12v1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        Start Interview
      </button>
      {lastInterviewId ? (
        <Link className="results-last-interview-link" to={`/interview/results/${lastInterviewId}`}>
          View last interview
        </Link>
      ) : null}
    </div>
  );
}

function getScoreInterpretation(score: number) {
  if (score >= 86) {
    return {
      label: 'Strong Match',
      action: 'You are well aligned. Apply with minimal changes and emphasize your strongest matched skills.',
      color: 'var(--score-high)'
    };
  }

  if (score >= 76) {
    return {
      label: 'Good Match',
      action: 'Apply after a light resume pass. Add missing keywords only where they honestly fit.',
      color: 'var(--score-good)'
    };
  }

  if (score >= 61) {
    return {
      label: 'Moderate Match',
      action: 'Tailor your resume before applying. Focus on the highest-priority missing keywords.',
      color: 'var(--score-mid)'
    };
  }

  if (score >= 41) {
    return {
      label: 'Weak Match',
      action: 'Apply selectively. The role has meaningful gaps, so prioritize stronger matches unless you can clearly address them.',
      color: 'var(--score-low)'
    };
  }

  return {
    label: 'Poor Match',
    action: 'This role is likely a poor fit based on the current resume. Target roles with closer alignment first.',
    color: 'var(--score-poor)'
  };
}

function ProgressPage({ children }: { children: React.ReactNode }) {
  return (
    <div className="page-container">
      <div className="analysis-progress-hero">{children}</div>
    </div>
  );
}

function ResultsRouteLoadingState() {
  return (
    <div className="page-container">
      <div className="results-loading results-loading--route">
        <div className="loading-spinner" />
        <p className="text-secondary">Loading results...</p>
      </div>
    </div>
  );
}

export function Results({ sample = false }: { sample?: boolean }) {
  const { analysisId } = useParams<{ analysisId: string }>();
  // In sample mode we render a canned report with no backend: pass `null` to
  // usePolling so it short-circuits (no getAnalysis call, no stale-state guard),
  // then override its outputs with the fixture.
  const poll = usePolling(sample ? null : (analysisId ?? null));
  const analysis = sample ? SAMPLE_ANALYSIS : poll.analysis;
  const loading = sample ? false : poll.loading;
  const error = sample ? null : poll.error;
  const timedOut = sample ? false : poll.timedOut;
  const status = normalizeAnalysisStatus(analysis?.status);
  const [resumeUrl, setResumeUrl] = useState<string | null>(null);
  const [resumeLoading, setResumeLoading] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [jdOpen, setJdOpen] = useState(false);
  const [signupPrompt, setSignupPrompt] = useState<SignupPromptContent | null>(null);
  const { user } = useAuth();
  const isDemo = user?.email === 'demo123@resumeapp.com';
  // Read-only covers both the shared demo account and the signed-out /sample page:
  // every write/action button routes to the signup prompt instead of the backend.
  const isReadOnly = isDemo || sample;
  const navigate = useNavigate();

  // Completion beat: after the user has watched the analysis run, hold a brief
  // all-steps-done card before revealing the report. Never plays when landing
  // on an already-finished analysis (e.g. from History).
  const sawProgressRef = useRef(false);
  const [completionBeatDone, setCompletionBeatDone] = useState(false);
  const isComplete = status === 'completed' && analysis?.matchScore != null;

  useEffect(() => {
    sawProgressRef.current = false;
    setCompletionBeatDone(false);
  }, [analysisId]);

  useEffect(() => {
    if (analysis && (isInProgress(status) || (status === 'completed' && analysis.matchScore == null))) {
      sawProgressRef.current = true;
    }
  }, [analysis, status]);

  const showCompletionBeat = isComplete && !completionBeatDone && sawProgressRef.current;

  useEffect(() => {
    if (!showCompletionBeat) return;
    const timer = setTimeout(() => setCompletionBeatDone(true), COMPLETION_BEAT_MS);
    return () => clearTimeout(timer);
  }, [showCompletionBeat]);

  // How many edits the guard let through. Drives the diff caption; 0 means the texts are
  // identical and the no-safe-rewrites empty state renders instead.
  const safeEditCount = useMemo(() => {
    const originalText = analysis?.originalText;
    const suggestedText = analysis?.suggestedText;
    if (!originalText || !suggestedText) return 0;
    return countSafeEdits(originalText, suggestedText);
  }, [analysis?.originalText, analysis?.suggestedText]);

  const closeModal = useCallback(() => {
    setResumeUrl(null);
    setResumeError(null);
    setIframeLoaded(false);
  }, []);

  // ESC to close modal
  useEffect(() => {
    if (!resumeUrl) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') closeModal();
    }
    document.addEventListener('keydown', handleKeyDown);
    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [resumeUrl, closeModal]);

  async function handleDownload() {
    if (!resumeUrl) return;
    try {
      const res = await fetch(resumeUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = analysis?.fileName ?? 'resume.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      console.error('Download failed');
    }
  }

  async function handleViewResume() {
    setResumeLoading(true);
    setResumeError(null);
    const timeout = setTimeout(() => {
      setResumeLoading(false);
      setResumeError('Loading took too long. Please try again or re-upload your resume.');
    }, 12000);
    try {
      const session = await fetchAuthSession();
      const userId = (session.tokens?.idToken?.payload?.email as string) || '';
      const url = await getResumeUrl(analysisId ?? '', userId);
      clearTimeout(timeout);
      setResumeUrl(url);
    } catch (err) {
      clearTimeout(timeout);
      console.error('Failed to load resume', err);
      setResumeError('Failed to load resume. Check your connection and try again.');
    } finally {
      setResumeLoading(false);
    }
  }

  function handleAddToTracker() {
    if (!analysis) return;
    const prefill = getTrackerPrefill(analysis);
    navigate(`/tracker?prefill=${encodeURIComponent(JSON.stringify(prefill))}`);
  }

  if (error) {
    return (
      <div className="page-container">
        <div className="results-empty">
          <h2>Something went wrong</h2>
          <p className="text-secondary">{error}</p>
          <Link to="/upload" className="btn btn-primary" style={{ marginTop: '1rem' }}>
            Try again
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return <ResultsRouteLoadingState />;
  }

  if (!analysis || isInProgress(status)) {
    if (!timedOut) {
      return (
        <ProgressPage>
          <AnalysisProgressCard key={analysisId} mode="active" status={status} analysisId={analysisId} />
        </ProgressPage>
      );
    }

    return (
      <ProgressPage>
        <AnalysisProgressCard mode="timeout" analysisId={analysisId} />
      </ProgressPage>
    );
  }

  if (status === 'failed') {
    return (
      <ProgressPage>
        <AnalysisProgressCard mode="failed" errorMessage={analysis.errorMessage} />
      </ProgressPage>
    );
  }

  if (analysis.matchScore == null) {
    return (
      <ProgressPage>
        <AnalysisProgressCard mode="finalizing" />
      </ProgressPage>
    );
  }

  if (showCompletionBeat) {
    return (
      <ProgressPage>
        <AnalysisProgressCard mode="complete" onViewReport={() => setCompletionBeatDone(true)} />
      </ProgressPage>
    );
  }

  const calculatedExperienceYears = analysis.experienceCheck?.displayYears ?? analysis.experienceCheck?.actualYears;
  const resumeStatedYears = analysis.experienceCheck?.resumeStatedYears || 'Not specified';

  return (
    <div className={`page-container results-reading-page${completionBeatDone ? ' results-reading-page--reveal' : ''}`}>
      {/* Sample-report banner: /sample renders bare (no app nav), so this is the
          only persistent affordance for direct visitors. Required, not optional. */}
      {sample && (
        <div className="results-sample-banner" role="region" aria-label="Sample report">
          <div className="results-sample-banner__text">
            <span className="results-sample-banner__badge">Sample report</span>
            <span className="results-sample-banner__note">
              This is an example analysis. Run your own resume against any job — free, no card.
            </span>
          </div>
          <div className="results-sample-banner__actions">
            <Link to="/" className="btn btn-ghost btn--sm">Back to site</Link>
            <Link to="/signup" className="btn btn-primary btn--sm">Create a free account</Link>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="page-header animate-in">
        <div className="results-header">
          <div className="results-header__top">
            <div className="results-header__title">
              <h1>{analysis.jobTitle || 'Analysis Results'}</h1>
              {analysis.fileName && (
                <p className="results-filename">{analysis.fileName}</p>
              )}
            </div>
            {isReadOnly ? (
              <button
                type="button"
                className="btn btn-primary btn-create-action results-header__primary"
                onClick={() => setSignupPrompt({
                  title: 'Run Your Own Analysis',
                  body: 'Create a free account to match your resume against any job description — free, no card.',
                })}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                New analysis
              </button>
            ) : (
              <Link to="/upload" className="btn btn-primary btn-create-action results-header__primary">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                New analysis
              </Link>
            )}
          </div>
          <div className="results-header__tools">
            {analysis.jobDescription && (analysis.originalText || analysis.suggestedText) ? (
              <InterviewButton
                resumeText={analysis.originalText || analysis.suggestedText || ''}
                jobDescription={analysis.jobDescription}
                fileName={analysis.fileName}
                analysisId={analysisId}
                jobTitle={analysis.jobTitle}
                matchScore={analysis.matchScore}
                navigate={navigate}
                isDemo={isReadOnly}
                onDemoAction={setSignupPrompt}
              />
            ) : null}
            {!sample && (
              <button
                className="btn btn-secondary"
                onClick={handleViewResume}
                disabled={resumeLoading}
              >
                {resumeLoading ? (
                  <>
                    <span className="btn-spinner" />
                    Loading...
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M2 10v2h10v-2M7 2v7M4 6l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    View Resume
                  </>
                )}
              </button>
            )}
            <button
              className="btn btn-outline"
              title={isReadOnly ? 'Sign up for full access' : 'Add to Outreach Tracker'}
              onClick={() => {
                if (isReadOnly) {
                  setSignupPrompt({
                    title: 'Add This Role to Your Outreach Tracker',
                    body: 'Create a free account to save roles, track follow-ups, and manage your application pipeline.',
                  });
                  return;
                }
                handleAddToTracker();
              }}
            >
              Add to Tracker
            </button>
          </div>
        </div>
      </div>

      {/* Job Description (collapsible) */}
      {analysis.jobDescription && (
        <div className="results-jd animate-in">
          <button
            type="button"
            className="results-jd__toggle"
            onClick={() => setJdOpen(!jdOpen)}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              className={`results-jd__chevron ${jdOpen ? 'results-jd__chevron--open' : ''}`}
            >
              <path d="M4.5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Job Description
          </button>
          {jdOpen && (
            <div className="results-jd__content">
              {analysis.jobDescription}
            </div>
          )}
        </div>
      )}

      {/* Experience Insight */}
      {analysis.experienceCheck?.hasMismatch && (
        <div className="results-experience animate-in">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="results-experience__icon">
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 5.5v3M8 10v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <div>
            <p className="results-experience__title">
              {analysis.experienceCheck.warning}
            </p>
            <p className="results-experience__body">
              {analysis.experienceCheck.recommendation}
            </p>
            {analysis.experienceCheck.requiredYears && (
              <p className="results-experience__detail">
                Required: {analysis.experienceCheck.requiredYears} years ·
                Explicitly stated on resume: {resumeStatedYears} ·
                Calculated from dates: {calculatedExperienceYears} years
              </p>
            )}
          </div>
        </div>
      )}

      {/* Score Row: Ring & Breakdown in one card */}
      <div className="results-score-row card animate-in stagger-1">
        <div className="results-score">
          {(() => {
            const interp = getScoreInterpretation(Number(analysis.matchScore));
            return (
              <div className="results-score__hover-wrap">
                <ProgressRing score={Number(analysis.matchScore)} label={interp.label} />
                <div className="results-score__tooltip">
                  <p className="results-score__tooltip-action">{interp.action}</p>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Score Breakdown */}
        {analysis.scoreBreakdown && (
          <div className="results-score-breakdown">
            <h4 className="results-breakdown-title">Score Breakdown</h4>

            {analysis.scoreSummary && (
              <p className="results-score-summary">{analysis.scoreSummary}</p>
            )}

            {analysis.matchedCount != null && analysis.totalCount != null && (
              <p className="results-score-count text-muted">
                Matched {analysis.matchedCount} of {analysis.totalCount} required keywords
              </p>
            )}

            <div className="results-breakdown-bars">
              {[
                { label: 'Technical Skills', value: analysis.scoreBreakdown.technical },
                { label: 'Tools',            value: analysis.scoreBreakdown.tools },
                { label: 'Soft Skills',      value: analysis.scoreBreakdown.softSkills },
                { label: 'Experience',       value: analysis.scoreBreakdown.experience },
              ].map(({ label, value }) => (
                <div key={label} className="results-breakdown-row">
                  <div className="results-breakdown-label">
                    <span>{label}</span>
                    <span className="text-muted">{value}/100</span>
                  </div>
                  <div className="results-breakdown-track">
                    <div
                      className="results-breakdown-fill"
                      style={{
                        width: `${value}%`,
                        background: value >= 76 ? 'var(--success)' : value >= 51 ? 'var(--accent)' : 'var(--danger)'
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Keywords: full width below */}
      <div className="results-keywords animate-in stagger-2">
        {/* Matched & Missing side by side */}
        <div className="results-keywords-row">
          {analysis.presentKeywords && analysis.presentKeywords.length > 0 && (
            <div className="card results-keyword-section">
              <h4>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="6" stroke="var(--success)" strokeWidth="1.5" />
                  <path d="M5.5 8l2 2 3.5-4" stroke="var(--success)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Matched Keywords
                <span className="results-keyword-count text-success">
                  {analysis.presentKeywords.length}
                </span>
              </h4>
              <div className="results-badges">
                {analysis.presentKeywords.map((kw) => (
                  <Badge key={kw} label={kw} variant="success" />
                ))}
              </div>
            </div>
          )}

          {analysis.missingKeywords && analysis.missingKeywords.length > 0 && (
            <div className="card results-keyword-section results-keyword-section--missing">
              <h4>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="6" stroke="var(--danger)" strokeWidth="1.5" />
                  <path d="M6 6l4 4M10 6l-4 4" stroke="var(--danger)" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                Missing Keywords
                <span className="results-keyword-count text-danger">
                  {analysis.missingKeywords.length}
                </span>
              </h4>
              <div className="results-badges">
                {analysis.missingKeywords.map((kw) => (
                  <Badge key={kw} label={kw} variant="danger" />
                ))}
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Top Priority Keywords */}
      {analysis.topMissing && analysis.topMissing.length > 0 && (
        <div className="results-section animate-in stagger-3">
          <h2>Top Priority Keywords</h2>
          <p className="text-secondary results-section__intro">
            High-impact keywords missing from your resume, ranked by importance
          </p>

          <div className="results-suggestions">
            {analysis.topMissing.map((item) => (
              <div key={item.keyword} className="card results-suggestion">
                <div className="results-suggestion__header">
                  <span className="results-suggestion__section">{item.keyword}</span>
                  <span className="text-muted" style={{ fontSize: '0.75rem' }}>
                    {item.importanceScore}/10
                  </span>
                </div>
                <div className="results-suggestion__copy">
                  <p className="results-suggestion__reason text-muted">{item.reason}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Suggestions */}
      {analysis.suggestions && analysis.suggestions.length > 0 && (
        <div className="results-section animate-in stagger-3">
          <h2>Suggestions</h2>
          <p className="text-secondary results-section__intro">
            Recommended additions to improve your match score
          </p>

          <div className="results-suggestions">
            {analysis.suggestions.map((s, i) => (
              <div key={i} className="card results-suggestion animate-in" style={{ animationDelay: `${0.3 + i * 0.06}s` }}>
                <div className="results-suggestion__header">
                  <span className="results-suggestion__section">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M2 4h10M2 7h6M2 10h8" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                    {s.keyword}
                  </span>
                </div>
                <div className="results-suggestion__copy">
                  <p className="results-suggestion__text">{s.whereToAdd}</p>
                  <p className="results-suggestion__reason text-muted">{s.reason}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Diff View. The rewrite guard refuses to insert anything your resume doesn't back
          up, so a clean run legitimately produces zero edits. Say so plainly instead of
          rendering a "suggested improvements" heading over an unchanged document. */}
      {analysis.originalText && analysis.suggestedText && (
        <div className="results-section animate-in stagger-4">
          <h2>Detailed Changes</h2>
          {analysis.suggestedText.trim() === analysis.originalText.trim() ? (
            <div className="results-no-rewrites">
              <p className="results-no-rewrites__title">No safe rewrites for this posting.</p>
              <p className="results-no-rewrites__body">
                Nothing in your resume backs up the missing keywords, so there is no honest
                wording change to make. These are real gaps, not phrasing differences. We
                will not add tools or skills you haven&apos;t used. See the suggestions for
                what would actually close them.
              </p>
            </div>
          ) : (
            <>
              <p className="results-diff-caption">
                {safeEditCount > 0 && (
                  <strong className="results-diff-caption__count">
                    {safeEditCount === 1 ? '1 safe edit found.' : `${safeEditCount} safe edits found.`}
                  </strong>
                )}{' '}
                We only change wording your resume already backs up. Anything still missing is
                a real gap; see the suggestions.
              </p>
              <DiffView
                original={analysis.originalText}
                suggested={analysis.suggestedText}
              />
            </>
          )}
        </div>
      )}

      {/* Download Optimized Resume */}
      <DownloadOptimizedButton
        suggestedText={analysis.suggestedText}
        status="completed"
        isDemo={isReadOnly}
      />

      {signupPrompt && (
        <SignupPromptModal
          onClose={() => setSignupPrompt(null)}
          title={signupPrompt.title}
          body={signupPrompt.body}
        />
      )}

      {/* Resume Modal */}
      {(resumeUrl || resumeError) && (
        <div className="modal-overlay" onClick={closeModal} role="dialog" aria-modal="true" aria-label="Resume viewer">
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-header__left">
                <h3>{analysis.fileName ?? 'Resume'}</h3>
                {analysis.createdAt && (
                  <span className="modal-meta">
                    Uploaded {new Date(analysis.createdAt).toLocaleDateString()}
                  </span>
                )}
              </div>
              <div className="modal-header__actions">
                {resumeUrl && (
                  <>
                    <button
                      className="modal-action-btn"
                      onClick={handleDownload}
                      title="Download PDF"
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M2 11v3h12v-3M8 2v8M5 7l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <a
                      href={resumeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="modal-action-btn"
                      title="Open in new tab"
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M6 3H3v10h10v-3M9 3h4v4M14 2L7 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </a>
                  </>
                )}
                <button className="modal-close" onClick={closeModal} aria-label="Close">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </div>
            {resumeError ? (
              <div className="modal-error">
                <p>{resumeError}</p>
                <button className="btn btn-secondary" onClick={handleViewResume}>
                  Retry
                </button>
              </div>
            ) : (
              <div className="modal-body">
                {!iframeLoaded && (
                  <div className="modal-loading">
                    <div className="btn-spinner btn-spinner--lg" />
                    <p className="text-muted">Loading PDF...</p>
                  </div>
                )}
                <iframe
                  src={resumeUrl!}
                  width="100%"
                  height="100%"
                  style={{ border: 'none', display: iframeLoaded ? 'block' : 'none' }}
                  title="Resume PDF"
                  onLoad={() => setIframeLoaded(true)}
                  onError={() => {
                    setResumeError('The resume could not be loaded. The link may have expired.');
                    setResumeUrl(null);
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
