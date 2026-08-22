import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, readdir, readFile, realpath } from 'node:fs/promises'
import path from 'node:path'

import { QA_API_ORIGIN, QA_APP_ORIGIN, QA_S3_ORIGIN } from './networkPolicy'
import { createScenario } from './scenarios'
import { PLAYWRIGHT_NETWORK_ENFORCEMENT_SCOPE } from './types'
import type {
  BrowserResourceType,
  EvaluationIdentity,
  EvidenceManifest,
  HttpMethod,
  NetworkEvent,
  NetworkOriginAlias,
  NetworkQueryKey,
  NetworkRouteTemplate,
  RequestFieldName,
  RunFailure,
  SafetyViolation,
  ScenarioId,
  TransientFault,
} from './types'
import {
  SYNTHETIC_EXISTING_FILE_NAME,
  SYNTHETIC_FILE_NAME,
  SYNTHETIC_JOB_DESCRIPTION,
  SYNTHETIC_PDF_SHA256,
  SYNTHETIC_PDF_SIZE,
  TRANSIENT_S3_FAILURE_STATUS,
  TRANSIENT_UPLOAD_FAILURE_BODY,
} from '../fixtures/data'

export type ArtifactViolationCode =
  | 'REAL_SERVICE_HOST' | 'CREDENTIAL_PATTERN' | 'NON_SYNTHETIC_EMAIL' | 'NON_SYNTHETIC_PDF'
  | 'RAW_JOB_DESCRIPTION' | 'RAW_RESUME_TEXT' | 'SENSITIVE_VALUE' | 'INVALID_ARTIFACT_FORMAT'
  | 'UNREADABLE_ARTIFACT' | 'UNREADABLE_TRACE' | 'UNKNOWN_ARTIFACT_TYPE' | 'MISSING_ARTIFACT'
  | 'UNREFERENCED_ARTIFACT' | 'UNREFERENCED_TRACE_RESOURCE' | 'INVALID_MANIFEST' | 'INVALID_ARTIFACT_SCHEMA'
  | 'INVALID_TRACE_RESOURCE'

export interface ArtifactValidationViolation { code: ArtifactViolationCode; file: string; detail: string }
export interface ArtifactValidationResult { valid: boolean; violations: ArtifactValidationViolation[] }
export interface ArtifactValidatorOptions { unzipCommand?: string; buildDirectory?: string; fixturePdfPath?: string }

const SCENARIOS = new Set<ScenarioId>(['P1-01', 'P1-02', 'P1-03', 'P1-04', 'P1-05', 'P1-06'])
const HTTP_METHODS = new Set<HttpMethod>(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'OTHER'])
const RESOURCE_TYPES = new Set<BrowserResourceType>([
  'document', 'stylesheet', 'image', 'media', 'font', 'script', 'texttrack', 'xhr', 'fetch',
  'eventsource', 'websocket', 'manifest', 'other',
])
const ORIGIN_ALIASES = new Set<NetworkOriginAlias>([
  'local-app', 'resumematch-api-sentinel', 's3-sentinel', 'google-fonts', 'cognito',
  'resumematch-api-external', 's3-external', 'deepgram', 'outreach', 'unexpected',
])
const ROUTE_TEMPLATES = new Set<NetworkRouteTemplate>([
  '/sample', '/upload', '/results/:analysisId', '/user/last-resume', '/analysis/:analysisId',
  '/synthetic-upload', '/css2', '[local-build-resource]', '[blocked-route]',
])
const QUERY_KEYS = new Set<NetworkQueryKey>(['display', 'family', 'userId', 'marker', 'probe', 'unexpected', '[other]'])
const REQUEST_FIELD_NAMES = new Set<RequestFieldName>([
  'fileName', 'jobDescription', 'existingAnalysisId', 'key', 'x-amz-meta-qa', 'file', 'multipartFormData', '[other]',
])
const TRANSIENT_FAULTS = new Set<TransientFault>([
  'upload_503_once', 'analysis_interrupted_once', 's3_response_500_once', 'last_resume_interrupted_once',
])
const MOCK_DECISIONS = new Set<NetworkEvent['mockDecision']>(['local-application', 'fulfilled-contract', 'fulfilled-font-css', 'blocked'])
const SYNTHETIC_EMAIL_DOMAINS = new Set(['qa.invalid', 'example.com'])
const SYNTHETIC_PDF_NAMES = new Set(['qa-synthetic-resume.pdf', 'qa-synthetic-existing-resume.pdf', 'sample_resume_jordan_reyes.pdf'])
const FIXED_JSON = new Set(['manifest.json', 'console-events.json', 'page-errors.json', 'network-events.json', 'scenario-transitions.json', 'safety-violations.json'])
const BODY_FREE_NORMALIZED_JSON = new Set(FIXED_JSON)
const OPAQUE_VALIDATION = [
  'Known API and S3 request bodies, mocked responses, and local build resources are positively validated against independent synthetic inputs',
  'PNG, JPEG, and WebM receive format-signature checks only; this is not semantic content redaction or OCR',
]
const FAILURE_PHASES = new Set([
  'scenario', 'scenario_execution', 'post_oracle_execution', 'contract_router', 'network_policy', 'oracle',
  'failure_capture', 'setup', 'trace_finalization', 'context_close', 'browser_close', 'cleanup',
  'runtime_cleanup', 'artifact_validation', 'artifact_persistence', 'rejected_bundle_cleanup',
])

