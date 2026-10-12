import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import type { EvalCase } from './evalCases'
import { HELD_OUT_CASES, HELD_OUT_CASE_IDS } from './evalCases.heldout'
import { MINIMAL_NARRATIVE_EXAMPLE, ROOT_CAUSE_FAILURE_MODES, ROOT_CAUSE_ROUTE_TEMPLATES } from './finding'
import type { RootCause } from './finding'
import type { SourceMutation } from './evalRunner/mutation'
import type { TransientFault } from '../browser/types'

/** What a held-out case actually does. Read only under an explicit opt-in. */
export interface HeldOutDefinition {
  caseId: string
  mutation?: SourceMutation
  transientFaults?: TransientFault[]
  /** The graded answer; absent means the case is not graded on root cause. */
  rootCause?: RootCause
  /** The evidence set; absent means the case is not graded on goldEv. */
  goldEvidenceProbes?: string[]
}

/**
 * Resolve a case id to the shape the runner works with, from either half.
 *
 * A held-out case is assembled from its expectations and its gitignored
 * definition, and never carries a gold probe: scoring a case whose
 * implementation was hidden while the investigator was tuned would measure
 * nothing the public set does not already measure.
 * @param caseId - a public or held-out case id.
 * @param publicCases - the public corpus.
 * @param heldOutEnabled - whether the operator passed `--held-out`.
 * @param repositoryRoot - checkout to resolve the definition directory against.
 * @returns the case, or undefined when the id belongs to neither half.
 */
export async function resolveEvalCase(
  caseId: string,
  publicCases: readonly EvalCase[],
  heldOutEnabled: boolean,
  repositoryRoot: string = process.cwd(),
): Promise<EvalCase | undefined> {
  const open = publicCases.find(item => item.id === caseId)
  if (open !== undefined) return open
  if (!HELD_OUT_CASE_IDS.includes(caseId)) return undefined
  const expectations = HELD_OUT_CASES.find(item => item.id === caseId)
  if (expectations === undefined) return undefined
  const definition = await loadHeldOutDefinition(caseId, heldOutEnabled, repositoryRoot)
  return {
    id: expectations.id,
    kind: expectations.kind,
    scenarioId: expectations.scenarioId,
    summary: `Held-out case ${expectations.id}`,
    expectedTriage: expectations.expectedTriage,
    expectedClassification: expectations.expectedClassification,
    ...definition.mutation === undefined ? {} : { mutation: definition.mutation },
    ...definition.transientFaults === undefined ? {} : { transientFaults: definition.transientFaults },
  }
}

/** Directory holding held-out definitions. Gitignored, so the corpus is not committed. */
export function heldOutDefinitionDirectory(repositoryRoot: string = process.cwd()): string {
  return path.join(repositoryRoot, 'qa', 'investigation', 'heldout')
}

/**
 * Load one held-out definition.
 *
 * The opt-in is a required argument rather than a default, so a runner that
 * forgets `--held-out` cannot reach these definitions by accident and quietly
 * tune against them.
 * @param caseId - a held-out case id.
 * @param heldOutEnabled - whether the operator passed `--held-out`.
 * @param repositoryRoot - checkout to resolve the directory against.
 * @returns the definition for that case.
 * @throws when held-out access is not enabled, the id is not held out, or no definition exists.
 */
export async function loadHeldOutDefinition(
  caseId: string,
  heldOutEnabled: boolean,
  repositoryRoot: string = process.cwd(),
): Promise<HeldOutDefinition> {
  if (!heldOutEnabled) throw new Error('Held-out definitions require an explicit --held-out opt-in')
  if (!HELD_OUT_CASE_IDS.includes(caseId)) throw new Error(`${caseId} is not a held-out case`)
  const file = path.join(heldOutDefinitionDirectory(repositoryRoot), `${caseId}.json`)
  const parsed: unknown = JSON.parse(await readFile(file, 'utf8'))
  if (!parsed || typeof parsed !== 'object' || (parsed as HeldOutDefinition).caseId !== caseId) {
    throw new Error(`Held-out definition for ${caseId} is malformed`)
  }
  const definition = parsed as HeldOutDefinition
  if (definition.rootCause !== undefined) requireGoldRootCause(caseId, definition.rootCause)
  if (definition.goldEvidenceProbes !== undefined) {
    const probes: unknown = definition.goldEvidenceProbes
    if (!Array.isArray(probes) || probes.length === 0 || !probes.every(item => typeof item === 'string')) {
      throw new Error(`Held-out definition for ${caseId} has an invalid goldEvidenceProbes: a non-empty list of tool names is required`)
    }
  }
  return definition
}

/**
 * Check a held-out gold answer before anything is graded against it.
 *
 * Stricter than a submitted narrative: a gold answer names a cause, so it is
 * never `undetermined`, which always scores 0. It also may not be the example
 * narrative's answer, because every rejected submission returns that example.
 * @param caseId - the held-out case the answer belongs to.
 * @param value - the answer as stored.
 * @throws when the answer could not be graded against, or matches the example.
 */
function requireGoldRootCause(caseId: string, value: unknown): void {
  const invalid = (why: string) => new Error(`Held-out definition for ${caseId} has an invalid rootCause: ${why}`)
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid('an object is required')
  const answer = value as Record<string, unknown>
  const keys = Object.keys(answer).sort()
  if (keys.join(',') !== 'attribution,failureMode,routeTemplate') throw invalid('exactly attribution, routeTemplate, and failureMode are required')
  if (answer.attribution !== 'product_defect' && answer.attribution !== 'transient_or_environment') {
    throw invalid('attribution must be product_defect or transient_or_environment')
  }
  if (!ROOT_CAUSE_ROUTE_TEMPLATES.includes(answer.routeTemplate as NonNullable<RootCause['routeTemplate']>)) {
    throw invalid(`routeTemplate must be one of ${ROOT_CAUSE_ROUTE_TEMPLATES.join(', ')}`)
  }
  if (!ROOT_CAUSE_FAILURE_MODES.includes(answer.failureMode as NonNullable<RootCause['failureMode']>)) {
    throw invalid(`failureMode must be one of ${ROOT_CAUSE_FAILURE_MODES.join(', ')}`)
  }
  const example = MINIMAL_NARRATIVE_EXAMPLE.rootCause
  if (answer.attribution === example.attribution && answer.routeTemplate === example.routeTemplate && answer.failureMode === example.failureMode) {
    throw new Error(`Held-out answer for ${caseId} matches the example narrative's rootCause, which every rejected submission returns`)
  }
}
