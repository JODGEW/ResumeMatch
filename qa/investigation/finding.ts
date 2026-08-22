import { InvestigationError, policyBlocked } from './errors'
import type { RunFailure, SafetyViolation, ScenarioId } from '../browser/types'

/** Bumped only when the closed finding schema changes. */
export const FINDING_SCHEMA_VERSION = 'phase2-finding/1'

/** The four terminal outcomes. Chosen by rule, never by the model. */
export type Classification = 'confirmed' | 'not_reproduced' | 'inconclusive' | 'policy_blocked'

/** Authority fields a model may never supply; naming one is an unauthorized action. */
const AUTHORITY_FIELDS = [
  'classification', 'reproductionOracleResult', 'safetyViolations', 'sourceCommit', 'usage', 'model', 'evaluationIdentity',
] as const

const CONFIDENCE = ['low', 'medium', 'high'] as const
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

export interface DeterministicFacts {
  findingId: string
  sourceRunId: string
  scenarioId: ScenarioId
  sourceCommit: string | null
  failedOracle: string | null
  probesSelected: string[]
  reproductionSequence: unknown[]
  reproductionOracleResult: ReproductionOracleResult | null
  safetyViolations: SafetyViolation[]
  model: { provider: string; modelId: string }
  usage: { inputTokens: number; outputTokens: number; toolCalls: number }
  policyBlocked: boolean
  budgetExhausted: boolean
}

export interface Finding extends ModelNarrative {
  schemaVersion: typeof FINDING_SCHEMA_VERSION
  findingId: string
  sourceRunId: string
  scenarioId: ScenarioId
  sourceCommit: string | null
  failedOracle: string | null
  probesSelected: string[]
  reproductionSequence: unknown[]
  reproductionOracleResult: ReproductionOracleResult | null
  classification: Classification
  safetyViolations: SafetyViolation[]
  model: { provider: string; modelId: string }
  usage: { inputTokens: number; outputTokens: number; toolCalls: number }
}

/**
 * Decide the terminal classification from observed facts alone.
 *
 * An attempted unauthorized action outranks everything, because that is the
 * finding. Budget exhaustion is `inconclusive` before any oracle comparison, so
 * a truncated investigation can never report a confirmed defect.
 */
export function classify(facts: Pick<DeterministicFacts, 'policyBlocked' | 'budgetExhausted' | 'failedOracle' | 'reproductionOracleResult'>): Classification {
  if (facts.policyBlocked) return 'policy_blocked'
  if (facts.budgetExhausted) return 'inconclusive'
  const reproduction = facts.reproductionOracleResult
  if (reproduction === null || reproduction.oracleStatus === 'not_run' || reproduction.oracleStatus === 'incomplete') return 'inconclusive'
  if (reproduction.oracleStatus === 'passed') return 'not_reproduced'
  if (reproduction.failedOracle !== null && reproduction.failedOracle === facts.failedOracle) return 'confirmed'
  return 'inconclusive'
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > MAX_TEXT) {
    throw new InvestigationError('INVALID_ARGUMENTS', `${field} must be a non-empty string of at most ${MAX_TEXT} characters`)
  }
  return value
}

function requireEvidenceRefs(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length > MAX_EVIDENCE_REFS) {
    throw new InvestigationError('INVALID_ARGUMENTS', `${field} must be an array of at most ${MAX_EVIDENCE_REFS} references`)
  }
  for (const item of value) {
    if (typeof item !== 'string' || !EVIDENCE_REF_PATTERN.test(item)) {
      throw new InvestigationError('INVALID_ARGUMENTS', `${field} contains a reference outside the accepted evidence roots`)
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
    throw new InvestigationError('INVALID_ARGUMENTS', 'Finding narrative must be an object')
  }
  const candidate = input as Record<string, unknown>
  for (const field of AUTHORITY_FIELDS) {
    if (field in candidate) throw policyBlocked(`A finding may not supply the deterministic field ${field}`)
  }
  const allowed = ['expectedBehavior', 'observedBehavior', 'hypotheses', 'evidenceRefs', 'reasoningSummary']
  const unknown = Object.keys(candidate).filter(key => !allowed.includes(key))
  if (unknown.length > 0) throw new InvestigationError('INVALID_ARGUMENTS', `Unsupported finding fields: ${unknown.join(', ')}`)
  if (!Array.isArray(candidate.hypotheses) || candidate.hypotheses.length === 0 || candidate.hypotheses.length > MAX_HYPOTHESES) {
    throw new InvestigationError('INVALID_ARGUMENTS', `hypotheses must hold between 1 and ${MAX_HYPOTHESES} entries`)
  }
  const hypotheses = candidate.hypotheses.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new InvestigationError('INVALID_ARGUMENTS', `hypotheses[${index}] must be an object`)
    }
    const item = entry as Record<string, unknown>
    const extra = Object.keys(item).filter(key => !['statement', 'evidenceRefs', 'confidence'].includes(key))
    if (extra.length > 0) throw new InvestigationError('INVALID_ARGUMENTS', `hypotheses[${index}] has unsupported fields: ${extra.join(', ')}`)
    if (!CONFIDENCE.includes(item.confidence as Hypothesis['confidence'])) {
      throw new InvestigationError('INVALID_ARGUMENTS', `hypotheses[${index}].confidence must be low, medium, or high`)
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
    failedOracle: facts.failedOracle,
    expectedBehavior: narrative.expectedBehavior,
    observedBehavior: narrative.observedBehavior,
    hypotheses: narrative.hypotheses,
    evidenceRefs: narrative.evidenceRefs,
    probesSelected: facts.probesSelected,
    reproductionSequence: facts.reproductionSequence,
    reproductionOracleResult: facts.reproductionOracleResult,
    classification: classify(facts),
    reasoningSummary: narrative.reasoningSummary,
    safetyViolations: facts.safetyViolations,
    model: facts.model,
    usage: facts.usage,
  }
}
