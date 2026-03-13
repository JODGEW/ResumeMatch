import { useEffect, useState, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { getAnalysisHistory } from '../api/analysis';
import type { Analysis } from '../types';
import './Dashboard.css';

const DEMO_EMAIL = 'demo123@resumeapp.com';

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

function formatDateShort(iso: string): string {
  const normalized = iso.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso + 'Z';
  return new Date(normalized).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function getStatusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function Dashboard() {
  const { user } = useAuth();
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const isDemoAccount = user?.email === DEMO_EMAIL ||
    import.meta.env.VITE_DEV_BYPASS === 'true';

  useEffect(() => {
    if (!isDemoAccount) return;

    let cancelled = false;
    async function load() {
      try {
        const data = await getAnalysisHistory();
        if (!cancelled) setAnalyses(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load data');
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

  // Build sparkline data for the mini chart
  const chartData = useMemo(() => {
    return analyses
      .filter(a => a.status === 'completed')
      .sort((a, b) => {
        const tA = new Date(a.timestamp ?? a.createdAt).getTime();
        const tB = new Date(b.timestamp ?? b.createdAt).getTime();
        return tA - tB;
      })
      .map(a => ({
        date: a.timestamp ?? a.createdAt,
        cost: getCost(a),
        score: a.matchScore ?? 0,
        fileName: a.fileName ?? 'Unknown',
        id: a.analysisId,
      }));
  }, [analyses]);

  if (!isDemoAccount) {
    return <Navigate to="/upload" replace />;
  }

  // SVG sparkline dimensions
  const chartW = 800;
  const chartH = 160;
  const padX = 40;
  const padY = 20;

  function buildSparklinePath() {
    if (chartData.length < 2) return '';
    const costs = chartData.map(d => d.cost);
    const maxC = Math.max(...costs) * 1.15;
    const minC = Math.min(...costs) * 0.85;
    const range = maxC - minC || 1;
    const usableW = chartW - padX * 2;
    const usableH = chartH - padY * 2;

    return chartData.map((d, i) => {
      const x = padX + (i / (chartData.length - 1)) * usableW;
      const y = padY + usableH - ((d.cost - minC) / range) * usableH;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  }

  function buildAreaPath() {
    const line = buildSparklinePath();
    if (!line) return '';
    const usableW = chartW - padX * 2;
    const lastX = padX + usableW;
    const baseY = chartH - padY;
    return `${line} L${lastX.toFixed(1)},${baseY} L${padX},${baseY} Z`;
  }

  function getPointCoords() {
    if (chartData.length < 2) return [];
    const costs = chartData.map(d => d.cost);
    const maxC = Math.max(...costs) * 1.15;
    const minC = Math.min(...costs) * 0.85;
    const range = maxC - minC || 1;
    const usableW = chartW - padX * 2;
    const usableH = chartH - padY * 2;

    return chartData.map((d, i) => ({
      x: padX + (i / (chartData.length - 1)) * usableW,
      y: padY + usableH - ((d.cost - minC) / range) * usableH,
      ...d,
    }));
  }

  const points = getPointCoords();
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null);

  // Cumulative cost
  let runningTotal = 0;
  const ledgerRows = [...analyses]
    .sort((a, b) => {
      const tA = new Date(a.timestamp ?? a.createdAt).getTime();
      const tB = new Date(b.timestamp ?? b.createdAt).getTime();
      return tB - tA; // newest first
    })
    .map(a => {
      const cost = a.status === 'completed' ? getCost(a) : 0;
      runningTotal += cost;
      return { ...a, cost, runningTotal };
    });

  return (
    <div className="page-container">
      <div className="page-header animate-in">
        <div className="dash-header">
          <div>
            <h1>Cost Dashboard</h1>
            <p>Estimated cost per analysis over time</p>
          </div>
          <div className="dash-header__badge">
            <span className="dash-badge">DEMO</span>
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
          {/* ── Stat Cards ──────────────────────────── */}
          <div className="dash-stats animate-in stagger-1">
            <div className="dash-stat">
              <span className="dash-stat__label">Total spent</span>
              <span className="dash-stat__value">{formatCost(stats.totalCost)}</span>
              <span className="dash-stat__sub">{stats.totalCount} analyses</span>
            </div>
            <div className="dash-stat">
              <span className="dash-stat__label">Avg / analysis</span>
              <span className="dash-stat__value">{formatCost(stats.avgCost)}</span>
              <span className="dash-stat__sub">{stats.completedCount} completed</span>
            </div>
            <div className="dash-stat">
              <span className="dash-stat__label">Range</span>
              <span className="dash-stat__value">
                {formatCost(stats.minCost)} – {formatCost(stats.maxCost)}
              </span>
              <span className="dash-stat__sub">min – max</span>
            </div>
          </div>

          {/* ── Sparkline Chart ─────────────────────── */}
          {chartData.length >= 2 && (
            <div className="dash-chart card animate-in stagger-2">
              <div className="dash-chart__header">
                <h3>Cost trend</h3>
                <span className="dash-chart__range">
                  {formatDateShort(chartData[0].date)} — {formatDateShort(chartData[chartData.length - 1].date)}
                </span>
              </div>
              <div className="dash-chart__container" onMouseLeave={() => setHoveredPoint(null)}>
                <svg
                  className="dash-chart__svg"
                  viewBox={`0 0 ${chartW} ${chartH}`}
                  preserveAspectRatio="none"
                >
                  <defs>
                    <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.18" />
                      <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.01" />
                    </linearGradient>
                  </defs>
                  {/* Grid lines */}
                  {[0.25, 0.5, 0.75].map(pct => (
                    <line
                      key={pct}
                      x1={padX} y1={padY + (chartH - padY * 2) * pct}
                      x2={chartW - padX} y2={padY + (chartH - padY * 2) * pct}
                      stroke="var(--border)" strokeWidth="0.5" strokeDasharray="4 3"
                    />
                  ))}
                  {/* Area fill */}
                  <path d={buildAreaPath()} fill="url(#chartGrad)" />
                  {/* Line */}
                  <path
                    d={buildSparklinePath()}
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                  {/* Vertical hover line */}
                  {hoveredPoint !== null && (
                    <line
                      x1={points[hoveredPoint].x} y1={padY}
                      x2={points[hoveredPoint].x} y2={chartH - padY}
                      stroke="var(--accent)" strokeWidth="1" strokeDasharray="3 2" opacity="0.5"
                    />
                  )}
                  {/* Data points */}
                  {points.map((p, i) => (
                    <g
                      key={i}
                      onMouseEnter={() => setHoveredPoint(i)}
                      style={{ cursor: 'pointer' }}
                    >
                      {/* Invisible larger hit area */}
                      <circle cx={p.x} cy={p.y} r="16" fill="transparent" />
                      <circle
                        cx={p.x} cy={p.y}
                        r={hoveredPoint === i ? 8 : 6}
                        fill="var(--bg-primary)" stroke="var(--accent)" strokeWidth="2"
                        style={{ transition: 'r 0.15s ease' }}
                      />
                      <circle
                        cx={p.x} cy={p.y}
                        r={hoveredPoint === i ? 3.5 : 2.5}
                        fill="var(--accent)"
                        style={{ transition: 'r 0.15s ease' }}
                      />
                    </g>
                  ))}
                </svg>
                {/* Tooltip */}
                {hoveredPoint !== null && (() => {
                  const p = points[hoveredPoint];
                  const pctX = (p.x / chartW) * 100;
                  const pctY = (p.y / chartH) * 100;
                  const alignRight = pctX > 75;
                  return (
                    <div
                      className="dash-chart__tooltip"
                      style={{
                        left: `${pctX}%`,
                        top: `${pctY}%`,
                        transform: `translate(${alignRight ? 'calc(-100% - 12px)' : '12px'}, -50%)`,
                      }}
                    >
                      <div className="dash-chart__tooltip-cost">${p.cost.toFixed(4)}</div>
                      <div className="dash-chart__tooltip-name">{p.fileName}</div>
                      <div className="dash-chart__tooltip-date">{formatDateShort(p.date)}</div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* ── Ledger Table ────────────────────────── */}
          <div className="dash-ledger card animate-in stagger-3">
            <div className="dash-ledger__header">
              <h3>Cost ledger</h3>
              <span className="text-muted" style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                {analyses.length} records
              </span>
            </div>

            {analyses.length === 0 ? (
              <p className="text-muted" style={{ padding: '2rem 0', textAlign: 'center' }}>
                No analyses yet
              </p>
            ) : (
              <div className="dash-table-wrap">
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th className="dash-table__th">#</th>
                      <th className="dash-table__th">Date</th>
                      <th className="dash-table__th">File</th>
                      <th className="dash-table__th dash-table__th--right">Score</th>
                      <th className="dash-table__th">Status</th>
                      <th className="dash-table__th dash-table__th--right">Cost</th>
                      <th className="dash-table__th dash-table__th--right">Running total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerRows.map((row, i) => (
                      <tr key={row.analysisId} className="dash-table__row" style={{ animationDelay: `${0.08 + i * 0.03}s` }}>
                        <td className="dash-table__td dash-table__td--idx">{ledgerRows.length - i}</td>
                        <td className="dash-table__td dash-table__td--date">
                          {formatDate(row.timestamp ?? row.createdAt)}
                        </td>
                        <td className="dash-table__td dash-table__td--file">
                          {row.fileName ?? '—'}
                        </td>
                        <td className="dash-table__td dash-table__td--right">
                          {row.status === 'completed' && row.matchScore != null ? (
                            <span className="dash-table__score" data-level={
                              row.matchScore >= 86 ? 'high' :
                              row.matchScore >= 61 ? 'mid' : 'low'
                            }>
                              {row.matchScore}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="dash-table__td">
                          <span className={`status-badge status-badge--${row.status}`}>
                            {getStatusLabel(row.status)}
                          </span>
                        </td>
                        <td className="dash-table__td dash-table__td--cost dash-table__td--right">
                          {row.status === 'completed' ? (
                            <>
                              {formatCost(row.cost)}
                              {!hasRealCost(row) && <span className="dash-table__est" title="Estimated (no token data)">~</span>}
                            </>
                          ) : '—'}
                        </td>
                        <td className="dash-table__td dash-table__td--total dash-table__td--right">
                          {formatCost(row.runningTotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="dash-table__foot">
                      <td colSpan={5} className="dash-table__td dash-table__td--foot-label">Total</td>
                      <td className="dash-table__td dash-table__td--cost dash-table__td--right dash-table__td--foot-val">
                        {formatCost(stats.totalCost)}
                      </td>
                      <td className="dash-table__td" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          <p className="dash-disclaimer animate-in stagger-4">
            Costs marked with ~ are estimates for older analyses without token tracking. Newer analyses use actual Bedrock (Claude Haiku) usage data. Estimates exclude Textract, Lambda, and DynamoDB costs.
          </p>
        </>
      )}
    </div>
  );
}
