import type { ClosingKind } from '../api/interview';

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
  closingKind: ClosingKind;
  interviewState: 'setup' | 'starting' | 'active' | 'thinking' | 'speaking' | 'completed' | 'loading';
  isListening: boolean;
  isArming?: boolean;
  isFinalizing?: boolean;
};

export function getInterviewControlState({
  closingKind,
  interviewState,
  isListening,
  isArming = false,
  isFinalizing = false,
}: InterviewControlStateInput) {
  const isClosingPrompt = closingKind !== null;
  const micDisabled = interviewState === 'thinking' || isFinalizing || isClosingPrompt;
  const micActive = (isListening || isArming) && !isClosingPrompt;
  const endDisabled = interviewState === 'thinking';

  const hint = isClosingPrompt
    ? 'All questions complete. View your report when ready.'
    : interviewState === 'thinking'
      ? 'Processing your answer...'
      : isFinalizing
        ? 'Transcribing your answer...'
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
    endReason:
      closingKind === 'all_questions_answered'
        ? 'all_questions_answered'
        : closingKind === 'time_running_out'
          ? 'timer_expired'
          : 'user_ended',
  } as const;
}
