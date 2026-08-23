import { randomUUID } from 'node:crypto'
import { lstat, mkdir, realpath } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import { ensureSafeArtifactDirectory, isPhaseOneRunId } from '../browser/artifactPaths'

const INVESTIGATION_ID_PATTERN = /^inv-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

/** Whether a value is an internally generated Phase 2 investigation id. */
export function isInvestigationId(value: string): boolean {
  return INVESTIGATION_ID_PATTERN.test(value)
}

/** Mint an investigation id. Never derived from model input. */
export function newInvestigationId(): string {
  return `inv-${randomUUID()}`
}

/** The approved artifact root both phases share. */
export function approvedArtifactRoot(cwd: string = process.cwd()): string {
  return path.resolve(cwd, '.qa-artifacts')
}

function contained(parent: string, candidate: string): boolean {
  return candidate === parent || candidate.startsWith(`${parent}${path.sep}`)
}

/**
 * Resolve the approved root before delegating to the Phase 1 helper, which
 * compares an unresolved input against its own realpath and therefore rejects a
 * root reached through a symlinked ancestor (a macOS temp directory, for one).
 * @throws when the root is not a real directory.
 */
async function resolveApprovedRoot(approvedRootInput: string): Promise<string> {
  await mkdir(approvedRootInput, { recursive: true, mode: 0o700 })
  const stat = await lstat(approvedRootInput)
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Approved artifact root must be a real directory')
  return ensureSafeArtifactDirectory(await realpath(approvedRootInput), await realpath(approvedRootInput))
}

/**
 * Resolve an accepted Phase 1 run directory for read-only access.
 *
 * Phase 2 never writes here: the bundle is a strict inventory whose manifest is
 * immutable, so any added file would fail revalidation.
 * @throws when the id is not an internally generated Phase 1 run id, or the
 * directory is missing, symlinked, or outside the approved root.
 */
export async function resolveAcceptedRunDirectory(approvedRootInput: string, runId: string): Promise<string> {
  if (!isPhaseOneRunId(runId)) throw new Error('Run id is not an internally generated Phase 1 run id')
  const approvedRoot = await resolveApprovedRoot(approvedRootInput)
  const runsRoot = await realpath(path.join(approvedRoot, 'runs'))
  if (!contained(approvedRoot, runsRoot)) throw new Error('Accepted runs root escapes the approved root')
  const candidate = path.join(runsRoot, runId)
  const stat = await lstat(candidate)
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Accepted run path is not a real directory')
  const resolved = await realpath(candidate)
  if (resolved !== candidate || !contained(runsRoot, resolved)) throw new Error('Accepted run path escapes through a symlink')
  return resolved
}

export interface InvestigationDirectory {
  approvedRoot: string
  investigationsRoot: string
  directory: string
  reproductionDirectory: string
}

/**
 * Create the write root for one investigation, separate from `runs/` so no
 * Phase 1 bundle is ever mutated or extended.
 * @throws when the id is not internally generated or containment fails.
 */
export async function createInvestigationDirectory(
  approvedRootInput: string,
  investigationId: string,
): Promise<InvestigationDirectory> {
  if (!isInvestigationId(investigationId)) throw new Error('Investigation id is not an internally generated Phase 2 id')
  const approvedRoot = await resolveApprovedRoot(approvedRootInput)
  const investigationsRoot = await ensureSafeArtifactDirectory(approvedRoot, path.join(approvedRoot, 'investigations'))
  const directory = path.join(investigationsRoot, investigationId)
  await mkdir(directory, { mode: 0o700 })
  const stat = await lstat(directory)
  const resolved = await realpath(directory)
  if (stat.isSymbolicLink() || resolved !== directory || path.dirname(resolved) !== investigationsRoot) {
    throw new Error('Generated investigation directory failed containment validation')
  }
  const reproductionDirectory = path.join(directory, 'reproduction')
  await mkdir(reproductionDirectory, { mode: 0o700 })
  return { approvedRoot, investigationsRoot, directory, reproductionDirectory }
}

/**
 * Project an absolute path inside the approved root into an evidence reference.
 * @throws when the path is outside the approved root.
 */
export function evidenceReference(approvedRoot: string, absolutePath: string): string {
  const relative = path.relative(approvedRoot, absolutePath)
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Evidence reference escapes the approved root')
  return relative.split(path.sep).join('/')
}
