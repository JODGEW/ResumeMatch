import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import { describe, expect, it } from 'vitest'

import { oracleById, oraclesForScenario, PHASE1_URL_MS, PHASE1_VISIBLE_MS, verifyOraclesForScenario } from './oracleRegistry'
import type { OracleContext } from './oracleRegistry'
import { createScenario } from './scenarios'
import type { Page } from '@playwright/test'

/** The registry entries that need no page reach it never; a stub keeps the test browser-free. */
const NO_PAGE = {} as Page

function context(options: { uploads?: number; violation?: string } = {}): OracleContext {
  const scenario = createScenario('P1-02')
  scenario.counters.upload = options.uploads ?? 0
  if (options.violation !== undefined) scenario.recordContractViolation(options.violation)
  return {
    scenario,
    networkSummary: () => ({ resumeMatchRest: 0, cognito: 0, s3: 0, deepgram: 0, outreach: 0, unexpectedEgress: 0, locallyFulfilled: 0 }),
    analysisCountAtTimeout: null,
  }
}

describe('CONTRACT_UPLOAD_BODY', () => {
  const oracle = oracleById('P1-02', 'CONTRACT_UPLOAD_BODY')

  it('is part of the verify sweep', () => {
    expect(oracle).toBeDefined()
    expect(verifyOraclesForScenario('P1-02').map(item => item.id)).toContain('CONTRACT_UPLOAD_BODY')
  })

  it('needs the upload to have been attempted, not accepted', () => {
    expect(oracle?.preconditionTransition).toBeNull()
    expect(oracle?.precondition?.(context({ uploads: 0 }))).toBe(false)
    expect(oracle?.precondition?.(context({ uploads: 1 }))).toBe(true)
  })

  it('fails when the transition log records a rejected upload body (D2 shape)', async () => {
    const failing = context({ uploads: 1, violation: 'new-upload-body-schema' })
    await expect(oracle?.evaluate(NO_PAGE, failing)).rejects.toMatchObject({
      oracleId: 'CONTRACT_UPLOAD_BODY',
      message: 'The upload request body was rejected by the contract',
    })
  })

  it('passes for a normal upload, and for an unrelated violation', async () => {
    await expect(oracle?.evaluate(NO_PAGE, context({ uploads: 1 }))).resolves.toBeUndefined()
    await expect(oracle?.evaluate(NO_PAGE, context({ uploads: 1, violation: 's3-multipart-schema-or-count' })))
      .resolves.toBeUndefined()
  })
})

describe('P1-02_RESULTS_NAVIGATION precondition', () => {
  const oracle = oracleById('P1-02', 'P1-02_RESULTS_NAVIGATION')

  it('keys on the upload attempt so a rejected upload is still judged', () => {
    // Keying on the acceptance transition would skip exactly the run where the
    // upload was rejected — the one where "did it navigate" matters.
    expect(oracle?.precondition?.(context({ uploads: 1, violation: 'new-upload-body-schema' }))).toBe(true)
    expect(oracle?.precondition?.(context({ uploads: 0 }))).toBe(false)
  })
})

