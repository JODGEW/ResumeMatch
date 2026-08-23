import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

import type { EvaluationIdentity } from '../../browser/types'

const GIT_ENVIRONMENT = { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' }

/** Generated directories that must never contribute to a source digest. */
const EXCLUDED_SOURCE_PREFIXES = ['.qa-artifacts/', '.qa-dist/']

function digestEntries(entries: Array<{ key: string; body: Buffer }>): string {
  const hash = createHash('sha256')
  for (const entry of [...entries].sort((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0))) {
    hash.update(createHash('sha256').update(`${entry.key}\0`).update(entry.body).digest())
  }
  return hash.digest('hex')
}

/**
 * Digest the tracked source of one checkout, after any mutation is applied.
 *
 * Tracked files only, so an untracked scratch file cannot change the identity of
 * an evaluation copy; generated build and artifact directories are excluded.
 * @param checkout - directory of the evaluation copy.
 * @returns lowercase SHA-256 hex.
 */
export async function sourceDigest(checkout: string): Promise<string> {
  const listed = execFileSync('git', ['ls-files', '-z'], { cwd: checkout, encoding: 'buffer', env: GIT_ENVIRONMENT })
    .toString('utf8').split('\0').filter(name => name.length > 0)
    .filter(name => !EXCLUDED_SOURCE_PREFIXES.some(prefix => name.startsWith(prefix)))
  const entries = []
  for (const name of listed) entries.push({ key: name, body: await readFile(path.join(checkout, name)) })
  return digestEntries(entries)
}

async function listFiles(directory: string, root = directory): Promise<string[]> {
  const output: string[] = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    // Dot entries are skipped for the same reason `generatedBuildResourcePaths`
    // skips them: the build never emits one, and a `.DS_Store` a file browser
    // drops into the output would otherwise change the evaluation identity and
    // read as source drift. Measured: it was the only difference between two
    // otherwise byte-identical builds of the same commit.
    if (entry.name.startsWith('.')) continue
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) output.push(...await listFiles(full, root))
    else if (entry.isFile()) output.push(path.relative(root, full).split(path.sep).join('/'))
  }
  return output
}

/**
 * Digest a generated QA build.
 *
 * Vite names most assets by content hash, but `index.html` and any unhashed
 * asset still need covering, so every emitted file contributes.
 * @param buildDirectory - the generated build root, normally `.qa-dist`.
 * @returns lowercase SHA-256 hex.
 */
export async function buildDigest(buildDirectory: string): Promise<string> {
  const names = await listFiles(buildDirectory)
  const entries = []
  for (const name of names) entries.push({ key: name, body: await readFile(path.join(buildDirectory, name)) })
  return digestEntries(entries)
}

/** Which digests disagree between a recorded identity and a freshly computed pair. */
export interface SourceDrift {
  drifted: boolean
  fields: Array<'sourceDigest' | 'buildDigest'>
}

/**
 * Compare a manifest's recorded evaluation identity against freshly computed digests.
 *
 * A reproduction must run against the same mutated source and build as the
 * failure it investigates; without this the two could silently diverge when the
 * investigation rebuilds.
 * @param recorded - the identity the manifest carries, or null for a release bundle.
 * @param computed - digests measured in the checkout about to be investigated.
 * @returns which fields drifted; never drifted for a release bundle.
 */
export function detectSourceDrift(
  recorded: EvaluationIdentity | null,
  computed: { sourceDigest: string; buildDigest: string },
): SourceDrift {
  if (recorded === null) return { drifted: false, fields: [] }
  const fields: Array<'sourceDigest' | 'buildDigest'> = []
  if (recorded.sourceDigest !== computed.sourceDigest) fields.push('sourceDigest')
  if (recorded.buildDigest !== computed.buildDigest) fields.push('buildDigest')
  return { drifted: fields.length > 0, fields }
}
