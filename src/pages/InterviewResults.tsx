import { useState, useEffect, useRef } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { getAnalysis } from '../api/analysis';
import { endInterview, getSession, type EndRequest, type SessionResponse, type TurnFeedback } from '../api/interview';
import { isInterviewQuestionTurn } from '../utils/interviewQuestions';
import { clearInterviewPointer } from '../utils/interviewPointer';
import './InterviewResults.css';

type InterviewType = 'behavioral' | 'technical';
type TranscriptTurn = SessionResponse['conversation'][number];
type PendingInterviewFinalization = {
  endReason: EndRequest['endReason'];
  startedAt: number;
};

const FINALIZATION_STORAGE_PREFIX = 'resumematch_interview_finalizing_';
const FINALIZATION_TTL_MS = 2 * 60 * 1000;

function getFinalizationStorageKey(sessionId: string): string {
  return `${FINALIZATION_STORAGE_PREFIX}${sessionId}`;
}

function loadPendingInterviewFinalization(sessionId: string): PendingInterviewFinalization | null {
  try {
    const raw = sessionStorage.getItem(getFinalizationStorageKey(sessionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingInterviewFinalization>;
    const endReason = parsed.endReason;
    const startedAt = parsed.startedAt;
    const isValidReason = endReason === 'timer_expired'
      || endReason === 'user_ended'
      || endReason === 'all_questions_answered';
    const isFresh = typeof startedAt === 'number'
      && Date.now() - startedAt <= FINALIZATION_TTL_MS;
    if (!isValidReason || !isFresh || typeof startedAt !== 'number') {
      sessionStorage.removeItem(getFinalizationStorageKey(sessionId));
      return null;
    }
    return { endReason, startedAt };
  } catch {
    return null;
  }
}

function savePendingInterviewFinalization(sessionId: string, endReason: EndRequest['endReason']): void {
  try {
    sessionStorage.setItem(
      getFinalizationStorageKey(sessionId),
      JSON.stringify({ endReason, startedAt: Date.now() })
    );
  } catch {
    // Session storage can be unavailable in restricted browser contexts.
  }
}

function clearPendingInterviewFinalization(sessionId: string): void {
  try {
    sessionStorage.removeItem(getFinalizationStorageKey(sessionId));
  } catch {
    // Session storage can be unavailable in restricted browser contexts.
  }
}

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function scoreColor(score: number): string {
  if (score >= 80) return 'var(--score-high)';
  if (score >= 60) return 'var(--score-good)';
  return 'var(--score-mid)';
}

function formatInterviewType(type: string): string {
  if (!type) return 'Interview';
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function normalizeJobTitle(title: string): string {
  return title.replace(/\s+@\s+/, ' — ');
}

function getSessionTitle(session: SessionResponse): string {
  if (session.roleName && session.companyName) {
    return `${session.roleName} — ${session.companyName}`;
  }
  if (session.roleName) return session.roleName;
  if (session.jobTitle) return normalizeJobTitle(session.jobTitle);
  return `${formatInterviewType(session.interviewType)} Practice Session (No job selected)`;
}

function parseMatchScore(score?: number | string): number | null {
  if (score == null || (typeof score === 'string' && score.trim() === '')) return null;
  const numeric = typeof score === 'number' ? score : Number(score);
  if (!Number.isFinite(numeric)) return null;
  return Math.round(numeric);
}

function formatMatchScore(score?: number | string): string | null {
  const numeric = parseMatchScore(score);
  return numeric == null ? null : `${numeric}% Match`;
}

function getMatchScoreTier(score: number): 'high' | 'good' | 'mid' | 'low' | 'poor' {
  if (score >= 86) return 'high';
  if (score >= 76) return 'good';
  if (score >= 61) return 'mid';
  if (score >= 41) return 'low';
  return 'poor';
}

function formatCategoryWeight(weight: number): string {
  const normalized = weight > 0 && weight <= 1 ? weight * 100 : weight;
  return `${Number.isInteger(normalized) ? normalized : Number(normalized.toFixed(1))}%`;
}

function getResumeLabel(session: SessionResponse): string {
  return session.fileName || 'Default Resume';
}

function getInterviewType(type: string): InterviewType {
  return type === 'technical' ? 'technical' : 'behavioral';
}

function getJobTitle(session: SessionResponse): string | undefined {
  if (session.roleName && session.companyName) return `${session.roleName} @ ${session.companyName}`;
  return session.roleName || session.jobTitle;
}

function getTranscriptLabel(turn: TranscriptTurn, uppercase = false): string {
  const label = turn.role === 'interviewer' ? 'Interviewer' : 'You';
  return uppercase ? label.toUpperCase() : label;
}

function formatFillerWords(fillerWords?: Record<string, number> | null): string | null {
  const entries = Object.entries(fillerWords ?? {});
  if (!entries.length) return null;
  return `Filler words: ${entries.map(([word, count]) => `"${word}" (${count})`).join(', ')}`;
}

function getTurnDetailLines(turn: TranscriptTurn): string[] {
  const isCandidateTurn = turn.role === 'user' || turn.role === 'candidate';
  if (!isCandidateTurn) return [];

  const lines: string[] = [];
  if (turn.feedback) {
    const star = (['situation', 'task', 'action', 'result'] as const)
      .map(key => `${key.charAt(0).toUpperCase() + key.slice(1)}: ${turn.feedback!.star[key] ? 'yes' : 'no'}`)
      .join(' | ');
    lines.push(`STAR: ${star}`);

    if (turn.feedback.strengths.length > 0) {
      lines.push('Strengths:');
      turn.feedback.strengths.forEach(item => lines.push(`- ${item}`));
    }

    if (turn.feedback.improvements.length > 0) {
      lines.push('Areas to improve:');
      turn.feedback.improvements.forEach(item => lines.push(`- ${item}`));
    }
  }

  const fillerLine = formatFillerWords(turn.fillerWords);
  if (fillerLine) lines.push(fillerLine);

  return lines;
}

export function InterviewResults() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const pendingFinalization = sessionId ? loadPendingInterviewFinalization(sessionId) : null;
  const [retryAssessmentCount, setRetryAssessmentCount] = useState(0);
  const shouldFinalizeInterview = Boolean(pendingFinalization);
  const finalizationEndReason = pendingFinalization?.endReason || 'user_ended';
  const finalizeStartedRef = useRef(false);
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [finalizing, setFinalizing] = useState(shouldFinalizeInterview);
  const [error, setError] = useState('');
  const [restartError, setRestartError] = useState('');
  const [restarting, setRestarting] = useState(false);
  const [jobDescriptionOpen, setJobDescriptionOpen] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(true);
  const [activeReportSection, setActiveReportSection] = useState<'assessment' | 'transcript'>('assessment');

  useEffect(() => {
    if (!sessionId) return;
    const activeSessionId = sessionId;

    let cancelled = false;
    let pollTimeout: ReturnType<typeof setTimeout> | undefined;

    async function fetchSession() {
      const nextSession = await getSession(activeSessionId);
      if (!cancelled) {
        setSession(nextSession);
        setLoading(false);
      }
      return nextSession;
    }

    async function pollForAssessment(attempt = 0) {
      try {
        const nextSession = await fetchSession();
        const assessmentReady = Boolean(nextSession.assessment);
        const stillFinalizing = nextSession.status === 'active' || !assessmentReady;

        if (!cancelled && stillFinalizing && attempt < 30) {
          pollTimeout = setTimeout(() => {
            void pollForAssessment(attempt + 1);
          }, 2000);
          return;
        }

        if (!cancelled) {
          clearPendingInterviewFinalization(activeSessionId);
          setFinalizing(false);
        }
      } catch (err) {
        console.error('Failed to refresh interview results:', err);
        if (!cancelled) {
          setError('Failed to load interview results');
          setLoading(false);
          setFinalizing(false);
        }
      }
    }

    async function loadResults() {
      setError('');

      if (shouldFinalizeInterview && !finalizeStartedRef.current) {
        finalizeStartedRef.current = true;
        setFinalizing(true);
        endInterview({
          sessionId: activeSessionId,
          endReason: finalizationEndReason,
        }).catch((err) => {
          console.error('Failed to finalize interview:', err);
        });
      }

      try {
        const initialSession = await fetchSession();
        if (initialSession.assessment) {
          clearPendingInterviewFinalization(activeSessionId);
        }
        if (shouldFinalizeInterview && !initialSession.assessment) {
          setFinalizing(true);
          pollTimeout = setTimeout(() => {
            void pollForAssessment();
          }, 1000);
        } else {
          setFinalizing(false);
        }
      } catch (err) {
        console.error('Failed to load interview results:', err);
        if (!cancelled) {
          setError('Failed to load interview results');
          setLoading(false);
          setFinalizing(false);
        }
      }
    }

    void loadResults();

    return () => {
      cancelled = true;
      if (pollTimeout) clearTimeout(pollTimeout);
    };
  }, [sessionId, shouldFinalizeInterview, finalizationEndReason, retryAssessmentCount]);

  if (loading) {
    return (
      <div className="page-container">
        <div className="ir-loading">
          <div className="loading-spinner" />
          <p className="text-secondary">
            {finalizing ? 'Finalizing your interview report...' : 'Loading interview results...'}
          </p>
        </div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="page-container">
        <div className="ir-error card">
          <h2>Something went wrong</h2>
          <p className="text-secondary">{error || 'Session not found'}</p>
          <button className="btn btn-primary" onClick={() => navigate(-1)}>Go Back</button>
        </div>
      </div>
    );
  }

  const assessment = session.assessment;
  const questionCount = session.conversation.filter(isInterviewQuestionTurn).length;
  const transcriptQuestionLabel = questionCount === 1 ? '1 question' : `${questionCount} questions`;
  const interviewType = formatInterviewType(session.interviewType);
  const typeBadge = `${interviewType} Interview`;
  const matchLabel = formatMatchScore(session.matchScore);
  const matchValue = parseMatchScore(session.matchScore);
  const matchTier = matchValue != null ? getMatchScoreTier(matchValue) : null;
  const hasContextLinks = Boolean(session.analysisId || session.jobDescription);
  const contextTitle = session.analysisId ? 'Analysis & Context' : 'Context';
  const isActiveSession = session.status === 'active';

  function downloadReport() {
    const lines: string[] = [
      '# Mock Interview Report',
      '',
      `Date: ${session!.createdAt ? new Date(session!.createdAt).toLocaleDateString() : new Date().toLocaleDateString()}`,
      `Role: ${getSessionTitle(session!)}`,
      `Resume: ${getResumeLabel(session!)}`,
      ...(matchLabel ? [`Match: ${matchLabel}`] : []),
      `Duration: ${formatDuration(session!.totalDuration)}`,
      `Questions: ${questionCount}`,
      `Type: ${typeBadge}`,
      '',
      '---',
      '',
    ];
    if (assessment) {
      lines.push(`## Assessment: ${assessment.overallScore}% — ${assessment.overallRating}`);
      lines.push('');
      lines.push(assessment.summary);
      lines.push('');
      assessment.categories.forEach(cat => {
        lines.push(`### ${cat.name} — ${cat.score}%`);
        lines.push(cat.comment);
        lines.push('');
      });
      if (assessment.strengths.length) {
        lines.push('## Strengths');
        assessment.strengths.forEach(s => lines.push(`- ${s}`));
        lines.push('');
      }
      if (assessment.improvements.length) {
        lines.push('## Areas to Improve');
        assessment.improvements.forEach(s => lines.push(`- ${s}`));
        lines.push('');
      }
      lines.push('---');
      lines.push('');
    }
    lines.push('## Transcript');
    lines.push('');
    session!.conversation.forEach((turn) => {
      lines.push(`**${getTranscriptLabel(turn, true)}**`);
      lines.push(turn.content);
      const detailLines = getTurnDetailLines(turn);
      if (detailLines.length > 0) {
        lines.push('');
        lines.push(...detailLines);
      }
      lines.push('');
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `interview-report-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function copyTranscript() {
    const lines = session!.conversation.flatMap((turn) => {
      return [`${getTranscriptLabel(turn)}: ${turn.content}`];
    });
    navigator.clipboard.writeText(lines.join('\n\n'));
  }

  async function startInterviewAgain() {
    if (!session?.analysisId) return;

    setRestartError('');
    setRestarting(true);

    try {
      const analysis = await getAnalysis(session.analysisId);
      const resumeText = analysis.originalText || analysis.suggestedText || '';
      const jobDescription = analysis.jobDescription || session.jobDescription || '';

      if (!resumeText.trim() || !jobDescription.trim()) {
        setRestartError('Could not find the resume and job description for this session.');
        return;
      }

      clearInterviewPointer(resumeText, jobDescription);
      navigate('/interview', {
        state: {
          resumeText,
          jobDescription,
          fileName: analysis.fileName || session.fileName,
          analysisId: session.analysisId,
          jobTitle: analysis.jobTitle || getJobTitle(session),
          matchScore: analysis.matchScore ?? (typeof session.matchScore === 'number' ? session.matchScore : undefined),
          interviewType: getInterviewType(session.interviewType),
        },
      });
    } catch (err) {
      console.error('Failed to restart interview:', err);
      setRestartError('Could not prepare a new interview. Try opening the analysis and starting from there.');
    } finally {
      setRestarting(false);
    }
  }

  function retryAssessment() {
    if (!sessionId) return;
    savePendingInterviewFinalization(sessionId, finalizationEndReason);
    finalizeStartedRef.current = false;
    setError('');
    setFinalizing(true);
    setRetryAssessmentCount(count => count + 1);
  }

  function continueInterview() {
    if (!session) return;
    const numericMatchScore = typeof session.matchScore === 'number'
      ? session.matchScore
      : Number(session.matchScore);

    navigate('/interview', {
      state: {
        resumeSessionId: session.sessionId,
        fileName: session.fileName,
        analysisId: session.analysisId,
        jobTitle: getJobTitle(session) || getSessionTitle(session),
        matchScore: Number.isFinite(numericMatchScore) ? numericMatchScore : undefined,
        interviewType: getInterviewType(session.interviewType),
      },
    });
  }

  function jumpToReportSection(section: 'assessment' | 'transcript') {
    setActiveReportSection(section);
    if (section === 'transcript') {
      setTranscriptOpen(true);
    }
    window.requestAnimationFrame(() => {
      document.getElementById(`ir-${section}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  return (
    <div className="page-container ir-reading-page">
      <button type="button" className="ir-back-top" onClick={() => navigate(-1)}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M7.5 2L3.5 6l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Back
      </button>

      <header className="ir-session-header">
        <div className="ir-session-header__top">
          <h1>{getSessionTitle(session)}</h1>
          {matchLabel && (
            <span className={`ir-context__match${matchTier ? ` ir-context__match--${matchTier}` : ''}`}>
              {matchLabel}
            </span>
          )}
        </div>

        <div className="ir-session-header__body">
          <div className="ir-session-header__main">
            <p className="ir-session-header__resume">{getResumeLabel(session)}</p>
            <p className="ir-session-header__meta">
              <span>{formatDate(session.createdAt)}</span>
              <span className="ir-context__sep">&middot;</span>
              <span>{formatTime(session.createdAt)}</span>
              <span className="ir-context__sep">&middot;</span>
              <span>{interviewType}</span>
              <span className="ir-context__sep">&middot;</span>
              <span>{transcriptQuestionLabel}</span>
            </p>
          </div>

          <div className="ir-session-header__actions">
            <span className="ir-session-header__actions-label">Actions</span>
            <div className="ir-session-header__actions-row">
              {isActiveSession ? (
                <button
                  className="btn btn-primary btn--sm"
                  onClick={continueInterview}
                >
                  Continue Interview
                </button>
              ) : session.analysisId && (
                <button
                  className="btn btn-primary btn--sm"
                  onClick={startInterviewAgain}
                  disabled={restarting}
                >
                  {restarting ? 'Preparing...' : 'Interview Again'}
                </button>
              )}
              <button className="btn btn-secondary btn--sm" onClick={downloadReport}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2 10v2h10v-2M7 2v7M4 6l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Interview Report
              </button>
              <button className="btn btn-secondary btn--sm" onClick={copyTranscript}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <rect x="4" y="4.25" width="7.25" height="8" rx="1.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M2.75 9.75v-7c0-.55.45-1 1-1h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Copy Transcript
              </button>
            </div>
            {restartError && <p className="ir-session-header__actions-error">{restartError}</p>}
          </div>
        </div>
      </header>

      {hasContextLinks && (
        <section className="ir-context">
          <h2 className="ir-context__title">{contextTitle}</h2>
          <div className="ir-context__actions">
            {session.analysisId && (
              <Link className="btn btn-secondary btn--sm" to={`/results/${session.analysisId}`}>
                View Full Analysis
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M4 2.5h5.5V8M9.25 2.75L3 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
            )}
            {session.jobDescription && (
              <button
                type="button"
                className="btn btn-secondary btn--sm"
                onClick={() => setJobDescriptionOpen(!jobDescriptionOpen)}
              >
                Job Description
                <svg
                  className={`ir-context__chevron ${jobDescriptionOpen ? 'ir-context__chevron--open' : ''}`}
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                >
                  <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
          </div>
          {jobDescriptionOpen && session.jobDescription && (
            <div className="ir-context__jd">
              {session.jobDescription}
            </div>
          )}
        </section>
      )}

      <nav className="ir-report-nav" aria-label="Interview report sections">
        <button
          type="button"
          className={`ir-report-nav__item ${activeReportSection === 'assessment' ? 'ir-report-nav__item--active' : ''}`}
          aria-pressed={activeReportSection === 'assessment'}
          onClick={() => jumpToReportSection('assessment')}
        >
          Assessment
        </button>
        <button
          type="button"
          className={`ir-report-nav__item ${activeReportSection === 'transcript' ? 'ir-report-nav__item--active' : ''}`}
          aria-pressed={activeReportSection === 'transcript'}
          onClick={() => jumpToReportSection('transcript')}
        >
          Transcript
        </button>
      </nav>

      {assessment ? (
        <section id="ir-assessment" className="ir-assessment-section">
          <h2 className="ir-section-title">Assessment</h2>
          <div className="ir-overview">
            <div className="ir-score-card card">
              <h3>Overall Score</h3>
              <div className="ir-score-main">
                <div className="ir-score-ring">
                  <svg viewBox="0 0 100 100" width="100" height="100">
                    <circle cx="50" cy="50" r="42" fill="none" stroke="var(--border)" strokeWidth="7" />
                    <circle
                      cx="50" cy="50" r="42" fill="none"
                      stroke={scoreColor(assessment.overallScore)}
                      strokeWidth="7" strokeLinecap="round"
                      strokeDasharray={`${(assessment.overallScore / 100) * 263.9} 263.9`}
                      transform="rotate(-90 50 50)"
                    />
                  </svg>
                  <span className="ir-score-ring__value">{assessment.overallScore}%</span>
                </div>
                <span className="ir-score-rating" style={{ color: scoreColor(assessment.overallScore) }}>
                  {assessment.overallRating}
                </span>
              </div>
              <p className="ir-score-breakdown-hint">
                {assessment.overallScore}% overall across {assessment.categories.length} categories
              </p>
            </div>

            <div className="ir-cat-grid" aria-label="Dimension scores">
              {assessment.categories.map((cat, i) => (
                <div key={i} className="ir-cat-card">
                  <span className="ir-cat-card__score" style={{ color: scoreColor(cat.score) }}>
                    {cat.score}%
                  </span>
                  <span className="ir-cat-card__name">{cat.name}</span>
                  <span className="ir-cat-card__weight">({formatCategoryWeight(cat.weight)})</span>
                </div>
              ))}
            </div>

            <div className="ir-summary-card card">
              <h3>Assessment Summary</h3>
              <p className="ir-summary__text">{assessment.summary}</p>
              {assessment.improvements.length > 0 && (
                <div className="ir-summary__tips">
                  {assessment.improvements.map((s, i) => (
                    <p key={i} className="ir-summary__tip">
                      <span className="ir-summary__tip-icon">+</span> {s}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Detailed Dimension Feedback */}
          <div className="ir-dimensions card">
            <h3>Detailed Dimension Feedback</h3>
            <div className="ir-dimensions__list">
              {assessment.categories.map((cat, i) => (
                <div key={i} className="ir-dimension">
                  <div className="ir-dimension__header">
                    <span className="ir-dimension__name">{cat.name}</span>
                    <span className="ir-dimension__score" style={{ color: scoreColor(cat.score) }}>
                      {cat.score}%
                    </span>
                  </div>
                  <div className="ir-dimension__bar">
                    <div
                      className="ir-dimension__fill"
                      style={{ width: `${cat.score}%`, background: scoreColor(cat.score) }}
                    />
                  </div>
                  <p className="ir-dimension__comment">{cat.comment}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Strengths / Improvements */}
          <div className="ir-feedback">
            <div className="ir-feedback-col card">
              <h4>
                Strengths
                <span className="ir-feedback-count">{assessment.strengths.length} items</span>
              </h4>
              {assessment.strengths.map((s, i) => (
                <p key={i} className="ir-feedback-item ir-feedback-item--strength">{s}</p>
              ))}
            </div>
            <div className="ir-feedback-col card">
              <h4>
                Areas to Improve
                <span className="ir-feedback-count">{assessment.improvements.length} items</span>
              </h4>
              {assessment.improvements.map((s, i) => (
                <p key={i} className="ir-feedback-item ir-feedback-item--improvement">{s}</p>
              ))}
            </div>
          </div>
        </section>
      ) : (
        <section id="ir-assessment" className="ir-assessment-section ir-assessment-section--empty">
          <h2 className="ir-section-title">Assessment</h2>
          {finalizing ? (
            <div className="ir-assessment-loading-banner" role="status" aria-live="polite">
                <div className="loading-spinner ir-assessment-loading-banner__spinner" />
                <div className="ir-assessment-loading-banner__copy">
                  <h3>Finalizing your interview report</h3>
                  <p>Transcript is ready. Analyzing responses and generating feedback...</p>
                  <span>Usually takes ~10-20 seconds</span>
                </div>
              </div>
          ) : (
            <div className="ir-assessment-empty-banner" role="status">
              <div className="ir-assessment-empty-banner__icon" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <path d="M12 8v5M12 17h.01M10.3 4.3 2.6 18a1.5 1.5 0 0 0 1.3 2.2h16.2a1.5 1.5 0 0 0 1.3-2.2L13.7 4.3a1.9 1.9 0 0 0-3.4 0Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="ir-assessment-empty-banner__body">
                <h3>We couldn&apos;t generate your assessment</h3>
                <p>You can review your responses or try again.</p>
                <div className="ir-assessment-empty-banner__actions">
                  <button type="button" className="btn btn-primary btn--sm" onClick={retryAssessment}>
                    Retry assessment
                  </button>
                  {session.analysisId && (
                    <button
                      type="button"
                      className="btn btn-secondary btn--sm"
                      onClick={startInterviewAgain}
                      disabled={restarting}
                    >
                      {restarting ? 'Preparing...' : 'Start new interview'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      <section id="ir-transcript" className={`ir-transcript ${transcriptOpen ? '' : 'ir-transcript--collapsed'}`}>
        <button
          type="button"
          className="ir-section-heading ir-transcript__header-toggle"
          aria-expanded={transcriptOpen}
          onClick={() => setTranscriptOpen(!transcriptOpen)}
        >
          <div className="ir-transcript__heading-copy">
            <h2>Session Transcript</h2>
            <span className="ir-transcript__summary">{transcriptQuestionLabel}</span>
          </div>
          <svg
            className={`ir-transcript__chevron ${transcriptOpen ? 'ir-transcript__chevron--open' : ''}`}
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            aria-hidden="true"
          >
            <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className={`ir-transcript__body ${transcriptOpen ? '' : 'ir-transcript__body--collapsed'}`}>
          {session.conversation.map((turn, i) => {
            const speakerClass = turn.role === 'interviewer' ? 'interviewer' : 'user';
            const isCandidateTurn = turn.role === 'user' || turn.role === 'candidate';

            return (
              <div key={i} className={`ir-transcript__turn ir-transcript__turn--${speakerClass}`}>
                <span className="ir-transcript__label">
                  {turn.role === 'interviewer' ? 'INTERVIEWER' : 'YOU'}
                </span>
                <p>{turn.content}</p>
                {isCandidateTurn && turn.feedback && (
                  <FeedbackBlock feedback={turn.feedback} fillerWords={turn.fillerWords} />
                )}
                {isCandidateTurn && !turn.feedback && turn.fillerWords && Object.keys(turn.fillerWords).length > 0 && (
                  <div className="ir-fillers">
                    Filler words: {Object.entries(turn.fillerWords).map(([word, count]) => `"${word}" (${count})`).join(', ')}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function FeedbackBlock({ feedback, fillerWords }: { feedback: TurnFeedback; fillerWords?: Record<string, number> | null }) {
  return (
    <div className="ir-turn-feedback">
      <div className="ir-turn-feedback__star">
        {(['situation', 'task', 'action', 'result'] as const).map(key => (
          <span key={key} className={`ir-star-item ${feedback.star[key] ? 'ir-star-item--pass' : ''}`}>
            {feedback.star[key] ? '\u2713' : '\u2717'} {key.charAt(0).toUpperCase() + key.slice(1)}
          </span>
        ))}
      </div>
      {feedback.strengths.length > 0 && (
        <div className="ir-turn-feedback__list ir-turn-feedback__list--strengths">
          {feedback.strengths.map((s, j) => <span key={j}>{s}</span>)}
        </div>
      )}
      {feedback.improvements.length > 0 && (
        <div className="ir-turn-feedback__list ir-turn-feedback__list--improvements">
          {feedback.improvements.map((s, j) => <span key={j}>{s}</span>)}
        </div>
      )}
      {fillerWords && Object.keys(fillerWords).length > 0 && (
        <div className="ir-fillers">
          Filler words: {Object.entries(fillerWords).map(([word, count]) => `"${word}" (${count})`).join(', ')}
        </div>
      )}
    </div>
  );
}
