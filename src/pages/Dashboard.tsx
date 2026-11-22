import { useCallback, useEffect, useState, useMemo } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { getAnalysisHistory } from '../api/analysis';
import { extractApiErrorMessage } from '../api/errors';
import type { Analysis } from '../types';
import './Dashboard.css';

// Owner-only. This whole page IS the cost dashboard (estimatedCost + token counts), so the
// gate is the cost gate. Deliberately NOT demo123@resumeapp.com — that is the public "Try
// Demo" account, and gating on it exposed per-analysis unit economics to anyone who clicked
// Try Demo. VITE_DEV_BYPASS is not an escape hatch here either: cost renders for this one
// account and nobody else.
const COST_VISIBLE_EMAIL = 'demo@resumeapp.com';

// Fallback estimate for older records without tokenUsage
const COST_BEDROCK_PER_PASS = 0.0032;
const COST_TEXTRACT = 0.0015;
const COST_INFRA = 0.0008;
const BASE_COST = COST_BEDROCK_PER_PASS * 4 + COST_TEXTRACT + COST_INFRA;

function fallbackEstimate(a: Analysis): number {
  const keywords = (a.presentKeywords?.length ?? 0) + (a.missingKeywords?.length ?? 0);
  return BASE_COST * (1 + keywords * 0.003);
}

