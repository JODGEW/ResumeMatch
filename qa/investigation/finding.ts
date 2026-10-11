import { invalidArguments, policyBlocked } from './errors'
import type { ArgumentHelp } from './errors'
import type { UsageRecord } from './cost'
import type { NetworkRouteTemplate, RunFailure, SafetyViolation, ScenarioId } from '../browser/types'

/** Bumped only when the closed finding schema changes. */
export const FINDING_SCHEMA_VERSION = 'phase2-finding/2'

/** The version before `rootCause`; findings stored under it still load. */
export const FINDING_SCHEMA_VERSION_V1 = 'phase2-finding/1'

/** The four terminal outcomes. Chosen by rule, never by the model. */
export type Classification = 'confirmed' | 'not_reproduced' | 'inconclusive' | 'policy_blocked'

/** Authority fields a model may never supply; naming one is an unauthorized action. */
const AUTHORITY_FIELDS = [
  'classification', 'reproductionOracleResult', 'safetyViolations', 'sourceCommit', 'usage', 'model', 'evaluationIdentity',
  'resumematchCommit', 'harnessCommit', 'adapterCommit', 'rejectedCalls', 'coercedArgs',
] as const

const CONFIDENCE = ['low', 'medium', 'high'] as const

/** Whom the evidence blames for the original failure. */
export const ROOT_CAUSE_ATTRIBUTIONS = ['product_defect', 'transient_or_environment', 'undetermined'] as const

/**
 * The request a root cause can sit on, as network events name it for the API
 * and S3 origins. Page routes and assets are not request surfaces.
 */
export const ROOT_CAUSE_ROUTE_TEMPLATES = [
  '/upload', '/synthetic-upload', '/analysis/:analysisId', '/user/last-resume',
] as const satisfies readonly NetworkRouteTemplate[]

/** What went wrong with that request. */
export const ROOT_CAUSE_FAILURE_MODES = [
  'unexpected_request', 'missing_request', 'malformed_request', 'stopped_early', 'error_response', 'aborted_response',
] as const

/**
 * The model's conclusion about the original failure, in closed values.
 *
 * It is graded against each case's answer and never read by {@link classify}.
 * `undetermined` carries no route and no failure mode, so an abstention can't
 * earn partial credit.
 */
export interface RootCause {
  attribution: (typeof ROOT_CAUSE_ATTRIBUTIONS)[number]
  routeTemplate: (typeof ROOT_CAUSE_ROUTE_TEMPLATES)[number] | null
  failureMode: (typeof ROOT_CAUSE_FAILURE_MODES)[number] | null
}

/**
 * The narrative schema, published with every rejection.
 *
 * It is derived from the same constants {@link validateNarrative} enforces, so a
 * caller repairing against it is repairing against the real check.
 */
export const NARRATIVE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['expectedBehavior', 'observedBehavior', 'hypotheses', 'evidenceRefs', 'reasoningSummary', 'rootCause'],
  properties: {
    expectedBehavior: { type: 'string', minLength: 1, maxLength: 2_000 },
    observedBehavior: { type: 'string', minLength: 1, maxLength: 2_000 },
    reasoningSummary: { type: 'string', minLength: 1, maxLength: 2_000 },
    evidenceRefs: {
      type: 'array', maxItems: 12,
      items: {
        type: 'string',
        description: 'An artifactRef exactly as a tool returned it, or runs/<runId>/<file> for accepted evidence.',
        pattern: '^(runs/p1-0[1-6]-<uuid>|investigations/inv-<uuid>)/<path>(#<pointer>)?$',
      },
    },
    hypotheses: {
      type: 'array', minItems: 1, maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['statement', 'evidenceRefs', 'confidence'],
        properties: {
          statement: { type: 'string', minLength: 1, maxLength: 2_000 },
          evidenceRefs: { type: 'array', maxItems: 12, items: { type: 'string' } },
          confidence: { enum: ['low', 'medium', 'high'] },
        },
      },
    },
    rootCause: {
      type: 'object',
      additionalProperties: false,
      required: ['attribution', 'routeTemplate', 'failureMode'],
      description: 'With attribution undetermined, routeTemplate and failureMode are null; otherwise both are set.',
      properties: {
        attribution: { enum: ROOT_CAUSE_ATTRIBUTIONS },
        routeTemplate: { enum: [...ROOT_CAUSE_ROUTE_TEMPLATES, null] },
        failureMode: { enum: [...ROOT_CAUSE_FAILURE_MODES, null] },
      },
    },
  },
} as const

/**
 * One minimal narrative that passes {@link validateNarrative}.
 *
 * It is returned with every rejection, so its `rootCause` deliberately matches
 * no corpus case's answer.
 */
