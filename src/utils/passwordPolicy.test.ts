import { describe, it, expect } from 'vitest';
import { validatePassword, friendlyPasswordPolicyError, PASSWORD_RULES } from './passwordPolicy';

function cognitoError(message: string): Error {
  const err = new Error(message);
  err.name = 'InvalidPasswordException';
  return err;
}

describe('validatePassword (mirrors the Cognito pool policy)', () => {
  it('accepts a password satisfying every pool rule', () => {
    expect(validatePassword('Sunny-Day7')).toBeNull();
  });

  it('rejects each unmet rule with its specific message', () => {
    expect(validatePassword('Ab1!')).toBe('Password must be at least 8 characters.');
    expect(validatePassword('UPPER-ONLY-99')).toBe('Password must include a lowercase letter.');
    expect(validatePassword('lower-only-99')).toBe('Password must include an uppercase letter.');
    expect(validatePassword('NoNumbers-Here')).toBe('Password must include a number.');
    expect(validatePassword('NoSpecials99x')).toBe('Password must include a special character (e.g. ! @ # %).');
  });

  it('reports every missing rule at once, matching the live checklist', () => {
    // Missing uppercase AND symbol — both named, not just the first.
    expect(validatePassword('lowercase99')).toBe(
      'Password must include an uppercase letter and a special character (e.g. ! @ # %).'
    );
    // Too short and missing several character classes.
    expect(validatePassword('ab')).toBe(
      'Password must be at least 8 characters and include an uppercase letter, a number, and a special character (e.g. ! @ # %).'
    );
  });

  it('counts every character class from the Cognito special set', () => {
    // A sample across the documented set — each satisfies the special-char rule.
    for (const special of ['^', '$', '*', '.', '[', ']', '{', '}', '(', ')', '?', '-', '"', '!', '@', '#', '%', '&', '/', '\\', ',', '>', '<', "'", ':', ';', '|', '_', '~', '`', '+', '=']) {
      expect(validatePassword(`Abcdef9${special}`)).toBeNull();
    }
  });
});

describe('PASSWORD_RULES (drives the live checklists)', () => {
  it('agrees with validatePassword rule for rule', () => {
    const compliant = 'Sunny-Day7';
    for (const rule of PASSWORD_RULES) {
      expect(rule.test(compliant)).toBe(true);
    }
  });

  it('symbol rule uses the Cognito special set, not any non-alphanumeric', () => {
    const symbolRule = PASSWORD_RULES.find((rule) => rule.label === 'symbol')!;
    expect(symbolRule.test('Abcdef9!')).toBe(true);
    // é is non-alphanumeric but NOT in Cognito's special set — the checklist
    // must not show a ✓ that Cognito would reject.
    expect(symbolRule.test('Abcdef9é')).toBe(false);
    expect(validatePassword('Abcdef9é')).toBe('Password must include a special character (e.g. ! @ # %).');
  });
});

describe('friendlyPasswordPolicyError', () => {
  it('softens the verbatim Cognito prefix and keeps the specific detail', () => {
    // Message shape pinned verbatim from Cognito's InvalidPasswordException.
    const err = cognitoError('Password did not conform with policy: Password must have symbol characters');
    expect(friendlyPasswordPolicyError(err)).toBe(
      "Your password doesn't meet the requirements: Password must have symbol characters"
    );
  });

  it('keeps the whole message when the prefix is absent', () => {
    const err = cognitoError('Password not long enough');
    expect(friendlyPasswordPolicyError(err)).toBe(
      "Your password doesn't meet the requirements: Password not long enough"
    );
  });

  it('returns null for other errors so callers use their own handling', () => {
    expect(friendlyPasswordPolicyError(new Error('User already exists'))).toBeNull();
    expect(friendlyPasswordPolicyError('not an error')).toBeNull();
    expect(friendlyPasswordPolicyError(undefined)).toBeNull();
  });
});
