import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { getAnalysisHistory, getAnalysis } from '../api/analysis';
import { useAuth } from '../auth/AuthContext';
import { parseResume } from '../utils/resumeParser';
import { downloadOptimizedResume } from '../utils/docxGenerator';
import type { Analysis } from '../types';
import './History.css';

function hasInProgress(items: Analysis[]) {
  return items.some(a => a.status === 'pending' || a.status === 'processing');
}

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

  function handleAddToTracker(a: Analysis) {
    const prefill = {
      skillMatch: {
        matchedSkills: a.presentKeywords || [],
        missingSkills: a.missingKeywords || [],
        matchPercentage: a.matchScore || 0,
      },
    };
    navigate(`/tracker?prefill=${encodeURIComponent(JSON.stringify(prefill))}`);
  }

  useEffect(() => {
    let cancelled = false;
    const pollRef: { timer?: ReturnType<typeof setInterval> } = {};

    function sortByNewest(items: Analysis[]) {
      return [...items].sort((a, b) => {
        const ta = new Date(a.timestamp ?? a.createdAt).getTime();
        const tb = new Date(b.timestamp ?? b.createdAt).getTime();
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

        // Detect newly completed items
        const prev = prevStatusRef.current;
        const justCompleted = new Set<string>();
        for (const a of sorted) {
          const oldStatus = prev.get(a.analysisId);
          if (oldStatus && (oldStatus === 'pending' || oldStatus === 'processing') && a.status === 'completed') {
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

        setAnalyses(sorted);
        setLoading(false);

        // Start or stop polling based on in-progress items
        if (hasInProgress(sorted) && !pollRef.timer) {
          pollRef.timer = setInterval(load, 4000);
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
  }, []);

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
    if (score >= 86) return '#16a34a';
    if (score >= 76) return '#3b82f6';
    if (score >= 61) return '#ca8a04';
    if (score >= 41) return '#dc4a20';
    return '#dc2626';
  }

  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  async function handleDownload(a: Analysis) {
    if (downloadingId) return;
    setDownloadingId(a.analysisId);
    try {
      // History endpoint may not include suggestedText — fetch full analysis if needed
      let text = a.suggestedText;
      if (!text) {
        const full = await getAnalysis(a.analysisId);
        text = full.suggestedText;
      }
      if (!text?.trim()) return;
      const parsed = parseResume(text);
      await downloadOptimizedResume(parsed);
    } catch (err) {
      console.error('Download failed:', err);
    } finally {
      setDownloadingId(null);
    }
  }

  const isProcessing = (status: string) => status === 'pending' || status === 'processing';

  return (
    <div className="page-container">
      <div className="page-header animate-in">
        <div className="history-header">
          <div>
            <h1>Analysis History</h1>
            <p>Your past resume analyses</p>
          </div>
          <Link to="/upload" className="btn btn-primary">
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

      {error && (
        <div className="upload-error animate-in">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="7" stroke="var(--danger)" strokeWidth="1.5" />
            <path d="M8 5v3.5M8 10.5v.5" stroke="var(--danger)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          {error}
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
              {paginatedItems.map((a, i) => {
                const inProgress = isProcessing(a.status);
                const isNew = newlyCompleted.has(a.analysisId);

                return (
                  <Link
                    key={a.analysisId}
                    to={inProgress ? '#' : `/results/${a.analysisId}`}
                    className={`history-item card animate-in${inProgress ? ' history-item--disabled' : ''}${isNew ? ' history-item--new' : ''}`}
                    style={{ animationDelay: `${0.05 + i * 0.04}s` }}
                    onClick={inProgress ? (e) => e.preventDefault() : undefined}
                    title={inProgress ? 'Still processing — results aren\'t ready yet' : undefined}
                  >
                    <div className="history-item__left">
                      {a.status === 'completed' && a.matchScore != null ? (
                        <div className="history-item__score" style={{ color: getScoreColor(a.matchScore) }}>
                          <svg width="44" height="44" viewBox="0 0 44 44">
                            <circle cx="22" cy="22" r="18" fill="none" stroke="var(--border)" strokeWidth="2.5" />
                            <circle
                              cx="22" cy="22" r="18"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeDasharray={`${(a.matchScore / 100) * 113.1} 113.1`}
                              transform="rotate(-90 22 22)"
                            />
                          </svg>
                          <span className="history-item__score-value">{a.matchScore}</span>
                        </div>
                      ) : (
                        <div className={`status-badge status-badge--${a.status}`}>
                          {a.status === 'processing' && <span className="status-badge__dot" />}
                          {a.status.charAt(0).toUpperCase() + a.status.slice(1)}
                        </div>
                      )}
                    </div>

                    <div className="history-item__body">
                      <div className="history-item__meta">
                        {a.fileName && (
                          <span className="history-item__file">{a.fileName}</span>
                        )}
                        {isNew && <span className="history-item__new-badge">New</span>}
                        <span className="history-item__date">{formatDate(a.timestamp ?? a.createdAt)}</span>
                      </div>
                      {inProgress ? (
                        <p className="history-item__jd" style={{ fontStyle: 'italic' }}>
                          Analyzing match score, keyword gaps, and experience alignment…
                        </p>
                      ) : a.status === 'failed' && a.errorMessage ? (
                        <p className="history-item__jd" style={{ color: 'var(--danger)' }}>
                          {a.errorMessage}
                        </p>
                      ) : (a.scoreSummaryShort || a.scoreSummary || a.jobDescription) ? (
                        <p className="history-item__jd">
                          {a.scoreSummaryShort ?? a.scoreSummary
                            ?? (a.jobDescription!.substring(0, 140) + (a.jobDescription!.length > 140 ? '...' : ''))}
                        </p>
                      ) : null}
                      {a.presentKeywords && a.missingKeywords && (
                        <div className="history-item__stats">
                          <span className="text-success">
                            {a.presentKeywords.length} matched
                          </span>
                          <span className="history-item__stats-divider" />
                          <span className="text-danger">
                            {a.missingKeywords.length} missing
                          </span>
                        </div>
                      )}
                      {a.missingKeywords && a.missingKeywords.length > 0 && (
                        <p className="history-item__missing">
                          <span className="history-item__missing-label">Missing: </span>
                          <span className="history-item__missing-keywords">{a.missingKeywords.slice(0, 3).join(', ')}</span>
                          {a.missingKeywords.length > 3 && (
                            <span className="history-item__missing-more"> +{a.missingKeywords.length - 3} more</span>
                          )}
                        </p>
                      )}
                    </div>

                    {a.status === 'completed' && a.matchScore != null && (
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                        <button
                          className="btn btn-secondary history-item__tracker-btn"
                          disabled={isDemo}
                          title={isDemo ? 'Sign up for full access' : 'Add to Outreach Tracker'}
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleAddToTracker(a); }}
                        >
                          Add to Tracker
                        </button>
                        <button
                          className="btn btn-secondary history-item__download-btn"
                          disabled={isDemo || downloadingId === a.analysisId}
                          title="Download optimized resume"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDownload(a); }}
                        >
                          {downloadingId === a.analysisId ? (
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
                              Download (DOCX)
                            </>
                          )}
                        </button>
                      </div>
                    )}

                    <div className="history-item__arrow">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M6 4l4 4-4 4" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
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
    </div>
  );
}
