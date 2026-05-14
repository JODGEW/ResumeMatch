import { isInterviewClosingPrompt } from './interviewQuestions';

/**
 * Awaits an in-flight submitTurn before allowing the caller (handleEnd) to navigate.
 * Unbounded by design: submitTurn p99 is ~10s; cutting it short truncates the
 * candidate's final answer from the transcript. Errors are swallowed because they
 * are surfaced via setError on the caller's submit path — navigation should continue
 * regardless so the user reaches the results page.
 */
export async function awaitPendingTurnSubmission(pending: Promise<unknown> | null | undefined): Promise<void> {
  if (!pending) return;
  try {
    await pending;
  } catch {
    // Submit failure is surfaced elsewhere; navigation must still proceed.
  }
}

type InterviewControlStateInput = {
  currentQuestion: string;
  interviewState: 'setup' | 'starting' | 'active' | 'thinking' | 'speaking' | 'completed' | 'loading';
  isListening: boolean;
  isArming?: boolean;
};

export function getInterviewControlState({
  currentQuestion,
  interviewState,
  isListening,
  isArming = false,
}: InterviewControlStateInput) {
  const isClosingPrompt = isInterviewClosingPrompt(currentQuestion);
  const micDisabled = interviewState === 'thinking' || isClosingPrompt;
  const micActive = (isListening || isArming) && !isClosingPrompt;
  const endDisabled = interviewState === 'thinking';

  const hint = isClosingPrompt
    ? 'All questions complete. View your report when ready.'
    : interviewState === 'thinking'
      ? 'Processing your answer...'
      : interviewState === 'speaking'
        ? 'Interviewer is speaking... hold mic or Space to interrupt'
        : isArming
          ? 'Connecting mic...'
          : isListening
            ? 'Listening... release to submit'
            : 'Hold mic or Space to speak';

  return {
    isClosingPrompt,
    micDisabled,
    micActive,
    endDisabled,
    hint,
    endButtonLabel: endDisabled ? 'Waiting for response...' : isClosingPrompt ? 'View report' : 'End Interview',
    endReason: isClosingPrompt ? 'all_questions_answered' : 'user_ended',
  } as const;
}