const RULES: ReadonlyArray<{ code: ArtifactViolationCode; detail: string; matches(value: string): boolean }> = [
  { code: 'REAL_SERVICE_HOST', detail: 'Known production or external-service host detected', matches: value => /(?:resumematchapp\.com|(?:[a-z0-9-]+\.)*(?:amazonaws\.com|amazoncognito\.com|cloudfront\.net|deepgram\.com|stripe\.com|hunter\.io|apollo\.io))/i.test(value) },
  { code: 'CREDENTIAL_PATTERN', detail: 'Token-like or credential-like pattern detected', matches: value => /(?:\bAKIA[A-Z0-9]{16}\b|\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b|\b(?:sk_(?:live|test)|dg)_[A-Za-z0-9_-]{12,}\b|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/.test(value) },
  {
    code: 'NON_SYNTHETIC_EMAIL', detail: 'Non-synthetic email address detected', matches: value => {
      const emails = value.match(/[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})/gi) ?? []
      return emails.some(email => /^page@[a-f0-9]+-\d+\.jpeg$/i.test(email) ? false : !SYNTHETIC_EMAIL_DOMAINS.has(email.split('@').at(-1)?.toLowerCase() ?? ''))
    },
  },
  {
    code: 'NON_SYNTHETIC_PDF', detail: 'Non-synthetic PDF filename detected', matches: value => {
      const fieldNames = [...value.matchAll(/"(?:fileName|resumeFileName)"\s*:\s*"((?:\\.|[^"\\])*)"/gi)].map(match => match[1])
      return [...(value.match(/[A-Z0-9][A-Z0-9_.-]*\.pdf/gi) ?? []), ...fieldNames].some(name => !SYNTHETIC_PDF_NAMES.has(name.trim().toLowerCase()))
    },
  },
  { code: 'RAW_RESUME_TEXT', detail: 'Raw resume text detected', matches: value => /"(?:originalText|suggestedText|resumeText)"\s*:\s*"(?!\s*")/i.test(value) },
  {
    code: 'SENSITIVE_VALUE', detail: 'Unredacted authorization, cookie, API-key, or presigned value detected', matches: value => {
      const fields = value.matchAll(/"(authorization|cookie|set-cookie|apiKey|api_key|x-api-key|presignedUrl)"\s*:\s*"((?:\\.|[^"\\])*)"/gi)
      for (const match of fields) {
        const field = match[1].toLowerCase(); const fieldValue = match[2]
        if ((field === 'apikey' || field === 'api_key' || field === 'x-api-key') && fieldValue === 'qa-synthetic-api-key-not-secret') continue
        if (field === 'presignedurl' && fieldValue.startsWith('https://s3.qa.invalid/')) continue
        if (fieldValue === '[REDACTED]' || fieldValue === '') continue
        return true
      }
      return /(?:x-amz-(?:signature|credential|security-token))\s*[=:]\s*(?!\[REDACTED\])[^&"\s]+/i.test(value) || /Bearer\s+(?!\[REDACTED\])[A-Za-z0-9._~+/=-]+/i.test(value)
    },
  },
]

interface TraceRequestRole { kind: 'request'; url: string; method: string; mimeType: string }
interface TraceResponseRole { kind: 'response'; url: string; status: number; mimeType: string }
interface TraceScreenshotRole { kind: 'screenshot' }
type TraceResourceRole = TraceRequestRole | TraceResponseRole | TraceScreenshotRole

function addRules(value: string, file: string, violations: ArtifactValidationViolation[]): void {
  for (const rule of RULES) if (rule.matches(value)) violations.push({ code: rule.code, file, detail: rule.detail })
}

function exactObject(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join(',') === [...keys].sort().join(',')
}

function finiteNonnegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function safeReference(reference: string): boolean {
  return reference.length > 0 && !path.isAbsolute(reference) && !reference.split(/[\\/]/).includes('..')
}

function manifestReferences(manifest: EvidenceManifest): string[] {
  const artifacts = manifest.artifacts
  return [
    ...(artifacts.trace ? [artifacts.trace] : []), ...artifacts.video,
    ...(artifacts.failureScreenshot ? [artifacts.failureScreenshot] : []), ...artifacts.checkpointScreenshots,
    artifacts.consoleEvents, artifacts.pageErrors, artifacts.networkEvents, artifacts.transitionLog, artifacts.safetyViolations,
  ]
}

async function listFiles(directory: string, root = directory): Promise<string[]> {
  const output: string[] = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name)
    if (entry.isSymbolicLink()) output.push(path.relative(root, fullPath))
    else if (entry.isDirectory()) output.push(...await listFiles(fullPath, root))
    else output.push(path.relative(root, fullPath))
  }
  return output.sort()
}

function validKnownPath(relativePath: string): boolean {
  if (FIXED_JSON.has(relativePath) || relativePath === 'trace.zip' || relativePath === 'failure.png') return true
  return /^checkpoint-[a-z0-9-]+\.png$/.test(relativePath) || /^video\/[a-z0-9-]+\.webm$/i.test(relativePath)
}

function validFailure(value: unknown): value is RunFailure {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as Record<string, unknown>
  if (!FAILURE_PHASES.has(String(item.phase)) || !['oracle', 'contract', 'safety', 'artifact', 'infrastructure', 'cleanup'].includes(String(item.kind)) || typeof item.message !== 'string') return false
  const expectedKeys = ['phase', 'kind', 'message', ...(item.oracleId === undefined ? [] : ['oracleId']), ...(item.evidenceRefs === undefined ? [] : ['evidenceRefs'])]
  if (!exactObject(item, expectedKeys)) return false
  if (item.kind === 'oracle') {
    if (typeof item.oracleId !== 'string' || !/^[A-Z0-9_-]+$/.test(item.oracleId)) return false
  } else if (item.oracleId !== undefined) return false
  return item.evidenceRefs === undefined || (Array.isArray(item.evidenceRefs) && item.evidenceRefs.every(ref => typeof ref === 'string' && safeReference(ref)))
}

function validArtifactReferences(value: unknown): value is EvidenceManifest['artifacts'] {
  if (!exactObject(value, ['trace', 'video', 'failureScreenshot', 'checkpointScreenshots', 'consoleEvents', 'pageErrors', 'networkEvents', 'transitionLog', 'safetyViolations'])) return false
  const strings = ['consoleEvents', 'pageErrors', 'networkEvents', 'transitionLog', 'safetyViolations'] as const
  if (!strings.every(key => typeof value[key] === 'string' && safeReference(value[key] as string))) return false
  if (value.trace !== null && (typeof value.trace !== 'string' || !safeReference(value.trace))) return false
  if (value.failureScreenshot !== null && (typeof value.failureScreenshot !== 'string' || !safeReference(value.failureScreenshot))) return false
  return Array.isArray(value.video) && value.video.every(item => typeof item === 'string' && safeReference(item))
    && Array.isArray(value.checkpointScreenshots) && value.checkpointScreenshots.every(item => typeof item === 'string' && safeReference(item))
}

