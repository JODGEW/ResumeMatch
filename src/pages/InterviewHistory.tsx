import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getSession, listSessions, type SessionSummary } from '../api/interview';
import { isInterviewQuestionTurn } from '../utils/interviewQuestions';
import { useAuth } from '../auth/AuthContext';
import { getScoreBand } from '../utils/scoreBands';
import { SAMPLE_INTERVIEW_SESSION, SAMPLE_INTERVIEW_SUMMARY } from '../types/sampleInterviewSession';
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

function formatQuestionCount(count: number): string {
  return count === 1 ? '1 question' : `${count} questions`;
}

function formatStatus(status?: string): string {
  if (status === 'completed') return 'Completed';
  if (status === 'active') return 'In progress';
  return 'Abandoned';
}

function getStatusClass(status?: string): string {
  if (status === 'completed') return 'ih-status--completed';
  if (status === 'active') return 'ih-status--active';
  return 'ih-status--abandoned';
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

/** Average match across the sessions that carry a score; null when none do. */
function getAverageMatch(sessions: SessionSummary[]): number | null {
  const scores = sessions
    .map((session) => parseMatchScore(session.matchScore))
    .filter((score): score is number => score != null);
  if (!scores.length) return null;
  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

export function InterviewHistory() {
  const { user } = useAuth();
  const isDemo = user?.email === 'demo123@resumeapp.com';
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [questionCounts, setQuestionCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    // The shared demo account can't start real interviews (sign-up gated), so it
    // showcases the canned sample session instead of calling the backend — same
    // pattern as the tracker's SAMPLE_DATA.
    if (isDemo) {
      setSessions([SAMPLE_INTERVIEW_SUMMARY]);
      setQuestionCounts({
        [SAMPLE_INTERVIEW_SUMMARY.sessionId]:
          SAMPLE_INTERVIEW_SESSION.conversation.filter(isInterviewQuestionTurn).length,
      });
      setLoading(false);
      return;
    }

    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    let polls = 0;
    // A just-ended interview can still read as 'active' for a few seconds while the
    // backend finalizes it. Re-poll the list (3s, up to ~2 min) so it flips to
    // "Completed" on its own instead of requiring a manual page refresh.
    const POLL_INTERVAL_MS = 3000;
    const MAX_POLLS = 40;
    // Question counts don't change once fetched, so accumulate them across polls and
    // only fetch the per-session detail for sessions we haven't counted yet.
    const counts: Record<string, number> = {};

    async function loadSessions(isInitial: boolean) {
      try {
        const summaries = await listSessions();

        const uncounted = summaries.filter((session) => counts[session.sessionId] === undefined);
        const countResults = await Promise.allSettled(
          uncounted.map(async (session) => {
            const detail = await getSession(session.sessionId);
            return [
              session.sessionId,
              detail.conversation.filter(isInterviewQuestionTurn).length,
            ] as const;
          })
        );

        if (cancelled) return;

        countResults.forEach((result) => {
          if (result.status === 'fulfilled') {
            const [sessionId, count] = result.value;
            counts[sessionId] = count;
          }
        });

        setSessions(summaries);
        setQuestionCounts({ ...counts });

        if (summaries.some((session) => session.status === 'active') && polls < MAX_POLLS) {
          polls += 1;
          pollTimer = setTimeout(() => loadSessions(false), POLL_INTERVAL_MS);
        }
      } catch {
        // Only surface an error for the initial load; a transient poll failure
        // shouldn't replace an already-rendered list with an error message.
        if (!cancelled && isInitial) setError('Failed to load interview sessions');
      } finally {
        if (!cancelled && isInitial) setLoading(false);
      }
    }

    loadSessions(true);
    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [isDemo]);

  const averageMatch = getAverageMatch(sessions);

  return (
    <div className="page-container ih-page">
      <div className="ih-head animate-in">
        <div>
          <h1>Interview Sessions</h1>
          <p>Review mock interviews by role, resume, and outcome</p>
        </div>
        {/* The setup screen needs a resume + job description, so the only real
            "new interview" entry point is picking an analysis. */}
        <Link to="/history" className="ih-new-btn">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <rect x="6" y="2" width="4" height="8" rx="2" stroke="currentColor" strokeWidth="1.4" />
            <path d="M4 8a4 4 0 0 0 8 0M8 12v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          New interview
        </Link>
      </div>

      {!loading && !error && sessions.length > 0 && (
        <div className="ih-stats animate-in">
          <div className="ih-stat">
            <span className="ih-stat__value">{sessions.length}</span>
            <span className="ih-stat__label">sessions</span>
          </div>
          {averageMatch != null && (
            <>
              <span className="ih-stats__divider" />
              <div className="ih-stat">
                <span className="ih-stat__value ih-stat__value--match">{averageMatch}%</span>
                <span className="ih-stat__label">avg match</span>
              </div>
            </>
          )}
        </div>
      )}

      {loading && (
        <div className="ih-loading">
          <div className="loading-spinner" />
          <p className="text-secondary">Loading interview sessions...</p>
        </div>
      )}

      {error && (
        <div className="ih-error animate-in">
          <p>{error}</p>
        </div>
      )}

      {!loading && sessions.length === 0 && !error ? (
        <div className="ih-empty animate-in stagger-1">
          <p className="ih-empty__title">No interview sessions yet.</p>
          <p className="ih-empty__body">Start your first mock interview from a job analysis.</p>
          <Link to="/history" className="ih-empty__cta">
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
                  const matchValue = parseMatchScore(session.matchScore);
                  const band = matchValue != null ? getScoreBand(matchValue) : null;
                  const company = getCompanyLabel(session);
                  const questionCount = questionCounts[session.sessionId] ?? session.questionCount;

                  return (
                    <Link
                      key={session.sessionId}
                      to={`/interview/results/${session.sessionId}`}
                      className="ih-card"
                    >
                      <div className="ih-card__top">
                        <div className="ih-card__identity">
                          <div className="ih-card__role">{getRoleLabel(session)}</div>
                          <div className="ih-card__source">
                            {company && (
                              <>
                                <span className="ih-card__company">{company}</span>
                                <span className="ih-card__dot">&middot;</span>
                              </>
                            )}
                            <span className="ih-card__file">{getResumeLabel(session)}</span>
                          </div>
                        </div>
                        {band && (
                          <span className={`ih-card__match ih-card__match--${band.tier}`}>
                            {matchValue}% Match
                          </span>
                        )}
                      </div>

                      <div className="ih-card__meta">
                        <span>{formatDate(session.createdAt)}</span>
                        <span>&middot;</span>
                        <span>{formatTime(session.createdAt)}</span>
                        <span>&middot;</span>
                        <span>{formatInterviewType(session.interviewType)}</span>
                        {questionCount != null && (
                          <>
                            <span>&middot;</span>
                            <span>{formatQuestionCount(questionCount)}</span>
                          </>
                        )}
                      </div>

                      <div className="ih-card__footer">
                        <span className={`ih-status ${getStatusClass(session.status)}`}>
                          {session.status === 'completed' && (
                            <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
                              <polyline points="2,6.5 5,9.5 10,3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                          {formatStatus(session.status)}
                        </span>
                        <span className="ih-card__view">
                          View
                          <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
                            <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                          </svg>
                        </span>
                      </div>
                    </Link>
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