describe('Phase 1 wait chain', () => {
  it('starts each original failure where Phase 1 started waiting for it, with its summed budget', () => {
    const chain = (scenarioId: 'P1-01' | 'P1-02' | 'P1-04' | 'P1-05', id: string) => oracleById(scenarioId, id)?.chain
    // requireUrl 30 s from the click; then requireVisible 8 s per state.
    expect(chain('P1-02', 'P1-02_RESULTS_NAVIGATION')).toEqual({ after: 'reproduction-click:Analyze Resume', withinMs: 30_000 })
    expect(chain('P1-02', 'P1-02_PROCESSING_STATE')).toEqual({ after: 'reproduction-click:Analyze Resume', withinMs: 38_000 })
    expect(chain('P1-02', 'P1-02_COMPLETED_REPORT')).toEqual({ after: 'reproduction-click:Analyze Resume', withinMs: 46_000 })
    // Conditions get the gate's chain; visible ids on the gate's page add one requireVisible.
    expect(chain('P1-02', 'CONTRACT_S3_COUNT')).toEqual({ after: 'reproduction-click:Analyze Resume', withinMs: 46_000 })
    expect(chain('P1-02', 'COMPLETED_JOB_TITLE')).toEqual({ after: 'reproduction-click:Analyze Resume', withinMs: 54_000 })
    // goto's default 30 s navigation budget, then the first requireVisible.
    expect(chain('P1-01', 'P1-01_NO_REST')).toEqual({ after: 'reproduction-open:/sample', withinMs: 38_000 })
    expect(chain('P1-04', 'P1-04_FAILED_STATE')).toEqual({ after: 'reproduction-open:/results/qa-failed-1', withinMs: 46_000 })
    // The timeout state's real-time wait starts at the controlled-clock advance.
    expect(chain('P1-05', 'P1-05_TIMEOUT_STATE')).toEqual({ after: 'reproduction-clock:', withinMs: 8_000 })
  })

  it('gives every id Phase 1 raises a chain and a wait, and none to the one it never raises', () => {
    for (const scenarioId of ['P1-01', 'P1-02', 'P1-03', 'P1-04', 'P1-05'] as const) {
      for (const oracle of oraclesForScenario(scenarioId)) {
        const raisedByPhase1 = oracle.id !== 'CONTRACT_UPLOAD_BODY'
        expect({ id: oracle.id, chain: oracle.chain !== undefined, settle: oracle.settle !== undefined })
          .toEqual({ id: oracle.id, chain: raisedByPhase1, settle: raisedByPhase1 })
      }
    }
  })

  it('uses the budgets Phase 1 actually has', async () => {
    const source = await readFile(path.join(process.cwd(), 'qa', 'browser', 'oracles.ts'), 'utf8')
    expect(source).toMatch(/export async function requireVisible[\s\S]*?timeout: 8_000/)
    expect(source).toMatch(/export async function requireUrl[\s\S]*?timeout: 30_000/)
    expect(PHASE1_VISIBLE_MS).toBe(8_000)
    expect(PHASE1_URL_MS).toBe(30_000)
  })
})

describe('P1-05 controlled-clock fair chance', () => {
  function clocked(events: string[]): OracleContext {
    const scenario = createScenario('P1-05')
    for (const event of events) scenario.recordTransition(event)
    return { ...context(), scenario }
  }
  const OPENED = 'reproduction-open:/results/qa-timeout-1'
  const timeout = oracleById('P1-05', 'P1-05_TIMEOUT_STATE')

  it('needs more than four minutes of counted advance after the last open (under-advance fails)', () => {
    expect(timeout?.fairChance?.(clocked([OPENED, 'reproduction-clock:30000']))).toBe(false)
    expect(timeout?.fairChance?.(clocked([OPENED, 'reproduction-clock:180000']))).toBe(false)
    expect(timeout?.fairChance?.(clocked([OPENED, 'reproduction-clock:180000', 'reproduction-clock:60000']))).toBe(false)
    expect(timeout?.fairChance?.(clocked([OPENED, 'reproduction-clock:180000', 'reproduction-clock:60001']))).toBe(true)
  })

  it('ignores advances made before the route was opened', () => {
    expect(timeout?.fairChance?.(clocked(['reproduction-clock:180000', 'reproduction-clock:60001', OPENED]))).toBe(false)
    expect(timeout?.fairChance?.(clocked([OPENED, 'reproduction-clock:180000', 'reproduction-clock:60001', OPENED]))).toBe(false)
  })

  it('applies to every observation Phase 1 makes after the timeout, and to nothing before it', () => {
    const gated = oraclesForScenario('P1-05').filter(oracle => oracle.fairChance !== undefined).map(oracle => oracle.id)
    expect(gated).toEqual(['P1-05_TIMEOUT_STATE', ...verifyOraclesForScenario('P1-05').map(oracle => oracle.id)])
    for (const scenarioId of ['P1-01', 'P1-02', 'P1-03', 'P1-04'] as const) {
      expect(oraclesForScenario(scenarioId).filter(oracle => oracle.fairChance !== undefined)).toEqual([])
    }
  })
})

describe('registry shape', () => {
  it('gives every scenario a verify set and unique ids', () => {
    for (const scenarioId of ['P1-01', 'P1-02', 'P1-03', 'P1-04', 'P1-05'] as const) {
      const ids = oraclesForScenario(scenarioId).map(item => item.id)
      expect(new Set(ids).size).toBe(ids.length)
      expect(verifyOraclesForScenario(scenarioId).length).toBeGreaterThan(0)
    }
  })
})
