import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { buildDigest, detectSourceDrift } from './digest'
import { applyMutationById } from './mutation'
import type { MutationRegistry } from './mutation'
import { evaluationWorktreeRoot, worktreeLabel } from './worktree'
import type { EvaluationIdentity } from '../../browser/types'

const REGISTRY: MutationRegistry = caseId => ({
  D1: { file: 'src/api/upload.ts', find: '{ fileName, jobDescription }', replace: '{ filename: fileName, jobDescription }' },
  D9: { file: '../escape.ts', find: 'a', replace: 'b' },
  D8: { file: 'src/api/upload.ts', find: 'twice', replace: 'once' },
}[caseId])

async function checkout(content: string): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'qa-mutation-'))
  await mkdir(path.join(root, 'src', 'api'), { recursive: true })
  await writeFile(path.join(root, 'src', 'api', 'upload.ts'), content)
  return root
}

describe('mutation applier', () => {
  it('applies a mutation addressed only by case id', async () => {
    const root = await checkout("client.post('/upload', { fileName, jobDescription });\n")
    expect(await applyMutationById(root, 'D1', REGISTRY)).toBe('src/api/upload.ts')
    expect(await readFile(path.join(root, 'src', 'api', 'upload.ts'), 'utf8'))
      .toBe("client.post('/upload', { filename: fileName, jobDescription });\n")
  })

  it('refuses an anchor that does not match exactly once', async () => {
    const none = await checkout('nothing to match\n')
    await expect(applyMutationById(none, 'D1', REGISTRY)).rejects.toThrow(/matched 0 times/)
    const twice = await checkout('twice and twice\n')
    await expect(applyMutationById(twice, 'D8', REGISTRY)).rejects.toThrow(/matched 2 times/)
  })

  it('refuses anything that is not a corpus case id', async () => {
    const root = await checkout('x\n')
    for (const id of ['../../etc/passwd', 'd1', 'DROP', '']) {
      await expect(applyMutationById(root, id, REGISTRY)).rejects.toThrow(/Not a corpus case id/)
    }
  })

  it('refuses an unknown case and a file escaping the copy', async () => {
    const root = await checkout('x\n')
    await expect(applyMutationById(root, 'D7', REGISTRY)).rejects.toThrow(/seeds no mutation/)
    await expect(applyMutationById(root, 'D9', REGISTRY)).rejects.toThrow(/escapes the evaluation copy/)
  })
})

describe('build digest', () => {
  it('is stable for identical content and changes with any byte', async () => {
    const first = await mkdtemp(path.join(tmpdir(), 'qa-dist-a-'))
    const second = await mkdtemp(path.join(tmpdir(), 'qa-dist-b-'))
    for (const root of [first, second]) {
      await mkdir(path.join(root, 'assets'), { recursive: true })
      await writeFile(path.join(root, 'index.html'), '<html></html>')
      await writeFile(path.join(root, 'assets', 'app.js'), 'export default 1')
    }
    expect(await buildDigest(first)).toBe(await buildDigest(second))
    await writeFile(path.join(second, 'assets', 'app.js'), 'export default 2')
    expect(await buildDigest(first)).not.toBe(await buildDigest(second))
  })

  it('ignores dot entries a file browser may drop into the output', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'qa-dist-dot-'))
    await writeFile(path.join(root, 'index.html'), '<html></html>')
    const clean = await buildDigest(root)
    await writeFile(path.join(root, '.DS_Store'), 'finder')
    await mkdir(path.join(root, '.vite'), { recursive: true })
    await writeFile(path.join(root, '.vite', 'manifest.json'), '{}')
    expect(await buildDigest(root)).toBe(clean)
  })
})

describe('source drift', () => {
  const identity: EvaluationIdentity = {
    caseId: 'D1', mutationApplied: 'D1', transientFaults: [],
    sourceDigest: 'a'.repeat(64), buildDigest: 'b'.repeat(64), worktreeLabel: 'abcdef012345-d1', approvedRequestHashes: [],
  }

  it('never drifts for a release bundle', () => {
    expect(detectSourceDrift(null, { sourceDigest: 'c'.repeat(64), buildDigest: 'd'.repeat(64) }))
      .toEqual({ drifted: false, fields: [] })
  })

  it('accepts a matching evaluation checkout', () => {
    expect(detectSourceDrift(identity, { sourceDigest: 'a'.repeat(64), buildDigest: 'b'.repeat(64) }))
      .toEqual({ drifted: false, fields: [] })
  })

  it('names each drifted digest', () => {
    expect(detectSourceDrift(identity, { sourceDigest: 'z'.repeat(64), buildDigest: 'b'.repeat(64) }))
      .toEqual({ drifted: true, fields: ['sourceDigest'] })
    expect(detectSourceDrift(identity, { sourceDigest: 'z'.repeat(64), buildDigest: 'y'.repeat(64) }))
      .toEqual({ drifted: true, fields: ['sourceDigest', 'buildDigest'] })
  })
})

describe('worktree labelling', () => {
  it('derives a manifest-safe label carrying no absolute path', () => {
    const label = worktreeLabel('9fa308337398fba41594c5240d9566a736e9cf44', 'D1')
    expect(label).toBe('9fa308337398-d1')
    expect(label).toMatch(/^[a-z0-9-]{1,64}$/)
  })

  it('refuses a short commit or a non-case id', () => {
    expect(() => worktreeLabel('9fa3083', 'D1')).toThrow(/40-character commit/)
    expect(() => worktreeLabel('9fa308337398fba41594c5240d9566a736e9cf44', 'nope')).toThrow(/Not a corpus case id/)
  })

  it('keeps evaluation checkouts outside the repository', () => {
    expect(evaluationWorktreeRoot().startsWith(process.cwd())).toBe(false)
  })
})
