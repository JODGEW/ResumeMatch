import type { RunResult } from '../browser/types'

/**
 * What Phase 1 produced, classified for routing. Only `investigate` may reach a
 * model; every other outcome is a human-review or automatic-retry path.
 */
export type TriageDecision =
  | 'expected'
  | 'investigate'
  | 'infrastructure_defect'
  | 'artifact_rejected'
  | 'oracle_incomplete'
  | 'unexpected_shape'

export interface TriageOutcome {
  decision: TriageDecision
  reason: string
}

/**
 * Decide whether an accepted Phase 1 result starts an investigation.
 *
 * The ordering is load-bearing. `oracleStatus === 'failed'` is not a trigger by
 * itself: P1-06 is a safety self-test whose expected outcome is a failed oracle,
 * and it reaches here as `expectationMet: true`. Infrastructure failures,
 * rejected artifacts, and oracles that never completed carry no trustworthy
 * product observation, so they never reach a model either.
 */
export function triageRun(result: RunResult): TriageOutcome {
  if (result.executionStatus !== 'completed') {
    return { decision: 'infrastructure_defect', reason: 'Browser or harness lifecycle did not complete' }
  }
  if (result.artifactValidation.status !== 'passed' || result.evidenceManifest === null) {
    return { decision: 'artifact_rejected', reason: 'Evidence bundle was rejected and removed; only the sanitized validation report survives' }
  }
  if (result.oracleStatus === 'not_run' || result.oracleStatus === 'incomplete') {
    return { decision: 'oracle_incomplete', reason: `Oracle never produced a completed observation (${result.oracleStatus})` }
  }
  if (result.expectationMet) {
    return { decision: 'expected', reason: 'Scenario met its expected oracle status' }
  }
  if (result.oracleStatus === 'failed' && result.failedOracle !== null) {
    return { decision: 'investigate', reason: `Unexpected deterministic oracle failure: ${result.failedOracle}` }
  }
  return {
    decision: 'unexpected_shape',
    reason: 'Expectation was not met without an unexpected oracle failure; human review owns cleanup-only and mismatched-expectation results',
  }
}

/** Whether this outcome is allowed to start the bounded investigator. */
export function startsInvestigation(outcome: TriageOutcome): boolean {
  return outcome.decision === 'investigate'
}

/**
 * The manifest-side form of {@link triageRun}, for a bundle already on disk.
 *
 * A persisted manifest only exists when artifacts were accepted, so the
 * rejected-artifact branch is unreachable here; every other branch matches
 * {@link triageRun} field for field.
 */
export function triageAcceptedManifest(manifest: {
  executionStatus: string
  oracleStatus: string
  expectationMet: boolean
  failedOracle: string | null
  artifactsAccepted: boolean
}): TriageOutcome {
  if (!manifest.artifactsAccepted) {
    return { decision: 'artifact_rejected', reason: 'Manifest records rejected artifacts' }
  }
  if (manifest.executionStatus !== 'completed') {
    return { decision: 'infrastructure_defect', reason: 'Browser or harness lifecycle did not complete' }
  }
  if (manifest.oracleStatus === 'not_run' || manifest.oracleStatus === 'incomplete') {
    return { decision: 'oracle_incomplete', reason: `Oracle never produced a completed observation (${manifest.oracleStatus})` }
  }
  if (manifest.expectationMet) {
    return { decision: 'expected', reason: 'Scenario met its expected oracle status' }
  }
  if (manifest.oracleStatus === 'failed' && manifest.failedOracle !== null) {
    return { decision: 'investigate', reason: `Unexpected deterministic oracle failure: ${manifest.failedOracle}` }
  }
  return { decision: 'unexpected_shape', reason: 'Expectation was not met without an unexpected oracle failure' }
}
