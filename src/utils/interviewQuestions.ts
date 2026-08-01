import type { ClosingKind } from '../api/interview';

type InterviewTurnLike = {
  role: string;
  content: string;
};

function normalizeClosingText(content: string): string {
  return content
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// Restore-only fallback. getSession does not persist the lambda's closingKind, so
// on restore we recover the closing state from the interviewer's message text. Each
// kind matches its own distinctive opener, verbatim from the deployed lambda:
// all-questions on "that's all the questions i have"; the time wrap-up on
// "we're running short on time" + "view report" (the current CTA is View report,
// NOT End Interview). The live submit flow uses the response's closingKind field,
// not this. isInterviewClosingPrompt is derived from the kind to avoid a circular check.
export function getInterviewClosingPromptKind(content: string): ClosingKind {
  const normalized = normalizeClosingText(content);
  if (
    normalized.includes("that's all the questions i have")
    && normalized.includes('assessment')
    && normalized.includes('transcript')
  ) {
    return 'all_questions_answered';
  }
  if (
    normalized.includes("we're running short on time")
    && normalized.includes('view report')
  ) {
    return 'time_running_out';
  }
  return null;
}

export function isInterviewClosingPrompt(content: string): boolean {
  return getInterviewClosingPromptKind(content) !== null;
}

export function isInterviewQuestionTurn(turn: InterviewTurnLike): boolean {
  return turn.role === 'interviewer' && !isInterviewClosingPrompt(turn.content);
}
