import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getAnalysisHistory } from '../api/analysis';
import { useAuth } from '../auth/AuthContext';
import type { Analysis } from '../types';
import './History.css';

export function History() {
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;
  const navigate = useNavigate();
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

    async function load() {
      try {
        const data = await getAnalysisHistory();
        if (!cancelled) setAnalyses(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load history');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
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
              {paginatedItems.map((a, i) => (
                <Link
                  key={a.analysisId}
                  to={`/results/${a.analysisId}`}
                  className="history-item card animate-in"
                  style={{ animationDelay: `${0.05 + i * 0.04}s` }}
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
                        {a.status}
                      </div>
                    )}
                  </div>

                  <div className="history-item__body">
                    <div className="history-item__meta">
                      {a.fileName && (
                        <span className="history-item__file">{a.fileName}</span>
                      )}
                      <span className="history-item__date">{formatDate(a.timestamp ?? a.createdAt)}</span>
                    </div>
                    {a.jobDescription && (
                      <p className="history-item__jd">
                        {a.jobDescription.substring(0, 140)}
                        {a.jobDescription.length > 140 ? '...' : ''}
                      </p>
                    )}
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
                    <button
                      className="btn btn-secondary history-item__tracker-btn"
                      disabled={isDemo}
                      title={isDemo ? 'Sign up for full access' : 'Add to Outreach Tracker'}
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleAddToTracker(a); }}
                    >
                      Add to Tracker
                    </button>
                  )}

                  <div className="history-item__arrow">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M6 4l4 4-4 4" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </Link>
              ))}
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
