import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

/** One seeded-defect edit, addressed by case id and applied by exact string match. */
export interface SourceMutation {
  file: string
  find: string
  replace: string
}

/** Resolves a case id to its mutation, or undefined when the case seeds none. */
export type MutationRegistry = (caseId: string) => SourceMutation | undefined

const CASE_ID = /^[A-Z][0-9]{1,2}$/

function occurrences(source: string, needle: string): number {
  return source.split(needle).length - 1
}

/**
 * Apply one seeded defect to an evaluation copy, addressed only by case id.
 *
 * The caller never supplies the edit: a free-form patch would let a wrong or
 * drifted anchor change the wrong line silently. The anchor must match exactly
 * once before the write, and the write is verified by counting both strings
 * again afterwards.
 * @param checkout - directory of the evaluation copy; never the main worktree.
 * @param caseId - corpus case id, such as `D1`.
 * @param registry - lookup for the case's mutation.
 * @returns the file that was rewritten.
 * @throws when the id is malformed, unknown, or the anchor does not match exactly once.
 */
export async function applyMutationById(checkout: string, caseId: string, registry: MutationRegistry): Promise<string> {
  if (!CASE_ID.test(caseId)) throw new Error(`Not a corpus case id: ${caseId}`)
  const mutation = registry(caseId)
  if (mutation === undefined) throw new Error(`Case ${caseId} seeds no mutation`)
  if (path.isAbsolute(mutation.file) || mutation.file.split('/').includes('..')) {
    throw new Error(`Mutation file for ${caseId} escapes the evaluation copy`)
  }
  const target = path.join(checkout, mutation.file)
  const before = await readFile(target, 'utf8')
  const found = occurrences(before, mutation.find)
  if (found !== 1) throw new Error(`Anchor for ${caseId} matched ${found} times in ${mutation.file}; expected exactly 1`)
  const after = before.replace(mutation.find, mutation.replace)
  await writeFile(target, after, 'utf8')

  const written = await readFile(target, 'utf8')
  if (occurrences(written, mutation.find) !== 0) throw new Error(`Anchor for ${caseId} survived the write`)
  if (occurrences(written, mutation.replace) !== 1) throw new Error(`Replacement for ${caseId} is not present exactly once`)
  return mutation.file
}
