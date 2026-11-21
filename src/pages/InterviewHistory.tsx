import { useState, useEffect, Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { getSession, listSessions, type SessionSummary } from '../api/interview';
import { isInterviewQuestionTurn } from '../utils/interviewQuestions';
import { resolveSessionIdentity } from '../utils/sessionIdentity';
import { useAuth } from '../auth/AuthContext';
import { Mascot } from '../components/Mascot';
import { scoreColor } from '../utils/interviewScore';
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

function getSessionLabels(session: SessionSummary): { role: string; company: string } {
  const { role, company } = resolveSessionIdentity(session);
  return {
    role: role || `${formatInterviewType(session.interviewType)} Practice Session (No job selected)`,
    company,
  };
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

function formatDuration(seconds?: number): string | null {
  if (seconds == null || !Number.isFinite(seconds)) return null;
  return `${Math.max(1, Math.round(seconds / 60))} min`;
}

/** Interleaves "·" separators between the items that are present. */
function joinWithDots(items: ReactNode[]): ReactNode {
  return items.filter(Boolean).map((item, i) => (
    <Fragment key={i}>
      {i > 0 && <span aria-hidden="true">&middot;</span>}
      {item}
    </Fragment>
  ));
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

type InterviewScore = { score: number; rating: string };

/** Average interview score across the sessions that have one; null when none do. */
function getAverageScore(sessions: SessionSummary[], scores: Record<string, InterviewScore>): number | null {
  const values = sessions
    .map((session) => scores[session.sessionId]?.score)
    .filter((score): score is number => score != null);
  if (!values.length) return null;
  return Math.round(values.reduce((sum, score) => sum + score, 0) / values.length);
}

const RING_CIRCUMFERENCE = 2 * Math.PI * 22;

export function InterviewHistory() {
  const { user } = useAuth();
  const isDemo = user?.email === 'demo123@resumeapp.com';
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [questionCounts, setQuestionCounts] = useState<Record<string, number>>({});
  const [interviewScores, setInterviewScores] = useState<Record<string, InterviewScore>>({});
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
      if (SAMPLE_INTERVIEW_SESSION.assessment) {
        setInterviewScores({
          [SAMPLE_INTERVIEW_SUMMARY.sessionId]: {
            score: SAMPLE_INTERVIEW_SESSION.assessment.overallScore,
            rating: SAMPLE_INTERVIEW_SESSION.assessment.overallRating,
          },
        });
      }
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
    // only fetch the per-session detail for sessions we haven't counted yet. The
    // same detail call also carries the assessment score, kept the same way.
    const counts: Record<string, number> = {};
    const scores: Record<string, InterviewScore> = {};

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
              detail.assessment,
            ] as const;
          })
        );

        if (cancelled) return;

        countResults.forEach((result) => {
          if (result.status === 'fulfilled') {
            const [sessionId, count, assessment] = result.value;
            counts[sessionId] = count;
            if (assessment && Number.isFinite(assessment.overallScore)) {
              scores[sessionId] = { score: assessment.overallScore, rating: assessment.overallRating };
            }
          }
        });

        setSessions(summaries);
        setQuestionCounts({ ...counts });
        setInterviewScores({ ...scores });

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

  const averageScore = getAverageScore(sessions, interviewScores);

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
            <span className="ih-stat__label">{sessions.length === 1 ? 'session' : 'sessions'}</span>
          </div>
          {averageScore != null && (
            <>
              <span className="ih-stats__divider" />
              <div className="ih-stat">
                <span className="ih-stat__value" style={{ color: scoreColor(averageScore) }}>{averageScore}</span>
                <span className="ih-stat__label">avg interview score</span>
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
          <div className="ih-empty__mascot" aria-hidden="true">
            <Mascot state="idle" size={96} />
          </div>
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
              <div className="ih-group__rows">
                {groupSessions.map((session) => {
                  const matchValue = parseMatchScore(session.matchScore);
                  const { role, company } = getSessionLabels(session);
                  const questionCount = questionCounts[session.sessionId] ?? session.questionCount;
                  const interviewScore = interviewScores[session.sessionId];
                  const color = interviewScore ? scoreColor(interviewScore.score) : undefined;
                  const duration = formatDuration(session.totalDuration);

                  return (
                    <Link
                      key={session.sessionId}
                      to={`/interview/results/${session.sessionId}`}
                      className="ih-row"
                    >
                      <div className="ih-row__ring" style={color ? { color } : undefined}>
                        <svg viewBox="0 0 52 52" aria-hidden="true">
                          <circle cx="26" cy="26" r="22" fill="none" stroke="var(--track)" strokeWidth="4.5" />
                          {interviewScore && (
                            <circle
                              cx="26" cy="26" r="22"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="4.5"
                              strokeLinecap="round"
                              strokeDasharray={`${(interviewScore.score / 100) * RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
                              transform="rotate(-90 26 26)"
                            />
                          )}
                        </svg>
                        {interviewScore && (
                          <span className="ih-row__ring-value">{interviewScore.score}</span>
                        )}
                      </div>

                      <div className="ih-row__body">
                        <div className="ih-row__role">{role}</div>
                        <div className="ih-row__meta">
                          {joinWithDots([
                            company && <span>{company}</span>,
                            <span className="ih-row__file">{getResumeLabel(session)}</span>,
                          ])}
                        </div>
                        <div className="ih-row__meta">
                          {joinWithDots([
                            interviewScore && (
                              <span className="ih-row__rating" style={{ color }}>{interviewScore.rating}</span>
                            ),
                            <span>{formatInterviewType(session.interviewType)}</span>,
                            questionCount != null && <span>{formatQuestionCount(questionCount)}</span>,
                            duration && <span>{duration}</span>,
                          ])}
                        </div>
                      </div>

                      <div className="ih-row__side">
                        <span>{formatDate(session.createdAt)} &middot; {formatTime(session.createdAt)}</span>
                        {matchValue != null && <span>Resume match {matchValue}%</span>}
                        <span className={`ih-status ${getStatusClass(session.status)}`}>
                          {session.status === 'completed' && (
                            <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
                              <polyline points="2,6.5 5,9.5 10,3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                          {formatStatus(session.status)}
                        </span>
                      </div>

                      <span className="ih-row__chevron" aria-hidden="true">
                        <svg width="14" height="14" viewBox="0 0 16 16">
                          <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                        </svg>
                      </span>
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
