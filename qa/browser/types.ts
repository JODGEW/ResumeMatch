export type ScenarioId = 'P1-01' | 'P1-02' | 'P1-03' | 'P1-04' | 'P1-05' | 'P1-06'

export type OracleStatus = 'not_run' | 'incomplete' | 'passed' | 'failed'

export type FaultInjection =
  | 'setup'
  | 'execution'
  | 'page_close_during_oracle_wait'
  | 'post_oracle_infrastructure'
  | 'persistence'
  | 'validation'
  | 'validation_report'
  | 'cleanup'

/**
 * Evaluation-only transient contract faults. Each fires at most once per
 * scenario instance and models a benign, non-reproducing failure: the request
 * is contract-legal, so it records no contract violation. Default is none, and
 * no Phase 1 scenario enables one.
 */
export type TransientFault =
  | 'upload_503_once'
  | 'analysis_interrupted_once'
  | 's3_response_500_once'
  | 'last_resume_interrupted_once'

/**
 * Marks a run as belonging to the Phase 2 evaluation corpus rather than to a
 * release check.
 *
 * A run carrying this is never release grade, no matter how clean its worktree
 * is, and it is the only thing that widens artifact validation's synthetic
 * allowlist. Release checks carry `null`, and no model-reachable surface can
 * produce one.
 */
export interface EvaluationIdentity {
  /** Corpus case identifier, such as `D1` or `B1`. */
  caseId: string
  /** Case id of the source mutation applied to the evaluation copy, or null for a benign case. */
  mutationApplied: string | null
  /** Transient contract faults configured for this run. */
  transientFaults: TransientFault[]
  /** SHA-256 over the tracked source of the evaluation copy, after any mutation. */
  sourceDigest: string
  /** SHA-256 over the generated QA build the run executed against. */
  buildDigest: string
  /**
   * Stable label for the temporary evaluation worktree. Deliberately not a
   * filesystem path: an absolute path would leak the operator's home directory
   * into evidence.
   */
  worktreeLabel: string
  /**
   * SHA-256 hashes of request bodies this case's mutation is expected to
   * produce.
   *
   * A seeded defect that changes the shape of a request produces a body the
   * closed synthetic allowlist cannot know, so its evidence is rejected and the
   * case never reaches an investigator. Declaring the hash in advance keeps the
   * allowlist closed while letting that class of defect be evaluated. Admitted
   * only when `mutationApplied` names this case; empty for every other run.
   */
  approvedRequestHashes: string[]
}

export interface RunOptions {
  artifactsRoot?: string
  headless?: boolean
  /** QA-only deterministic fault injection used by harness tests. */
  faultInjection?: FaultInjection | FaultInjection[]
  /** Evaluation-only transient contract faults; empty in every release check. */
  transientFaults?: TransientFault[]
  /** Evaluation-corpus identity; absent in every release check. */
  evaluationIdentity?: EvaluationIdentity
}

export type HttpMethod = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'OTHER'

export type BrowserResourceType =
  | 'document'
  | 'stylesheet'
  | 'image'
  | 'media'
  | 'font'
  | 'script'
  | 'texttrack'
  | 'xhr'
  | 'fetch'
  | 'eventsource'
  | 'websocket'
  | 'manifest'
  | 'other'

export interface SafetyViolation {
  code: 'SAFETY_UNEXPECTED_EGRESS' | 'SAFETY_UNEXPECTED_BROWSER_REQUEST'
  sequence: number
  relativeTimestampMs: number
  method: HttpMethod | 'WEBSOCKET'
  resourceType: BrowserResourceType
  target: string
  blockedByPlaywrightRoute: true
  reason: string
}

export interface NetworkEnforcementScope {
  http: 'playwright-browser-context-routing'
  webSocket: 'playwright-websocket-routing'
  serviceWorkers: 'blocked'
  exclusions: string[]
}

export const PLAYWRIGHT_NETWORK_ENFORCEMENT_SCOPE: NetworkEnforcementScope = {
  http: 'playwright-browser-context-routing',
  webSocket: 'playwright-websocket-routing',
  serviceWorkers: 'blocked',
  exclusions: [
    'speculative-dns-and-preconnect',
    'webrtc-stun-turn',
    'webtransport-quic',
    'chromium-background-traffic',
    'worker-websockets-outside-playwright-contract',
    'arbitrary-process-level-egress',
  ],
}

