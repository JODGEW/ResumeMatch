import type { RootCause } from './finding'

/**
 * The root cause a correct investigation names, per public case.
 *
 * Each answer is determinable from evidence the investigator can see: the
 * transition log, network events (redacted as recorded), request counts, and
 * the reproduction's oracle result. `null` marks a case that never reaches an
 * investigator, so there is nothing to grade. Cases absent from the map — the
 * public cases added later and every held-out case — are not graded either, so
 * a missing answer can never count as a miss.
 */
export const PUBLIC_ROOT_CAUSE_GOLD: ReadonlyMap<string, RootCause | null> = new Map<string, RootCause | null>([
  // Triage `expected`: no investigation runs.
  ['C1', null],
  ['C2', null],
  ['C3', null],
  // The product absorbs the S3 500, so the run passes and triage is `expected`.
  ['B3', null],
  // `contract-violation:analysis-method-id-query-or-count` on /sample, which
  // P1-01_NO_REST says must make no API request.
  ['D1', { attribution: 'product_defect', routeTemplate: '/analysis/:analysisId', failureMode: 'unexpected_request' }],
  // `contract-violation:new-upload-body-schema`; the POST is blocked carrying an
  // unexpected (redacted) field.
  ['D2', { attribution: 'product_defect', routeTemplate: '/upload', failureMode: 'malformed_request' }],
  // No `s3-contract` transition and no S3 request at all; CONTRACT_S3_COUNT fails.
  ['D3', { attribution: 'product_defect', routeTemplate: '/synthetic-upload', failureMode: 'missing_request' }],
  // The last transition is `analysis:processing` with no abort; the reproduction fails again.
  ['D4', { attribution: 'product_defect', routeTemplate: '/analysis/:analysisId', failureMode: 'stopped_early' }],
  // `upload-response:503`; the reproduction is not reproduced.
  ['B1', { attribution: 'transient_or_environment', routeTemplate: '/upload', failureMode: 'error_response' }],
  // `analysis-response:aborted` with no contract violation; the reproduction passes.
  ['B2', { attribution: 'transient_or_environment', routeTemplate: '/analysis/:analysisId', failureMode: 'aborted_response' }],
])

/**
 * The graded answer for one case.
 * @param caseId - corpus case id.
 * @returns the answer, or null when the case is not graded.
 */
export function goldRootCause(caseId: string): RootCause | null {
  return PUBLIC_ROOT_CAUSE_GOLD.get(caseId) ?? null
}