function getCost(a: Analysis): number {
  if (a.tokenUsage?.estimatedCost != null) {
    const parsed = Number(a.tokenUsage.estimatedCost);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return fallbackEstimate(a);
}

function hasRealCost(a: Analysis): boolean {
  if (a.tokenUsage?.estimatedCost == null) return false;
  const parsed = Number(a.tokenUsage.estimatedCost);
  return !isNaN(parsed) && parsed > 0;
}

function formatCost(cost: number): string {
  return cost < 0.01
    ? `$${cost.toFixed(4)}`
    : `$${cost.toFixed(3)}`;
}

function formatDate(iso: string): string {
  const normalized = iso.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso + 'Z';
  return new Date(normalized).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const ROWS_PER_PAGE = 10;

function getPageFromSearchParams(searchParams: URLSearchParams) {
  const page = Number(searchParams.get('page'));
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function getStatusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function Dashboard() {
  const { user } = useAuth();
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [searchParams, setSearchParams] = useSearchParams();
  const currentPage = getPageFromSearchParams(searchParams);

  const isDemoAccount = user?.email === COST_VISIBLE_EMAIL;

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

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [currentPage]);

  useEffect(() => {
    if (loading) return;
    const totalPages = Math.max(1, Math.ceil(analyses.length / ROWS_PER_PAGE));
    if (currentPage > totalPages) {
      goToPage(totalPages, { replace: true });
    }
  }, [analyses.length, currentPage, goToPage, loading]);

  useEffect(() => {
    if (!isDemoAccount) return;

    let cancelled = false;
    async function load() {
      try {
        const data = await getAnalysisHistory();
        if (!cancelled) setAnalyses(data);
      } catch (err) {
        if (!cancelled) setError(extractApiErrorMessage(err, 'Failed to load data'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [isDemoAccount]);

  const stats = useMemo(() => {
    const completed = analyses.filter(a => a.status === 'completed');
    const costs = completed.map(a => getCost(a));
    const totalCost = costs.reduce((sum, c) => sum + c, 0);
    const avgCost = costs.length > 0 ? totalCost / costs.length : 0;
    const maxCost = costs.length > 0 ? Math.max(...costs) : 0;
    const minCost = costs.length > 0 ? Math.min(...costs) : 0;
    return { totalCost, avgCost, maxCost, minCost, completedCount: completed.length, totalCount: analyses.length };
  }, [analyses]);

  if (!isDemoAccount) {
    return <Navigate to="/upload" replace />;
  }

  // Cumulative cost — accumulate oldest→newest, then reverse for display
  let runningTotal = 0;
  const ledgerRows = [...analyses]
    .sort((a, b) => {
      const tA = new Date(a.timestamp ?? a.createdAt).getTime();
      const tB = new Date(b.timestamp ?? b.createdAt).getTime();
      return tA - tB; // oldest first for accumulation
    })
    .map(a => {
      const cost = a.status === 'completed' ? getCost(a) : 0;
      runningTotal += cost;
      return { ...a, cost, runningTotal };
    })
    .reverse(); // newest first for display

  const totalPages = Math.max(1, Math.ceil(ledgerRows.length / ROWS_PER_PAGE));
  const pageInView = Math.min(currentPage, totalPages);
  const pageRows = ledgerRows.slice((pageInView - 1) * ROWS_PER_PAGE, pageInView * ROWS_PER_PAGE);
  const hasEstimate = analyses.some(a => a.status === 'completed' && !hasRealCost(a));

  return (
    <div className="page-container">
      <div className="page-header animate-in">
        <div className="dash-header">
          <div>
            <h1>Analysis costs</h1>
            <p>Estimated AI and processing cost of each resume analysis run on this account.</p>
          </div>
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

      {!loading && !error && (
        <>
          {/* ── Stats ───────────────────────────────── */}
          <dl className="dash-stats animate-in stagger-1">
            <div className="dash-stat">
              <dt className="dash-stat__label">Total</dt>
              <dd className="dash-stat__value">{formatCost(stats.totalCost)}</dd>
              <dd className="dash-stat__sub">{stats.totalCount} analyses, {stats.completedCount} completed</dd>
            </div>
            <div className="dash-stat">
              <dt className="dash-stat__label">Average</dt>
              <dd className="dash-stat__value">{formatCost(stats.avgCost)}</dd>
              <dd className="dash-stat__sub">per completed analysis</dd>
            </div>
            <div className="dash-stat">
              <dt className="dash-stat__label">Lowest to highest</dt>
              <dd className="dash-stat__value">
                {formatCost(stats.minCost)} – {formatCost(stats.maxCost)}
              </dd>
              <dd className="dash-stat__sub">per completed analysis</dd>
            </div>
          </dl>

          {/* ── Ledger Table ────────────────────────── */}
          <section className="dash-ledger animate-in stagger-2">
            <div className="dash-ledger__header">
              <h2>All analyses</h2>
              <span className="dash-ledger__count">{analyses.length}</span>
            </div>

            {analyses.length === 0 ? (
              <p className="text-muted" style={{ padding: '2rem 0', textAlign: 'center' }}>
                No analyses yet
              </p>
            ) : (
              <>
              <div className="dash-table-wrap">
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th className="dash-table__th">Date</th>
                      <th className="dash-table__th">Job</th>
                      <th className="dash-table__th dash-table__th--right">Match</th>
                      <th className="dash-table__th dash-table__th--right">Cost</th>
                      <th className="dash-table__th dash-table__th--right">Running total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map(row => (
                      <tr key={row.analysisId} className="dash-table__row">
                        <td className="dash-table__td dash-table__td--date">
                          {formatDate(row.timestamp ?? row.createdAt)}
                        </td>
                        <td className="dash-table__td dash-table__td--file">
                          {row.jobTitle ?? row.fileName ?? '—'}
                          {row.status !== 'completed' && (
                            <span className={`dash-table__status${row.status === 'failed' ? ' dash-table__status--failed' : ''}`}>
                              {row.status === 'failed' ? 'Failed' : getStatusLabel(row.status)}
                            </span>
                          )}
                        </td>
                        <td className="dash-table__td dash-table__td--score dash-table__td--right">
                          {row.status === 'completed' && row.matchScore != null ? row.matchScore : '—'}
                        </td>
                        <td className="dash-table__td dash-table__td--cost dash-table__td--right">
                          {row.status === 'completed' ? (
                            <>
                              {formatCost(row.cost)}
                              {!hasRealCost(row) && <span className="dash-table__est">~</span>}
                            </>
                          ) : '—'}
                        </td>
                        <td className="dash-table__td dash-table__td--total dash-table__td--right">
                          {formatCost(row.runningTotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {hasEstimate && (
                <p className="dash-ledger__foot">
                  ~ marks an estimate. Older analyses have no token usage data, so their cost is estimated from keyword count.
                </p>
              )}
              {totalPages > 1 && (
                <div className="pagination dash-pagination">
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
            )}
          </section>
        </>
      )}
    </div>
  );
}
