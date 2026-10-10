import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { describe, expect, it } from 'vitest'

import { parseProviderLog, providerLogCostUsd, providerLogTotals } from '../cost'
import {
  caseArtifactPaths, guardRecordedUsage, stopsSweep, summaryTable, sweepCostUsd, transcriptUsageEvents, USAGE_NOT_RECORDED,
} from './runCase'
import type { EvalCaseResult } from './runCase'

function result(overrides: Partial<EvalCaseResult>): EvalCaseResult {
  return {
    caseId: 'C1', kind: 'clean', scenarioId: 'P1-01', runId: 'p1-01-x', oracleStatus: 'passed',
    expectationMet: true, failedOracle: null, artifactValidation: 'passed', releaseGrade: false,
    triage: 'expected', expectedTriage: 'expected', triageMatched: true, harnessLaunched: false,
    modelRequests: 0, classification: null, expectedClassification: null, classificationMatched: false,
    firstProbe: null, goldFirstProbe: null, goldProbeHit: null, goldProbeWithinFirst3: null, goldProbeWithinFirst4Excl: null, rejectedCalls: 0,
    costUsd: 0, findingCostUsd: 0, wallClockMs: 4_000,
    worktreeRemoved: true, errors: [],
    ...overrides,
  }
}

describe('sweepCostUsd', () => {
  it('sums the cost of every completed case', () => {
    expect(sweepCostUsd([result({ costUsd: 0.02 }), result({ costUsd: 0.13 })])).toBeCloseTo(0.15, 10)
    expect(sweepCostUsd([])).toBe(0)
  })
})

describe('summaryTable', () => {
  it('renders one aligned row per case with the counted model requests', () => {
    const table = summaryTable([
      result({}),
      result({
        caseId: 'D1', kind: 'seeded_defect', triage: 'investigate', expectedTriage: 'investigate',
        harnessLaunched: true, modelRequests: 11, classification: 'confirmed', expectedClassification: 'confirmed',
        classificationMatched: true, firstProbe: 'read_network_events', goldFirstProbe: 'read_network_events',
        goldProbeHit: true, goldProbeWithinFirst3: true, goldProbeWithinFirst4Excl: true,
        rejectedCalls: 3, costUsd: 0.0231, wallClockMs: 9_000,
      }),
    ])
    const lines = table.split('\n')
    expect(lines[0].split(/\s+/)).toEqual([
      'case', 'kind', 'triage', 'ok', 'requests', 'rejected', 'classification', 'ok', 'first', 'probe', 'gold', 'gold3',
      'gold4x', 'cost', 'wall', 'clean',
    ])
    expect(lines[2]).toMatch(/^C1\s+clean\s+expected\s+y\s+0\s+0\s/)
    expect(lines[3]).toMatch(/^D1\s+seeded_defect\s+investigate\s+y\s+11\s+3\s+confirmed\s+y\s+read_network_events\s+y\s+y\s+y\s+\$0\.0231\s+9s\s+y/)
  })

  it('marks a clean case with no expected classification as matching', () => {
    expect(summaryTable([result({ classification: null, expectedClassification: null, classificationMatched: false })]))
      .toMatch(/C1\s+clean\s+expected\s+y\s+0\s+0\s+-\s+y/)
  })
})

describe('case artifact paths', () => {
  it('lets a harness child in another directory write the log a relative --output names', async () => {
    const root = await realpath(await mkdtemp(path.join(tmpdir(), 'qa-output-')))
    const child = await mkdtemp(path.join(tmpdir(), 'qa-harness-child-'))
    try {
      const output = path.relative(process.cwd(), path.join(root, 'sweep'))
      await mkdir(output, { recursive: true })
      const { requestLog } = caseArtifactPaths(output, 'D1')
      await writeFile(requestLog, '', 'utf8')
      // The adapter's append, from the scratch directory the harness child runs in.
      spawnSync(process.execPath, ['-e', "require('node:fs').appendFileSync(process.env.LOG, process.env.LINE + '\\n')"], {
        cwd: child,
        env: {
          LOG: requestLog,
          LINE: JSON.stringify({ cacheHitTokens: 0, cacheMissTokens: 10_000, completionTokens: 2_000, requestedAt: '2026-10-10T00:00:00.000Z' }),
        },
      })
      const logged = parseProviderLog(await readFile(requestLog, 'utf8'))
      const d1 = result({
        caseId: 'D1', harnessLaunched: true,
        modelRequests: providerLogTotals(logged).requests,
        costUsd: providerLogCostUsd(logged, { inputPerMillion: 0.1, outputPerMillion: 0.5, cacheHitPerMillion: 0.01 }),
      })
      expect(d1.modelRequests).toBe(1)
      expect(d1.costUsd).toBeCloseTo(0.002, 10)
      expect(sweepCostUsd([result({}), d1])).toBeCloseTo(0.002, 10)
      expect(summaryTable([d1]).split('\n')[2]).toMatch(/^D1\s+clean\s+expected\s+y\s+1\s+0\s.*\$0\.0020\s/)
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(child, { recursive: true, force: true })
    }
  })

  it('leaves the default absolute output directory as it was', () => {
    expect(caseArtifactPaths('/repo/.qa-artifacts/evaluations', 'C1')).toEqual({
      requestLog: '/repo/.qa-artifacts/evaluations/C1.model-requests.log',
      transcript: '/repo/.qa-artifacts/evaluations/C1.transcript.jsonl',
    })
  })
})

