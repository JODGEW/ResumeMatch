/**
 * Backend `error` fields are not consistent: the analysis 429 puts a finished
 * sentence there, while interviewStart puts a machine code and (for the quota
 * case) no human copy at all. Since we prefer `error`, the code reached the
 * user's error banner verbatim — "interview_quota_exceeded" as a UI string.
 * Known codes get copy here; unknown ones fall back rather than leak, because
 * the next code added backend-side would otherwise leak too (see
 * CreateCustomerPortalSession's no_stripe_customer, unreachable from main
 * today but one branch merge away).
 *
 * A Map, not an object literal: `picked` is attacker-adjacent backend input, and
 * a plain Record would resolve "toString"/"constructor" off Object.prototype.
 */
const CODE_COPY = new Map<string, string>([
  ['interview_quota_exceeded', 'Daily interview limit reached. Try again tomorrow.'],
  ['technical_interview_pro_only', 'Technical interviews are available on Pro.'],
  ['no_stripe_customer', 'No billing account found yet. Start a subscription first.'],
]);

// snake_case, all lowercase, no spaces, at least one underscore. Deliberately
// requires the underscore so single lowercase words that ARE user copy
// ("unauthorized") keep rendering as-is.
const LOOKS_LIKE_CODE = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/;

/**
 * Backend error bodies carry the user-facing copy under one of these keys —
 * notably the daily-limit 429s from /upload and /interview/start. Axios's own
 * err.message for those is just "Request failed with status code 429", so
 * callers must prefer the body. Key order matches the long-standing Upload
 * behavior: error, then errorMessage, then message.
 */
export function extractApiErrorMessage(err: unknown, fallback: string): string {
  const axiosErr = err as {
    response?: { data?: { error?: string; errorMessage?: string; message?: string } };
  };
  const data = axiosErr?.response?.data;
  const picked = data?.error || data?.errorMessage || data?.message || '';

  if (picked) {
    const mapped = CODE_COPY.get(picked);
    if (mapped) return mapped;
    if (LOOKS_LIKE_CODE.test(picked)) {
      // Swallowing this silently would make "generic copy on screen" the only
      // signal that a new backend code exists — the same missing-as-only-signal
      // shape this map exists to fix. Say which code, and what the user saw.
      console.warn(
        `[api] unmapped backend error code "${picked}" — showed fallback copy instead: "${fallback}". `
        + 'Add it to CODE_COPY in src/api/errors.ts.'
      );
      // An unrecognised code is worse than saying nothing specific: the caller's
      // fallback is context-appropriate ("Failed to start interview"), whereas
      // err.message here is only "Request failed with status code 429".
      return fallback;
    }
    return picked;
  }

  return (err instanceof Error ? err.message : '') || fallback;
}
