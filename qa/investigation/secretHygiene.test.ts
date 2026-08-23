import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import { describe, expect, it } from 'vitest'

/**
 * The only process the API key may reach is the harness child. Everything else —
 * the QA launcher, the investigation server, the in-worktree scenario — runs
 * without it, and nothing projects it into an artifact.
 */
const KEY = 'DEEPSEEK_API_KEY'
const SECRET_SHAPES = [/\bsk-[A-Za-z0-9_-]{16,}\b/, /\bDEEPSEEK_API_KEY\s*[:=]\s*(?!process\.env)\S/]

async function source(file: string): Promise<string> {
  return readFile(path.join(process.cwd(), file), 'utf8')
}

async function projectedFiles(root: string, limit = 400): Promise<string[]> {
  const found: string[] = []
  async function walk(directory: string): Promise<void> {
    if (found.length >= limit) return
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch {
      // No artifacts on this machine yet: the source-level assertions still run.
      return
    }
    for (const entry of entries) {
      if (found.length >= limit) return
      const full = path.join(directory, entry.name)
      if (entry.isDirectory()) await walk(full)
      else if (/\.(?:json|txt|log|yaml)$/.test(entry.name)) found.push(full)
    }
  }
  await walk(path.join(process.cwd(), '.qa-artifacts', root))
  return found
}

describe('API key never leaves the environment', () => {
  it('is read only from the environment, and only for the harness child', async () => {
    const runner = await source('qa/investigation/evalRunner/runCase.ts')
    const occurrences = [...runner.matchAll(new RegExp(KEY, 'g'))]
    expect(occurrences.length).toBeGreaterThan(0)
    // Every mention forwards process.env into the harness spawn; none assigns a literal.
    for (const match of occurrences) {
      const line = runner.slice(runner.lastIndexOf('\n', match.index) + 1, runner.indexOf('\n', match.index))
      expect(line).toMatch(/process\.env/)
    }
  })

  it('is absent from the sanitized QA environment and the investigation server', async () => {
    expect(await source('qa/browser/qaCommand.mjs')).not.toContain(KEY)
    expect(await source('qa/investigation/serverMain.ts')).not.toContain(KEY)
    expect(await source('qa/investigation/session.ts')).not.toContain(KEY)
    expect(await source('tests/e2e/evalCase.e2e.ts')).not.toContain(KEY)
  })

  it('appears in no projected artifact', async () => {
    const live = process.env[KEY]
    const files = [...await projectedFiles('investigations'), ...await projectedFiles('evaluations'), ...await projectedFiles('runs', 60)]
    for (const file of files) {
      const text = await readFile(file, 'utf8')
      for (const shape of SECRET_SHAPES) {
        expect({ file, matched: shape.test(text) }).toEqual({ file, matched: false })
      }
      if (live !== undefined && live.length > 0) {
        expect({ file, containsLiveKey: text.includes(live) }).toEqual({ file, containsLiveKey: false })
      }
    }
  })
})
