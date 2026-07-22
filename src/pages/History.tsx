import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { getAnalysisHistory, getAnalysis } from '../api/analysis';
import { useAuth } from '../auth/AuthContext';
import { parseResume } from '../utils/resumeParser';
import { downloadOptimizedResume } from '../utils/docxGenerator';
import { getTrackerPrefill } from '../utils/trackerPrefill';
import { isInProgress } from '../hooks/usePolling';
import { getScoreBand } from '../utils/scoreBands';
import { clearAnalysisNew, getNewAnalysisIds, markAnalysisNew } from '../utils/newAnalyses';
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

const ITEMS_PER_PAGE = 10;

function getPageFromSearchParams(searchParams: URLSearchParams) {
  const page = Number(searchParams.get('page'));
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export function History() {
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newAnalysisIds, setNewAnalysisIds] = useState<Set<string>>(() => getNewAnalysisIds());
  const prevStatusRef = useRef<Map<string, string>>(new Map());
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentPage = getPageFromSearchParams(searchParams);
  const pendingAnalysisId = (location.state as { pendingAnalysisId?: string } | null)?.pendingAnalysisId;
  const { user } = useAuth();
  const isDemo = user?.email === 'demo123@resumeapp.com';
  const [signupPrompt, setSignupPrompt] = useState<SignupPromptContent | null>(null);
  const [query, setQuery] = useState('');

  const goToPage = useCallback((page: number, options?: { replace?: boolean }) => {
    const nextPage = Math.max(1, page);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (nextPage === 1) {
        next.delete('page');
      } else {
        next.set('page', String(nextPage));
      }
      return next;
    }, options);
  }, [setSearchParams]);

  // Search runs over the already-loaded list, which the loader keeps sorted
  // newest-first — that ordering is the only one the page offers.
  const visibleAnalyses = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return analyses;
    return analyses.filter(a => (a.jobTitle ?? '').toLowerCase().includes(q));
  }, [analyses, query]);

  // Opening the analysis from History is what retires its "New" badge. The
  // report auto-revealing right after completion deliberately doesn't, or the
  // badge would be gone before it was ever seen.
  function handleOpenAnalysis(analysisId: string) {
    if (!newAnalysisIds.has(analysisId)) return;
    clearAnalysisNew(analysisId);
    setNewAnalysisIds(current => {
      const next = new Set(current);
      next.delete(analysisId);
      return next;
    });
  }

  function handleAddToTracker(a: Analysis) {
    const prefill = getTrackerPrefill(a);
    navigate(`/tracker?prefill=${encodeURIComponent(JSON.stringify(prefill))}`);
  }

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [currentPage]);

  useEffect(() => {
    if (loading) return;
    const totalPages = Math.max(1, Math.ceil(visibleAnalyses.length / ITEMS_PER_PAGE));
    if (currentPage > totalPages) {
      goToPage(totalPages, { replace: true });
    }
  }, [visibleAnalyses.length, currentPage, goToPage, loading]);

  // Narrowing the list should land you on its first page — but only on a real
  // change, so a ?page=N deep link still resolves on first render.
  const queryRef = useRef(query);
  useEffect(() => {
    if (queryRef.current === query) return;
    queryRef.current = query;
    goToPage(1, { replace: true });
  }, [query, goToPage]);

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
        // Completing while History is open also earns the badge. It persists
        // (utils/newAnalyses) and clears when the user opens the analysis, so
        // there's no timed auto-clear here.
        if (justCompleted.size > 0) {
          justCompleted.forEach(markAnalysisNew);
          setNewAnalysisIds(current => {
            const next = new Set(current);
            justCompleted.forEach(id => next.add(id));
            return next;
          });
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
      let original = a.originalText;
      if (!text) {
        const full = await getAnalysis(a.analysisId);
        text = full.suggestedText;
        original = full.originalText;
      }
      clearTimeout(timeout);
      if (!text?.trim()) { setDownloadingId(null); return; }
      // The rewrite guard can legitimately produce zero edits. Say so rather
      // than handing back a DOCX identical to the resume they uploaded.
      if (original?.trim() && text.trim() === original.trim()) {
        setDownloadError('No safe rewrites for this analysis — open it to see what would close the gaps.');
        setDownloadingId(null);
        return;
      }
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
    <div className="page-container history-page">
      <div className="history-head animate-in">
        <div>
          <h1>Analysis History</h1>
          <p>Your past resume analyses</p>
        </div>
        <Link to="/upload" className="history-new-btn">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          New analysis
        </Link>
      </div>

      {loading && (
        <div className="history-loading">
          <div className="loading-spinner" />
          <p className="text-secondary">Loading analysis history...</p>
        </div>
      )}

      {(error || downloadError || interviewError) && (
        <div className="history-alert animate-in">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 5v3.5M8 10.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
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

      {!loading && !error && analyses.length > 0 && (
        <div className="history-controls animate-in">
          <div className="history-search">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" className="history-search__icon">
              <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.4" />
              <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <input
              className="history-search__input"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search role or company..."
              aria-label="Search role or company"
            />
          </div>
        </div>
      )}

      {!loading && !error && analyses.length > 0 && visibleAnalyses.length === 0 && (
        <div className="history-no-match animate-in">
          <div className="history-no-match__title">No analyses match "{query}"</div>
          <div className="history-no-match__hint">Try a different company or role.</div>
        </div>
      )}

      {!loading && visibleAnalyses.length > 0 && (() => {
        const totalPages = Math.max(1, Math.ceil(visibleAnalyses.length / ITEMS_PER_PAGE));
        const pageInView = Math.min(currentPage, totalPages);
        const paginatedItems = visibleAnalyses.slice((pageInView - 1) * ITEMS_PER_PAGE, pageInView * ITEMS_PER_PAGE);

        return (
          <>
            <div className="history-list">
              {paginatedItems.map((analysis, i) => {
                const inProgress = isInProgress(analysis.status);
                const badgeStatus = analysis.status;
                const isNew = newAnalysisIds.has(analysis.analysisId);
                const scored = analysis.status === 'completed' && analysis.matchScore != null;
                const band = scored ? getScoreBand(analysis.matchScore!) : null;

                // A job still in flight gets the bundle's processing card: same
                // shell, spinner in the score-ring slot, and a live link through
                // to the in-progress screen.
                if (inProgress) {
                  return (
                    <Link
                      key={analysis.analysisId}
                      to={`/results/${analysis.analysisId}`}
                      className="history-card history-card--processing animate-in"
                      style={{ animationDelay: `${0.05 + i * 0.04}s` }}
                      title="View live progress"
                    >
                      <div className="history-card__lead">
                        <div className="history-card__spinner" aria-hidden="true">
                          <svg width="50" height="50" viewBox="0 0 50 50">
                            <circle cx="25" cy="25" r="21" fill="none" stroke="var(--track)" strokeWidth="4.5" />
                            <path d="M25 4a21 21 0 0 1 21 21" fill="none" stroke="var(--accent-hover)" strokeWidth="4.5" strokeLinecap="round" />
                          </svg>
                        </div>
                      </div>

                      <div className="history-card__body">
                        <div className="history-card__head">
                          <span className="history-card__title">Analysis in progress</span>
                          <span className="history-card__processing-pill">
                            <span className="history-card__processing-dot" />
                            Processing
                          </span>
                        </div>

                        <div className="history-card__meta">
                          {analysis.fileName && (
                            <span className="history-card__file">{analysis.fileName}</span>
                          )}
                          <span className="history-card__date">{formatDate(analysis.timestamp ?? analysis.createdAt)}</span>
                        </div>

                        <p className="history-card__summary">
                          Comparing against the job description — scoring match, keyword gaps, and experience alignment.
                        </p>

                        <div className="history-card__indeterminate" aria-hidden="true">
                          <span />
                        </div>

                        <div className="history-card__live">
                          View live progress
                          <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
                            <path d="M3 8h9M8.5 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                          </svg>
                        </div>
                      </div>
                    </Link>
                  );
                }

                return (
                  <Link
                    key={analysis.analysisId}
                    to={`/results/${analysis.analysisId}`}
                    className={`history-card animate-in${isNew ? ' history-card--new' : ''}`}
                    style={{ animationDelay: `${0.05 + i * 0.04}s` }}
                    onClick={() => handleOpenAnalysis(analysis.analysisId)}
                    title="View analysis details"
                  >
                    {isNew && <span className="history-card__new-ring" aria-hidden="true" />}
                    <div className="history-card__lead">
                      {scored ? (
                        <div className="history-card__ring" style={{ color: band!.color }}>
                          <svg width="50" height="50" viewBox="0 0 50 50">
                            <circle cx="25" cy="25" r="21" fill="none" stroke="var(--track)" strokeWidth="4.5" />
                            <circle
                              cx="25" cy="25" r="21"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="4.5"
                              strokeLinecap="round"
                              strokeDasharray={`${(analysis.matchScore! / 100) * 131.9} 131.9`}
                              transform="rotate(-90 25 25)"
                            />
                          </svg>
                          <span className="history-card__ring-value">{analysis.matchScore}</span>
                        </div>
                      ) : (
                        <div className={`status-badge status-badge--${badgeStatus}`}>
                          {badgeStatus.charAt(0).toUpperCase() + badgeStatus.slice(1)}
                        </div>
                      )}
                    </div>

                    <div className="history-card__body">
                      <div className="history-card__head">
                        <span className="history-card__title">{analysis.jobTitle || 'Analysis Results'}</span>
                        {isNew && (
                          <span className="history-card__new-badge">
                            <span className="history-card__new-dot" />
                            New
                          </span>
                        )}
                        {band && (
                          <span className={`history-card__band history-card__band--${band.tier}`}>
                            {band.label}
                          </span>
                        )}
                      </div>

                      <div className="history-card__meta">
                        {analysis.fileName && (
                          <span className="history-card__file">{analysis.fileName}</span>
                        )}
                        <span className="history-card__date">{formatDate(analysis.timestamp ?? analysis.createdAt)}</span>
                      </div>

                      {analysis.status === 'failed' && analysis.errorMessage ? (
                        <p className="history-card__summary history-card__summary--failed">
                          {analysis.errorMessage}
                        </p>
                      ) : (analysis.scoreSummaryShort || analysis.scoreSummary || analysis.jobDescription) ? (
                        <p className="history-card__summary">
                          {analysis.scoreSummaryShort ?? analysis.scoreSummary
                            ?? (analysis.jobDescription!.substring(0, 140) + (analysis.jobDescription!.length > 140 ? '...' : ''))}
                        </p>
                      ) : null}

                      {analysis.presentKeywords && analysis.missingKeywords && (
                        <div className="history-card__stats">
                          <span className="history-card__pill history-card__pill--success">
                            <span className="history-card__pill-dot" />
                            {analysis.presentKeywords.length} matched
                          </span>
                          <span className="history-card__pill history-card__pill--danger">
                            <span className="history-card__pill-dot" />
                            {analysis.missingKeywords.length} missing
                          </span>
                          {analysis.missingKeywords.length > 0 && (
                            <span className="history-card__gaps">
                              Gaps: {analysis.missingKeywords.slice(0, 3).join(', ')}
                              {analysis.missingKeywords.length > 3 && ` +${analysis.missingKeywords.length - 3} more`}
                            </span>
                          )}
                        </div>
                      )}

                      {scored && (
                        <div className="history-card__actions">
                          <button
                            className="history-action history-action--brand"
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
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                              <rect x="6" y="2" width="4" height="8" rx="2" stroke="currentColor" strokeWidth="1.4" />
                              <path d="M4 8a4 4 0 0 0 8 0M8 12v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                            </svg>
                            Start Interview
                          </button>
                          <button
                            className="history-action"
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
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                            </svg>
                            Add to Tracker
                          </button>
                          <button
                            className="history-action"
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
                                <span className="loading-spinner loading-spinner--sm" />
                                Downloading...
                              </>
                            ) : (
                              <>
                                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                                  <path d="M8 2v8M5 7l3 3 3-3M3 13h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                Download
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>

            {totalPages > 1 && (
              <div className="pagination">
                <button
                  className="pagination__btn"
                  disabled={pageInView === 1}
                  onClick={() => goToPage(pageInView - 1)}
                >
                  Previous
                </button>
                <div className="pagination__pages">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                    <button
                      key={page}
                      className={`pagination__page ${page === pageInView ? 'pagination__page--active' : ''}`}
                      onClick={() => goToPage(page)}
                    >
                      {page}
                    </button>
                  ))}
                </div>
                <button
                  className="pagination__btn"
                  disabled={pageInView === totalPages}
                  onClick={() => goToPage(pageInView + 1)}
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