function validEvaluationIdentity(value: unknown): value is EvaluationIdentity {
  if (!exactObject(value, ['caseId', 'mutationApplied', 'transientFaults', 'sourceDigest', 'buildDigest', 'worktreeLabel'])) return false
  if (typeof value.caseId !== 'string' || !/^[A-Z][0-9]{1,2}$/.test(value.caseId)) return false
  if (value.mutationApplied !== null && (typeof value.mutationApplied !== 'string' || !/^[A-Z][0-9]{1,2}$/.test(value.mutationApplied))) return false
  if (!Array.isArray(value.transientFaults) || !value.transientFaults.every(item => TRANSIENT_FAULTS.has(item as TransientFault))) return false
  if (new Set(value.transientFaults).size !== value.transientFaults.length) return false
  if (typeof value.sourceDigest !== 'string' || !/^[0-9a-f]{64}$/.test(value.sourceDigest)) return false
  if (typeof value.buildDigest !== 'string' || !/^[0-9a-f]{64}$/.test(value.buildDigest)) return false
  return typeof value.worktreeLabel === 'string' && /^[a-z0-9-]{1,64}$/.test(value.worktreeLabel)
}

/**
 * The transient faults this bundle is allowed to have exercised.
 *
 * A release bundle carries no evaluation identity and therefore no faults, so
 * every conditional allowlist entry below collapses to the Phase 1 set.
 * @param identity - the manifest's evaluation identity, or null.
 * @returns the configured faults, empty for a release bundle.
 */
function allowedFaults(identity: EvaluationIdentity | null): ReadonlySet<TransientFault> {
  return new Set(identity?.transientFaults ?? [])
}

function validP106ExpectedFailures(failures: RunFailure[]): boolean {
  return failures.filter(item => item.kind === 'safety').length === 3
    && failures.filter(item => item.kind === 'oracle' && item.oracleId === 'SAFETY_UNEXPECTED_EGRESS').length === 1
    && failures.every(item => item.kind === 'safety' || (item.kind === 'oracle' && item.oracleId === 'SAFETY_UNEXPECTED_EGRESS'))
}

function validateManifestShape(value: unknown): value is EvidenceManifest {
  const keys = [
    'runId', 'scenarioId', 'browserVersion', 'durationMs', 'sourceIdentity', 'executionStatus', 'oracleStatus',
    'expectedOracleStatus', 'expectationMet', 'failedOracle', 'failures', 'artifactsAccepted',
    'networkEnforcementScope', 'networkSummary', 'artifacts', 'opaqueArtifactValidation', 'evaluationIdentity',
  ]
  if (!exactObject(value, keys)) return false
  if (!SCENARIOS.has(value.scenarioId as ScenarioId) || typeof value.runId !== 'string') return false
  const scenarioId = value.scenarioId as ScenarioId
  if (!new RegExp(`^${scenarioId.toLowerCase()}-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`).test(value.runId)) return false
  if (typeof value.browserVersion !== 'string' || value.browserVersion.length === 0 || !finiteNonnegative(value.durationMs)) return false
  if (!['completed', 'infrastructure_failed'].includes(String(value.executionStatus))) return false
  if (!['not_run', 'incomplete', 'passed', 'failed'].includes(String(value.oracleStatus))) return false
  const expectedOracleStatus = scenarioId === 'P1-06' ? 'failed' : 'passed'
  if (value.expectedOracleStatus !== expectedOracleStatus || typeof value.expectationMet !== 'boolean' || typeof value.artifactsAccepted !== 'boolean') return false
  if (value.failedOracle !== null && (typeof value.failedOracle !== 'string' || !/^[A-Z0-9_-]+$/.test(value.failedOracle))) return false
  if (!Array.isArray(value.failures) || !value.failures.every(validFailure)) return false
  const failures = value.failures as RunFailure[]
  const primaryOracleFailure = failures.find(item => item.kind === 'oracle')
  if ((primaryOracleFailure?.oracleId ?? null) !== value.failedOracle) return false
  if (value.oracleStatus === 'failed' ? !primaryOracleFailure : !!primaryOracleFailure) return false
  if (!exactObject(value.sourceIdentity, ['headCommit', 'worktreeDirty', 'exactCommittedSource', 'releaseGrade'])) return false
  const source = value.sourceIdentity
  const validCommit = typeof source.headCommit === 'string' && /^[0-9a-f]{40}$/.test(source.headCommit)
  if (source.headCommit === null) {
    if (source.worktreeDirty !== null || source.exactCommittedSource !== false || source.releaseGrade !== false) return false
  } else if (!validCommit || typeof source.worktreeDirty !== 'boolean' || typeof source.exactCommittedSource !== 'boolean' || typeof source.releaseGrade !== 'boolean') return false
  if (source.worktreeDirty === true && (source.exactCommittedSource !== false || source.releaseGrade !== false)) return false
  if (source.exactCommittedSource === true && (!validCommit || source.worktreeDirty !== false)) return false
  if (value.evaluationIdentity !== null && !validEvaluationIdentity(value.evaluationIdentity)) return false
  // Both directions of the evaluation/release split: an evaluation bundle can
  // never be release grade, and a release-grade bundle can never carry an
  // evaluation identity.
  const releaseGrade = source.exactCommittedSource === true && value.executionStatus === 'completed'
    && value.artifactsAccepted === true && value.expectationMet === true && value.evaluationIdentity === null
  if (source.releaseGrade !== releaseGrade) return false
  if (source.releaseGrade === true && value.evaluationIdentity !== null) return false
  if (value.executionStatus === 'infrastructure_failed' && value.expectationMet) return false
  if ((value.oracleStatus === 'not_run' || value.oracleStatus === 'incomplete') && value.expectationMet) return false
  if (value.artifactsAccepted === false && value.expectationMet) return false
  if (failures.some(item => item.kind === 'infrastructure' || item.kind === 'artifact' || item.kind === 'cleanup') && value.expectationMet) return false
  if (value.expectationMet) {
    if (value.executionStatus !== 'completed' || value.artifactsAccepted !== true || value.oracleStatus !== expectedOracleStatus) return false
    if (scenarioId === 'P1-06' ? !validP106ExpectedFailures(failures) : failures.length !== 0) return false
  }
  if (!validArtifactReferences(value.artifacts)) return false
  if (JSON.stringify(value.networkEnforcementScope) !== JSON.stringify(PLAYWRIGHT_NETWORK_ENFORCEMENT_SCOPE)) return false
  if (!exactObject(value.networkSummary, ['resumeMatchRest', 'cognito', 's3', 'deepgram', 'outreach', 'unexpectedEgress', 'locallyFulfilled'])) return false
  if (!Object.values(value.networkSummary).every(item => Number.isInteger(item) && (item as number) >= 0)) return false
  return Array.isArray(value.opaqueArtifactValidation)
    && JSON.stringify(value.opaqueArtifactValidation) === JSON.stringify(OPAQUE_VALIDATION)
}