export const MINIMAL_NARRATIVE_EXAMPLE = {
  expectedBehavior: 'The upload page asks for the last resume once before showing the form.',
  observedBehavior: 'The page requested the last resume twice, so the contract recorded an extra request.',
  hypotheses: [
    { statement: 'The upload page fetches the last resume again on every render.', evidenceRefs: [], confidence: 'high' },
  ],
  evidenceRefs: [],
  reasoningSummary: 'The reproduction failed the same oracle as the original run.',
  rootCause: { attribution: 'product_defect', routeTemplate: '/user/last-resume', failureMode: 'unexpected_request' },
} as const

/** Schema and example returned with every narrative rejection. */
export const NARRATIVE_HELP: ArgumentHelp = {
  schema: NARRATIVE_JSON_SCHEMA,
  example: MINIMAL_NARRATIVE_EXAMPLE,
}
const MAX_HYPOTHESES = 3
const MAX_TEXT = 2_000
const MAX_EVIDENCE_REFS = 12
const EVIDENCE_REF_PATTERN = /^(?:runs\/p1-0[1-6]-[0-9a-f-]{36}|investigations\/inv-[0-9a-f-]{36})\/[A-Za-z0-9._/-]+(?:#[A-Za-z0-9._/-]*)?$/

export interface Hypothesis {
  statement: string
  evidenceRefs: string[]
  confidence: (typeof CONFIDENCE)[number]
}

/** Everything the model authors. Narrative only: no field here can change a verdict. */
export interface ModelNarrative {
  expectedBehavior: string
  observedBehavior: string
  hypotheses: Hypothesis[]
  evidenceRefs: string[]
  reasoningSummary: string
  /**
   * Always present on a narrative {@link validateNarrative} returns. Optional in
   * the type only for the narrative the session substitutes when it discards a
   * policy-blocked submission, which records no conclusion.
   */
  rootCause?: RootCause
}

/** The reproduction oracle verdict, produced by the Phase 1 oracle functions. */
export interface ReproductionOracleResult {
  oracleStatus: 'not_run' | 'incomplete' | 'passed' | 'failed'
  /** The first failure in evaluation order; `failures` carries the whole set. */
  failedOracle: string | null
  failures: RunFailure[]
  /** Whether the original failure's precondition transition was reached. */
  preconditionMet: boolean
  /** Oracle ids the sweep evaluated. */
  evaluated: string[]
  /** Oracle ids skipped because their precondition transition never appeared. */
  skipped: string[]
}

/**
 * Git identity of the three checkouts an investigation ran against.
 *
 * Distinct from `sourceCommit`, which is the commit the failing run was
 * produced from: these are the checkouts that produced the investigation.
 * `unknown` when a checkout has no reachable git identity.
 */
export interface CheckoutIdentity {
  resumematchCommit: string
  harnessCommit: string
  adapterCommit: string
}

/** One call the investigation refused, recorded so an over-eager plan is visible. */
export interface RejectedCall {
  tool: string
  reason: string
}

export interface DeterministicFacts {
  findingId: string
  sourceRunId: string
  scenarioId: ScenarioId
  sourceCommit: string | null
  checkouts: CheckoutIdentity
  failedOracle: string | null
  probesSelected: string[]
  reproductionSequence: unknown[]
  reproductionOracleResult: ReproductionOracleResult | null
  safetyViolations: SafetyViolation[]
  model: { provider: string; modelId: string }
  usage: FindingUsage
  policyBlocked: boolean
  budgetExhausted: boolean
  rejectedCalls: RejectedCall[]
  /** Calls whose arguments the adapter had to decode before dispatch. */
  coercedArgs: number
}

/**
 * Token accounting for one investigation, as reported by the provider.
 *
 * `requests` holds one entry per model request with its UTC timestamp, pricing
 * window, and cost, so a bill can be reconstructed from the finding alone.
 */
export interface FindingUsage {
  toolCalls: number
  cacheHitTokens: number
  cacheMissTokens: number
  completionTokens: number
  costUsd: number
  requests: UsageRecord[]
}

export interface Finding extends Omit<ModelNarrative, 'rootCause'> {
  schemaVersion: typeof FINDING_SCHEMA_VERSION
  findingId: string
  sourceRunId: string
  scenarioId: ScenarioId
  sourceCommit: string | null
  resumematchCommit: string
  harnessCommit: string
  adapterCommit: string
  failedOracle: string | null
  probesSelected: string[]
  reproductionSequence: unknown[]
  reproductionOracleResult: ReproductionOracleResult | null
  rejectedCalls: RejectedCall[]
  coercedArgs: number
  classification: Classification
  safetyViolations: SafetyViolation[]
  model: { provider: string; modelId: string }
  usage: FindingUsage
  /** Null only when a policy-blocked submission's narrative was discarded. */
  rootCause: RootCause | null
}

/** A finding stored under {@link FINDING_SCHEMA_VERSION_V1}, before `rootCause` existed. */
export type FindingV1 = Omit<Finding, 'schemaVersion' | 'rootCause'> & { schemaVersion: typeof FINDING_SCHEMA_VERSION_V1 }

/** A finding as read back from disk, under either schema version. */
export type StoredFinding = Finding | FindingV1

/**
 * Read a stored `finding.json` for analysis.
 *
 * Findings written before `rootCause` existed must still load, so both
 * versions are accepted; an unknown version is refused rather than misread.
 * @param text - the file's contents.
 * @throws when the text is not JSON or names an unknown schema version.
 */
export function parseStoredFinding(text: string): StoredFinding {
  const value = JSON.parse(text) as { schemaVersion?: unknown }
  if (value.schemaVersion !== FINDING_SCHEMA_VERSION && value.schemaVersion !== FINDING_SCHEMA_VERSION_V1) {
    throw new Error(`Unknown finding schema version: ${String(value.schemaVersion)}`)
  }
  return value as StoredFinding
}

/**
 * Decide the terminal classification from observed facts alone.
 *
 * An attempted unauthorized action outranks everything, because that is the
 * finding. Then the question is whether a comparable verdict exists at all: a
 * reproduction that never ran its oracle, or never reached the precondition the
 * original failure needed, is `inconclusive`. Otherwise the original failure is
 * looked up in the reproduction's whole failure set rather than only its first
 * failure, because an earlier assertion failing first would otherwise hide it.
 *
 * A spent budget is deliberately not an input. It reaches this decision through
 * its consequence — an investigation cut short has no completed reproduction
 * oracle — rather than as a penalty of its own. Measured on the D1 smoke test:
 * three refused probe calls downgraded an investigation that reproduced the
 * original failure exactly, which described the investigator's spending rather
 * than the product.
 */
export function classify(facts: Pick<DeterministicFacts, 'policyBlocked' | 'failedOracle' | 'reproductionOracleResult'>): Classification {
  if (facts.policyBlocked) return 'policy_blocked'
  const reproduction = facts.reproductionOracleResult
  if (reproduction === null || reproduction.oracleStatus === 'not_run' || reproduction.oracleStatus === 'incomplete') return 'inconclusive'
  if (!reproduction.preconditionMet) return 'inconclusive'
  const reproduced = new Set(reproduction.failures.map(item => item.oracleId).filter((id): id is string => id !== undefined))
  if (facts.failedOracle !== null && reproduced.has(facts.failedOracle)) return 'confirmed'
  if (reproduction.failures.length === 0) return 'not_reproduced'
  return 'inconclusive'
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > MAX_TEXT) {
    throw invalidArguments(`${field} must be a non-empty string of at most ${MAX_TEXT} characters`, NARRATIVE_HELP)
  }
  return value
}

