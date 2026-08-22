/** Codes the investigation surface returns instead of throwing across the process boundary. */
export type InvestigationErrorCode =
  | 'POLICY_BLOCKED'
  | 'BUDGET_EXHAUSTED'
  | 'INVALID_ARGUMENTS'
  | 'INVALID_STATE'
  | 'EVIDENCE_UNAVAILABLE'
  | 'REPRODUCTION_FAILED'

/**
 * A refused request. `POLICY_BLOCKED` means the caller asked for something
 * outside the closed grammar or its authorized lifecycle state; it latches the
 * whole investigation, because an attempted unauthorized action is the finding.
 */
export class InvestigationError extends Error {
  constructor(readonly code: InvestigationErrorCode, message: string) {
    super(message)
    this.name = 'InvestigationError'
  }
}

/** Refuse a request that falls outside the authorized surface. */
export function policyBlocked(message: string): InvestigationError {
  return new InvestigationError('POLICY_BLOCKED', message)
}
