import { describe, expect, it } from 'vitest'

import { summaryTable } from './runCase'
import type { EvalCaseResult } from './runCase'

function result(overrides: Partial<EvalCaseResult>): EvalCaseResult {
  return {
    caseId: 'C1', kind: 'clean', scenarioId: 'P1-01', runId: 'p1-01-x', oracleStatus: 'passed',
    expectationMet: true, failedOracle: null, artifactValidation: 'passed', releaseGrade: false,
    triage: 'expected', expectedTriage: 'expected', triageMatched: true, harnessLaunched: false,
    modelRequests: 0, classification: null, expectedClassification: null, classificationMatched: false,
    firstProbe: null, goldFirstProbe: null, goldProbeHit: null, worktreeRemoved: true, errors: [],
    ...overrides,
  }
}

describe('summaryTable', () => {
  it('renders one aligned row per case with the counted model requests', () => {
    const table = summaryTable([
      result({}),
      result({
        caseId: 'D1', kind: 'seeded_defect', triage: 'investigate', expectedTriage: 'investigate',
        harnessLaunched: true, modelRequests: 11, classification: 'confirmed', expectedClassification: 'confirmed',
        classificationMatched: true, firstProbe: 'read_network_events', goldFirstProbe: 'read_network_events', goldProbeHit: true,
      }),
    ])
    const lines = table.split('\n')
    expect(lines[0].split(/\s+/)).toEqual(['case', 'kind', 'triage', 'ok', 'requests', 'classification', 'ok', 'first', 'probe', 'gold', 'clean'])
    expect(lines[2]).toMatch(/^C1\s+clean\s+expected\s+y\s+0\s/)
    expect(lines[3]).toMatch(/^D1\s+seeded_defect\s+investigate\s+y\s+11\s+confirmed\s+y\s+read_network_events\s+y\s+y/)
  })

  it('marks a clean case with no expected classification as matching', () => {
    expect(summaryTable([result({ classification: null, expectedClassification: null, classificationMatched: false })]))
      .toMatch(/C1\s+clean\s+expected\s+y\s+0\s+-\s+y/)
  })
})
