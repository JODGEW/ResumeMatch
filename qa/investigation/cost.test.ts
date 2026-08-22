import { describe, expect, it } from 'vitest'

import {
  CostLedger, EVALUATION_COST_LIMIT_USD, INVESTIGATION_COST_LIMIT_USD,
  parseProviderLog, pricingWindow, providerLogCostUsd, providerLogTotals, requestCostUsd, sweepHasBudget,
} from './cost'

/** The peak rates the evaluation is authorized against, cache hits included. */
const RATES = { inputPerMillion: 0.44, outputPerMillion: 1.32, cacheHitPerMillion: 0.014 }

describe('request cost', () => {
  it('charges cache hits at their own rate and misses at the input rate', () => {
    expect(requestCostUsd({ cacheHitTokens: 1_000_000, cacheMissTokens: 0, completionTokens: 0 }, RATES)).toBeCloseTo(0.014, 10)
    expect(requestCostUsd({ cacheHitTokens: 0, cacheMissTokens: 1_000_000, completionTokens: 0 }, RATES)).toBeCloseTo(0.44, 10)
    expect(requestCostUsd({ cacheHitTokens: 500_000, cacheMissTokens: 500_000, completionTokens: 0 }, RATES)).toBeCloseTo(0.227, 10)
    expect(requestCostUsd({ cacheHitTokens: 0, cacheMissTokens: 0, completionTokens: 1_000_000 }, RATES)).toBeCloseTo(1.32, 10)
  })

  it('falls back to the input rate when no cache rate is configured, overstating rather than understating', () => {
    const withoutCacheRate = { inputPerMillion: 0.44, outputPerMillion: 1.32 }
    expect(requestCostUsd({ cacheHitTokens: 1_000_000, cacheMissTokens: 0, completionTokens: 0 }, withoutCacheRate)).toBeCloseTo(0.44, 10)
  })

  it('is zero for a request that reported nothing', () => {
    expect(requestCostUsd({ cacheHitTokens: 0, cacheMissTokens: 0, completionTokens: 0 }, RATES)).toBe(0)
  })
})

describe('pricing window', () => {
  /** The configured peak bands: 01:00-04:00 and 06:00-10:00 UTC. */
  const PEAK = [{ startMinutes: 60, endMinutes: 240 }, { startMinutes: 360, endMinutes: 600 }]

  it('labels every request peak when no window is configured', () => {
    expect(pricingWindow(new Date('2026-08-20T18:00:00Z'))).toBe('peak')
    expect(pricingWindow(new Date('2026-08-20T06:00:00Z'))).toBe('peak')
    expect(pricingWindow(new Date('2026-08-20T18:00:00Z'), [])).toBe('peak')
  })

  it('labels the two configured bands peak and everything else off-peak', () => {
    for (const inside of ['01:00', '03:59', '06:00', '09:59']) {
      expect({ inside, label: pricingWindow(new Date(`2026-08-20T${inside}:00Z`), PEAK) }).toEqual({ inside, label: 'peak' })
    }
    for (const outside of ['00:59', '04:00', '05:59', '10:00', '23:30']) {
      expect({ outside, label: pricingWindow(new Date(`2026-08-20T${outside}:00Z`), PEAK) }).toEqual({ outside, label: 'off-peak' })
    }
  })

  it('labels a band that wraps past midnight', () => {
    const wrapping = [{ startMinutes: 16 * 60 + 30, endMinutes: 30 }]
    expect(pricingWindow(new Date('2026-08-20T16:29:00Z'), wrapping)).toBe('off-peak')
    expect(pricingWindow(new Date('2026-08-20T16:30:00Z'), wrapping)).toBe('peak')
    expect(pricingWindow(new Date('2026-08-20T00:29:00Z'), wrapping)).toBe('peak')
    expect(pricingWindow(new Date('2026-08-20T00:30:00Z'), wrapping)).toBe('off-peak')
  })
})

describe('provider request log', () => {
  const LOG = [
    '{"cacheHitTokens":10,"cacheMissTokens":90,"completionTokens":40,"requestedAt":"2026-08-20T02:00:00.000Z"}',
    '{"cacheHitTokens":0,"cacheMissTokens":100,"completionTokens":60,"requestedAt":"2026-08-20T12:00:00.000Z"}',
  ].join('\n')

  it('sums every logged request, including the closing turn a finding cannot hold', () => {
    const lines = parseProviderLog(`${LOG}\n`)
    expect(providerLogTotals(lines)).toEqual({ requests: 2, cacheHitTokens: 10, cacheMissTokens: 190, completionTokens: 100 })
    expect(providerLogCostUsd(lines, RATES)).toBeCloseTo((10 * 0.014 + 190 * 0.44 + 100 * 1.32) / 1_000_000, 12)
  })

  it('drops a malformed or partially flushed line rather than failing the sweep', () => {
    expect(parseProviderLog(`${LOG}\n{"cacheHitTokens":1,"cacheMiss`)).toHaveLength(2)
    expect(parseProviderLog('{"step":1}\n')).toHaveLength(0)
    expect(parseProviderLog('')).toHaveLength(0)
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
    expect(INVESTIGATION_COST_LIMIT_USD).toBe(0.25)
    expect(EVALUATION_COST_LIMIT_USD).toBe(5)
    const ledger = new CostLedger(RATES)
    // Just under a quarter of a dollar of output at the peak rate stays inside.
    ledger.record({ cacheHitTokens: 0, cacheMissTokens: 0, completionTokens: 185_000 }, new Date('2026-08-20T12:00:00Z'))
    expect(ledger.isExhausted()).toBe(false)
    expect(() => ledger.record({ cacheHitTokens: 0, cacheMissTokens: 0, completionTokens: 20_000 }, new Date('2026-08-20T12:00:01Z'))).toThrow()
  })
})

describe('sweep ceiling', () => {
  it('stops the sweep at five dollars', () => {
    expect(sweepHasBudget(4.99)).toBe(true)
    expect(sweepHasBudget(5)).toBe(false)
    expect(sweepHasBudget(7.5)).toBe(false)
  })
})
