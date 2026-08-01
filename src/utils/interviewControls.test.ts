import { describe, expect, it, vi } from 'vitest';
import { awaitPendingTurnSubmission, getInterviewControlState } from './interviewControls';

describe('getInterviewControlState', () => {
  it('does not invite push-to-talk on the all-questions-answered closing prompt', () => {
    const controls = getInterviewControlState({
      closingKind: 'all_questions_answered',
      interviewState: 'active',
      isListening: false,
    });

    expect(controls.isClosingPrompt).toBe(true);
    expect(controls.micDisabled).toBe(true);
    expect(controls.hint).not.toContain('Hold mic');
    expect(controls.endButtonLabel).toBe('View report');
    expect(controls.endReason).toBe('all_questions_answered');
  });

  it('maps the time-running-out wrap-up to a timer_expired end reason', () => {
    const controls = getInterviewControlState({
      closingKind: 'time_running_out',
      interviewState: 'active',
      isListening: false,
    });

    expect(controls.isClosingPrompt).toBe(true);
    expect(controls.micDisabled).toBe(true);
    expect(controls.endButtonLabel).toBe('View report');
    expect(controls.endReason).toBe('timer_expired');
  });

  it('keeps push-to-talk available for normal interview questions', () => {
    const controls = getInterviewControlState({
      closingKind: null,
      interviewState: 'active',
      isListening: false,
    });

    expect(controls.isClosingPrompt).toBe(false);
    expect(controls.micDisabled).toBe(false);
    expect(controls.hint).toBe('Hold mic or Space to speak');
    expect(controls.endButtonLabel).toBe('End interview');
    expect(controls.endReason).toBe('user_ended');
  });

  it('blocks ending while an answer is being processed', () => {
    const controls = getInterviewControlState({
      closingKind: null,
      interviewState: 'thinking',
      isListening: false,
    });

    expect(controls.micDisabled).toBe(true);
    expect(controls.endDisabled).toBe(true);
    expect(controls.hint).toBe('Processing your answer...');
    expect(controls.endButtonLabel).toBe('Waiting for response...');
  });

  it('shows a connecting hint while the mic is arming but not yet capturing', () => {
    const controls = getInterviewControlState({
      closingKind: null,
      interviewState: 'active',
      isListening: false,
      isArming: true,
    });

    expect(controls.hint).toBe('Connecting mic...');
    expect(controls.micActive).toBe(true);
    expect(controls.micDisabled).toBe(false);
  });

  it('prefers the listening hint once capture is live', () => {
    const controls = getInterviewControlState({
      closingKind: null,
      interviewState: 'active',
      isListening: true,
      isArming: false,
    });

    expect(controls.hint).toBe('Listening... release to submit');
    expect(controls.micActive).toBe(true);
  });
});

describe('awaitPendingTurnSubmission', () => {
  it('returns immediately when there is no pending submit', async () => {
    const after = vi.fn();
    await awaitPendingTurnSubmission(null);
    after();
    expect(after).toHaveBeenCalledOnce();
  });

  it('blocks until a slow submit resolves — no internal timeout', async () => {
    vi.useFakeTimers();
    let resolveSubmit: (value: unknown) => void = () => {};
    const submitPromise = new Promise(resolve => { resolveSubmit = resolve; });
    const navigate = vi.fn();

    const waiter = awaitPendingTurnSubmission(submitPromise).then(() => navigate());

    // Simulate 8s of latency — well past the old 5s cutoff. Navigate must not fire.
    await vi.advanceTimersByTimeAsync(8000);
    expect(navigate).not.toHaveBeenCalled();

    resolveSubmit({ question: 'done' });
    await waiter;
    expect(navigate).toHaveBeenCalledOnce();

    vi.useRealTimers();
  });

  it('still resolves (and allows navigation) when submit rejects', async () => {
    const navigate = vi.fn();
    const submitPromise = Promise.reject(new Error('network down'));

    await awaitPendingTurnSubmission(submitPromise);
    navigate();

    expect(navigate).toHaveBeenCalledOnce();
  });
});
