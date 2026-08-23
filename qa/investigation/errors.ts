/** Codes the investigation surface returns instead of throwing across the process boundary. */
export type InvestigationErrorCode =
  | 'POLICY_BLOCKED'
  | 'BUDGET_EXHAUSTED'
  | 'INVALID_ARGUMENTS'
  | 'INVALID_STATE'
  | 'EVIDENCE_UNAVAILABLE'
  | 'REPRODUCTION_FAILED'

/**
 * Repair material returned with a rejected argument.
 *
 * A refusal the caller cannot act on costs an attempt and teaches nothing, so
 * an `INVALID_ARGUMENTS` refusal carries the schema it failed and one minimal
 * call that satisfies it.
 */
export interface ArgumentHelp {
  schema: unknown
  example: unknown
  /** What this scenario actually authorizes, so a caller need not guess it. */
  scenarioPolicy?: unknown
}

/**
 * A refused request. `POLICY_BLOCKED` means the caller asked for something
 * outside the closed grammar or its authorized lifecycle state; it latches the
 * whole investigation, because an attempted unauthorized action is the finding.
 * `INVALID_ARGUMENTS` means the request was the right kind of thing, badly
 * formed, and it is retryable.
 */
export class InvestigationError extends Error {
  constructor(readonly code: InvestigationErrorCode, message: string, readonly help?: ArgumentHelp) {
    super(message)
    this.name = 'InvestigationError'
  }
}

/**
 * Refuse a malformed argument, with the schema and an example that satisfies it.
 * @param message - what was wrong.
 * @param help - the schema the argument failed and one minimal valid call.
 * @returns the retryable refusal.
 */
export function invalidArguments(message: string, help: ArgumentHelp): InvestigationError {
  return new InvestigationError('INVALID_ARGUMENTS', message, help)
}

/** Refuse a request that falls outside the authorized surface. */
export function policyBlocked(message: string): InvestigationError {
  return new InvestigationError('POLICY_BLOCKED', message)
}
