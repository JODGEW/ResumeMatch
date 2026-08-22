import type { Finding } from './finding'

/** How many opening probes count towards the looser metric. */
export const GOLD_PROBE_WINDOW = 3

/** One scored investigation: which case it belongs to and what it probed first. */
export interface ProbeScoreEntry {
  caseId: string
  firstProbe: string | null
  /** The opening probes, up to {@link GOLD_PROBE_WINDOW}. */
  openingProbes: string[]
  goldFirstProbe: string | null
  hit: boolean
  /** Whether the gold probe appears among the opening probes. */
  hitWithinWindow: boolean
  scored: boolean
}

/**
 * Aggregate probe accuracy over the scored cases, on two metrics.
 *
 * `goldFirstProbe` asks whether the very first read was the gold one;
 * `goldWithinFirst3` asks whether it appeared in the opening three. The second
 * was added on 2026-08-22 after the D1 smoke test, where the model read the
 * manifest first and the gold probe third — an ordering the strict metric scores
 * the same as never reaching for it at all.
 */
export interface ProbeScore {
  entries: ProbeScoreEntry[]
  scored: number
  hits: number
  hitsWithinWindow: number
  /** Hit rate over scored cases; null when no case could be scored. */
  goldFirstProbe: number | null
  /** Rate at which the gold probe appears in the opening probes; null when nothing was scored. */
  goldWithinFirst3: number | null
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
    const openingProbes = finding.probesSelected.slice(0, GOLD_PROBE_WINDOW)
    return {
      caseId,
      firstProbe: probe,
      openingProbes,
      goldFirstProbe: gold,
      hit: gold !== null && probe === gold,
      hitWithinWindow: gold !== null && openingProbes.includes(gold),
      scored: gold !== null,
    }
  })
  const scored = entries.filter(entry => entry.scored)
  const hits = scored.filter(entry => entry.hit).length
  const hitsWithinWindow = scored.filter(entry => entry.hitWithinWindow).length
  return {
    entries,
    scored: scored.length,
    hits,
    hitsWithinWindow,
    goldFirstProbe: scored.length === 0 ? null : hits / scored.length,
    goldWithinFirst3: scored.length === 0 ? null : hitsWithinWindow / scored.length,
  }
}

/**
 * Build the gold lookup from the public corpus.
 * @param cases - public evaluation cases.
 * @returns case id to gold first probe.
 */
export function goldFirstProbes(cases: ReadonlyArray<{ id: string; goldFirstProbe?: string }>): Map<string, string | undefined> {
  return new Map(cases.map(item => [item.id, item.goldFirstProbe]))
}
