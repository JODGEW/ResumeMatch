/**
 * How the assessment half of Interview Results should present itself.
 *
 * - `paywalled` — the backend redacted paid detail (category scores, dimension
 *   feedback, strengths, improvements) for a Free-plan user and set
 *   `upgradeRequired: true`. This is an entitlement state, NOT a processing
 *   failure: the overall score and rating are still real and Free-visible, so
 *   the page must not describe the assessment as incomplete.
 * - `no-category-scores` — a genuine gap: nothing was redacted, the grader
 *   just produced no per-category scores. Keeps the existing
 *   "Assessment incomplete" presentation.
 * - `complete` — the normal full assessment.
 *
 * The paywall check runs before the score-presence check on purpose: a
 * redacted assessment always has missing categories, and reading that absence
 * as "incomplete" is exactly the bug this helper exists to prevent.
 */
export type AssessmentDisplayState = 'paywalled' | 'no-category-scores' | 'complete';

export function getAssessmentDisplayState(assessment: {
  upgradeRequired?: boolean;
  categories: ReadonlyArray<unknown>;
}): AssessmentDisplayState {
  if (assessment.upgradeRequired === true) return 'paywalled';
  return assessment.categories.length > 0 ? 'complete' : 'no-category-scores';
}