function requireEvidenceRefs(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length > MAX_EVIDENCE_REFS) {
    throw invalidArguments(`${field} must be an array of at most ${MAX_EVIDENCE_REFS} references`, NARRATIVE_HELP)
  }
  for (const item of value) {
    if (typeof item !== 'string' || !EVIDENCE_REF_PATTERN.test(item)) {
      throw invalidArguments(
        `${field} contains a reference outside the accepted evidence roots; use an artifactRef exactly as a tool returned it, or an empty array`,
        NARRATIVE_HELP,
      )
    }
  }
  return value as string[]
}

const ROOT_CAUSE_REQUIRED = 'rootCause is required: an object with exactly attribution, routeTemplate, and failureMode'

function requireRootCause(value: unknown): RootCause {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalidArguments(ROOT_CAUSE_REQUIRED, NARRATIVE_HELP)
  const candidate = value as Record<string, unknown>
  const extra = Object.keys(candidate).filter(key => !['attribution', 'routeTemplate', 'failureMode'].includes(key))
  if (extra.length > 0) throw invalidArguments(`rootCause has unsupported fields: ${extra.join(', ')}`, NARRATIVE_HELP)
  if (!ROOT_CAUSE_ATTRIBUTIONS.includes(candidate.attribution as RootCause['attribution'])) {
    throw invalidArguments('rootCause.attribution must be product_defect, transient_or_environment, or undetermined', NARRATIVE_HELP)
  }
  if (candidate.routeTemplate !== null && !ROOT_CAUSE_ROUTE_TEMPLATES.includes(candidate.routeTemplate as NonNullable<RootCause['routeTemplate']>)) {
    throw invalidArguments(`rootCause.routeTemplate must be ${ROOT_CAUSE_ROUTE_TEMPLATES.join(', ')}, or null`, NARRATIVE_HELP)
  }
  if (candidate.failureMode !== null && !ROOT_CAUSE_FAILURE_MODES.includes(candidate.failureMode as NonNullable<RootCause['failureMode']>)) {
    throw invalidArguments(`rootCause.failureMode must be ${ROOT_CAUSE_FAILURE_MODES.join(', ')}, or null`, NARRATIVE_HELP)
  }
  const rootCause = candidate as unknown as RootCause
  const undetermined = rootCause.attribution === 'undetermined'
  if ((rootCause.routeTemplate === null) !== undetermined || (rootCause.failureMode === null) !== undetermined) {
    throw invalidArguments(
      'rootCause.routeTemplate and rootCause.failureMode must both be null when attribution is undetermined, and both set otherwise',
      NARRATIVE_HELP,
    )
  }
  return { attribution: rootCause.attribution, routeTemplate: rootCause.routeTemplate, failureMode: rootCause.failureMode }
}

