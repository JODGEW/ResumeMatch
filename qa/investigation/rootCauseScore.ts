import { FINDING_SCHEMA_VERSION_V1 } from './finding'
import type { RootCause, StoredFinding } from './finding'

/** Why a finding carries no grade. None of these counts as a miss. */
export type NotGradedReason = 'no_finding' | 'v1_finding' | 'no_gold'

/**
 * One finding's `rootCause` against its case's answer.
 *
 * A `policyBlocked` grade is a v2 finding whose narrative the session discarded
 * after an unauthorized submission. It is graded and wrong, because the model
 * caused the block, but tagged so a policy failure can be told apart from a
 * wrong diagnosis.
 */
export type RootCauseGrade =
  | { graded: false; reason: NotGradedReason }
  | { graded: true; attributionCorrect: boolean; tripleCorrect: boolean; undetermined: boolean; policyBlocked: boolean }

/**
 * Grade one finding.
 * @param finding - the submitted finding, under either schema version, or null when none was submitted.
 * @param gold - the case's answer, or null when the case is not graded.
 * @returns the grade.
 */
export function gradeRootCause(finding: StoredFinding | null, gold: RootCause | null): RootCauseGrade {
  if (finding === null) return { graded: false, reason: 'no_finding' }
  if (finding.schemaVersion === FINDING_SCHEMA_VERSION_V1) return { graded: false, reason: 'v1_finding' }
  if (gold === null) return { graded: false, reason: 'no_gold' }
  const answer = finding.rootCause
  if (answer === null) return { graded: true, attributionCorrect: false, tripleCorrect: false, undetermined: false, policyBlocked: true }
  const attributionCorrect = answer.attribution === gold.attribution
  return {
    graded: true,
    attributionCorrect,
    tripleCorrect: attributionCorrect && answer.routeTemplate === gold.routeTemplate && answer.failureMode === gold.failureMode,
    undetermined: answer.attribution === 'undetermined',
    policyBlocked: false,
  }
}

/** Counts over one run's graded findings; `graded` is the denominator of every rate. */
export interface RootCauseScore {
  graded: number
  attributionCorrect: number
  tripleCorrect: number
  undetermined: number
  policyBlocked: number
}

/**
 * Aggregate grades for one run. Not-graded findings are left out of every
 * denominator.
 * @param grades - one grade per case.
 * @returns the counts.
 */
export function scoreRootCauses(grades: readonly RootCauseGrade[]): RootCauseScore {
  const graded = grades.filter((grade): grade is Extract<RootCauseGrade, { graded: true }> => grade.graded)
  return {
    graded: graded.length,
    attributionCorrect: graded.filter(grade => grade.attributionCorrect).length,
    tripleCorrect: graded.filter(grade => grade.tripleCorrect).length,
    undetermined: graded.filter(grade => grade.undetermined).length,
    policyBlocked: graded.filter(grade => grade.policyBlocked).length,
  }
}
