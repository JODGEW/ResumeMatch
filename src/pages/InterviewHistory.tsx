import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getSession, listSessions, type SessionSummary } from '../api/interview';
import { isInterviewQuestionTurn } from '../utils/interviewQuestions';
import './InterviewHistory.css';

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

function formatInterviewType(type: string): string {
  if (!type) return 'Interview';
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function parseJobTitle(title?: string): { role: string; company: string } {
  if (!title) return { role: '', company: '' };
  const parts = title.split(/\s+(?:@|—|-)\s+/);
  return {
    role: parts[0]?.trim() ?? '',
    company: parts.slice(1).join(' - ').trim(),
  };
}

function getRoleLabel(session: SessionSummary): string {
  const parsed = parseJobTitle(session.jobTitle);
  return session.roleName || parsed.role || `${formatInterviewType(session.interviewType)} Practice Session (No job selected)`;
}

function getCompanyLabel(session: SessionSummary): string {
  const parsed = parseJobTitle(session.jobTitle);
  return session.companyName || parsed.company;
}

function getResumeLabel(session: SessionSummary): string {
  return session.fileName || 'Default Resume';
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

function getScoreTier(score: number): 'high' | 'good' | 'mid' | 'low' | 'poor' {
  if (score >= 86) return 'high';
  if (score >= 76) return 'good';
  if (score >= 61) return 'mid';
  if (score >= 41) return 'low';
  return 'poor';
}

function formatStatus(status?: string): string {
  if (status === 'completed') return 'Completed';
  if (status === 'active') return 'In progress';
  return 'Abandoned';
}

function getStatusClass(status?: string): string {
  if (status === 'completed') return 'ih-badge--completed';
  if (status === 'active') return 'ih-badge--active';
  return 'ih-badge--abandoned';
}

type Bucket = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'earlier';

const BUCKET_ORDER: Bucket[] = ['today', 'yesterday', 'this_week', 'this_month', 'earlier'];

const BUCKET_LABEL: Record<Bucket, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  this_week: 'Earlier this week',
  this_month: 'Earlier this month',
  earlier: 'Earlier',
};

function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function getSessionBucket(createdAt: string, now: Date): Bucket {
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return 'earlier';
  const today = startOfLocalDay(now);
  const createdDay = startOfLocalDay(created);
  const dayDiff = Math.round((today.getTime() - createdDay.getTime()) / 86_400_000);
  if (dayDiff <= 0) return 'today';
  if (dayDiff === 1) return 'yesterday';
  if (dayDiff <= 6) return 'this_week';
  if (dayDiff <= 29) return 'this_month';
  return 'earlier';
}

function groupSessionsByBucket(
  sessions: SessionSummary[]
): Array<{ bucket: Bucket; sessions: SessionSummary[] }> {
  const now = new Date();
  const groups = new Map<Bucket, SessionSummary[]>();
  for (const session of sessions) {
    const bucket = getSessionBucket(session.createdAt, now);
    const arr = groups.get(bucket) ?? [];
    arr.push(session);
    groups.set(bucket, arr);
  }
  for (const arr of groups.values()) {
    arr.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  return BUCKET_ORDER.filter((b) => groups.has(b)).map((b) => ({
    bucket: b,
    sessions: groups.get(b)!,
  }));
}

export function InterviewHistory() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [questionCounts, setQuestionCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadSessions() {
      try {
        const summaries = await listSessions();
        const countResults = await Promise.allSettled(
          summaries.map(async (session) => {
            const detail = await getSession(session.sessionId);
            return [
              session.sessionId,
              detail.conversation.filter(isInterviewQuestionTurn).length,
            ] as const;
          })
        );

        if (cancelled) return;

        const correctedCounts: Record<string, number> = {};
        countResults.forEach((result) => {
          if (result.status === 'fulfilled') {
            const [sessionId, count] = result.value;
            correctedCounts[sessionId] = count;
          }
        });

        setSessions(summaries);
        setQuestionCounts(correctedCounts);
      } catch {
        if (!cancelled) setError('Failed to load interview sessions');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadSessions();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="page-container">
      <div className="page-header animate-in">
        <h1>Interview Sessions</h1>
        <p className="text-secondary">Review mock interviews by role, resume, and outcome</p>
      </div>

      {loading && (
        <div className="ih-loading">
          <div className="loading-spinner" />
          <p className="text-secondary">Loading interview sessions...</p>
        </div>
      )}

      {error && (
        <div className="interview-error animate-in">
          <p>{error}</p>
        </div>
      )}

      {!loading && sessions.length === 0 && !error ? (
        <div className="ih-empty card animate-in stagger-1">
          <p>No interview sessions yet.</p>
          <p className="text-secondary">Start your first mock interview from a job analysis.</p>
          <Link to="/history" className="btn btn-primary btn--sm ih-empty__cta">
            Choose an Analysis
          </Link>
        </div>
      ) : !loading && (
        <div className="ih-list animate-in stagger-1">
          {groupSessionsByBucket(sessions).map(({ bucket, sessions: groupSessions }) => (
            <section key={bucket} className="ih-group">
              <header className="ih-group__heading">
                <h2 className="ih-group__title">{BUCKET_LABEL[bucket]}</h2>
                <span className="ih-group__count">{groupSessions.length}</span>
              </header>
              <div className="ih-group__cards">
                {groupSessions.map((session) => {
                  const matchLabel = formatMatchScore(session.matchScore);
                  const matchValue = parseMatchScore(session.matchScore);
                  const matchTier = matchValue != null ? getScoreTier(matchValue) : null;
                  const company = getCompanyLabel(session);
                  const sourceLabel = company
                    ? `${company} · ${getResumeLabel(session)}`
                    : getResumeLabel(session);

                  return (
                    <article key={session.sessionId} className="ih-card card">
                      <div className="ih-card__top">
                        <h3 className="ih-card__title">{getRoleLabel(session)}</h3>
                        {matchLabel && (
                          <span className={`ih-card__match${matchTier ? ` ih-card__match--${matchTier}` : ''}`}>
                            {matchLabel}
                          </span>
                        )}
                      </div>

                      <p className="ih-card__source">{sourceLabel}</p>

                      <p className="ih-card__meta">
                        <span>{formatDate(session.createdAt)}</span>
                        <span className="ih-card__sep">&middot;</span>
                        <span>{formatTime(session.createdAt)}</span>
                        <span className="ih-card__sep">&middot;</span>
                        <span>{formatInterviewType(session.interviewType)}</span>
                        <span className="ih-card__sep">&middot;</span>
                        <span>{questionCounts[session.sessionId] ?? session.questionCount ?? '—'} Qs</span>
                      </p>

                      <div className="ih-card__footer">
                        <span className={`ih-badge ${getStatusClass(session.status)}`}>
                          {formatStatus(session.status)}
                        </span>
                        <button
                          type="button"
                          className="btn btn-secondary btn--sm ih-card__view"
                          onClick={() => navigate(`/interview/results/${session.sessionId}`)}
                        >
                          View
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M2.5 6h7M7 3.5L9.5 6 7 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
