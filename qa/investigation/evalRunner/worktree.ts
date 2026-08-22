import { execFileSync } from 'node:child_process'
import { mkdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const GIT_ENVIRONMENT = { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' }
const CASE_ID = /^[A-Z][0-9]{1,2}$/
const COMMIT = /^[0-9a-f]{40}$/

/** One temporary evaluation checkout, outside the main worktree. */
export interface EvaluationWorktree {
  directory: string
  label: string
  commit: string
}

/** Root for evaluation checkouts: the system temp directory, never the repository. */
export function evaluationWorktreeRoot(): string {
  return path.join(os.tmpdir(), 'resumematch-eval')
}

/**
 * The manifest-safe label for one evaluation checkout.
 *
 * Evidence records this instead of the directory, because an absolute temp path
 * carries the operator's home directory.
 * @param commit - full source commit.
 * @param caseId - corpus case id.
 * @returns a lowercase label safe for the manifest schema.
 */
export function worktreeLabel(commit: string, caseId: string): string {
  if (!COMMIT.test(commit)) throw new Error('Evaluation worktree needs a full 40-character commit')
  if (!CASE_ID.test(caseId)) throw new Error(`Not a corpus case id: ${caseId}`)
  return `${commit.slice(0, 12)}-${caseId.toLowerCase()}`
}

/**
 * Create a detached evaluation checkout of one commit.
 *
 * Detached so the main worktree never changes branch, and under the temp root so
 * a mutated copy can never be mistaken for the repository under test.
 * @param repositoryPath - the main worktree, used only as the git command's cwd.
 * @param commit - full source commit to check out.
 * @param caseId - corpus case id.
 * @returns the created checkout.
 * @throws when the main worktree is dirty, or git refuses the checkout.
 */
export async function createEvaluationWorktree(repositoryPath: string, commit: string, caseId: string): Promise<EvaluationWorktree> {
  const label = worktreeLabel(commit, caseId)
  const status = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
    cwd: repositoryPath, encoding: 'utf8', env: GIT_ENVIRONMENT,
  }).trim()
  if (status.length > 0) throw new Error('Refusing to build an evaluation copy from a dirty worktree')
  const root = evaluationWorktreeRoot()
  await mkdir(root, { recursive: true, mode: 0o700 })
  const directory = path.join(root, label)
  await rm(directory, { recursive: true, force: true })
  execFileSync('git', ['worktree', 'add', '--detach', directory, commit], {
    cwd: repositoryPath, encoding: 'utf8', env: GIT_ENVIRONMENT,
  })
  return { directory, label, commit }
}

/**
 * Remove one evaluation checkout and its git registration.
 * @param repositoryPath - the main worktree.
 * @param worktree - the checkout to remove.
 */
export async function removeEvaluationWorktree(repositoryPath: string, worktree: EvaluationWorktree): Promise<void> {
  if (path.dirname(worktree.directory) !== evaluationWorktreeRoot()) {
    throw new Error('Refusing to remove a checkout outside the evaluation root')
  }
  execFileSync('git', ['worktree', 'remove', '--force', worktree.directory], {
    cwd: repositoryPath, encoding: 'utf8', env: GIT_ENVIRONMENT,
  })
}
