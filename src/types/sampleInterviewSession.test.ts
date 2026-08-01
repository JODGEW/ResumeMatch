import { describe, it, expect } from 'vitest';
import {
  SAMPLE_INTERVIEW_SESSION,
  SAMPLE_INTERVIEW_SUMMARY,
  SAMPLE_INTERVIEW_SESSION_ID,
} from './sampleInterviewSession';
import {
  getInterviewClosingPromptKind,
  isInterviewClosingPrompt,
  isInterviewQuestionTurn,
} from '../utils/interviewQuestions';

// The demo account's Interviews tab renders this canned session through the exact
// same code paths as a real one (question-count filter, closing-prompt detection,
// assessment sections). These tests pin the invariants those paths rely on, so a
// future re-capture that breaks one fails loudly here instead of on the demo page.
describe('sample interview session (demo showcase)', () => {
  it('is a completed session with a full assessment', () => {
    expect(SAMPLE_INTERVIEW_SESSION.status).toBe('completed');
    const assessment = SAMPLE_INTERVIEW_SESSION.assessment;
    expect(assessment).toBeTruthy();
    expect(assessment!.categories.length).toBeGreaterThan(0);
    expect(assessment!.strengths.length).toBeGreaterThan(0);
    expect(assessment!.improvements.length).toBeGreaterThan(0);
    expect(assessment!.overallScore).toBeGreaterThan(0);
  });

  it('ends with the verbatim backend closing prompt, excluded from the question count', () => {
    const interviewerTurns = SAMPLE_INTERVIEW_SESSION.conversation.filter(
      (turn) => turn.role === 'interviewer'
    );
    const closing = interviewerTurns[interviewerTurns.length - 1];
    expect(isInterviewClosingPrompt(closing.content)).toBe(true);
    expect(getInterviewClosingPromptKind(closing.content)).toBe('all_questions_answered');
    // Only the final turn is a closing prompt; every other interviewer turn is a question.
    expect(interviewerTurns.filter((turn) => isInterviewClosingPrompt(turn.content))).toHaveLength(1);
  });

  it('derives the same question count the UI computes from the transcript', () => {
    const uiCount = SAMPLE_INTERVIEW_SESSION.conversation.filter(isInterviewQuestionTurn).length;
    expect(uiCount).toBe(SAMPLE_INTERVIEW_SESSION.totalQuestions);
    expect(uiCount).toBe(SAMPLE_INTERVIEW_SUMMARY.questionCount);
  });

  it('keeps the list summary consistent with the session detail', () => {
    expect(SAMPLE_INTERVIEW_SESSION.sessionId).toBe(SAMPLE_INTERVIEW_SESSION_ID);
    expect(SAMPLE_INTERVIEW_SUMMARY.sessionId).toBe(SAMPLE_INTERVIEW_SESSION_ID);
    expect(SAMPLE_INTERVIEW_SUMMARY.status).toBe('completed');
    expect(SAMPLE_INTERVIEW_SUMMARY.analysisId).toBe(SAMPLE_INTERVIEW_SESSION.analysisId);
    expect(SAMPLE_INTERVIEW_SUMMARY.matchScore).toBe(SAMPLE_INTERVIEW_SESSION.matchScore);
    expect(SAMPLE_INTERVIEW_SUMMARY.completedAt).toBe(SAMPLE_INTERVIEW_SESSION.completedAt);
  });

  it('carries per-turn coaching detail worth showcasing', () => {
    const candidateTurns = SAMPLE_INTERVIEW_SESSION.conversation.filter(
      (turn) => turn.role === 'candidate' || turn.role === 'user'
    );
    expect(candidateTurns.length).toBeGreaterThan(0);
    expect(candidateTurns.some((turn) => turn.feedback?.star)).toBe(true);
    expect(candidateTurns.some((turn) => turn.fillerWords && Object.keys(turn.fillerWords).length > 0)).toBe(true);
  });
});
