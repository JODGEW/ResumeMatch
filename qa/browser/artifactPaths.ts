import { lstat, mkdir, realpath, rm } from 'node:fs/promises'
import path from 'node:path'

const RUN_ID_PATTERN = /^p1-0[1-6]-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const SAFE_RUN_DIRECTORY = Symbol('safe-run-directory')
const SAFE_RUN_DIRECTORIES = new WeakMap<SafeRunDirectory, { approvedRoot: string; runsRoot: string; runDirectory: string }>()

function contained(parent: string, candidate: string): boolean {
  return candidate === parent || candidate.startsWith(`${parent}${path.sep}`)
}

async function ensureDirectoryWithoutSymlinks(directory: string, approvedRoot: string): Promise<void> {
  const relative = path.relative(approvedRoot, directory)
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Artifact path escapes approved root')
  let cursor = approvedRoot
  for (const component of relative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, component)
    try {
      const stat = await lstat(cursor)
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Artifact path component is not a real directory')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      await mkdir(cursor, { mode: 0o700 })
    }
  }
}

export interface SafeRunDirectory {
  approvedRoot: string
  runsRoot: string
  runDirectory: string
  readonly [SAFE_RUN_DIRECTORY]: true
}

export async function ensureSafeArtifactDirectory(approvedRootInput: string, directoryInput: string): Promise<string> {
  await mkdir(approvedRootInput, { recursive: true, mode: 0o700 })
  const approvedStat = await lstat(approvedRootInput)
  if (approvedStat.isSymbolicLink() || !approvedStat.isDirectory()) throw new Error('Approved artifact root must be a real directory')
  const approvedRoot = await realpath(approvedRootInput)
  const directory = path.resolve(directoryInput)
  if (!contained(approvedRoot, directory)) throw new Error('Artifact directory escapes approved root')
  await ensureDirectoryWithoutSymlinks(directory, approvedRoot)
  const resolved = await realpath(directory)
  if (resolved !== directory || !contained(approvedRoot, resolved)) throw new Error('Artifact directory escapes through a symlink')
  return resolved
}

export async function createSafeRunDirectory(
  approvedRootInput: string,
  runsRootInput: string,
  runId: string,
): Promise<SafeRunDirectory> {
  if (!RUN_ID_PATTERN.test(runId)) throw new Error('Run ID is not an internally generated Phase 1 UUID')
  const approvedRoot = await ensureSafeArtifactDirectory(approvedRootInput, approvedRootInput)
  const runsRoot = path.resolve(runsRootInput)
  if (!contained(approvedRoot, runsRoot)) throw new Error('Phase 1 artifacts must stay inside the approved artifact root')
  await ensureDirectoryWithoutSymlinks(runsRoot, approvedRoot)
  const realRunsRoot = await realpath(runsRoot)
  if (!contained(approvedRoot, realRunsRoot)) throw new Error('Artifact runs root escapes through a symlink')
  const runDirectory = path.join(realRunsRoot, runId)
  await mkdir(runDirectory, { mode: 0o700 })
  const stat = await lstat(runDirectory)
  const resolvedRunDirectory = await realpath(runDirectory)
  if (stat.isSymbolicLink() || path.dirname(resolvedRunDirectory) !== realRunsRoot || path.basename(resolvedRunDirectory) !== runId) {
    throw new Error('Generated run directory failed containment validation')
  }
  const paths = { approvedRoot, runsRoot: realRunsRoot, runDirectory: resolvedRunDirectory, [SAFE_RUN_DIRECTORY]: true } as const
  SAFE_RUN_DIRECTORIES.set(paths, { approvedRoot, runsRoot: realRunsRoot, runDirectory: resolvedRunDirectory })
  return paths
}

export async function removeSafeRunDirectory(paths: SafeRunDirectory, runId: string): Promise<void> {
  if (!RUN_ID_PATTERN.test(runId)) throw new Error('Refusing to remove a non-UUID run directory')
  const generated = SAFE_RUN_DIRECTORIES.get(paths)
  if (
    paths[SAFE_RUN_DIRECTORY] !== true
    || !generated
    || paths.approvedRoot !== generated.approvedRoot
    || paths.runsRoot !== generated.runsRoot
    || paths.runDirectory !== generated.runDirectory
  ) throw new Error('Refusing to remove a run path not created by this harness')
  const approvedStat = await lstat(paths.approvedRoot)
  const runsStat = await lstat(paths.runsRoot)
  if (approvedStat.isSymbolicLink() || !approvedStat.isDirectory() || runsStat.isSymbolicLink() || !runsStat.isDirectory()) {
    throw new Error('Refusing cleanup through a symlinked artifact root')
  }
  const approvedRoot = await realpath(paths.approvedRoot)
  const runsRoot = await realpath(paths.runsRoot)
  if (approvedRoot !== paths.approvedRoot || runsRoot !== paths.runsRoot || !contained(approvedRoot, runsRoot)) {
    throw new Error('Refusing cleanup outside the approved realpath root')
  }
  const candidate = path.join(paths.runsRoot, runId)
  if (candidate !== paths.runDirectory || path.dirname(candidate) !== paths.runsRoot) {
    throw new Error('Refusing to remove an unresolved run path')
  }
  let stat
  try {
    stat = await lstat(candidate)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Refusing to remove a symlinked run path')
  const resolved = await realpath(candidate)
  if (resolved !== candidate || !contained(paths.approvedRoot, resolved)) throw new Error('Refusing to remove escaped run path')
  await rm(resolved, { recursive: true })
}

export function isPhaseOneRunId(value: string): boolean {
  return RUN_ID_PATTERN.test(value)
}
