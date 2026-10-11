import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { describe, expect, it } from 'vitest'

import { parseProviderLog, providerLogCostUsd, providerLogTotals } from '../cost'
import { EVAL_CASES } from '../evalCases'
import {
  caseArtifactPaths, evidenceProbeSummary, guardRecordedUsage, recordRootCauseGrade, rootCauseSummary, SCRIPT_BY_SCENARIO, stopsSweep, summaryTable,
  sweepCostUsd, transcriptUsageEvents, USAGE_NOT_RECORDED,
} from './runCase'
import type { EvalCaseResult } from './runCase'

function result(overrides: Partial<EvalCaseResult>): EvalCaseResult {
  return {
    caseId: 'C1', kind: 'clean', scenarioId: 'P1-01', runId: 'p1-01-x', oracleStatus: 'passed',
    expectationMet: true, failedOracle: null, artifactValidation: 'passed', releaseGrade: false,
    triage: 'expected', expectedTriage: 'expected', triageMatched: true, harnessLaunched: false,
    modelRequests: 0, classification: null, expectedClassification: null, classificationMatched: false,
    firstProbe: null, goldFirstProbe: null, goldProbeHit: null, goldProbeWithinFirst3: null, goldProbeWithinFirst4Excl: null,
    goldEvidenceProbeHit: null, rootCauseAttributionCorrect: null, rootCauseTripleCorrect: null, rootCauseUndetermined: null, rootCauseGradeReason: null,
    rejectedCalls: 0,
    costUsd: 0, findingCostUsd: 0, wallClockMs: 4_000,
    worktreeRemoved: true, errors: [],
    ...overrides,
  }
}

describe('root-cause columns', () => {
  const OLD_HEADER = ['case', 'kind', 'triage', 'ok', 'requests', 'rejected', 'classification', 'ok', 'first probe', 'gold', 'gold3', 'gold4x']

  it('adds attr, triple and undet after gold4x and leaves every older column and value in place', () => {
    const graded = result({
      caseId: 'D1', kind: 'seeded_defect', triage: 'investigate', expectedTriage: 'investigate', harnessLaunched: true,
      modelRequests: 9, classification: 'confirmed', expectedClassification: 'confirmed', classificationMatched: true,
      firstProbe: 'read_failure_manifest', goldFirstProbe: 'read_network_events', goldProbeHit: false,
      goldProbeWithinFirst3: false, goldProbeWithinFirst4Excl: true, costUsd: 0.0184, wallClockMs: 61_000,
    })
    recordRootCauseGrade(graded, { graded: true, attributionCorrect: true, tripleCorrect: false, undetermined: false, policyBlocked: false })
    const cells = (line: string) => line.trim().split(/\s{2,}/)
    const [header, , clean, d1] = summaryTable([result({}), graded]).split('\n')
    expect(cells(header)).toEqual([...OLD_HEADER, 'goldEv', 'attr', 'triple', 'undet', 'cost', 'wall', 'clean'])
    expect(cells(d1)).toEqual([
      'D1', 'seeded_defect', 'investigate', 'y', '9', '0', 'confirmed', 'y', 'read_failure_manifest', 'n', 'n', 'y',
      '-', 'y', 'n', 'n', '$0.0184', '61s', 'y',
    ])
    // A zero-call case grades nothing and shows "-" in each new column.
    expect(cells(clean)).toEqual(['C1', 'clean', 'expected', 'y', '0', '0', '-', 'y', '-', '-', '-', '-', '-', '-', '-', '-', '$0.0000', '4s', 'y'])
  })

  it('records the three per-case fields in the result and keeps the older fields untouched', () => {
    const before = result({ caseId: 'B1', classification: 'not_reproduced' })
    const after = { ...before }
    recordRootCauseGrade(after, { graded: true, attributionCorrect: false, tripleCorrect: false, undetermined: true, policyBlocked: false })
    expect(after).toEqual({
      ...before, rootCauseAttributionCorrect: false, rootCauseTripleCorrect: false, rootCauseUndetermined: true, rootCauseGradeReason: null,
    })
  })

  it('shows "-" and records the reason for a finding that is not graded', () => {
    const v1 = result({ caseId: 'D2' })
    recordRootCauseGrade(v1, { graded: false, reason: 'v1_finding' })
    expect(v1).toMatchObject({ rootCauseAttributionCorrect: null, rootCauseTripleCorrect: null, rootCauseUndetermined: null, rootCauseGradeReason: 'v1_finding' })
    expect(summaryTable([v1]).split('\n')[2]).toMatch(/\s-\s+-\s+-\s+-\s+\$0\.0000/)
  })

  it('reports the run totals over graded cases only, with a separate policy-blocked count', () => {
    const graded = (attribution: boolean, triple: boolean, undetermined: boolean, policyBlocked: boolean) => {
      const item = result({})
      recordRootCauseGrade(item, { graded: true, attributionCorrect: attribution, tripleCorrect: triple, undetermined, policyBlocked })
      return item
    }
    const notGraded = result({})
    recordRootCauseGrade(notGraded, { graded: false, reason: 'no_gold' })
    expect(rootCauseSummary([
      graded(true, true, false, false), graded(true, false, false, false), graded(false, false, true, false),
      graded(false, false, false, true), notGraded, result({}),
    ])).toBe('root cause attribution 2/4, triple 1/4, undetermined 1/4, policy-blocked 1/4')
    expect(rootCauseSummary([result({}), notGraded]))
      .toBe('root cause attribution -, triple -, undetermined -, policy-blocked - (0 graded)')
  })
})

