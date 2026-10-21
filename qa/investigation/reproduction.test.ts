import { errors } from '@playwright/test'
import type { Page } from '@playwright/test'
import { describe, expect, it } from 'vitest'

import type { OracleContext } from '../browser/oracleRegistry'
import { createScenario, type ScenarioInstance } from '../browser/scenarios'
import type { ScenarioId } from '../browser/types'
import { classify } from './finding'
import { judgeReproduction } from './reproduction'

const CLICKED = 'reproduction-click:Analyze Resume'
const UPLOAD_ACCEPTED = 'upload-contract:accepted-new-resume'
const TIMEOUT_OPENED = 'reproduction-open:/results/qa-timeout-1'

interface FakePageOptions {
  /** The pathname the page is on. */
  pathname: string
  /** Whether every element a visibility check names is on the page; absence checks always find nothing. */
  visible: boolean
  /** Whether a URL wait reaches its target. */
  navigates?: boolean
  /** Runs inside the first wait, standing for what the page does while it is awaited. */
  duringFirstWait?: () => void
}

/**
 * A page that answers every locator the same way and records each wait it is
 * asked for, so a verdict can be judged without a browser.
 */
function fakePage(options: FakePageOptions): { page: Page; waits: number[] } {
  const waits: number[] = []
  let first = true
  const wait = async (timeout: number, reached: boolean): Promise<void> => {
    waits.push(timeout)
    if (first) {
      first = false
      options.duringFirstWait?.()
    }
    if (!reached) throw new errors.TimeoutError(`Timeout ${timeout}ms exceeded.`)
  }
  const locator: Record<string, unknown> = {
    first: () => locator,
    getByText: () => locator,
    waitFor: ({ timeout }: { timeout: number }) => wait(timeout, options.visible),
    isVisible: async () => options.visible,
    count: async () => 0,
  }
  const page = {
    getByRole: () => locator,
    getByText: () => locator,
    locator: () => locator,
    url: () => `http://127.0.0.1:4173${options.pathname}`,
    waitForURL: (_target: unknown, { timeout }: { timeout: number }) => wait(timeout, options.navigates ?? false),
    waitForLoadState: async () => undefined,
  }
  return { page: page as unknown as Page, waits }
}

function contextFor(scenario: ScenarioInstance): OracleContext {
  return {
    scenario,
    networkSummary: () => ({ resumeMatchRest: 0, cognito: 0, s3: 0, deepgram: 0, outreach: 0, unexpectedEgress: 0, locallyFulfilled: 0 }),
    analysisCountAtTimeout: null,
  }
}

async function judge(scenarioId: ScenarioId, scenario: ScenarioInstance, failedOracle: string, page: Page) {
  const result = await judgeReproduction(page, contextFor(scenario), scenarioId, failedOracle, 0)
  return { result, classification: classify({ policyBlocked: false, failedOracle, reproductionOracleResult: result }) }
}

describe('judging a D2-shaped reproduction: clicked, then run_oracle immediately', () => {
  function rejectedUpload(): ScenarioInstance {
    const scenario = createScenario('P1-02')
    scenario.recordTransition(CLICKED)
    scenario.counters.upload = 1
    scenario.recordContractViolation('new-upload-body-schema')
    return scenario
  }

  it('is still confirmed when the page never leaves /upload', async () => {
    const { page } = fakePage({ pathname: '/upload', visible: false })
    const { result, classification } = await judge('P1-02', rejectedUpload(), 'P1-02_RESULTS_NAVIGATION', page)
    expect(result.failures.map(item => item.oracleId)).toContain('P1-02_RESULTS_NAVIGATION')
    expect(result.preconditionMet).toBe(true)
    expect(classification).toBe('confirmed')
  })

  it('waits for the route until click + 30 s, as requireUrl did, before judging it', async () => {
    const { page, waits } = fakePage({ pathname: '/upload', visible: false })
    await judge('P1-02', rejectedUpload(), 'P1-02_RESULTS_NAVIGATION', page)
    expect(waits[0]).toBeGreaterThan(29_000)
    expect(waits[0]).toBeLessThanOrEqual(30_000)
  })
})

