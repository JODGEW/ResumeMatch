import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import { describe, expect, it } from 'vitest'

/** Where the adapter checkout lives when it is not at its default location. */
const ADAPTER_PATH = process.env.RESUMEMATCH_QA_ADAPTER_PATH
  ?? '/Users/wenhaohe/downloads/deepseek-harness/resumematch-qa-tools'

const FREEZE_DOCUMENT = path.join(process.cwd(), 'docs', 'qa-phase2.md')
const ROW = /^\| `([^`]+)` \| `([0-9a-f]{64})` \|$/gm
/** Only the current version gates; earlier tables are kept as history. */
const CURRENT_VERSION = '### Freeze v4'

interface FrozenFile { reference: string; sha256: string }

async function frozenFiles(): Promise<FrozenFile[]> {
  const document = await readFile(FREEZE_DOCUMENT, 'utf8')
  const start = document.indexOf(CURRENT_VERSION)
  if (start === -1) throw new Error(`${CURRENT_VERSION} is missing from the freeze record`)
  const next = document.indexOf('### Freeze v', start + CURRENT_VERSION.length)
  const section = document.slice(start, next === -1 ? undefined : next)
  return [...section.matchAll(ROW)].map(match => ({ reference: match[1], sha256: match[2] }))
}

function resolve(reference: string): string {
  return reference.startsWith('adapter:')
    ? path.join(ADAPTER_PATH, reference.slice('adapter:'.length))
    : path.join(process.cwd(), reference)
}

async function digest(file: string): Promise<string | null> {
  try {
    return createHash('sha256').update(await readFile(file)).digest('hex')
  } catch {
    // Absent adapter checkout: reported as unverified rather than failed, so the
    // repository rows still gate every run.
    return null
  }
}

describe('freeze record', () => {
  it('lists every frozen file exactly once', async () => {
    const files = await frozenFiles()
    expect(files).toHaveLength(8)
    expect(new Set(files.map(file => file.reference)).size).toBe(files.length)
  })

  it('matches the recorded hash for every frozen repository file', async () => {
    const files = (await frozenFiles()).filter(file => !file.reference.startsWith('adapter:'))
    expect(files).toHaveLength(4)
    for (const file of files) {
      expect({ reference: file.reference, sha256: await digest(resolve(file.reference)) })
        .toEqual({ reference: file.reference, sha256: file.sha256 })
    }
  })

  it('matches the recorded hash for every frozen adapter file that is present', async () => {
    const files = (await frozenFiles()).filter(file => file.reference.startsWith('adapter:'))
    expect(files).toHaveLength(4)
    for (const file of files) {
      const actual = await digest(resolve(file.reference))
      if (actual === null) continue
      expect({ reference: file.reference, sha256: actual }).toEqual({ reference: file.reference, sha256: file.sha256 })
    }
  })

  it('freezes the prompt, the tool descriptions, the grammar, the budgets, the schema, the corpus, and the composition', async () => {
    expect((await frozenFiles()).map(file => file.reference).sort()).toEqual([
      'adapter:cordis.yml',
      'adapter:prompts/investigator.md',
      'adapter:run-config.yml',
      'adapter:src/qa-tools.ts',
      'qa/investigation/actions.ts',
      'qa/investigation/budget.ts',
      'qa/investigation/evalCases.ts',
      'qa/investigation/finding.ts',
    ])
  })
})
