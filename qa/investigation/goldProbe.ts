import type { Finding } from './finding'

/** One scored investigation: which case it belongs to and what it probed first. */
export interface ProbeScoreEntry {
  caseId: string
  firstProbe: string | null
  goldFirstProbe: string | null
  hit: boolean
  scored: boolean
}

/** Aggregate first-probe accuracy over the scored cases. */
export interface ProbeScore {
  entries: ProbeScoreEntry[]
  scored: number
  hits: number
  /** Hit rate over scored cases; null when no case could be scored. */
  hitRate: number | null
}

/**
 * The first probe an investigation reached for.
 *
 * `probesSelected` is recorded by the session in call order, so its head is the
 * first evidence tool the model chose. A finding with no probe — one that went
 * straight to reproduction, or was blocked before probing — has none.
 * @param finding - a submitted finding.
 * @returns the first probe name, or null.
 */
export function firstProbe(finding: Pick<Finding, 'probesSelected'>): string | null {
  return finding.probesSelected[0] ?? null
}

/**
 * Score first-probe selection against the gold set.
 *
 * Only cases that declare a gold probe are scored: clean cases start no
 * investigation, and held-out cases deliberately carry none, so counting them
 * would either inflate or depress the rate for reasons unrelated to probe
 * choice.
 * @param investigations - findings paired with the case that produced them.
 * @param goldByCase - gold first probe per case id, from the public corpus.
 * @returns per-case entries and the aggregate hit rate.
 */
export function scoreFirstProbes(
  investigations: ReadonlyArray<{ caseId: string; finding: Pick<Finding, 'probesSelected'> }>,
  goldByCase: ReadonlyMap<string, string | undefined>,
): ProbeScore {
  const entries = investigations.map(({ caseId, finding }) => {
    const gold = goldByCase.get(caseId) ?? null
    const probe = firstProbe(finding)
    return { caseId, firstProbe: probe, goldFirstProbe: gold, hit: gold !== null && probe === gold, scored: gold !== null }
  })
  const scored = entries.filter(entry => entry.scored)
  const hits = scored.filter(entry => entry.hit).length
  return { entries, scored: scored.length, hits, hitRate: scored.length === 0 ? null : hits / scored.length }
}

/**
 * Build the gold lookup from the public corpus.
 * @param cases - public evaluation cases.
 * @returns case id to gold first probe.
 */
export function goldFirstProbes(cases: ReadonlyArray<{ id: string; goldFirstProbe?: string }>): Map<string, string | undefined> {
  return new Map(cases.map(item => [item.id, item.goldFirstProbe]))
}