function exactQueryKeys(keys: NetworkQueryKey[], expected: NetworkQueryKey[]): boolean {
  return JSON.stringify(keys) === JSON.stringify(expected)
}

function validRequestField(value: unknown): boolean {
  return exactObject(value, ['name', 'length', 'sha256'])
    && REQUEST_FIELD_NAMES.has(value.name as RequestFieldName)
    && Number.isInteger(value.length) && (value.length as number) >= 0
    && typeof value.sha256 === 'string' && /^[0-9a-f]{64}$/.test(value.sha256)
}

function expectedField(name: RequestFieldName, value: string | Buffer): { name: RequestFieldName; length: number; sha256: string } {
  const bytes = typeof value === 'string' ? Buffer.from(value) : value
  return { name, length: bytes.length, sha256: sha256(bytes) }
}

function exactRequestFields(actual: NetworkEvent['requestFields'], alternatives: NetworkEvent['requestFields'][]): boolean {
  return alternatives.some(expected => JSON.stringify(actual) === JSON.stringify(expected))
}

function validNetworkEvent(value: unknown, identity: EvaluationIdentity | null): value is NetworkEvent {
  const keys = ['durationMs', 'method', 'mockDecision', 'originAlias', 'queryKeys', 'relativeTimestampMs', 'requestFields', 'resourceType', 'routeTemplate', 'sequence', 'status']
  if (!exactObject(value, keys)) return false
  if (!Number.isInteger(value.sequence) || (value.sequence as number) < 1 || !finiteNonnegative(value.relativeTimestampMs) || !finiteNonnegative(value.durationMs)) return false
  if (!HTTP_METHODS.has(value.method as HttpMethod) || !RESOURCE_TYPES.has(value.resourceType as BrowserResourceType)) return false
  if (!ORIGIN_ALIASES.has(value.originAlias as NetworkOriginAlias) || !ROUTE_TEMPLATES.has(value.routeTemplate as NetworkRouteTemplate)) return false
  if (!MOCK_DECISIONS.has(value.mockDecision as NetworkEvent['mockDecision'])) return false
  if (!Array.isArray(value.queryKeys) || !value.queryKeys.every(item => QUERY_KEYS.has(item as NetworkQueryKey)) || new Set(value.queryKeys).size !== value.queryKeys.length) return false
  if (!Array.isArray(value.requestFields) || !value.requestFields.every(validRequestField)) return false
  const event = value as unknown as NetworkEvent
  if (event.mockDecision === 'blocked' ? event.status !== null : !Number.isInteger(event.status)) return false
  if (event.originAlias === 'local-app') {
    if (event.mockDecision === 'blocked') return event.routeTemplate === '[blocked-route]'
    if (event.mockDecision !== 'local-application' || !exactQueryKeys(event.queryKeys, []) || event.requestFields.length !== 0) return false
    if (event.routeTemplate === '[local-build-resource]') return ['GET', 'HEAD'].includes(event.method) && event.resourceType !== 'xhr' && event.resourceType !== 'fetch'
    return ['/sample', '/upload', '/results/:analysisId'].includes(event.routeTemplate) && event.method === 'GET' && event.resourceType === 'document'
  }
  if (event.originAlias === 'google-fonts') {
    return event.routeTemplate === '/css2' && event.method === 'GET' && event.resourceType === 'stylesheet'
      && event.mockDecision === 'fulfilled-font-css' && event.status === 200 && exactQueryKeys(event.queryKeys, ['display', 'family'])
      && event.requestFields.length === 0
  }
  if (event.originAlias === 'resumematch-api-sentinel') {
    if (event.routeTemplate === '/user/last-resume' && event.method !== 'GET') return false
    if (event.routeTemplate === '/analysis/:analysisId' && event.method !== 'GET') return false
    if (event.routeTemplate === '/upload' && event.method !== 'POST') return false
    if (event.mockDecision === 'blocked') return event.status === null
    if (event.mockDecision !== 'fulfilled-contract' || event.resourceType !== 'xhr') return false
    if (event.routeTemplate === '/user/last-resume') return event.method === 'GET' && exactQueryKeys(event.queryKeys, []) && event.requestFields.length === 0
    if (event.routeTemplate === '/analysis/:analysisId') return event.method === 'GET' && exactQueryKeys(event.queryKeys, ['userId']) && event.requestFields.length === 0
    if (event.routeTemplate === '/upload') {
      return event.method === 'POST' && exactQueryKeys(event.queryKeys, [])
        && exactRequestFields(event.requestFields, [
          [expectedField('fileName', SYNTHETIC_FILE_NAME), expectedField('jobDescription', SYNTHETIC_JOB_DESCRIPTION)],
          [expectedField('existingAnalysisId', 'qa-existing-source-1'), expectedField('jobDescription', SYNTHETIC_JOB_DESCRIPTION)],
        ])
    }
    return false
  }
  if (event.originAlias === 's3-sentinel') {
    if (event.routeTemplate === '/synthetic-upload' && event.method !== 'POST') return false
    if (event.mockDecision === 'blocked') return event.status === null
    return event.routeTemplate === '/synthetic-upload' && event.method === 'POST' && event.resourceType === 'fetch'
      && event.mockDecision === 'fulfilled-contract'
      && (event.status === 204
        || (event.status === TRANSIENT_S3_FAILURE_STATUS && allowedFaults(identity).has('s3_response_500_once')))
      && exactQueryKeys(event.queryKeys, [])
      && exactRequestFields(event.requestFields, [[
        expectedField('key', 'qa-synthetic/qa-new-1/qa-synthetic-resume.pdf'),
        expectedField('x-amz-meta-qa', 'qa-synthetic'),
        { name: 'file', length: SYNTHETIC_PDF_SIZE, sha256: SYNTHETIC_PDF_SHA256 },
      ]])
  }
  return event.routeTemplate === '[blocked-route]' && event.mockDecision === 'blocked' && event.status === null
}

