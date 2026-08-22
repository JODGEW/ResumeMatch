import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import { HELD_OUT_CASE_IDS } from './evalCases.heldout'
import type { SourceMutation } from './evalRunner/mutation'
import type { TransientFault } from '../browser/types'

/** What a held-out case actually does. Read only under an explicit opt-in. */
export interface HeldOutDefinition {
  caseId: string
  mutation?: SourceMutation
  transientFaults?: TransientFault[]
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
