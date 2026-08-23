import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import type { EvalCase } from './evalCases'
import { HELD_OUT_CASES, HELD_OUT_CASE_IDS } from './evalCases.heldout'
import type { SourceMutation } from './evalRunner/mutation'
import type { TransientFault } from '../browser/types'

/** What a held-out case actually does. Read only under an explicit opt-in. */
export interface HeldOutDefinition {
  caseId: string
  mutation?: SourceMutation
  transientFaults?: TransientFault[]
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
  return parsed as HeldOutDefinition
}