function validSafetyViolation(value: unknown): value is SafetyViolation {
  const keys = ['blockedByPlaywrightRoute', 'code', 'method', 'reason', 'relativeTimestampMs', 'resourceType', 'sequence', 'target']
  if (!exactObject(value, keys)) return false
  return ['SAFETY_UNEXPECTED_EGRESS', 'SAFETY_UNEXPECTED_BROWSER_REQUEST'].includes(String(value.code))
    && Number.isInteger(value.sequence) && (value.sequence as number) >= 1
    && finiteNonnegative(value.relativeTimestampMs)
    && (HTTP_METHODS.has(value.method as HttpMethod) || value.method === 'WEBSOCKET')
    && RESOURCE_TYPES.has(value.resourceType as BrowserResourceType)
    && typeof value.target === 'string' && value.blockedByPlaywrightRoute === true && typeof value.reason === 'string'
}

function validateJsonSchema(file: string, value: unknown, violations: ArtifactValidationViolation[], identity: EvaluationIdentity | null): void {
  const fail = () => violations.push({ code: 'INVALID_ARTIFACT_SCHEMA', file, detail: `Invalid closed schema for ${file}` })
  if (file === 'manifest.json') { if (!validateManifestShape(value)) fail(); return }
  if (!Array.isArray(value)) { fail(); return }
  if (file === 'console-events.json') {
    if (value.some(item => !exactObject(item, ['type', 'text']) || typeof item.type !== 'string' || typeof item.text !== 'string')) fail()
  } else if (file === 'page-errors.json') {
    if (value.some(item => typeof item !== 'string')) fail()
  } else if (file === 'scenario-transitions.json') {
    if (value.some(item => !exactObject(item, ['event', 'relativeTimestampMs', 'sequence']) || typeof item.event !== 'string'
      || !Number.isInteger(item.sequence) || (item.sequence as number) < 1 || !finiteNonnegative(item.relativeTimestampMs))) fail()
  } else if (file === 'safety-violations.json') {
    if (value.some(item => !validSafetyViolation(item))) fail()
  } else if (file === 'network-events.json' && value.some(item => !validNetworkEvent(item, identity))) fail()
}

function sha256(value: Buffer | string): string { return createHash('sha256').update(value).digest('hex') }
function sha1(value: Buffer): string { return createHash('sha1').update(value).digest('hex') }
function canonicalJson(value: unknown): Buffer { return Buffer.from(JSON.stringify(value)) }

function canonicalApiRequestHashes(pathname: string): Set<string> {
  if (pathname !== '/upload') return new Set()
  return new Set([
    sha256(canonicalJson({ fileName: SYNTHETIC_FILE_NAME, jobDescription: SYNTHETIC_JOB_DESCRIPTION })),
    sha256(canonicalJson({ existingAnalysisId: 'qa-existing-source-1', jobDescription: SYNTHETIC_JOB_DESCRIPTION })),
  ])
}

/**
 * The exact response bodies a bundle may hold for one API path.
 *
 * Exported for the reverse test that pins the release set: with a null
 * evaluation identity the returned set is byte-for-byte the Phase 1 set, so a
 * transient failure body recorded by a run that declared no fault is rejected.
 * @param pathname - the sentinel API path.
 * @param identity - the manifest's evaluation identity, or null.
 * @returns SHA-256 hashes of every allowed canonical body.
 */
export function canonicalApiResponseHashes(pathname: string, identity: EvaluationIdentity | null): Set<string> {
  if (pathname === '/user/last-resume') return new Set([
    sha256(canonicalJson({ lastResume: null })),
    sha256(canonicalJson({ lastResume: { analysisId: 'qa-existing-source-1', fileName: SYNTHETIC_EXISTING_FILE_NAME, uploadedAt: '2026-01-14T12:00:00Z' } })),
  ])
  if (pathname === '/upload') return new Set([
    sha256(canonicalJson({
      presignedUrl: `${QA_S3_ORIGIN}/synthetic-upload`,
      presignedFields: { key: 'qa-synthetic/qa-new-1/qa-synthetic-resume.pdf', 'x-amz-meta-qa': 'qa-synthetic' },
      analysisId: 'qa-new-1', s3Key: 'qa-synthetic/qa-new-1/qa-synthetic-resume.pdf',
    })),
    sha256(canonicalJson({ analysisId: 'qa-reuse-1', reused: true, presignedUrl: null, presignedFields: null })),
    // Admitted only for a run that declared the matching evaluation fault.
    ...allowedFaults(identity).has('upload_503_once') ? [sha256(canonicalJson(TRANSIENT_UPLOAD_FAILURE_BODY))] : [],
  ])
  if (/^\/analysis\/qa-(?:new|reuse|failed|timeout)-1$/.test(pathname)) {
    const hashes = new Set<string>()
    for (const id of ['P1-02', 'P1-03', 'P1-04', 'P1-05'] as const) {
      for (const response of createScenario(id).analysisResponses) hashes.add(sha256(canonicalJson(response)))
    }
    return hashes
  }
  return new Set()
}

function splitBuffer(value: Buffer, delimiter: Buffer): Buffer[] {
  const parts: Buffer[] = []
  let cursor = 0
  while (cursor <= value.length) {
    const index = value.indexOf(delimiter, cursor)
    if (index === -1) { parts.push(value.subarray(cursor)); break }
    parts.push(value.subarray(cursor, index)); cursor = index + delimiter.length
  }
  return parts
}

