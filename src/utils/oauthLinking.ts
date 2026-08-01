// Sentinel raised by the Cognito Pre Sign-Up linking trigger
// (local_lambda/preSignUpLink.py) after it links a first-time Google sign-in
// to an existing email/password account and aborts the duplicate signup.
// Cognito surfaces it in the OAuth error redirect as
// "PreSignUp failed with error LINKED_RETRY." — retrying the redirect once
// signs into the freshly linked account.
export const LINK_RETRY_SENTINEL = 'LINKED_RETRY';

/**
 * True when a `signInWithRedirect_failure` Hub payload's data carries the
 * linking sentinel. Accepts the raw Hub `payload.data` (which wraps the
 * error as `{ error }`), a bare Error, or a string.
 */
export function isAccountLinkRetry(failureData: unknown): boolean {
  const err =
    failureData && typeof failureData === 'object' && 'error' in failureData
      ? (failureData as { error: unknown }).error
      : failureData;
  const message =
    err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  return message.includes(LINK_RETRY_SENTINEL);
}