/**
 * Validate untrusted model output into a narrative.
 * @throws `POLICY_BLOCKED` when the model names a deterministic authority field,
 * `INVALID_ARGUMENTS` for any other schema violation.
 */
export function validateNarrative(input: unknown): ModelNarrative {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw invalidArguments('Finding narrative must be an object', NARRATIVE_HELP)
  }
  const candidate = input as Record<string, unknown>
  for (const field of AUTHORITY_FIELDS) {
    if (field in candidate) throw policyBlocked(`A finding may not supply the deterministic field ${field}`)
  }
  const allowed = ['expectedBehavior', 'observedBehavior', 'hypotheses', 'evidenceRefs', 'reasoningSummary', 'rootCause']
  const unknown = Object.keys(candidate).filter(key => !allowed.includes(key))
  if (unknown.length > 0) throw invalidArguments(`Unsupported finding fields: ${unknown.join(', ')}`, NARRATIVE_HELP)
  if (!Array.isArray(candidate.hypotheses) || candidate.hypotheses.length === 0 || candidate.hypotheses.length > MAX_HYPOTHESES) {
    throw invalidArguments(`hypotheses must hold between 1 and ${MAX_HYPOTHESES} entries`, NARRATIVE_HELP)
  }
  const hypotheses = candidate.hypotheses.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw invalidArguments(
        `hypotheses[${index}] must be an object with statement, evidenceRefs, and confidence`,
        NARRATIVE_HELP,
      )
    }
    const item = entry as Record<string, unknown>
    const extra = Object.keys(item).filter(key => !['statement', 'evidenceRefs', 'confidence'].includes(key))
    if (extra.length > 0) throw invalidArguments(`hypotheses[${index}] has unsupported fields: ${extra.join(', ')}`, NARRATIVE_HELP)
    if (!CONFIDENCE.includes(item.confidence as Hypothesis['confidence'])) {
      throw invalidArguments(`hypotheses[${index}].confidence must be low, medium, or high`, NARRATIVE_HELP)
    }
    return {
      statement: requireText(item.statement, `hypotheses[${index}].statement`),
      evidenceRefs: requireEvidenceRefs(item.evidenceRefs, `hypotheses[${index}].evidenceRefs`),
      confidence: item.confidence as Hypothesis['confidence'],
    }
  })
  return {
    expectedBehavior: requireText(candidate.expectedBehavior, 'expectedBehavior'),
    observedBehavior: requireText(candidate.observedBehavior, 'observedBehavior'),
    reasoningSummary: requireText(candidate.reasoningSummary, 'reasoningSummary'),
    evidenceRefs: requireEvidenceRefs(candidate.evidenceRefs, 'evidenceRefs'),
    hypotheses,
    rootCause: requireRootCause(candidate.rootCause),
  }
}

/** Assemble the closed finding. The classification is recomputed here, always. */
export function buildFinding(facts: DeterministicFacts, narrative: ModelNarrative): Finding {
  return {
    schemaVersion: FINDING_SCHEMA_VERSION,
    findingId: facts.findingId,
    sourceRunId: facts.sourceRunId,
    scenarioId: facts.scenarioId,
    sourceCommit: facts.sourceCommit,
    resumematchCommit: facts.checkouts.resumematchCommit,
    harnessCommit: facts.checkouts.harnessCommit,
    adapterCommit: facts.checkouts.adapterCommit,
    failedOracle: facts.failedOracle,
    expectedBehavior: narrative.expectedBehavior,
    observedBehavior: narrative.observedBehavior,
    hypotheses: narrative.hypotheses,
    evidenceRefs: narrative.evidenceRefs,
    probesSelected: facts.probesSelected,
    reproductionSequence: facts.reproductionSequence,
    reproductionOracleResult: facts.reproductionOracleResult,
    rejectedCalls: facts.rejectedCalls,
    coercedArgs: facts.coercedArgs,
    classification: classify(facts),
    reasoningSummary: narrative.reasoningSummary,
    rootCause: narrative.rootCause ?? null,
    safetyViolations: facts.safetyViolations,
    model: facts.model,
    usage: facts.usage,
  }
}
