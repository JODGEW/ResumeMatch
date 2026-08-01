import { describe, it, expect } from 'vitest';
import { isAccountLinkRetry, LINK_RETRY_SENTINEL } from './oauthLinking';

// Cognito wraps the Lambda's exception message in the OAuth error_description;
// pin the observed wrapped form so a trigger-side rename breaks this test.
const COGNITO_WRAPPED = 'PreSignUp failed with error LINKED_RETRY.';

describe('isAccountLinkRetry', () => {
  it('pins the sentinel shared with local_lambda/preSignUpLink.py', () => {
    expect(LINK_RETRY_SENTINEL).toBe('LINKED_RETRY');
    expect(COGNITO_WRAPPED).toContain(LINK_RETRY_SENTINEL);
  });

  it('matches the Hub failure payload shape ({ error })', () => {
    expect(isAccountLinkRetry({ error: new Error(COGNITO_WRAPPED) })).toBe(true);
  });

  it('matches a bare Error or string', () => {
    expect(isAccountLinkRetry(new Error(COGNITO_WRAPPED))).toBe(true);
    expect(isAccountLinkRetry(COGNITO_WRAPPED)).toBe(true);
  });

  it('rejects unrelated OAuth failures', () => {
    expect(isAccountLinkRetry({ error: new Error('invalid_grant') })).toBe(false);
    expect(isAccountLinkRetry(new Error('User cancelled the flow'))).toBe(false);
  });

  it('rejects empty/absent payloads', () => {
    expect(isAccountLinkRetry(undefined)).toBe(false);
    expect(isAccountLinkRetry(null)).toBe(false);
    expect(isAccountLinkRetry({})).toBe(false);
  });
});
