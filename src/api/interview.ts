import client from './client';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getApiErrorStatus(err: unknown): number | undefined {
  if (!isRecord(err) || !isRecord(err.response)) return undefined;
  return typeof err.response.status === 'number' ? err.response.status : undefined;
}

function getApiErrorMessage(err: unknown): string {
  const parts: string[] = [];

  if (err instanceof Error) {
    parts.push(err.message);
  } else if (typeof err === 'string') {
    parts.push(err);
  }

  if (isRecord(err) && isRecord(err.response)) {
    const data = err.response.data;
    if (typeof data === 'string') {
      parts.push(data);
    } else if (isRecord(data)) {
      ['message', 'error', 'detail'].forEach((key) => {
        if (typeof data[key] === 'string') parts.push(data[key]);
      });
    }
  }

  return parts.join(' ').toLowerCase();
}

export function isMissingInterviewSessionError(err: unknown): boolean {
  const status = getApiErrorStatus(err);
  if (status === 404 || status === 410) return true;

  const message = getApiErrorMessage(err);
  return message.includes('session not found')
    || (message.includes('session') && message.includes('not found'));
}

export interface StartInterviewRequest {
  resumeText: string;
  jobDescription: string;
  interviewType?: 'behavioral' | 'technical';
  clientRequestId?: string;
  analysisId?: string;
  fileName?: string;
  jobTitle?: string;
  matchScore?: number;
}

export interface StartInterviewResponse {
  sessionId: string;
  question: string;
  questionNumber: number;
  totalQuestions: number;
  timeLimit: number;
  keyterms?: string[];
}

export interface TurnRequest {
  sessionId: string;
  userAnswer: string;
  turnNumber: number;
}

export interface StarFeedback {
  situation: boolean;
  task: boolean;
  action: boolean;
  result: boolean;
}

export interface TechnicalFeedback {
  accuracy: boolean;
  tradeoffs: boolean;
  depth: boolean;
}

export interface TurnFeedback {
  // Exactly one of star (behavioral) / technical (technical) is present when feedback is
  // non-null; both optional so each rubric type-checks independently.
  star?: StarFeedback;
  technical?: TechnicalFeedback;
  strengths: string[];
  improvements: string[];
}

// closingKind is an explicit field returned by the interviewTurn lambda so the
// frontend can detect the wrap-up state without string-matching the message.
export type ClosingKind = 'all_questions_answered' | 'time_running_out' | null;

export interface TurnResponse {
  question: string;
  closingKind: ClosingKind;
  questionNumber: number;
  isFollowUp: boolean;
  elapsedSeconds: number;
  remainingSeconds: number;
  feedback: TurnFeedback | null;
  fillerWords: Record<string, number> | null;
  // Classifies res.question together with isFollowUp: isFollowUp + 'clear' => a real
  // follow-up; isFollowUp + 'unclear' => a restate request after unparseable speech.
  // Optional so a missing value is treated as 'clear' per the backend contract.
  transcriptClarity?: 'clear' | 'unclear';
}

export interface EndRequest {
  sessionId: string;
  endReason: 'timer_expired' | 'user_ended' | 'all_questions_answered';
}

export interface AssessmentCategory {
  name: string;
  score: number;
  weight: number;
  comment: string;
}

export interface TranscriptClarityStats {
  candidateTurnCount: number;
  clearTurnCount: number;
  unclearTurnCount: number;
  clarityRatio: number;
}

export interface Assessment {
  overallScore: number;
  overallRating: string;
  summary: string;
  categories: AssessmentCategory[];
  strengths: string[];
  improvements: string[];
  transcriptClarityStats?: TranscriptClarityStats;
  clarityAdjusted?: boolean;
}

export interface EndResponse {
  conversation: ConversationTurn[];
  totalDuration: number;
  questionCount: number;
  assessment: Assessment | null;
}

export interface ConversationTurn {
  role: 'interviewer' | 'user' | 'candidate';
  content: string;
  timestamp: number;
  duration?: number;
  feedback?: TurnFeedback | null;
  fillerWords?: Record<string, number> | null;
  transcriptClarity?: 'clear' | 'unclear';
}

export async function startInterview(req: StartInterviewRequest): Promise<StartInterviewResponse> {
  const { data } = await client.post('/interview/start', req);
  return data;
}

export async function submitTurn(req: TurnRequest): Promise<TurnResponse> {
  const { data } = await client.post('/interview/turn', req);
  return data;
}

export async function endInterview(req: EndRequest): Promise<EndResponse> {
  const { data } = await client.post('/interview/end', req);
  return data;
}

export interface SessionResponse {
  sessionId: string;
  status: 'active' | 'completed';
  interviewType: string;
  roleName?: string;
  companyName?: string;
  jobTitle?: string;
  analysisId?: string;
  fileName?: string;
  matchScore?: number | string;
  jobDescription?: string;
  conversation: ConversationTurn[];
  totalQuestions?: number;
  questionCount?: number;
  totalDuration: number;
  endReason?: string;
  createdAt: string;
  completedAt?: string;
  timeLimit: number;
  createdAtEpoch: number;
  assessment?: Assessment | null;
  keyterms?: string[];
}

export async function getSession(sessionId: string): Promise<SessionResponse> {
  const { data } = await client.get(`/interview/sessions/${sessionId}`);
  return data;
}

export interface SessionSummary {
  sessionId: string;
  interviewType: string;
  companyName?: string;
  roleName?: string;
  jobTitle?: string;
  analysisId?: string;
  fileName?: string;
  matchScore?: number | string;
  status: 'active' | 'completed';
  questionCount: number;
  totalDuration: number;
  createdAt: string;
  completedAt: string;
}

export async function listSessions(): Promise<SessionSummary[]> {
  const { data } = await client.get('/interview/sessions');
  return data.sessions ?? [];
}