function validSyntheticMultipart(body: Buffer, mimeType: string, expectedPdf: Buffer, observedSyntheticUpload: boolean): boolean {
  const boundary = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(mimeType)?.slice(1).find(Boolean)
  if (!boundary) return false
  const entries: Array<{ name: string; fileName: string | null; mimeType: string | null; body: Buffer }> = []
  for (let part of splitBuffer(body, Buffer.from(`--${boundary}`)).slice(1)) {
    if (part.subarray(0, 2).toString() === '--') continue
    if (part.subarray(0, 2).toString() === '\r\n') part = part.subarray(2)
    if (part.subarray(-2).toString() === '\r\n') part = part.subarray(0, -2)
    if (part.length === 0) continue
    const separator = part.indexOf(Buffer.from('\r\n\r\n'))
    if (separator < 0) return false
    const headers = part.subarray(0, separator).toString('utf8')
    const disposition = /content-disposition:\s*form-data;\s*name="([^"]+)"(?:;\s*filename="([^"]*)")?/i.exec(headers)
    if (!disposition) return false
    entries.push({
      name: disposition[1], fileName: disposition[2] ?? null,
      mimeType: /content-type:\s*([^\r\n]+)/i.exec(headers)?.[1].trim() ?? null,
      body: part.subarray(separator + 4),
    })
  }
  if (entries.length !== 3 || new Set(entries.map(entry => entry.name)).size !== 3) return false
  const key = entries.find(entry => entry.name === 'key')
  const marker = entries.find(entry => entry.name === 'x-amz-meta-qa')
  const file = entries.find(entry => entry.name === 'file')
  const fileBytesMatch = !!file && (
    (file.body.length === 0 && observedSyntheticUpload)
    || (
      file.body.length === SYNTHETIC_PDF_SIZE
      && sha256(file.body) === SYNTHETIC_PDF_SHA256
      && file.body.equals(expectedPdf)
    )
  )
  return key?.fileName === null && key.body.toString() === 'qa-synthetic/qa-new-1/qa-synthetic-resume.pdf'
    && marker?.fileName === null && marker.body.toString() === 'qa-synthetic'
    && file?.fileName === SYNTHETIC_FILE_NAME && file.mimeType === 'application/pdf'
    && fileBytesMatch
}

function parseJsonLines(text: string): Record<string, unknown>[] {
  return text.split('\n').filter(line => line.trim().length > 0).map(line => {
    const parsed: unknown = JSON.parse(line)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid trace record')
    return parsed as Record<string, unknown>
  })
}

function addTraceReference(references: Map<string, TraceResourceRole[]>, name: unknown, role: TraceResourceRole): void {
  if (typeof name !== 'string' || name.length === 0 || name.includes('/') || name.includes('\\')) throw new Error('invalid trace resource reference')
  references.set(name, [...(references.get(name) ?? []), role])
}

function collectTraceReferences(traceRecords: Record<string, unknown>[], networkRecords: Record<string, unknown>[]): Map<string, TraceResourceRole[]> {
  const references = new Map<string, TraceResourceRole[]>()
  for (const record of traceRecords) {
    if (record.type === 'screencast-frame') addTraceReference(references, record.sha1, { kind: 'screenshot' })
    if (record.type === 'frame-snapshot') {
      const snapshot = record.snapshot as { resourceOverrides?: Array<{ url?: unknown; sha1?: unknown }> } | undefined
      for (const override of snapshot?.resourceOverrides ?? []) {
        if (typeof override.url !== 'string') throw new Error('unclassifiable frame resource')
        addTraceReference(references, override.sha1, { kind: 'response', url: override.url, status: 200, mimeType: '' })
      }
    }
  }
  for (const record of networkRecords) {
    if (record.type !== 'resource-snapshot') continue
    const snapshot = record.snapshot as {
      request?: { url?: unknown; method?: unknown; postData?: { _sha1?: unknown; mimeType?: unknown } }
      response?: { status?: unknown; content?: { _sha1?: unknown; mimeType?: unknown } }
    } | undefined
    const request = snapshot?.request; const response = snapshot?.response
    if (!request || typeof request.url !== 'string' || typeof request.method !== 'string') throw new Error('unclassifiable network resource')
    if (request.postData?._sha1 !== undefined) {
      addTraceReference(references, request.postData._sha1, { kind: 'request', url: request.url, method: request.method, mimeType: String(request.postData.mimeType ?? '') })
    }
    if (response?.content?._sha1 !== undefined) {
      if (typeof response.status !== 'number') throw new Error('unclassifiable response resource')
      addTraceReference(references, response.content._sha1, { kind: 'response', url: request.url, status: response.status, mimeType: String(response.content.mimeType ?? '') })
    }
  }
  return references
}

