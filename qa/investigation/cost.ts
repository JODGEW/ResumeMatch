import { InvestigationError } from './errors'

/** USD per million tokens, supplied by the adapter's pricing configuration. */
export interface TokenRates {
  inputPerMillion: number
  outputPerMillion: number
}

/**
 * Optional off-peak window in minutes past UTC midnight.
 *
 * Absent means every request is recorded as `peak`. Billing always uses the
 * peak rates either way; the window only labels what was observed, so a wrong
 * or missing window can never understate a cost.
 */
export interface OffPeakWindow {
  startMinutes: number
  endMinutes: number
}

/** One model request as billed. Cache hit and miss are the disjoint DeepSeek counts. */
export interface UsageRecord {
  cacheHitTokens: number
  cacheMissTokens: number
  completionTokens: number
  /** UTC ISO-8601 timestamp of the request. */
  requestedAt: string
  pricingWindow: 'peak' | 'off-peak'
  costUsd: number
}

/** Ceiling for one investigation. */
export const INVESTIGATION_COST_LIMIT_USD = 0.5

/** Ceiling for one evaluation sweep across all its investigations. */
export const EVALUATION_COST_LIMIT_USD = 5

/**
 * Label a request's pricing window.
 *
 * A window that wraps past midnight is expressed with `startMinutes` greater
 * than `endMinutes`, which is the normal shape for an evening-to-morning
 * discount period.
 * @param requestedAt - UTC timestamp of the request.
 * @param window - the configured off-peak window, if any.
 * @returns the label recorded with the request.
 */
export function pricingWindow(requestedAt: Date, window?: OffPeakWindow): UsageRecord['pricingWindow'] {
  if (window === undefined) return 'peak'
  const minutes = requestedAt.getUTCHours() * 60 + requestedAt.getUTCMinutes()
  const inside = window.startMinutes <= window.endMinutes
    ? minutes >= window.startMinutes && minutes < window.endMinutes
    : minutes >= window.startMinutes || minutes < window.endMinutes
  return inside ? 'off-peak' : 'peak'
}

/**
 * Cost of one request at the configured rates.
 *
 * Every prompt token is charged at the input rate, cache hits included: the
 * configured rates carry no separate cache price, and charging a hit as if it
 * were a miss can only overstate the bill.
 * @param usage - the disjoint token counts.
 * @param rates - USD per million tokens.
 * @returns cost in USD.
 */
export function requestCostUsd(
  usage: Pick<UsageRecord, 'cacheHitTokens' | 'cacheMissTokens' | 'completionTokens'>,
  rates: TokenRates,
): number {
  const promptTokens = usage.cacheHitTokens + usage.cacheMissTokens
  return (promptTokens * rates.inputPerMillion + usage.completionTokens * rates.outputPerMillion) / 1_000_000
}

/**
 * Accumulates request cost for one investigation and latches at the ceiling.
 *
 * The latch is deliberately the same shape as a spent tool budget: an
 * investigation that ran out of money did not finish its work, so its finding is
 * `inconclusive` rather than a verdict.
 */
export class CostLedger {
  private readonly entries: UsageRecord[] = []
  private exhausted = false

  constructor(
    private readonly rates: TokenRates,
    private readonly limitUsd: number = INVESTIGATION_COST_LIMIT_USD,
    private readonly offPeak?: OffPeakWindow,
  ) {}

  /**
   * Record one model request.
   * @param usage - disjoint token counts reported by the provider.
   * @param requestedAt - UTC timestamp of the request.
   * @returns the stored record.
   * @throws `BUDGET_EXHAUSTED` when this request crosses the ceiling; the record is still stored.
   */
  record(
    usage: Pick<UsageRecord, 'cacheHitTokens' | 'cacheMissTokens' | 'completionTokens'>,
    requestedAt: Date,
  ): UsageRecord {
    const entry: UsageRecord = {
      cacheHitTokens: usage.cacheHitTokens,
      cacheMissTokens: usage.cacheMissTokens,
      completionTokens: usage.completionTokens,
      requestedAt: requestedAt.toISOString(),
      pricingWindow: pricingWindow(requestedAt, this.offPeak),
      costUsd: requestCostUsd(usage, this.rates),
    }
    this.entries.push(entry)
    if (this.totalUsd() > this.limitUsd) {
      this.exhausted = true
      throw new InvestigationError('BUDGET_EXHAUSTED', `Investigation cost ceiling of $${this.limitUsd.toFixed(2)} is exhausted`)
    }
    return entry
  }

  /** Total spend so far. */
  totalUsd(): number {
    return this.entries.reduce((total, entry) => total + entry.costUsd, 0)
  }

  /** Whether the ceiling was crossed; latched for the rest of the investigation. */
  isExhausted(): boolean {
    return this.exhausted
  }

  /** Every recorded request, in order. */
  records(): readonly UsageRecord[] {
    return this.entries
  }
}

/**
 * Whether another investigation may start within an evaluation sweep.
 * @param spentUsd - cost of every investigation completed so far.
 * @param limitUsd - the sweep ceiling.
 * @returns whether the next case may run.
 */
export function sweepHasBudget(spentUsd: number, limitUsd: number = EVALUATION_COST_LIMIT_USD): boolean {
  return spentUsd < limitUsd
}
