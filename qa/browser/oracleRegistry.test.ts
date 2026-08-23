import { describe, expect, it } from 'vitest'

import { oracleById, oraclesForScenario, verifyOraclesForScenario } from './oracleRegistry'
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

describe('registry shape', () => {
  it('gives every scenario a verify set and unique ids', () => {
    for (const scenarioId of ['P1-01', 'P1-02', 'P1-03', 'P1-04', 'P1-05'] as const) {
      const ids = oraclesForScenario(scenarioId).map(item => item.id)
      expect(new Set(ids).size).toBe(ids.length)
      expect(verifyOraclesForScenario(scenarioId).length).toBeGreaterThan(0)
    }
  })
})
