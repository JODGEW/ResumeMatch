/**
 * The evidence tools whose output carries each public case's signature.
 *
 * A case is scored on whether its first discriminating probe (the first one
 * after the orientation reads) is in its set. The sets were registered before
 * any scoring against them; see the design doc's section 3. B2 has no set for
 * the same reason it has no gold probe: it was observed during development, so
 * a set derived from it would be tuned on its implementation. D7 and D8 have no
 * set either: their original evidence is B2's and B1's, so no probe of it can
 * show the defect, which appears only in the reproduction, and any set would
 * reward the same reading as the benign twin. They are measured by rootCause
 * attribution instead. Cases absent from the map — clean cases, B2, B3, D7, D8,
 * and every held-out case — are not graded, so a missing set never counts as a miss.
 */
export const PUBLIC_GOLD_EVIDENCE_PROBES: ReadonlyMap<string, readonly string[]> = new Map<string, readonly string[]>([
  // contract-violation:analysis-method-id-query-or-count; the blocked analysis request; its count.
  ['D1', ['read_scenario_transition_log', 'read_network_events', 'count_requests']],
  // contract-violation:new-upload-body-schema; the blocked POST /upload.
  ['D2', ['read_scenario_transition_log', 'read_network_events']],
  // No s3-contract transition and no S3 request; the S3 count is zero.
  ['D3', ['read_scenario_transition_log', 'read_network_events', 'count_requests']],
  // The last analysis transition is processing; two analysis requests, then none.
  ['D4', ['read_scenario_transition_log', 'read_network_events', 'count_requests']],
  // upload-response:503; the POST /upload answered 503.
  ['B1', ['read_scenario_transition_log', 'read_network_events']],
  // contract-violation:analysis-method-id-query-or-count; the blocked analysis
  // request with an unknown query key; its count.
  ['D9', ['read_scenario_transition_log', 'read_network_events', 'count_requests']],
  // analysis-response:aborted with no contract violation; the blocked poll. The
  // low poll count is the symptom, not the cause, so count_requests is not in the set.
  ['B5', ['read_scenario_transition_log', 'read_network_events']],
])

/**
 * The evidence set for one case.
 * @param caseId - corpus case id.
 * @returns the set, or null when the case is not graded.
 */
export function goldEvidenceProbes(caseId: string): readonly string[] | null {
  return PUBLIC_GOLD_EVIDENCE_PROBES.get(caseId) ?? null
}
