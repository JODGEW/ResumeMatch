/**
 * Client-side mirror of the Cognito user pool password policy (console →
 * Sign-in experience → Password policy, checked 2026-07-12): minimum length 8,
 * and at least one number, one special character, one uppercase letter, and one
 * lowercase letter. The pool is the source of truth — if its policy changes,
 * update this module (and its test) to match. The mirror exists so users get
 * instant, specific feedback instead of Cognito's raw InvalidPasswordException
 * after a network round trip; anything that still slips through is softened by
 * friendlyPasswordPolicyError below.
 */

// Cognito's documented special-character set. Space is deliberately omitted:
// Cognito rejects leading/trailing spaces anyway, and an interior space as the
// only special character is rare enough that the server fallback covering it
// beats widening the class.
const SPECIAL_CHAR_RE = /[\^$*.[\]{}()?\-"!@#%&/\\,><':;|_~`+=]/;

/** Shown under the password fields; states the full pool policy. */
export const PASSWORD_REQUIREMENTS_HINT =
  'Use 8+ characters, including an uppercase and lowercase letter, a number, and a special character';

/**
 * One entry per pool rule, in display order. The live checklists under the
 * password fields render from this array so they can never drift from
 * validatePassword — in particular the symbol rule uses the Cognito special
 * set, not "any non-alphanumeric".
 */
export const PASSWORD_RULES: ReadonlyArray<{ label: string; test: (pw: string) => boolean }> = [
  { label: '8+ chars', test: (pw) => pw.length >= 8 },
  { label: 'lowercase', test: (pw) => /[a-z]/.test(pw) },
  { label: 'uppercase', test: (pw) => /[A-Z]/.test(pw) },
  { label: 'number', test: (pw) => /\d/.test(pw) },
  { label: 'symbol', test: (pw) => SPECIAL_CHAR_RE.test(pw) },
];

function listJoin(items: string[]): string {
  if (items.length <= 2) return items.join(' and ');
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

/**
 * Every unmet pool rule folded into one sentence (e.g. "Password must include
 * an uppercase letter and a special character."), or null when compliant —
 * matching the checklist, which also shows all misses at once.
 */
export function validatePassword(password: string): string | null {
  const missing: string[] = [];
  if (!/[a-z]/.test(password)) missing.push('a lowercase letter');
  if (!/[A-Z]/.test(password)) missing.push('an uppercase letter');
  if (!/\d/.test(password)) missing.push('a number');
  if (!SPECIAL_CHAR_RE.test(password)) missing.push('a special character (e.g. ! @ # %)');
  const tooShort = password.length < 8;
  if (!tooShort && missing.length === 0) return null;

  const clauses: string[] = [];
  if (tooShort) clauses.push('be at least 8 characters');
  if (missing.length > 0) clauses.push(`include ${listJoin(missing)}`);
  return `Password must ${listJoin(clauses)}.`;
}

// Verbatim prefix of Cognito's InvalidPasswordException message, e.g.
// "Password did not conform with policy: Password must have symbol characters".
// Pinned by passwordPolicy.test.ts.
const COGNITO_POLICY_PREFIX_RE = /^password did not conform with policy:\s*/i;

/**
 * Softens Cognito's InvalidPasswordException for display, keeping Cognito's
 * specific rule detail. Returns null for every other error so callers fall
 * back to their normal handling. Matches on err.name, not message text, so it
 * survives message-wording changes.
 */
export function friendlyPasswordPolicyError(err: unknown): string | null {
  if (!(err instanceof Error) || err.name !== 'InvalidPasswordException') return null;
  const detail = err.message.replace(COGNITO_POLICY_PREFIX_RE, '').trim();
  return detail
    ? `Your password doesn't meet the requirements: ${detail}`
    : "Your password doesn't meet the requirements.";
}
