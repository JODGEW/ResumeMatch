import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { usePolling } from '../hooks/usePolling';
import { ProgressRing } from '../components/ProgressRing';
import { Badge } from '../components/Badge';
import { DiffView } from '../components/DiffView';
import { fetchAuthSession } from 'aws-amplify/auth';
import { getResumeUrl } from '../api/upload';
import './Results.css';

function getScoreInterpretation(score: number) {
  if (score >= 86) return { label: 'Strong Match', action: 'Apply with confidence. Highlight your matched keywords in a cover letter.', color: '#16a34a' };
  if (score >= 76) return { label: 'Good Match', action: 'Apply and address missing keywords in your cover letter.', color: '#3b82f6' };
  if (score >= 61) return { label: 'Moderate Match', action: 'Update your resume to include missing keywords before applying.', color: '#ca8a04' };
  if (score >= 41) return { label: 'Weak Match', action: 'Significant gaps exist. Address them in a strong cover letter.', color: '#dc4a20' };
  return { label: 'Poor Match', action: 'This role may not be the right fit. Try better-matched opportunities.', color: '#dc2626' };
}

export function Results() {
  const { analysisId } = useParams<{ analysisId: string }>();
  const { analysis, loading, error, timedOut } = usePolling(analysisId ?? null);
  const [resumeUrl, setResumeUrl] = useState<string | null>(null);
  const [resumeLoading, setResumeLoading] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [jdOpen, setJdOpen] = useState(false);

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
    try {
      const session = await fetchAuthSession();
      const userId = (session.tokens?.idToken?.payload?.email as string) || '';
      const url = await getResumeUrl(analysisId ?? '', userId);
      setResumeUrl(url);
    } catch (err) {
      console.error('Failed to load resume', err);
      setResumeError('Failed to load resume. Please try again.');
    } finally {
      setResumeLoading(false);
    }
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
    return (
      <div className="page-container">
        <div className="results-loading">
          <div className="loading-spinner" />
        </div>
      </div>
    );
  }

  if (!analysis || analysis.status === 'pending' || analysis.status === 'processing') {
    return (
      <div className="page-container">
        <div className="results-loading">
          {timedOut ? (
            <>
              <h2>Still processing</h2>
              <p className="text-secondary">
                This is taking longer than expected. Refresh the page to check status.
              </p>
              <button
                className="btn btn-primary"
                style={{ marginTop: '1rem' }}
                onClick={() => window.location.reload()}
              >
                Refresh
              </button>
            </>
          ) : (
            <>
              <div className="results-loading__ring">
                <svg width="80" height="80" viewBox="0 0 80 80">
                  <circle
                    cx="40" cy="40" r="34"
                    fill="none"
                    stroke="var(--border)"
                    strokeWidth="6"
                  />
                  <circle
                    cx="40" cy="40" r="34"
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray="60 154"
                    className="results-loading__arc"
                  />
                </svg>
              </div>
              <h2>Analyzing your resume</h2>
              <p className="text-secondary">
                Comparing keywords, skills, and qualifications...
              </p>
              <div className="results-loading__steps">
                <div className="results-loading__step results-loading__step--done">
                  <span className="results-loading__dot" />
                  Upload received
                </div>
                <div className="results-loading__step results-loading__step--active">
                  <span className="results-loading__dot" />
                  Processing analysis
                </div>
              </div>
              <div className="results-loading__bg-notice">
                <p className="results-loading__bg-primary">Analysis is running in the background — you can safely leave.</p>
                <p className="results-loading__bg-secondary">Results are saved automatically. View them anytime in <strong>History</strong>.</p>
                <p className="results-loading__bg-tertiary">Usually takes ~30 seconds.</p>
                <div className="results-loading__actions">
                  <Link to="/history" state={{ pendingAnalysisId: analysisId }} className="btn btn-primary btn--sm">Go to History</Link>
                  <Link to="/upload" className="btn btn-outline btn--sm">Upload another resume</Link>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  if (analysis.status === 'failed') {
    return (
      <div className="page-container">
        <div className="results-empty">
          <h2>Analysis failed</h2>
          <p className="text-secondary">
            We couldn't process your resume. Please try uploading again.
          </p>
          <Link to="/upload" className="btn btn-primary" style={{ marginTop: '1rem' }}>
            Upload again
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header animate-in">
        <div className="results-header">
          <div>
            <h1>Analysis Results</h1>
            {analysis.fileName && (
              <p className="results-filename">{analysis.fileName}</p>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
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
            <Link to="/upload" className="btn btn-secondary">
              New analysis
            </Link>
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
                Stated on resume: {analysis.experienceCheck.resumeStatedYears ?? 'not specified'} ·
                Calculated from dates: {analysis.experienceCheck.actualYears} years
              </p>
            )}
          </div>
        </div>
      )}

      {/* Score Row: Ring & Breakdown side by side */}
      <div className="results-score-row">
        <div className="results-score card animate-in stagger-1">
          {analysis.matchScore != null ? (() => {
            const interp = getScoreInterpretation(Number(analysis.matchScore));
            return (
              <div className="results-score__hover-wrap">
                <ProgressRing score={Number(analysis.matchScore)} label={interp.label} />
                <div className="results-score__tooltip">
                  <p className="results-score__tooltip-action">{interp.action}</p>
                </div>
              </div>
            );
          })() : (
            <ProgressRing score={0} />
          )}
        </div>

        {/* Score Breakdown */}
        {analysis.scoreBreakdown && (
          <div className="card results-score-breakdown animate-in stagger-2">
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

        {/* Top Priority Missing Keywords */}
        {analysis.topMissing && analysis.topMissing.length > 0 && (
          <div className="card results-keyword-section animate-in stagger-3">
            <h4>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 2l1.5 3.5H13l-2.8 2 1 3.5L8 9.5l-3.2 1.5 1-3.5L3 5.5h3.5z"
                  stroke="var(--warning, #ca8a04)" strokeWidth="1.5"
                  strokeLinejoin="round" fill="none" />
              </svg>
              Top Priority Keywords
              <span className="results-keyword-count" style={{ color: 'var(--warning, #ca8a04)' }}>
                {analysis.topMissing.length}
              </span>
            </h4>
            <div className="results-suggestions">
              {analysis.topMissing.map((item) => (
                <div key={item.keyword} className="card results-suggestion" style={{ marginBottom: '0.5rem' }}>
                  <div className="results-suggestion__header">
                    <span className="results-suggestion__section">{item.keyword}</span>
                    <span className="text-muted" style={{ fontSize: '0.75rem' }}>
                      {item.importanceScore}/10
                    </span>
                  </div>
                  <p className="results-suggestion__reason text-muted">{item.reason}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Suggestions */}
      {analysis.suggestions && analysis.suggestions.length > 0 && (
        <div className="results-section animate-in stagger-3">
          <h2>Suggestions</h2>
          <p className="text-secondary" style={{ marginBottom: '1.25rem' }}>
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
                <p className="results-suggestion__text">{s.whereToAdd}</p>
                <p className="results-suggestion__reason text-muted">{s.reason}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Diff View */}
      {analysis.originalText && analysis.suggestedText && (
        <div className="results-section animate-in stagger-4">
          <h2>Detailed Changes</h2>
          <p className="text-secondary" style={{ marginBottom: '1.25rem' }}>
            Side-by-side comparison of your resume with suggested improvements
          </p>
          <DiffView
            original={analysis.originalText}
            suggested={analysis.suggestedText}
          />
        </div>
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