describe('recorded usage guard', () => {
  const USAGE_STEP = JSON.stringify({
    type: 'session_event', sessionId: 's',
    event: { type: 'assistant/message', data: { turn: 1, step: 1, usage: { inputTokens: 10, outputTokens: 2 } } },
  })
  const TRANSCRIPT = [USAGE_STEP, USAGE_STEP, '', '--- stderr ---', '(!) Some chunks are larger than 500 kB after minification.', 'null', '42'].join('\n')
  const PROVIDER_FAILURE = JSON.stringify({
    type: 'session_event', sessionId: 's',
    event: { type: 'turn/end', data: { turn: 1, reason: { kind: 'error', error: { message: '400', code: 'INVALID_REQUEST' } } } },
  })
  const ledger = (requests: number): EvalCaseResult['usage'] => ({
    cacheHitTokens: 0, cacheMissTokens: 0, completionTokens: 0,
    requests: Array.from({ length: requests }, () => ({ requestedAt: '2026-10-10T00:00:00.000Z', pricingWindow: 'peak', costUsd: 0.001 })),
  })
  const launched = (overrides: Partial<EvalCaseResult>) => result({
    caseId: 'D1', kind: 'seeded_defect', triage: 'investigate', expectedTriage: 'investigate', harnessLaunched: true,
    classification: 'confirmed', expectedClassification: 'confirmed', classificationMatched: true, ...overrides,
  })

  it('counts the assistant steps that reported usage, ignoring stderr', () => {
    expect(transcriptUsageEvents(TRANSCRIPT)).toBe(2)
    expect(transcriptUsageEvents(PROVIDER_FAILURE)).toBe(0)
  })

  it.each([
    ['neither the log nor the finding', 0, 0],
    ['the log', 0, 2],
    ['the finding', 2, 0],
  ])('fails a model-calling case whose usage missed %s, and stops the sweep', (_label, logged, ledgered) => {
    const lost = launched({ modelRequests: logged, usage: ledger(ledgered) })
    guardRecordedUsage(lost, transcriptUsageEvents(TRANSCRIPT))
    expect(lost.errors).toEqual([USAGE_NOT_RECORDED])
    expect(lost.classificationMatched).toBe(false)
    expect(stopsSweep(lost)).toBe(true)
    expect(summaryTable([lost]).split('\n')[2]).toMatch(/^D1\s+seeded_defect\s+investigate\s+y\s+\d+\s+0\s+confirmed\s+n\s/)
  })

  it('passes a case whose usage reached both the log and the finding', () => {
    const recorded = launched({ modelRequests: 2, usage: ledger(2) })
    guardRecordedUsage(recorded, transcriptUsageEvents(TRANSCRIPT))
    expect(recorded.errors).toEqual([])
    expect(recorded.classificationMatched).toBe(true)
    expect(stopsSweep(recorded)).toBe(false)
  })

  it('never fires for a zero-call case or a provider failure that produced no step', () => {
    const clean = result({})
    guardRecordedUsage(clean, 0)
    expect(clean.errors).toEqual([])
    const refused = launched({ classification: null, classificationMatched: false, errors: ['no finding was submitted'] })
    guardRecordedUsage(refused, transcriptUsageEvents(PROVIDER_FAILURE))
    expect(refused.errors).toEqual(['no finding was submitted'])
    expect(stopsSweep(refused)).toBe(false)
  })
})
