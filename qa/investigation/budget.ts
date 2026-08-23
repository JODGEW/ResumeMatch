import { InvestigationError } from './errors'

/** Hard ceilings for one investigation. Enforced here, never by prompt text. */
export const INVESTIGATION_BUDGET = {
  hypotheses: 3,
  // Eight, not six: across four live runs every investigation spent its probe
  // ceiling and then asked for more, and probes are read-only.
  probes: 8,
  reproductions: 1,
  actions: 8,
  inspections: 6,
  screenshots: 2,
  accessibilitySnapshots: 2,
  clockAdvances: 2,
  oracleRuns: 1,
  toolCalls: 20,
  wallClockMs: 480_000,
  reproductionWallClockMs: 240_000,
} as const

export type BudgetKind = Exclude<keyof typeof INVESTIGATION_BUDGET, 'hypotheses' | 'wallClockMs' | 'reproductionWallClockMs'>

/**
 * Counts spend against {@link INVESTIGATION_BUDGET} and latches exhaustion.
 *
 * A refused spend does not end the investigation: the agent may still submit,
 * and the latch forces the terminal classification to `inconclusive`.
 */
export class BudgetLedger {
  private readonly spent = new Map<BudgetKind, number>()
  private exhausted = false

  constructor(private readonly startedAt: number, private readonly now: () => number = Date.now) {}

  /** Spend one unit. @throws `BUDGET_EXHAUSTED` when the ceiling or wall clock is reached. */
  spend(kind: BudgetKind): void {
    if (this.now() - this.startedAt > INVESTIGATION_BUDGET.wallClockMs) {
      this.exhausted = true
      throw new InvestigationError('BUDGET_EXHAUSTED', 'Investigation wall-clock budget is exhausted')
    }
    const next = (this.spent.get(kind) ?? 0) + 1
    if (next > INVESTIGATION_BUDGET[kind]) {
      this.exhausted = true
      throw new InvestigationError('BUDGET_EXHAUSTED', `Budget for ${kind} is exhausted (limit ${INVESTIGATION_BUDGET[kind]})`)
    }
    this.spent.set(kind, next)
  }

  /** How many units of one kind have been spent. */
  count(kind: BudgetKind): number {
    return this.spent.get(kind) ?? 0
  }

  /** Whether any ceiling was reached; latched for the rest of the investigation. */
  isExhausted(): boolean {
    return this.exhausted
  }

  /** Remaining units per kind, for the model-facing budget statement. */
  remaining(): Record<BudgetKind, number> {
    const kinds: BudgetKind[] = ['probes', 'reproductions', 'actions', 'inspections', 'screenshots', 'accessibilitySnapshots', 'clockAdvances', 'oracleRuns', 'toolCalls']
    return Object.fromEntries(kinds.map(kind => [kind, INVESTIGATION_BUDGET[kind] - this.count(kind)])) as Record<BudgetKind, number>
  }
}
