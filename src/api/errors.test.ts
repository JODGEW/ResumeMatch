import { describe, it, expect, vi } from 'vitest';
import { AxiosError } from 'axios';
import { extractApiErrorMessage } from './errors';

function httpError(status: number, data: Record<string, string> | undefined): Error {
  const err = new Error(`Request failed with status code ${status}`);
  (err as Error & { response?: { status: number; data?: Record<string, string> } }).response = {
    status,
    data,
  };
  return err;
}

function axios429(data: Record<string, string> | undefined): Error {
  return httpError(429, data);
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

  it('uses the fallback, never axios status text, when an HTTP error body has no copy', () => {
    expect(extractApiErrorMessage(axios429(undefined), 'f')).toBe('f');
    expect(extractApiErrorMessage(axios429({}), 'f')).toBe('f');
  });

  it('uses the fallback for any 5xx, whatever its body says', () => {
    // Bodies the backend and API Gateway really send on 5xx.
    const bodies: Record<string, string>[] = [
      { error: 'failed to mint token' },
      { error: 'Internal server error' },
      { message: 'Endpoint request timed out' },
    ];
    for (const data of bodies) {
      expect(extractApiErrorMessage(httpError(502, data), 'Failed to start recording'))
        .toBe('Failed to start recording');
    }
  });

  it('uses the fallback when there was no response at all', () => {
    const network = new AxiosError('Network Error', 'ERR_NETWORK');
    const timeout = new AxiosError('timeout of 10000ms exceeded', 'ECONNABORTED');
    expect(extractApiErrorMessage(network, 'Failed to load history')).toBe('Failed to load history');
    expect(extractApiErrorMessage(timeout, 'Failed to load history')).toBe('Failed to load history');
  });

  it('keeps the message of a non-HTTP error', () => {
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