describe('evidence-probe column', () => {
  it('shows goldEv after gold4x, leaves the older columns in place, and shows "-" when not graded', () => {
    const cells = (line: string) => line.trim().split(/\s{2,}/)
    const hit = result({ caseId: 'D1', goldEvidenceProbeHit: true, goldProbeHit: false, goldProbeWithinFirst3: false, goldProbeWithinFirst4Excl: true })
    const miss = result({ caseId: 'D2', goldEvidenceProbeHit: false })
    const [header, , d1, d2, b2] = summaryTable([hit, miss, result({ caseId: 'B2' })]).split('\n')
    const at = cells(header).indexOf('goldEv')
    expect(cells(header).slice(at - 3, at + 2)).toEqual(['gold', 'gold3', 'gold4x', 'goldEv', 'attr'])
    expect(cells(d1).slice(at - 3, at + 1)).toEqual(['n', 'n', 'y', 'y'])
    expect(cells(d2)[at]).toBe('n')
    expect(cells(b2)[at]).toBe('-')
  })

  it('reports the run count over graded cases only', () => {
    expect(evidenceProbeSummary([
      result({ goldEvidenceProbeHit: true }), result({ goldEvidenceProbeHit: false }), result({ goldEvidenceProbeHit: true }), result({}),
    ])).toBe('evidence probe 2/3')
    expect(evidenceProbeSummary([result({})])).toBe('evidence probe - (0 graded)')
  })
})

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
      'gold4x', 'goldEv', 'attr', 'triple', 'undet', 'cost', 'wall', 'clean',
    ])
    expect(lines[2]).toMatch(/^C1\s+clean\s+expected\s+y\s+0\s+0\s/)
    expect(lines[3]).toMatch(/^D1\s+seeded_defect\s+investigate\s+y\s+11\s+3\s+confirmed\s+y\s+read_network_events\s+y\s+y\s+y\s+-\s+-\s+-\s+-\s+\$0\.0231\s+9s\s+y/)
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

describe('scripted plan by scenario', () => {
  it('names a plan for every scenario a public case is investigated in, so none falls back to the upload plan', () => {
    const investigated = [...new Set(EVAL_CASES.filter(item => item.expectedTriage === 'investigate').map(item => item.scenarioId))].sort()
    expect(investigated.filter(scenarioId => SCRIPT_BY_SCENARIO[scenarioId] === undefined)).toEqual([])
    expect(SCRIPT_BY_SCENARIO['P1-05']).toBe('timeout')
  })
})
