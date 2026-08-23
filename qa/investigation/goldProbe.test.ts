import { describe, expect, it } from 'vitest'

import { EVAL_CASES } from './evalCases'
import { HELD_OUT_CASE_IDS } from './evalCases.heldout'
import { firstProbe, goldFirstProbes, scoreFirstProbes } from './goldProbe'

function finding(probes: string[]) {
  return { probesSelected: probes }
}

describe('firstProbe', () => {
  it('reads the head of the recorded probe order', () => {
    expect(firstProbe(finding(['read_network_events', 'count_requests']))).toBe('read_network_events')
  })

  it('is null when the investigation probed nothing', () => {
    expect(firstProbe(finding([]))).toBeNull()
  })
})

describe('scoreFirstProbes', () => {
  const gold = goldFirstProbes(EVAL_CASES)

  it('separates the strict first-probe metric from the opening-three metric', () => {
    // The D1 smoke test's actual ordering: manifest, assertion, then the gold probe.
    const score = scoreFirstProbes([
      { caseId: 'D1', finding: finding(['read_failure_manifest', 'read_failed_assertion', 'read_network_events', 'read_console_events']) },
    ], gold)
    expect({ hits: score.hits, within: score.hitsWithinWindow }).toEqual({ hits: 0, within: 1 })
    expect({ first: score.goldFirstProbe, window: score.goldWithinFirst3 }).toEqual({ first: 0, window: 1 })
    expect(score.entries[0].openingProbes).toHaveLength(3)
  })

  it('discounts the orientation reads in the exclusive window', () => {
    // Every live run opened with these two; the gold probe is the fourth call
    // but the second discriminating one.
    const score = scoreFirstProbes([
      { caseId: 'D1', finding: finding(['read_failed_assertion', 'read_failure_manifest', 'read_scenario_transition_log', 'read_network_events']) },
    ], gold)
    expect({ first: score.goldFirstProbe, window: score.goldWithinFirst3, exclusive: score.goldWithinFirst4Excl })
      .toEqual({ first: 0, window: 0, exclusive: 1 })
  })

  it('counts a gold probe beyond the fourth discriminating read as a miss on all three', () => {
    const score = scoreFirstProbes([
      { caseId: 'D1', finding: finding([
        'read_failed_assertion', 'read_failure_manifest', 'read_page_errors', 'read_console_events',
        'read_safety_violations', 'read_scenario_transition_log', 'count_requests', 'read_network_events',
      ]) },
    ], gold)
    expect({ first: score.goldFirstProbe, window: score.goldWithinFirst3, exclusive: score.goldWithinFirst4Excl })
      .toEqual({ first: 0, window: 0, exclusive: 0 })
  })

  it('counts a gold probe that arrives after the opening three as a miss on both metrics', () => {
    const score = scoreFirstProbes([
      { caseId: 'D1', finding: finding(['read_page_errors', 'read_console_events', 'read_safety_violations', 'read_network_events']) },
    ], gold)
    expect({ first: score.goldFirstProbe, window: score.goldWithinFirst3 }).toEqual({ first: 0, window: 0 })
  })

  it('scores only the cases that declare a gold probe', () => {
    const score = scoreFirstProbes([
      { caseId: 'D1', finding: finding(['read_network_events']) },
      { caseId: 'B2', finding: finding(['read_page_errors']) },
    ], gold)
    expect(score.scored).toBe(1)
    expect(score.hits).toBe(1)
    expect(score.goldFirstProbe).toBe(1)
    expect(score.goldWithinFirst3).toBe(1)
    expect(score.entries.find(entry => entry.caseId === 'B2')).toMatchObject({ scored: false, hit: false })
  })

  it('counts a wrong or missing first probe as a miss', () => {
    const score = scoreFirstProbes([
      { caseId: 'D1', finding: finding(['read_console_events']) },
      { caseId: 'D2', finding: finding([]) },
      { caseId: 'D3', finding: finding(['count_requests']) },
      { caseId: 'D4', finding: finding(['read_scenario_transition_log']) },
    ], gold)
    expect({ scored: score.scored, hits: score.hits, goldFirstProbe: score.goldFirstProbe })
      .toEqual({ scored: 4, hits: 2, goldFirstProbe: 0.5 })
  })

  it('reports no rate when nothing was scorable', () => {
    const score = scoreFirstProbes([{ caseId: 'C1', finding: finding(['read_page_errors']) }], gold)
    expect(score.goldFirstProbe).toBeNull()
    expect(score.goldWithinFirst3).toBeNull()
    expect(score.goldWithinFirst4Excl).toBeNull()
  })

  it('cannot score a held-out case, because none declares a gold probe', () => {
    for (const id of HELD_OUT_CASE_IDS) {
      expect(scoreFirstProbes([{ caseId: id, finding: finding(['read_network_events']) }], gold).scored).toBe(0)
    }
  })
})
