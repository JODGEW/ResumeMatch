import { describe, it, expect } from 'vitest';
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
});