describe('judging a B2-shaped reproduction: clicked, then run_oracle immediately', () => {
  function clickedOnly(): ScenarioInstance {
    const scenario = createScenario('P1-02')
    scenario.recordTransition(CLICKED)
    return scenario
  }
  /** What the product does while the completed report is awaited: the upload is accepted and polling completes. */
  function completes(scenario: ScenarioInstance): () => void {
    return () => {
      scenario.recordTransition(UPLOAD_ACCEPTED)
      scenario.counters.upload = 1
      scenario.counters.lastResume = 1
      scenario.counters.s3 = 1
      scenario.counters.analysis = 3
    }
  }

  it('reads the precondition after the wait, so an upload accepted meanwhile is judged, not skipped', async () => {
    const scenario = clickedOnly()
    const { page } = fakePage({ pathname: '/results/qa-new-1', visible: true, navigates: true, duringFirstWait: completes(scenario) })
    const { result, classification } = await judge('P1-02', scenario, 'P1-02_COMPLETED_REPORT', page)
    expect(result.evaluated[0]).toBe('P1-02_COMPLETED_REPORT')
    expect(result.preconditionMet).toBe(true)
    expect(classification).toBe('not_reproduced')
  })

  it('gives the sweep the original failure’s deadline, not a fixed 3 s per observation', async () => {
    const scenario = clickedOnly()
    const { page, waits } = fakePage({ pathname: '/results/qa-new-1', visible: true, navigates: true, duringFirstWait: completes(scenario) })
    await judge('P1-02', scenario, 'P1-02_COMPLETED_REPORT', page)
    expect(waits.length).toBeGreaterThan(1)
    for (const timeout of waits) {
      expect(timeout).toBeGreaterThan(40_000)
      expect(timeout).toBeLessThanOrEqual(46_000)
    }
  })

  it('waits no further once the shared deadline has expired', async () => {
    const scenario = createScenario('P1-02')
    scenario.transitions.push({ sequence: 1, relativeTimestampMs: Date.now() - scenario.startedAt - 60_000, event: CLICKED })
    completes(scenario)()
    const { page, waits } = fakePage({ pathname: '/results/qa-new-1', visible: true, navigates: true })
    const { classification } = await judge('P1-02', scenario, 'P1-02_COMPLETED_REPORT', page)
    expect(waits).toEqual([])
    expect(classification).toBe('not_reproduced')
  })
})

describe('judging a B5-shaped reproduction under the controlled clock', () => {
  function advanced(ms: number): ScenarioInstance {
    const scenario = createScenario('P1-05')
    scenario.recordTransition(TIMEOUT_OPENED)
    scenario.recordTransition(`reproduction-clock:${ms}`)
    scenario.counters.analysis = 80
    return scenario
  }

  it('is inconclusive, not confirmed, when the clock was advanced too little for the timeout', async () => {
    const { page } = fakePage({ pathname: '/results/qa-timeout-1', visible: false })
    const { result, classification } = await judge('P1-05', advanced(30_000), 'P1-05_TIMEOUT_STATE', page)
    expect(result.failures.map(item => item.oracleId)).toContain('P1-05_TIMEOUT_STATE')
    expect(result.preconditionMet).toBe(false)
    expect(classification).toBe('inconclusive')
  })

  it('does not block a not_reproduced verdict: the gate only stands between a failure and a confirmation', async () => {
    const { page } = fakePage({ pathname: '/results/qa-timeout-1', visible: true })
    const scenario = advanced(30_000)
    const result = await judgeReproduction(page, { ...contextFor(scenario), analysisCountAtTimeout: 80 }, 'P1-05', 'P1-05_TIMEOUT_STATE', 0)
    expect(result.preconditionMet).toBe(true)
    expect(classify({ policyBlocked: false, failedOracle: 'P1-05_TIMEOUT_STATE', reproductionOracleResult: result })).toBe('not_reproduced')
  })

  it('is not_reproduced when more than four minutes were advanced and the timeout appeared', async () => {
    const { page } = fakePage({ pathname: '/results/qa-timeout-1', visible: true })
    const scenario = advanced(240_001)
    const result = await judgeReproduction(page, { ...contextFor(scenario), analysisCountAtTimeout: 80 }, 'P1-05', 'P1-05_TIMEOUT_STATE', 0)
    expect(result.preconditionMet).toBe(true)
    expect(classify({ policyBlocked: false, failedOracle: 'P1-05_TIMEOUT_STATE', reproductionOracleResult: result })).toBe('not_reproduced')
  })
})
