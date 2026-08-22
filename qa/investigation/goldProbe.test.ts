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

  it('scores only the cases that declare a gold probe', () => {
    const score = scoreFirstProbes([
      { caseId: 'D1', finding: finding(['read_network_events']) },
      { caseId: 'B2', finding: finding(['read_page_errors']) },
    ], gold)
    expect(score.scored).toBe(1)
    expect(score.hits).toBe(1)
    expect(score.hitRate).toBe(1)
    expect(score.entries.find(entry => entry.caseId === 'B2')).toMatchObject({ scored: false, hit: false })
  })

  it('counts a wrong or missing first probe as a miss', () => {
    const score = scoreFirstProbes([
      { caseId: 'D1', finding: finding(['read_console_events']) },
      { caseId: 'D2', finding: finding([]) },
      { caseId: 'D3', finding: finding(['count_requests']) },
      { caseId: 'D4', finding: finding(['read_scenario_transition_log']) },
    ], gold)
    expect({ scored: score.scored, hits: score.hits, hitRate: score.hitRate }).toEqual({ scored: 4, hits: 2, hitRate: 0.5 })
  })

  it('reports no rate when nothing was scorable', () => {
    expect(scoreFirstProbes([{ caseId: 'C1', finding: finding(['read_page_errors']) }], gold).hitRate).toBeNull()
  })

  it('cannot score a held-out case, because none declares a gold probe', () => {
    for (const id of HELD_OUT_CASE_IDS) {
      expect(scoreFirstProbes([{ caseId: id, finding: finding(['read_network_events']) }], gold).scored).toBe(0)
    }
  })
})
