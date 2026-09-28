import { describe, it, expect } from 'vitest';
import { AxiosError } from 'axios';
import { voiceTokenErrorMessage, VOICE_UNAVAILABLE } from './voiceErrors';

function httpError(status: number, error?: string): Error {
  const err = new Error(`Request failed with status code ${status}`);
  (err as Error & { response?: { status: number; data?: { error?: string } } }).response = {
    status,
    data: error ? { error } : undefined,
  };
  return err;
}

describe('voiceTokenErrorMessage', () => {
  it('says voice is unavailable and nothing was recorded when the token service fails', () => {
    // The 2026-09-12 outages: a 502 from the token Lambda and a mint timeout.
    expect(voiceTokenErrorMessage(httpError(502, 'failed to mint token'))).toBe(VOICE_UNAVAILABLE);
    expect(voiceTokenErrorMessage(httpError(500, 'session lookup failed'))).toBe(VOICE_UNAVAILABLE);
    expect(voiceTokenErrorMessage(new AxiosError('Network Error', 'ERR_NETWORK'))).toBe(VOICE_UNAVAILABLE);
    expect(VOICE_UNAVAILABLE).toMatch(/nothing was recorded/);
  });

  it('never shows the token endpoint\'s own error strings', () => {
    for (const [status, body] of [
      [429, 'token mint cap reached for this session'],
      [400, 'session is not active'],
      [404, 'session not found'],
      [401, 'unauthorized'],
    ] as const) {
      expect(voiceTokenErrorMessage(httpError(status, body))).not.toContain(body);
    }
  });

  it('tells the user to start a new interview when the session is over or capped', () => {
    expect(voiceTokenErrorMessage(httpError(400, 'session is not active'))).toMatch(/start a new interview/i);
    expect(voiceTokenErrorMessage(httpError(404, 'session not found'))).toMatch(/start a new interview/i);
    expect(voiceTokenErrorMessage(httpError(429, 'token mint cap reached for this session'))).toMatch(/start a new interview/i);
  });

  it('tells the user to refresh on 401', () => {
    expect(voiceTokenErrorMessage(httpError(401, 'unauthorized'))).toMatch(/refresh/i);
  });

  it('treats anything unrecognised as unavailable', () => {
    expect(voiceTokenErrorMessage(new Error('boom'))).toBe(VOICE_UNAVAILABLE);
    expect(voiceTokenErrorMessage(undefined)).toBe(VOICE_UNAVAILABLE);
    expect(voiceTokenErrorMessage(httpError(418))).toBe(VOICE_UNAVAILABLE);
  });

  it('never mentions a timeout, so the interview mascot shows the error state', () => {
    // Interview.tsx picks the 'timeout' mascot when the message matches this.
    for (const status of [400, 401, 404, 429, 502]) {
      expect(voiceTokenErrorMessage(httpError(status))).not.toMatch(/timed?\s*out|timeout/i);
    }
  });
});
