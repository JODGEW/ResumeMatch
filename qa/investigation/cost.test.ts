import { describe, expect, it } from 'vitest'

import {
  CostLedger, EVALUATION_COST_LIMIT_USD, INVESTIGATION_COST_LIMIT_USD,
  pricingWindow, requestCostUsd, sweepHasBudget,
} from './cost'

/** The peak rates the evaluation is authorized against. */
const RATES = { inputPerMillion: 0.44, outputPerMillion: 1.32 }

describe('request cost', () => {
  it('charges every prompt token at the input rate, cache hits included', () => {
    expect(requestCostUsd({ cacheHitTokens: 1_000_000, cacheMissTokens: 0, completionTokens: 0 }, RATES)).toBeCloseTo(0.44, 10)
    expect(requestCostUsd({ cacheHitTokens: 500_000, cacheMissTokens: 500_000, completionTokens: 0 }, RATES)).toBeCloseTo(0.44, 10)
    expect(requestCostUsd({ cacheHitTokens: 0, cacheMissTokens: 0, completionTokens: 1_000_000 }, RATES)).toBeCloseTo(1.32, 10)
  })

  it('is zero for a request that reported nothing', () => {
    expect(requestCostUsd({ cacheHitTokens: 0, cacheMissTokens: 0, completionTokens: 0 }, RATES)).toBe(0)
  })
})

describe('pricing window', () => {
  it('labels every request peak when no window is configured', () => {
    expect(pricingWindow(new Date('2026-08-20T18:00:00Z'))).toBe('peak')
    expect(pricingWindow(new Date('2026-08-20T06:00:00Z'))).toBe('peak')
  })

  it('labels a window that wraps past midnight', () => {
    const window = { startMinutes: 16 * 60 + 30, endMinutes: 30 }
    expect(pricingWindow(new Date('2026-08-20T16:29:00Z'), window)).toBe('peak')
    expect(pricingWindow(new Date('2026-08-20T16:30:00Z'), window)).toBe('off-peak')
    expect(pricingWindow(new Date('2026-08-20T23:59:00Z'), window)).toBe('off-peak')
    expect(pricingWindow(new Date('2026-08-20T00:29:00Z'), window)).toBe('off-peak')
    expect(pricingWindow(new Date('2026-08-20T00:30:00Z'), window)).toBe('peak')
  })
})

describe('investigation cost ceiling', () => {
  it('accumulates cost and the disjoint token counts', () => {
    const ledger = new CostLedger(RATES)
    ledger.record({ cacheHitTokens: 10, cacheMissTokens: 90, completionTokens: 50 }, new Date('2026-08-20T12:00:00Z'))
    ledger.record({ cacheHitTokens: 0, cacheMissTokens: 100, completionTokens: 50 }, new Date('2026-08-20T12:00:05Z'))
    expect(ledger.records()).toHaveLength(2)
    expect(ledger.records()[0]).toMatchObject({ requestedAt: '2026-08-20T12:00:00.000Z', pricingWindow: 'peak' })
    expect(ledger.totalUsd()).toBeCloseTo(requestCostUsd({ cacheHitTokens: 10, cacheMissTokens: 190, completionTokens: 100 }, RATES), 12)
    expect(ledger.isExhausted()).toBe(false)
  })

  it('latches and refuses once the ceiling is crossed, keeping the crossing request', () => {
    const ledger = new CostLedger(RATES, 0.01)
    expect(() => ledger.record({ cacheHitTokens: 0, cacheMissTokens: 0, completionTokens: 1_000_000 }, new Date('2026-08-20T12:00:00Z')))
      .toThrow(/cost ceiling of \$0\.01 is exhausted/)
    expect(ledger.isExhausted()).toBe(true)
    expect(ledger.records()).toHaveLength(1)
    expect(ledger.totalUsd()).toBeCloseTo(1.32, 10)
  })

  it('defaults to the authorized ceilings', () => {
    expect(INVESTIGATION_COST_LIMIT_USD).toBe(0.5)
    expect(EVALUATION_COST_LIMIT_USD).toBe(5)
    const ledger = new CostLedger(RATES)
    // Just under half a dollar of output at the peak rate stays inside the ceiling.
    ledger.record({ cacheHitTokens: 0, cacheMissTokens: 0, completionTokens: 370_000 }, new Date('2026-08-20T12:00:00Z'))
    expect(ledger.isExhausted()).toBe(false)
    expect(() => ledger.record({ cacheHitTokens: 0, cacheMissTokens: 0, completionTokens: 40_000 }, new Date('2026-08-20T12:00:01Z'))).toThrow()
  })
})

describe('sweep ceiling', () => {
  it('stops the sweep at five dollars', () => {
    expect(sweepHasBudget(4.99)).toBe(true)
    expect(sweepHasBudget(5)).toBe(false)
    expect(sweepHasBudget(7.5)).toBe(false)
  })
})
