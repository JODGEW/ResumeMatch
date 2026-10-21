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
const CURRENT_VERSION = '### Freeze v9'
/** The version v9 superseded, kept byte-for-byte as the record its sweeps were taken under. */
const V8_VERSION = '### Freeze v8'
/** sha256 of the Freeze v8 section, from its heading up to the Freeze v7 heading, when v9 superseded it. */
const V8_SECTION_SHA256 = 'f9c03f49c022bd421ebb8ff10518c9590ff3678dca3a4e34e5ad970b9d726efd'
/** The version v8 superseded, kept the same way. */
const V7_VERSION = '### Freeze v7'
/** sha256 of the Freeze v7 section, from its heading up to the Freeze v6 heading, when v8 superseded it. */
const V7_SECTION_SHA256 = '0e42f517c9acdbea57256a9d939de916df642096eb14c6afc9c2ce9abafc7564'
/** The version v7 superseded, kept the same way. */
const V6_VERSION = '### Freeze v6'
/** sha256 of the Freeze v6 section, from its heading up to the Freeze v5 heading, when v7 superseded it. */
const V6_SECTION_SHA256 = '19fcbc194d4f15cab856be239ed2efa6a6a507893f1f37428814022f64a1df99'
/** The version v6 superseded, kept the same way. */
const V5_VERSION = '### Freeze v5'
/** sha256 of the Freeze v5 section, from its heading up to the Freeze v4 heading, when v6 superseded it. */
const V5_SECTION_SHA256 = 'b644147ada40e368e96c5ca112fae26e3ac8acf979992820e9c12d4f1cb182c0'

/** The files v6 froze and v7, v8 and v9 keep: the investigator interface, the scoring and cases, and the scenario and evidence model. */
const FROZEN_REFERENCES = [
  'adapter:cordis.yml',
  'adapter:prompts/investigator.md',
  'adapter:run-config.anthropic-haiku.yml',
  'adapter:run-config.anthropic-opus.yml',
  'adapter:run-config.anthropic.yml',
  'adapter:run-config.yml',
  'adapter:src/pricing.ts',
  'adapter:src/qa-tools.ts',
  'adapter:src/system-prompt.ts',
  'qa/browser/artifactValidator.ts',
  'qa/browser/contractRouter.ts',
  'qa/browser/evidence.ts',
  'qa/browser/networkPolicy.ts',
  'qa/browser/oracleRegistry.ts',
  'qa/browser/oracles.ts',
  'qa/browser/runReleaseCheck.ts',
  'qa/browser/scenarios.ts',
  'qa/browser/uploadObservation.ts',
  'qa/fixtures/data.ts',
  'qa/investigation/actions.ts',
  'qa/investigation/budget.ts',
  'qa/investigation/cost.ts',
  'qa/investigation/errors.ts',
  'qa/investigation/evalCases.ts',
  'qa/investigation/evalRunner/mutation.ts',
  'qa/investigation/evalRunner/runCase.ts',
  'qa/investigation/evidenceReader.ts',
  'qa/investigation/finding.ts',
  'qa/investigation/goldEvidence.ts',
  'qa/investigation/goldProbe.ts',
  'qa/investigation/heldoutDefinitions.ts',
  'qa/investigation/reproduction.ts',
  'qa/investigation/rootCauseGold.ts',
  'qa/investigation/rootCauseScore.ts',
  'qa/investigation/session.ts',
  'qa/investigation/triage.ts',
  'tests/e2e/evalCase.e2e.ts',
]

interface FrozenFile { reference: string; sha256: string }

async function section(version: string): Promise<string> {
  const document = await readFile(FREEZE_DOCUMENT, 'utf8')
  const start = document.indexOf(version)
  if (start === -1) throw new Error(`${version} is missing from the freeze record`)
  const next = document.indexOf('### Freeze v', start + version.length)
  return document.slice(start, next === -1 ? undefined : next)
}

async function frozenFiles(version: string = CURRENT_VERSION): Promise<FrozenFile[]> {
  return [...(await section(version)).matchAll(ROW)].map(match => ({ reference: match[1], sha256: match[2] }))
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
    expect(files).toHaveLength(37)
    expect(new Set(files.map(file => file.reference)).size).toBe(files.length)
  })

  it('matches the recorded hash for every frozen repository file', async () => {
    const files = (await frozenFiles()).filter(file => !file.reference.startsWith('adapter:'))
    expect(files).toHaveLength(28)
    for (const file of files) {
      expect({ reference: file.reference, sha256: await digest(resolve(file.reference)) })
        .toEqual({ reference: file.reference, sha256: file.sha256 })
    }
  })

  it('matches the recorded hash for every frozen adapter file that is present', async () => {
    const files = (await frozenFiles()).filter(file => file.reference.startsWith('adapter:'))
    expect(files).toHaveLength(9)
    for (const file of files) {
      const actual = await digest(resolve(file.reference))
      if (actual === null) continue
      expect({ reference: file.reference, sha256: actual }).toEqual({ reference: file.reference, sha256: file.sha256 })
    }
  })

  it('freezes the investigator interface, the scoring and cases, and the scenario and evidence model', async () => {
    expect((await frozenFiles()).map(file => file.reference).sort()).toEqual(FROZEN_REFERENCES)
  })

  it('keeps Freeze v8 as readable history, unchanged byte for byte', async () => {
    expect((await frozenFiles(V8_VERSION)).map(file => file.reference).sort()).toEqual(FROZEN_REFERENCES)
    expect(createHash('sha256').update(await section(V8_VERSION)).digest('hex')).toBe(V8_SECTION_SHA256)
  })

  it('keeps Freeze v7 as readable history, unchanged byte for byte', async () => {
    expect((await frozenFiles(V7_VERSION)).map(file => file.reference).sort()).toEqual(FROZEN_REFERENCES)
    expect(createHash('sha256').update(await section(V7_VERSION)).digest('hex')).toBe(V7_SECTION_SHA256)
  })

  it('keeps Freeze v6 as readable history, unchanged byte for byte', async () => {
    expect((await frozenFiles(V6_VERSION)).map(file => file.reference).sort()).toEqual(FROZEN_REFERENCES)
    expect(createHash('sha256').update(await section(V6_VERSION)).digest('hex')).toBe(V6_SECTION_SHA256)
  })

  it('keeps Freeze v5 as readable history, unchanged byte for byte', async () => {
    expect((await frozenFiles(V5_VERSION)).map(file => file.reference).sort()).toEqual([
      'adapter:cordis.yml',
      'adapter:prompts/investigator.md',
      'adapter:run-config.yml',
      'adapter:src/qa-tools.ts',
      'qa/browser/oracleRegistry.ts',
      'qa/investigation/actions.ts',
      'qa/investigation/budget.ts',
      'qa/investigation/evalCases.ts',
      'qa/investigation/finding.ts',
    ])
    expect(createHash('sha256').update(await section(V5_VERSION)).digest('hex')).toBe(V5_SECTION_SHA256)
  })
})
