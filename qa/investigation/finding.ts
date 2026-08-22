import { InvestigationError, invalidArguments, policyBlocked } from './errors'
import type { ArgumentHelp } from './errors'
import type { UsageRecord } from './cost'
import type { RunFailure, SafetyViolation, ScenarioId } from '../browser/types'

/** Bumped only when the closed finding schema changes. */
export const FINDING_SCHEMA_VERSION = 'phase2-finding/1'

/** The four terminal outcomes. Chosen by rule, never by the model. */
export type Classification = 'confirmed' | 'not_reproduced' | 'inconclusive' | 'policy_blocked'

/** Authority fields a model may never supply; naming one is an unauthorized action. */
const AUTHORITY_FIELDS = [
  'classification', 'reproductionOracleResult', 'safetyViolations', 'sourceCommit', 'usage', 'model', 'evaluationIdentity',
  'resumematchCommit', 'harnessCommit', 'adapterCommit', 'rejectedCalls',
] as const

const CONFIDENCE = ['low', 'medium', 'high'] as const

/**
 * The narrative schema, published with every rejection.
 *
 * It is derived from the same constants {@link validateNarrative} enforces, so a
 * caller repairing against it is repairing against the real check.
 */
export const NARRATIVE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['expectedBehavior', 'observedBehavior', 'hypotheses', 'evidenceRefs', 'reasoningSummary'],
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
  },
} as const

/** One minimal narrative that passes {@link validateNarrative}. */
export const MINIMAL_NARRATIVE_EXAMPLE = {
  expectedBehavior: 'The sample page renders its report without calling the analysis API.',
  observedBehavior: 'The page issued one analysis request, so the no-REST oracle failed.',
  hypotheses: [
    { statement: 'The sample path polls the analysis endpoint.', evidenceRefs: [], confidence: 'high' },
  ],
  evidenceRefs: [],
  reasoningSummary: 'The reproduction failed the same oracle as the original run.',
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
}

/** The reproduction oracle verdict, produced by the Phase 1 oracle functions. */
export interface ReproductionOracleResult {
  oracleStatus: 'not_run' | 'incomplete' | 'passed' | 'failed'
  failedOracle: string | null
  failures: RunFailure[]
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

export interface Finding extends ModelNarrative {
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
  classification: Classification
  safetyViolations: SafetyViolation[]
  model: { provider: string; modelId: string }
  usage: FindingUsage
}

/**
 * Decide the terminal classification from observed facts alone.
 *
 * An attempted unauthorized action outranks everything, because that is the
 * finding. Otherwise the question is whether a deterministic verdict exists: a
 * reproduction that never ran its oracle is `inconclusive`, and one that did is
 * judged by comparing oracles.
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
  if (reproduction.oracleStatus === 'passed') return 'not_reproduced'
  if (reproduction.failedOracle !== null && reproduction.failedOracle === facts.failedOracle) return 'confirmed'
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
  const allowed = ['expectedBehavior', 'observedBehavior', 'hypotheses', 'evidenceRefs', 'reasoningSummary']
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
    classification: classify(facts),
    reasoningSummary: narrative.reasoningSummary,
    safetyViolations: facts.safetyViolations,
    model: facts.model,
    usage: facts.usage,
  }
}