async function validateLocalBuildResource(body: Buffer, url: URL, buildDirectory: string): Promise<boolean> {
  const buildRoot = await realpath(buildDirectory)
  const documentPath = /^\/(?:sample|upload)$/.test(url.pathname) || /^\/results\/qa-(?:new|reuse|failed|timeout)-1$/.test(url.pathname)
  const relative = documentPath ? 'index.html' : url.pathname.replace(/^\//, '')
  if (!relative || relative.split('/').includes('..')) return false
  const target = path.join(buildRoot, relative)
  const stat = await lstat(target)
  if (stat.isSymbolicLink() || !stat.isFile()) return false
  const resolved = await realpath(target)
  if (resolved !== target || (!resolved.startsWith(`${buildRoot}${path.sep}`) && resolved !== buildRoot)) return false
  return body.equals(await readFile(resolved))
}

async function validateTraceRole(
  body: Buffer,
  resourceName: string,
  role: TraceResourceRole,
  options: Required<Pick<ArtifactValidatorOptions, 'buildDirectory' | 'fixturePdfPath'>> & {
    observedSyntheticUpload: boolean
    evaluationIdentity: EvaluationIdentity | null
  },
): Promise<boolean> {
  if (role.kind === 'screenshot') return resourceName.endsWith('.jpeg') && body.subarray(0, 3).toString('hex') === 'ffd8ff'
  const url = new URL(role.url)
  if (role.kind === 'request') {
    if (url.origin === QA_API_ORIGIN && role.method === 'POST' && url.search === '') return canonicalApiRequestHashes(url.pathname).has(sha256(body))
    if (url.origin === QA_S3_ORIGIN && url.pathname === '/synthetic-upload' && url.search === '' && role.method === 'POST') {
      return validSyntheticMultipart(body, role.mimeType, await readFile(options.fixturePdfPath), options.observedSyntheticUpload)
    }
    return false
  }
  if (url.origin === QA_APP_ORIGIN) return validateLocalBuildResource(body, url, options.buildDirectory)
  if (url.origin === 'https://fonts.googleapis.com' && url.pathname === '/css2') return body.length === 0
  if (url.origin === QA_API_ORIGIN) return canonicalApiResponseHashes(url.pathname, options.evaluationIdentity).has(sha256(body))
  if (url.origin === QA_S3_ORIGIN && url.pathname === '/synthetic-upload') return body.length === 0
  return false
}

async function inspectTrace(
  filePath: string,
  relativePath: string,
  violations: ArtifactValidationViolation[],
  options: ArtifactValidatorOptions,
  observedSyntheticUpload: boolean,
  evaluationIdentity: EvaluationIdentity | null,
): Promise<void> {
  try {
    if ((await readFile(filePath)).subarray(0, 2).toString('utf8') !== 'PK') throw new Error('invalid ZIP signature')
    const command = options.unzipCommand ?? 'unzip'
    const textOptions = { encoding: 'utf8' as const, maxBuffer: 64 * 1024 * 1024, env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' }, stdio: ['ignore', 'pipe', 'pipe'] as ['ignore', 'pipe', 'pipe'] }
    const bufferOptions = { maxBuffer: 64 * 1024 * 1024, env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' }, stdio: ['ignore', 'pipe', 'pipe'] as ['ignore', 'pipe', 'pipe'] }
    const entries = execFileSync(command, ['-Z1', filePath], textOptions).split('\n').filter(Boolean)
    if (!entries.includes('trace.trace') || !entries.includes('trace.network')) throw new Error('required trace records missing')
    if (entries.some(entry => entry.startsWith('/') || entry.split('/').includes('..'))) throw new Error('unsafe ZIP entry')
    if (entries.some(entry => !['trace.trace', 'trace.network', 'trace.stacks', 'resources/'].includes(entry) && !/^resources\/[A-Za-z0-9@._-]+$/.test(entry))) throw new Error('unsupported trace entry')
    const traceText = execFileSync(command, ['-p', filePath, 'trace.trace'], textOptions)
    const networkText = execFileSync(command, ['-p', filePath, 'trace.network'], textOptions)
    addRules(`${traceText}\n${networkText}`, `${relativePath}:trace-records`, violations)
    const references = collectTraceReferences(parseJsonLines(traceText), parseJsonLines(networkText))
    const resources = entries.filter(entry => /^resources\/[A-Za-z0-9@._-]+$/.test(entry))
    const resourceNames = new Set(resources.map(entry => entry.slice('resources/'.length)))
    for (const name of references.keys()) {
      if (!resourceNames.has(name)) violations.push({ code: 'MISSING_ARTIFACT', file: `${relativePath}:resources/${name}`, detail: 'Trace resource reference is missing' })
    }
    const resolvedOptions = {
      buildDirectory: options.buildDirectory ?? path.join(process.cwd(), '.qa-dist'),
      fixturePdfPath: options.fixturePdfPath ?? path.join(process.cwd(), 'qa', 'fixtures', SYNTHETIC_FILE_NAME),
      observedSyntheticUpload,
      evaluationIdentity,
    }
    for (const entry of resources) {
      const name = entry.slice('resources/'.length)
      const roles = references.get(name)
      if (!roles?.length) {
        violations.push({ code: 'UNREFERENCED_TRACE_RESOURCE', file: `${relativePath}:${entry}`, detail: 'Trace resource is not referenced by any trace event' })
        continue
      }
      const body = execFileSync(command, ['-p', filePath, entry], bufferOptions)
      if (!roles.some(role => role.kind === 'screenshot') && /^[0-9a-f]{40}\./.test(name) && !name.startsWith(`${sha1(body)}.`)) {
        violations.push({ code: 'INVALID_TRACE_RESOURCE', file: `${relativePath}:${entry}`, detail: 'Trace content-addressed name does not match the resource bytes' })
        continue
      }
      for (const role of roles) {
        if (!await validateTraceRole(body, name, role, resolvedOptions)) {
          violations.push({ code: 'INVALID_TRACE_RESOURCE', file: `${relativePath}:${entry}`, detail: `Trace ${role.kind} resource is not an independently approved synthetic or build resource` })
          break
        }
      }
    }
  } catch {
    violations.push({ code: 'UNREADABLE_TRACE', file: relativePath, detail: 'Could not inspect and positively classify the Playwright trace' })
  }
}

function stringLeaves(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(stringLeaves)
  if (value && typeof value === 'object') return Object.values(value).flatMap(stringLeaves)
  return []
}

function rejectNormalizedRawContent(
  value: unknown,
  file: string,
  violations: ArtifactValidationViolation[],
  prohibitBodyBearingProperties: boolean,
): void {
  const leaves = stringLeaves(value)
  if (leaves.some(text => text.includes(SYNTHETIC_JOB_DESCRIPTION))) {
    violations.push({ code: 'RAW_JOB_DESCRIPTION', file, detail: 'Exact synthetic job description is forbidden in normalized evidence' })
  }
  if (leaves.some(text => text.includes('QA Test Candidate - Synthetic Resume') || text.includes('%PDF-') || text.includes('JVBERi0'))) {
    violations.push({ code: 'RAW_RESUME_TEXT', file, detail: 'Raw or encoded synthetic resume/PDF content is forbidden in normalized evidence' })
  }
  if (prohibitBodyBearingProperties && /"(?:raw|content|body|value|text|bytes|base64|data)"\s*:/i.test(JSON.stringify(value))) {
    violations.push({ code: 'INVALID_ARTIFACT_SCHEMA', file, detail: 'Body-bearing or generic data properties are forbidden in normalized evidence' })
  }
}

export async function validateEvidenceBundle(bundleDirectory: string, options: ArtifactValidatorOptions = {}): Promise<ArtifactValidationResult> {
  const violations: ArtifactValidationViolation[] = []
  let observedSyntheticUpload = false
  let normalizedNetworkEvents: NetworkEvent[] | null = null
  let normalizedSafetyViolations: SafetyViolation[] | null = null
  let files: string[]
  try { files = await listFiles(bundleDirectory) } catch { return { valid: false, violations: [{ code: 'UNREADABLE_ARTIFACT', file: '.', detail: 'Could not enumerate evidence bundle' }] } }

  let manifest: EvidenceManifest | null = null
  try {
    const manifestPath = path.join(bundleDirectory, 'manifest.json')
    const manifestStat = await lstat(manifestPath)
    if (manifestStat.isSymbolicLink() || !manifestStat.isFile()) throw new Error('Manifest is not an ordinary file')
    const text = await readFile(manifestPath, 'utf8')
    addRules(text, 'manifest.json', violations)
    const parsed: unknown = JSON.parse(text)
    // The manifest is validated before its own identity is trusted, so a bundle
    // whose manifest fails its schema is judged under the strict release set.
    validateJsonSchema('manifest.json', parsed, violations, null)
    if (validateManifestShape(parsed)) manifest = parsed
  } catch {
    violations.push({ code: 'INVALID_MANIFEST', file: 'manifest.json', detail: 'Manifest is missing, unreadable, or malformed' })
  }

  // Null unless a valid manifest declared one, so an unreadable or malformed
  // manifest can never widen the synthetic allowlist.
  const evaluationIdentity: EvaluationIdentity | null = manifest?.evaluationIdentity ?? null

  const referenced = new Set(['manifest.json'])
  if (manifest) {
    for (const ref of manifestReferences(manifest)) referenced.add(ref)
    if (!manifest.artifacts.trace || manifest.artifacts.video.length === 0 || manifest.artifacts.checkpointScreenshots.length === 0) {
      violations.push({ code: 'MISSING_ARTIFACT', file: 'manifest.json', detail: 'Trace, video, and checkpoint screenshots are required' })
    }
    if (manifest.oracleStatus === 'failed' && !manifest.artifacts.failureScreenshot) {
      violations.push({ code: 'MISSING_ARTIFACT', file: 'manifest.json', detail: 'Failed oracle requires a failure screenshot' })
    }
  }

  for (const ref of referenced) if (!files.includes(ref)) violations.push({ code: 'MISSING_ARTIFACT', file: ref, detail: 'Manifest reference does not exist' })
  for (const file of files) {
    if (!validKnownPath(file)) violations.push({ code: 'UNKNOWN_ARTIFACT_TYPE', file, detail: 'Unsupported artifact path or type' })
    if (!referenced.has(file)) violations.push({ code: 'UNREFERENCED_ARTIFACT', file, detail: 'Artifact is not referenced by the manifest' })
    if (!validKnownPath(file)) continue
    try {
      const artifactPath = path.join(bundleDirectory, file)
      const stat = await lstat(artifactPath)
      if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('not an ordinary file')
      if (file.endsWith('.json')) {
        const text = await readFile(artifactPath, 'utf8')
        addRules(text, file, violations)
        let parsed: unknown
        try { parsed = JSON.parse(text) } catch { violations.push({ code: 'INVALID_ARTIFACT_FORMAT', file, detail: 'Malformed JSON' }); continue }
        validateJsonSchema(file, parsed, violations, evaluationIdentity)
        if (BODY_FREE_NORMALIZED_JSON.has(file)) {
          rejectNormalizedRawContent(parsed, file, violations, file === 'network-events.json')
        }
        if (file === 'network-events.json' && Array.isArray(parsed)) {
          if (parsed.every(item => validNetworkEvent(item, evaluationIdentity))) normalizedNetworkEvents = parsed
          observedSyntheticUpload = parsed.some(item => validNetworkEvent(item, evaluationIdentity)
            && item.originAlias === 's3-sentinel'
            && item.routeTemplate === '/synthetic-upload'
            && item.mockDecision === 'fulfilled-contract')
        }
        if (file === 'safety-violations.json' && Array.isArray(parsed) && parsed.every(item => validSafetyViolation(item))) {
          normalizedSafetyViolations = parsed
        }
      } else if (file.endsWith('.png')) {
        if ((await readFile(artifactPath)).subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') violations.push({ code: 'INVALID_ARTIFACT_FORMAT', file, detail: 'Invalid PNG signature' })
      } else if (file.endsWith('.webm')) {
        if ((await readFile(artifactPath)).subarray(0, 4).toString('hex') !== '1a45dfa3') violations.push({ code: 'INVALID_ARTIFACT_FORMAT', file, detail: 'Invalid WebM signature' })
      } else if (file === 'trace.zip') await inspectTrace(artifactPath, file, violations, options, observedSyntheticUpload, evaluationIdentity)
    } catch {
      violations.push({ code: 'UNREADABLE_ARTIFACT', file, detail: 'Artifact is unreadable or not an ordinary file' })
    }
  }
  if (manifest && normalizedNetworkEvents && normalizedSafetyViolations) {
    const count = (...aliases: NetworkOriginAlias[]) => normalizedNetworkEvents?.filter(event => aliases.includes(event.originAlias)).length ?? 0
    const observedSummary = {
      resumeMatchRest: count('resumematch-api-sentinel', 'resumematch-api-external'),
      cognito: count('cognito'),
      s3: count('s3-sentinel', 's3-external'),
      deepgram: count('deepgram'),
      outreach: count('outreach'),
      unexpectedEgress: normalizedSafetyViolations.length,
      locallyFulfilled: count('google-fonts'),
    }
    if (JSON.stringify(manifest.networkSummary) !== JSON.stringify(observedSummary)
      || manifest.failures.filter(item => item.kind === 'safety').length !== normalizedSafetyViolations.length) {
      violations.push({ code: 'INVALID_ARTIFACT_SCHEMA', file: 'manifest.json', detail: 'Manifest network summary does not agree with normalized evidence' })
    }
    if (manifest.scenarioId === 'P1-06' && manifest.expectationMet) {
      const observed = normalizedSafetyViolations.map(item => `${item.code}|${item.resourceType}|${item.target}`).sort()
      const expected = [
        'SAFETY_UNEXPECTED_BROWSER_REQUEST|fetch|http://127.0.0.1:4173/api/unexpected?probe',
        'SAFETY_UNEXPECTED_EGRESS|fetch|https://unapproved.qa.invalid/probe?marker',
        'SAFETY_UNEXPECTED_EGRESS|websocket|wss://unapproved.qa.invalid/socket',
      ].sort()
      if (JSON.stringify(observed) !== JSON.stringify(expected) || manifest.networkSummary.locallyFulfilled < 1) {
        violations.push({ code: 'INVALID_ARTIFACT_SCHEMA', file: 'safety-violations.json', detail: 'P1-06 expected violations do not exactly match the policy self-test catalog' })
      }
    }
  }
  return { valid: violations.length === 0, violations }
}
