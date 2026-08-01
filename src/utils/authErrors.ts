// Amplify v6 surfaces the Cognito exception name as `Error.name`. These are the
// two names a password sign-in attempt produces when the account either has no
// password (Google-federated) or doesn't exist under that email:
// - NotAuthorizedException: wrong password, or federated-only user with
//   "prevent user existence errors" enabled (the pool default).
// - UserNotFoundException: pool configured to reveal non-existence.
const CREDENTIAL_SIGN_IN_FAILURES = new Set([
  'NotAuthorizedException',
  'UserNotFoundException',
]);

/**
 * True when a password sign-in failed in a way that is consistent with the
 * account having been created through Google OAuth instead (no password set).
 * Used to show a "try Continue with Google" hint — the names above cannot
 * distinguish a federated account from a plain wrong password, so the hint
 * must stay conditional ("If you signed up with Google…"), never assertive.
 */
export function isCredentialSignInFailure(err: unknown): boolean {
  return err instanceof Error && CREDENTIAL_SIGN_IN_FAILURES.has(err.name);
}
