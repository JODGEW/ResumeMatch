import { describe, expect, it } from 'vitest';
import { getInterviewClosingPromptKind, isInterviewClosingPrompt } from './interviewQuestions';

// Verbatim closing messages emitted by the interviewTurn lambda. These fixtures must
// stay byte-for-byte identical to the deployed strings (apostrophes, the em-dash,
// punctuation) — the whole point of this test is to convert silent frontend/backend
// drift into a loud failure. Do not "tidy" or reconstruct them. If the lambda copy
// changes, update these from the lambda source, not from memory.
const ALL_QUESTIONS_VIEW_REPORT =
  "That's all the questions I have for you today. Click 'View report' whenever you're ready to see your assessment and transcript.";

// Bank-exhausted paths (the unclear move-on branch and the final else) still say
// "End Interview", not "View report". It must still map to all_questions_answered
// because the matcher ignores the button word — which is exactly what lets that copy
// be changed safely. If those lambda strings are switched to "View report", replace
// this fixture with the current text.
const ALL_QUESTIONS_END_INTERVIEW =
  "That's all the questions I have for you today. Click 'End Interview' whenever you're ready to see your assessment and transcript.";

const TIME_RUNNING_OUT =
  "We're running short on time. Thank you for your answers today — you did great. Click 'View report' whenever you're ready to see your assessment and transcript.";

// A normal interviewer question. Note it contains the word "time" — it must NOT be
// misread as the time wrap-up, which requires the full "we're running short on time".
const REAL_QUESTION =
  'Tell me about a time you took ownership of a feature from conception to production.';

describe('getInterviewClosingPromptKind', () => {
  it('maps the all-questions wrap-up (View report CTA) to all_questions_answered', () => {
    expect(getInterviewClosingPromptKind(ALL_QUESTIONS_VIEW_REPORT)).toBe('all_questions_answered');
  });

  it('maps the all-questions wrap-up to all_questions_answered regardless of the button word', () => {
    expect(getInterviewClosingPromptKind(ALL_QUESTIONS_END_INTERVIEW)).toBe('all_questions_answered');
  });

  it('maps the time wrap-up to time_running_out', () => {
    expect(getInterviewClosingPromptKind(TIME_RUNNING_OUT)).toBe('time_running_out');
  });

  it('returns null for a normal interview question (no false positives)', () => {
    expect(getInterviewClosingPromptKind(REAL_QUESTION)).toBeNull();
  });
});

describe('isInterviewClosingPrompt', () => {
  it('is true for every closing message and false for a normal question', () => {
    expect(isInterviewClosingPrompt(ALL_QUESTIONS_VIEW_REPORT)).toBe(true);
    expect(isInterviewClosingPrompt(ALL_QUESTIONS_END_INTERVIEW)).toBe(true);
    expect(isInterviewClosingPrompt(TIME_RUNNING_OUT)).toBe(true);
    expect(isInterviewClosingPrompt(REAL_QUESTION)).toBe(false);
  });
});
