import { describe, it, expect, vi } from 'vitest';
import { extractApiErrorMessage } from './errors';

function axios429(data: Record<string, string> | undefined): Error {
  const err = new Error('Request failed with status code 429');
  (err as Error & { response?: { status: number; data?: Record<string, string> } }).response = {
    status: 429,
    data,
  };
  return err;
}

describe('extractApiErrorMessage', () => {
  it('prefers the backend body copy over the axios status noise', () => {
    expect(
      extractApiErrorMessage(axios429({ error: 'Daily analysis limit reached. Try again tomorrow.' }), 'fallback')
    ).toBe('Daily analysis limit reached. Try again tomorrow.');
  });

  it('checks body keys in order: error, errorMessage, message', () => {
    expect(extractApiErrorMessage(axios429({ errorMessage: 'em', message: 'm' }), 'f')).toBe('em');
    expect(extractApiErrorMessage(axios429({ message: 'm' }), 'f')).toBe('m');
  });

  it('falls back to err.message when the body has no copy', () => {
    expect(extractApiErrorMessage(axios429(undefined), 'f')).toBe('Request failed with status code 429');
    expect(extractApiErrorMessage(new Error('boom'), 'f')).toBe('boom');
  });

  it('uses the caller fallback for non-Error values and empty messages', () => {
    expect(extractApiErrorMessage('nope', 'Failed to start interview')).toBe('Failed to start interview');
    expect(extractApiErrorMessage(new Error(''), 'f')).toBe('f');
  });

  it('maps known backend machine codes to human copy', () => {
    expect(extractApiErrorMessage(axios429({ error: 'interview_quota_exceeded' }), 'f'))
      .toBe('Daily interview limit reached. Try again tomorrow.');
    expect(extractApiErrorMessage(axios429({ error: 'technical_interview_pro_only' }), 'f'))
      .toBe('Technical interviews are available on Pro.');
  });

  it('never renders an unrecognised machine code, and warns so it gets mapped', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(extractApiErrorMessage(axios429({ error: 'some_future_code' }), 'Failed to start interview'))
      .toBe('Failed to start interview');
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toContain('some_future_code');
    expect(warn.mock.calls[0][0]).toContain('Failed to start interview');
    warn.mockRestore();
  });

  it('still renders lowercase words that are real copy, not codes', () => {
    // no underscore -> not a code -> shown as-is
    expect(extractApiErrorMessage(axios429({ error: 'unauthorized' }), 'f')).toBe('unauthorized');
  });

  it('does not resolve Object.prototype keys as mapped copy', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // "toString" has no underscore, so it is not code-shaped either — it must
    // come back as-is rather than as a stringified function.
    expect(extractApiErrorMessage(axios429({ error: 'toString' }), 'f')).toBe('toString');
    expect(extractApiErrorMessage(axios429({ error: 'has_own_property' }), 'f')).toBe('f');
    warn.mockRestore();
  });
});
