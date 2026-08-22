import { InvestigationError } from './errors'

/** USD per million tokens, supplied by the adapter's pricing configuration. */
export interface TokenRates {
  inputPerMillion: number
  outputPerMillion: number
  /**
   * Rate for prompt tokens the provider served from its cache.
   *
   * Omitting it charges cache hits at the full input rate, which overstates the
   * bill rather than understating it.
   */
  cacheHitPerMillion?: number
}

/**
 * A peak window in minutes past UTC midnight.
 *
 * Configuring none labels every request `peak`. Billing always uses the peak
 * rates either way; the windows only label what was observed, so a wrong or
 * missing window can never understate a cost.
 */
export interface PeakWindow {
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
export const INVESTIGATION_COST_LIMIT_USD = 0.25

/** Ceiling for one evaluation sweep across all its investigations. */
export const EVALUATION_COST_LIMIT_USD = 5

function insideWindow(minutes: number, window: PeakWindow): boolean {
  return window.startMinutes <= window.endMinutes
    ? minutes >= window.startMinutes && minutes < window.endMinutes
    : minutes >= window.startMinutes || minutes < window.endMinutes
}

/**
 * Label a request's pricing window.
 *
 * Peak is the configured set and off-peak is everything else, so an empty
 * configuration labels everything peak — the conservative default. A window
 * that wraps past midnight is expressed with `startMinutes` greater than
 * `endMinutes`.
 * @param requestedAt - UTC timestamp of the request.
 * @param peakWindows - the configured peak windows, if any.
 * @returns the label recorded with the request.
 */
export function pricingWindow(requestedAt: Date, peakWindows?: readonly PeakWindow[]): UsageRecord['pricingWindow'] {
  if (peakWindows === undefined || peakWindows.length === 0) return 'peak'
  const minutes = requestedAt.getUTCHours() * 60 + requestedAt.getUTCMinutes()
  return peakWindows.some(window => insideWindow(minutes, window)) ? 'peak' : 'off-peak'
}

/** One model request as the adapter logged it, independent of which provider served it. */
export interface ProviderUsageLine {
  cacheHitTokens: number
  cacheMissTokens: number
  completionTokens: number
  requestedAt: string
}

/**
 * Parse the adapter's request log.
 *
 * Malformed lines are dropped rather than failing the sweep: the log is an
 * accounting record written by a live process, and a truncated final line must
 * not lose the sweep its budget arithmetic.
 * @param text - the log file's contents.
 * @returns every well-formed entry, in order.
 */
export function parseProviderLog(text: string): ProviderUsageLine[] {
  const lines: ProviderUsageLine[] = []
  for (const raw of text.split('\n')) {
    if (raw.trim().length === 0) continue
    try {
      const parsed = JSON.parse(raw) as Partial<ProviderUsageLine>
      if (typeof parsed.cacheHitTokens !== 'number' || typeof parsed.cacheMissTokens !== 'number'
        || typeof parsed.completionTokens !== 'number' || typeof parsed.requestedAt !== 'string') continue
      lines.push(parsed as ProviderUsageLine)
    } catch {
      // A partially flushed final line contributes nothing rather than throwing.
      continue
    }
  }
  return lines
}

/** Token totals across every logged request. */
export function providerLogTotals(lines: readonly ProviderUsageLine[]): {
  requests: number
  cacheHitTokens: number
  cacheMissTokens: number
  completionTokens: number
} {
  return {
    requests: lines.length,
    cacheHitTokens: lines.reduce((total, line) => total + line.cacheHitTokens, 0),
    cacheMissTokens: lines.reduce((total, line) => total + line.cacheMissTokens, 0),
    completionTokens: lines.reduce((total, line) => total + line.completionTokens, 0),
  }
}

/**
 * Cost of every logged request at the peak rates.
 *
 * The sweep ceiling is enforced against this rather than against a finding's
 * `costUsd`, because a finding is written at `submit_finding` and therefore
 * cannot contain the closing turn that follows it.
 * @param lines - parsed log entries.
 * @param rates - peak USD per million tokens.
 * @returns cost in USD.
 */
export function providerLogCostUsd(lines: readonly ProviderUsageLine[], rates: TokenRates): number {
  const totals = providerLogTotals(lines)
  return requestCostUsd(totals, rates)
}

/**
 * Cost of one request at the configured rates.
 *
 * Cache hits are charged at their own rate when one is configured, and at the
 * full input rate otherwise; the counts are disjoint, so a hit is never billed
 * twice. Measured on the first live runs, hits are around 95% of prompt tokens,
 * which is why the separate rate matters.
 * @param usage - the disjoint token counts.
 * @param rates - USD per million tokens.
 * @returns cost in USD.
 */
export function requestCostUsd(
  usage: Pick<UsageRecord, 'cacheHitTokens' | 'cacheMissTokens' | 'completionTokens'>,
  rates: TokenRates,
): number {
  const cacheHitRate = rates.cacheHitPerMillion ?? rates.inputPerMillion
  return (
    usage.cacheHitTokens * cacheHitRate
    + usage.cacheMissTokens * rates.inputPerMillion
    + usage.completionTokens * rates.outputPerMillion
  ) / 1_000_000
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
    private readonly peakWindows?: readonly PeakWindow[],
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
      pricingWindow: pricingWindow(requestedAt, this.peakWindows),
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
