import { describe, expect, it } from 'vitest'

import { goldEvidenceProbes, PUBLIC_GOLD_EVIDENCE_PROBES } from './goldEvidence'
import { firstDiscriminatingProbe, goldEvidenceHit, scoreFirstProbes } from './goldProbe'

const D1_SET = goldEvidenceProbes('D1')

describe('firstDiscriminatingProbe', () => {
  it('skips the orientation reads, in either order', () => {
    expect(firstDiscriminatingProbe(['read_failure_manifest', 'read_failed_assertion', 'read_page_errors', 'count_requests'])).toBe('read_page_errors')
    expect(firstDiscriminatingProbe(['read_failed_assertion', 'read_scenario_transition_log'])).toBe('read_scenario_transition_log')
    expect(firstDiscriminatingProbe(['count_requests'])).toBe('count_requests')
  })

  it('is null when only orientation reads were made', () => {
    expect(firstDiscriminatingProbe(['read_failure_manifest', 'read_failed_assertion'])).toBeNull()
    expect(firstDiscriminatingProbe([])).toBeNull()
  })
})

describe('goldEvidenceHit', () => {
  it('hits when the first discriminating probe is in the evidence set', () => {
    expect(goldEvidenceHit(['read_failure_manifest', 'read_scenario_transition_log', 'read_page_errors'], D1_SET)).toBe(true)
  })

  it('misses when the first discriminating probe is outside the set, even if a set member follows', () => {
    expect(goldEvidenceHit(['read_failed_assertion', 'read_page_errors', 'read_network_events'], D1_SET)).toBe(false)
  })

  it('misses when only orientation reads were made', () => {
    expect(goldEvidenceHit(['read_failed_assertion', 'read_failure_manifest'], D1_SET)).toBe(false)
    expect(goldEvidenceHit([], D1_SET)).toBe(false)
  })

  it('is not graded without an evidence set', () => {
    expect(goldEvidenceHit(['read_scenario_transition_log'], goldEvidenceProbes('B2'))).toBeNull()
    expect(goldEvidenceHit(['read_scenario_transition_log'], null)).toBeNull()
  })

  it('leaves gold, gold3 and gold4x scoring unchanged', () => {
    const probes = ['read_failure_manifest', 'read_scenario_transition_log', 'read_network_events']
    expect(goldEvidenceHit(probes, D1_SET)).toBe(true)
    expect(scoreFirstProbes([{ caseId: 'D1', finding: { probesSelected: probes } }], new Map([['D1', 'read_network_events']])).entries[0])
      .toMatchObject({ hit: false, hitWithinWindow: true, hitWithinWindowExclusive: true })
  })
})

describe('goldEvidenceProbes', () => {
  it('holds the section 3 sets for D1-D4 and B1, and nothing for B2 or any other case', () => {
    expect(Object.fromEntries(PUBLIC_GOLD_EVIDENCE_PROBES)).toEqual({
      D1: ['read_scenario_transition_log', 'read_network_events', 'count_requests'],
      D2: ['read_scenario_transition_log', 'read_network_events'],
      D3: ['read_scenario_transition_log', 'read_network_events', 'count_requests'],
      D4: ['read_scenario_transition_log', 'read_network_events', 'count_requests'],
      B1: ['read_scenario_transition_log', 'read_network_events'],
    })
    for (const caseId of ['C1', 'C2', 'C3', 'B2', 'B3', 'D5', 'D6', 'B4', 'D7', 'D8', 'D9', 'B5']) expect(goldEvidenceProbes(caseId)).toBeNull()
  })
})