export interface RunFailure {
  phase: string
  kind: 'oracle' | 'contract' | 'safety' | 'artifact' | 'infrastructure' | 'cleanup'
  message: string
  oracleId?: string
  evidenceRefs?: string[]
}

export type NetworkOriginAlias =
  | 'local-app'
  | 'resumematch-api-sentinel'
  | 's3-sentinel'
  | 'google-fonts'
  | 'cognito'
  | 'resumematch-api-external'
  | 's3-external'
  | 'deepgram'
  | 'outreach'
  | 'unexpected'

export type NetworkRouteTemplate =
  | '/sample'
  | '/upload'
  | '/results/:analysisId'
  | '/user/last-resume'
  | '/analysis/:analysisId'
  | '/synthetic-upload'
  | '/css2'
  | '[local-build-resource]'
  | '[blocked-route]'

export type NetworkQueryKey = 'display' | 'family' | 'userId' | 'marker' | 'probe' | 'unexpected' | '[other]'

export type RequestFieldName =
  | 'fileName'
  | 'jobDescription'
  | 'existingAnalysisId'
  | 'key'
  | 'x-amz-meta-qa'
  | 'file'
  | 'multipartFormData'
  | '[other]'

export interface RequestFieldEvidence {
  name: RequestFieldName
  length: number
  sha256: string
}

export interface UploadTextEntry {
  name: string
  kind: 'text'
  value: string
  length: number
  sha256: string
}

export interface UploadFileEntry {
  name: string
  kind: 'file'
  fileName: string
  mimeType: string
  size: number
  sha256: string
  signatureHex: string
}

export type UploadEntry = UploadTextEntry | UploadFileEntry

export interface UploadObservation {
  entries: UploadEntry[]
}

export interface NetworkEvent {
  sequence: number
  relativeTimestampMs: number
  method: HttpMethod
  resourceType: BrowserResourceType
  originAlias: NetworkOriginAlias
  routeTemplate: NetworkRouteTemplate
  queryKeys: NetworkQueryKey[]
  status: number | null
  durationMs: number
  mockDecision: 'local-application' | 'fulfilled-contract' | 'fulfilled-font-css' | 'blocked'
  requestFields: RequestFieldEvidence[]
}

export interface NetworkSummary {
  resumeMatchRest: number
  cognito: number
  s3: number
  deepgram: number
  outreach: number
  unexpectedEgress: number
  locallyFulfilled: number
}

export interface ArtifactReferences {
  trace: string | null
  video: string[]
  failureScreenshot: string | null
  checkpointScreenshots: string[]
  consoleEvents: string
  pageErrors: string
  networkEvents: string
  transitionLog: string
  safetyViolations: string
}

export interface SourceIdentity {
  headCommit: string | null
  worktreeDirty: boolean | null
  exactCommittedSource: boolean
  releaseGrade: boolean
}

export interface EvidenceManifest {
  runId: string
  scenarioId: ScenarioId
  browserVersion: string
  durationMs: number
  sourceIdentity: SourceIdentity
  executionStatus: 'completed' | 'infrastructure_failed'
  oracleStatus: OracleStatus
  expectedOracleStatus: 'passed' | 'failed'
  expectationMet: boolean
  failedOracle: string | null
  failures: RunFailure[]
  artifactsAccepted: boolean
  networkEnforcementScope: NetworkEnforcementScope
  networkSummary: NetworkSummary
  artifacts: ArtifactReferences
  opaqueArtifactValidation: string[]
  evaluationIdentity: EvaluationIdentity | null
}

export interface ArtifactValidationSummary {
  status: 'passed' | 'failed'
  report: string | null
  violationCount: number
  rejectedBundleRemoved: boolean
}

export interface RunResult {
  runId: string
  scenarioId: ScenarioId
  executionStatus: 'completed' | 'infrastructure_failed'
  oracleStatus: OracleStatus
  expectedOracleStatus: 'passed' | 'failed'
  expectationMet: boolean
  failures: RunFailure[]
  failedOracle: string | null
  safetyViolations: SafetyViolation[]
  evidenceManifest: EvidenceManifest | null
  artifactValidation: ArtifactValidationSummary
  durationMs: number
}

export interface TransitionEvent {
  sequence: number
  relativeTimestampMs: number
  event: string
}
