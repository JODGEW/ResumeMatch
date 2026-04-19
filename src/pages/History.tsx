import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { getAnalysisHistory, getAnalysis } from '../api/analysis';
import { useAuth } from '../auth/AuthContext';
import { parseResume } from '../utils/resumeParser';
import { downloadOptimizedResume } from '../utils/docxGenerator';
import { getTrackerPrefill } from '../utils/trackerPrefill';
import { isInProgress } from '../hooks/usePolling';
import type { Analysis } from '../types';
import { SignupPromptModal } from '../components/SignupPromptModal';
import './History.css';

function hasInProgress(items: Analysis[]) {
  return items.some(a => isInProgress(a.status));
}

type SignupPromptContent = {
  title: string;
  body: string;
};

export function History() {
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [newlyCompleted, setNewlyCompleted] = useState<Set<string>>(new Set());
  const prevStatusRef = useRef<Map<string, string>>(new Map());
  const ITEMS_PER_PAGE = 10;
  const navigate = useNavigate();
  const location = useLocation();
  const pendingAnalysisId = (location.state as { pendingAnalysisId?: string } | null)?.pendingAnalysisId;
  const { user } = useAuth();
  const isDemo = user?.email === 'demo123@resumeapp.com';
  const [signupPrompt, setSignupPrompt] = useState<SignupPromptContent | null>(null);

  function handleAddToTracker(a: Analysis) {
    const prefill = getTrackerPrefill(a);
    navigate(`/tracker?prefill=${encodeURIComponent(JSON.stringify(prefill))}`);
  }

  useEffect(() => {
    let cancelled = false;
    const pollRef: { timer?: ReturnType<typeof setInterval>; started?: number } = {};

    function toUTC(iso: string) {
      // Treat bare timestamps (no timezone suffix) as UTC
      return iso.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso + 'Z';
    }

    function sortByNewest(items: Analysis[]) {
      return [...items].sort((a, b) => {
        const ta = new Date(toUTC(a.timestamp ?? a.createdAt)).getTime();
        const tb = new Date(toUTC(b.timestamp ?? b.createdAt)).getTime();
        return tb - ta;
      });
    }

    async function load() {
      try {
        const data = await getAnalysisHistory();
        if (cancelled) return;

        // If we navigated here with a pending analysis that the history API
        // doesn't include yet (still processing), fetch it individually and merge
        let merged = data;
        if (pendingAnalysisId && !data.some(a => a.analysisId === pendingAnalysisId)) {
          try {
            const pending = await getAnalysis(pendingAnalysisId);
            if (!cancelled) merged = [pending, ...data];
          } catch {
            // ignore — item may not exist yet
          }
        }

        const sorted = sortByNewest(merged);

        // Mark stale processing items as failed (older than 5 min)
        const staleThreshold = Date.now() - 5 * 60 * 1000;
        const withStaleFixed = sorted.map(a => {
          if (isInProgress(a.status)) {
            const ts = new Date(toUTC(a.timestamp ?? a.createdAt)).getTime();
            if (ts < staleThreshold) {
              return { ...a, status: 'failed' as const, errorMessage: 'Analysis timed out. Please try again.' };
            }
          }
          return a;
        });

        // Hide failed items older than 24h
        const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
        const filtered = withStaleFixed.filter(a => {
          if (a.status !== 'failed') return true;
          const ts = new Date(toUTC(a.timestamp ?? a.createdAt)).getTime();
          return ts > dayAgo;
        });

        // Detect newly completed items
        const prev = prevStatusRef.current;
        const justCompleted = new Set<string>();
        for (const a of sorted) {
          const oldStatus = prev.get(a.analysisId);
          if (oldStatus && isInProgress(oldStatus) && a.status === 'completed') {
            justCompleted.add(a.analysisId);
          }
          prev.set(a.analysisId, a.status);
        }
        if (justCompleted.size > 0) {
          setNewlyCompleted(s => {
            const next = new Set(s);
            justCompleted.forEach(id => next.add(id));
            return next;
          });
          // Auto-clear "New" badges after 5 seconds
          setTimeout(() => {
            if (cancelled) return;
            setNewlyCompleted(s => {
              const next = new Set(s);
              justCompleted.forEach(id => next.delete(id));
              return next;
            });
          }, 5000);
        }

        setAnalyses(filtered);
        setLoading(false);

        // Start or stop polling based on in-progress items
        if (hasInProgress(filtered) && !pollRef.timer) {
          pollRef.started = Date.now();
          pollRef.timer = setInterval(() => {
            // Stop polling after 60s and show timeout message
            if (pollRef.started && Date.now() - pollRef.started > 90000) {
              clearInterval(pollRef.timer);
              pollRef.timer = undefined;
              if (!cancelled) {
                // Mark still-processing items as timed out visually
                setAnalyses(prev => prev.map(a =>
                  isInProgress(a.status)
                    ? { ...a, status: 'failed' as const, errorMessage: 'Analysis is taking longer than expected. Refresh the page to check again.' }
                    : a
                ));
              }
              return;
            }
            load();
          }, 4000);
        } else if (!hasInProgress(sorted) && pollRef.timer) {
          clearInterval(pollRef.timer);
          pollRef.timer = undefined;
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load history');
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
      if (pollRef.timer) clearInterval(pollRef.timer);
    };
  }, [pendingAnalysisId]);

  function formatDate(iso: string) {
    const normalized = iso.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso + 'Z';
    return new Date(normalized).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    });
  }

  function getScoreColor(score: number) {
    if (score >= 86) return 'var(--score-high)';
    if (score >= 76) return 'var(--score-good)';
    if (score >= 61) return 'var(--score-mid)';
    if (score >= 41) return 'var(--score-low)';
    return 'var(--score-poor)';
  }

  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [interviewError, setInterviewError] = useState<string | null>(null);

  async function handleDownload(a: Analysis) {
    if (downloadingId) return;
    setDownloadingId(a.analysisId);
    setDownloadError(null);
    const timeout = setTimeout(() => {
      setDownloadingId(null);
      setDownloadError('Download took too long. Check your connection and try again.');
    }, 12000);
    try {
      // History endpoint may not include suggestedText — fetch full analysis if needed
      let text = a.suggestedText;
      if (!text) {
        const full = await getAnalysis(a.analysisId);
        text = full.suggestedText;
      }
      clearTimeout(timeout);
      if (!text?.trim()) { setDownloadingId(null); return; }
      const parsed = parseResume(text);
      await downloadOptimizedResume(parsed);
    } catch (err) {
      clearTimeout(timeout);
      console.error('Download failed:', err);
      setDownloadError('Download failed. Check your connection and try again.');
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleInterview(a: Analysis) {
    setInterviewError(null);
    try {
      const needsFullAnalysis = !a.jobDescription || (!a.originalText && !a.suggestedText);
      const source = needsFullAnalysis ? await getAnalysis(a.analysisId) : a;
      const resumeText = source.originalText || source.suggestedText || '';
      const jobDescription = source.jobDescription || '';

      if (!resumeText.trim() || !jobDescription.trim()) {
        setInterviewError('Could not find the resume and job description for this analysis.');
        return;
      }

      navigate('/interview', {
        state: {
          resumeText,
          jobDescription,
          fileName: source.fileName,
          analysisId: source.analysisId,
          jobTitle: source.jobTitle,
          matchScore: source.matchScore,
          startFresh: true,
        },
      });
    } catch (err) {
      console.error('Failed to open interview:', err);
      setInterviewError('Could not prepare the interview. Check your connection and try again.');
    }
  }


  return (
    <div className="page-container">
      <div className="page-header animate-in">
        <div className="history-header">
          <div>
            <h1>Analysis History</h1>
            <p>Your past resume analyses</p>
          </div>
          <Link to="/upload" className="btn btn-primary btn-create-action">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            New analysis
          </Link>
        </div>
      </div>

      {loading && (
        <div className="history-loading">
          <div className="loading-spinner" />
        </div>
      )}

      {(error || downloadError || interviewError) && (
        <div className="upload-error animate-in">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="7" stroke="var(--danger)" strokeWidth="1.5" />
            <path d="M8 5v3.5M8 10.5v.5" stroke="var(--danger)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          {error || downloadError || interviewError}
        </div>
      )}

      {!loading && !error && analyses.length === 0 && (
        <div className="history-empty animate-in">
          <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
            <rect x="12" y="8" width="40" height="48" rx="6" stroke="var(--border-light)" strokeWidth="2" />
            <path d="M22 22h20M22 30h14M22 38h17" stroke="var(--border-light)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <h3>No analyses yet</h3>
          <p className="text-secondary">Upload your first resume to get started</p>
          <Link to="/upload" className="btn btn-primary" style={{ marginTop: '0.5rem' }}>
            Get started
          </Link>
        </div>
      )}

      {!loading && analyses.length > 0 && (() => {
        const totalPages = Math.max(1, Math.ceil(analyses.length / ITEMS_PER_PAGE));
        const paginatedItems = analyses.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

        return (
          <>
            <div className="history-list">
              {paginatedItems.map((analysis, i) => {
                const inProgress = isInProgress(analysis.status);
                const badgeStatus = inProgress ? 'processing' : analysis.status;
                const isNew = newlyCompleted.has(analysis.analysisId);

                return (
                  <Link
                    key={analysis.analysisId}
                    to={inProgress ? '#' : `/results/${analysis.analysisId}`}
                    className={`history-item card animate-in${inProgress ? ' history-item--disabled' : ''}${isNew ? ' history-item--new' : ''}`}
                    style={{ animationDelay: `${0.05 + i * 0.04}s` }}
                    onClick={inProgress ? (e) => e.preventDefault() : undefined}
                    title={inProgress ? 'Still processing — results aren\'t ready yet' : 'View analysis details'}
                  >
                    <div className="history-item__left">
                      {analysis.status === 'completed' && analysis.matchScore != null ? (
                        <div className="history-item__score" style={{ color: getScoreColor(analysis.matchScore) }}>
                          <svg width="56" height="56" viewBox="0 0 44 44">
                            <circle cx="22" cy="22" r="18" fill="none" stroke="var(--border)" strokeWidth="2.5" />
                            <circle
                              cx="22" cy="22" r="18"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeDasharray={`${(analysis.matchScore / 100) * 113.1} 113.1`}
                              transform="rotate(-90 22 22)"
                            />
                          </svg>
                          <span className="history-item__score-value">{analysis.matchScore}%</span>
                        </div>
                      ) : (
                        <div className={`status-badge status-badge--${badgeStatus}`}>
                          {inProgress && <span className="status-badge__dot" />}
                          {badgeStatus.charAt(0).toUpperCase() + badgeStatus.slice(1)}
                        </div>
                      )}
                    </div>

                    <div className="history-item__body">
                      <div className="history-item__details">
                        <h3 className="history-item__title">{analysis.jobTitle || 'Analysis Results'}</h3>
                        <div className="history-item__meta">
                          {analysis.fileName && (
                            <span className="history-item__file">{analysis.fileName}</span>
                          )}
                          {isNew && <span className="history-item__new-badge">New</span>}
                          <span className="history-item__date">{formatDate(analysis.timestamp ?? analysis.createdAt)}</span>
                        </div>
                        {inProgress ? (
                          <p className="history-item__jd" style={{ fontStyle: 'italic' }}>
                            Analyzing match score, keyword gaps, and experience alignment…
                          </p>
                        ) : analysis.status === 'failed' && analysis.errorMessage ? (
                          <p className="history-item__jd" style={{ color: 'var(--danger)' }}>
                            {analysis.errorMessage}
                          </p>
                        ) : (analysis.scoreSummaryShort || analysis.scoreSummary || analysis.jobDescription) ? (
                          <p className="history-item__jd">
                            {analysis.scoreSummaryShort ?? analysis.scoreSummary
                              ?? (analysis.jobDescription!.substring(0, 140) + (analysis.jobDescription!.length > 140 ? '...' : ''))}
                          </p>
                        ) : null}
                        {analysis.presentKeywords && analysis.missingKeywords && (
                          <div className="history-item__stats">
                            <span className="history-item__pill history-item__pill--success">
                              <span className="history-item__pill-dot" />
                              {analysis.presentKeywords.length} Matched
                            </span>
                            <span className="history-item__pill history-item__pill--danger">
                              <span className="history-item__pill-dot" />
                              {analysis.missingKeywords.length} Missing
                            </span>
                          </div>
                        )}
                        {analysis.missingKeywords && analysis.missingKeywords.length > 0 && (
                          <p className="history-item__missing">
                            <span className="history-item__missing-label">Missing: </span>
                            <span className="history-item__missing-keywords">{analysis.missingKeywords.slice(0, 3).join(', ')}</span>
                            {analysis.missingKeywords.length > 3 && (
                              <span className="history-item__missing-more"> +{analysis.missingKeywords.length - 3} more</span>
                            )}
                          </p>
                        )}
                      </div>
                    </div>

                    {analysis.status === 'completed' && analysis.matchScore != null && (
                      <div className="history-item__actions">
                        <button
                          className="btn btn-primary history-item__interview-btn"
                          title={isDemo ? 'Sign up for full access' : 'Start mock interview'}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (isDemo) {
                              setSignupPrompt({
                                title: 'Start Your Mock Interview',
                                body: 'Create a free account to practice role-specific interview questions and get a detailed interview report.',
                              });
                              return;
                            }
                            handleInterview(analysis);
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <rect x="3.5" y="1" width="7" height="9" rx="3.5" stroke="currentColor" strokeWidth="1.5" />
                            <path d="M2 7c0 2.75 2.25 5 5 5s5-2.25 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                            <path d="M7 12v1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                          </svg>
                          Start Interview
                        </button>
                        <div className="history-item__secondary-actions">
                          <button
                            className="btn btn-secondary history-item__tracker-btn"
                            title={isDemo ? 'Sign up for full access' : 'Add to Outreach Tracker'}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (isDemo) {
                                setSignupPrompt({
                                  title: 'Add This Role to Your Outreach Tracker',
                                  body: 'Create a free account to save roles, track follow-ups, and manage your application pipeline.',
                                });
                                return;
                              }
                              handleAddToTracker(analysis);
                            }}
                          >
                            Add to Tracker
                          </button>
                          <button
                            className="btn btn-secondary history-item__download-btn"
                            disabled={downloadingId === analysis.analysisId}
                            title={isDemo ? 'Sign up for full access' : 'Download optimized resume'}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (isDemo) {
                                setSignupPrompt({
                                  title: 'Download Your Optimized Resume',
                                  body: 'Create a free account to download your AI-optimized resume as a Word document.',
                                });
                              } else {
                                handleDownload(analysis);
                              }
                            }}
                          >
                            {downloadingId === analysis.analysisId ? (
                              <>
                                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ animation: 'spin 0.8s linear infinite' }}>
                                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                                  <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" strokeDasharray="28" strokeDashoffset="8" strokeLinecap="round" />
                                </svg>
                                Downloading...
                              </>
                            ) : (
                              <>
                                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M8 2v8m0 0L5 7m3 3l3-3" />
                                  <path d="M2 12v1a1 1 0 001 1h10a1 1 0 001-1v-1" />
                                </svg>
                                Download
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="history-item__arrow">
                      <span className="history-item__arrow-label">View details</span>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  </Link>
                );
              })}
            </div>

            {totalPages > 1 && (
              <div className="pagination">
                <button
                  className="pagination__btn"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => p - 1)}
                >
                  Previous
                </button>
                <div className="pagination__pages">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                    <button
                      key={page}
                      className={`pagination__page ${page === currentPage ? 'pagination__page--active' : ''}`}
                      onClick={() => setCurrentPage(page)}
                    >
                      {page}
                    </button>
                  ))}
                </div>
                <button
                  className="pagination__btn"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(p => p + 1)}
                >
                  Next
                </button>
              </div>
            )}
          </>
        );
      })()}

      {signupPrompt && (
        <SignupPromptModal
          onClose={() => setSignupPrompt(null)}
          title={signupPrompt.title}
          body={signupPrompt.body}
        />
      )}
    </div>
  );
}
