import { describe, it, expect } from 'vitest';
import { isCredentialSignInFailure } from './authErrors';

function cognitoError(name: string, message: string): Error {
  const err = new Error(message);
  err.name = name;
  return err;
}

describe('isCredentialSignInFailure', () => {
  // Pin the verbatim Cognito exception names — Amplify v6 sets them as Error.name.
  it('matches NotAuthorizedException', () => {
    expect(
      isCredentialSignInFailure(
        cognitoError('NotAuthorizedException', 'Incorrect username or password.'),
      ),
    ).toBe(true);
  });

  it('matches UserNotFoundException', () => {
    expect(
      isCredentialSignInFailure(
        cognitoError('UserNotFoundException', 'User does not exist.'),
      ),
    ).toBe(true);
  });

  it('ignores other Cognito errors', () => {
    expect(
      isCredentialSignInFailure(
        cognitoError('UserNotConfirmedException', 'User is not confirmed.'),
      ),
    ).toBe(false);
    expect(
      isCredentialSignInFailure(
        cognitoError('LimitExceededException', 'Attempt limit exceeded.'),
      ),
    ).toBe(false);
  });

  it('ignores plain Errors (e.g. sign-in step errors from AuthContext)', () => {
    expect(isCredentialSignInFailure(new Error('This account is not confirmed yet.'))).toBe(false);
  });

  it('ignores non-Error values', () => {
    expect(isCredentialSignInFailure('NotAuthorizedException')).toBe(false);
    expect(isCredentialSignInFailure(undefined)).toBe(false);
  });
});
