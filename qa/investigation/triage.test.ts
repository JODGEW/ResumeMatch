import { describe, expect, it } from 'vitest'

import { startsInvestigation, triageRun } from './triage'
import type { EvidenceManifest, RunResult, ScenarioId } from '../browser/types'

function manifest(scenarioId: ScenarioId): EvidenceManifest {
  return { scenarioId } as unknown as EvidenceManifest
}

function result(overrides: Partial<RunResult> = {}): RunResult {
  return {
    runId: 'p1-01-00000000-0000-4000-8000-000000000001',
    scenarioId: 'P1-01',
    executionStatus: 'completed',
    oracleStatus: 'passed',
    expectedOracleStatus: 'passed',
    expectationMet: true,
    failures: [],
    failedOracle: null,
    safetyViolations: [],
    evidenceManifest: manifest('P1-01'),
    artifactValidation: { status: 'passed', report: null, violationCount: 0, rejectedBundleRemoved: false },
    durationMs: 1,
    ...overrides,
  }
}

describe('triageRun', () => {
  it('does not investigate a passing scenario', () => {
    expect(triageRun(result()).decision).toBe('expected')
  })

  it('does not investigate P1-06 meeting its expected failed oracle', () => {
    const p106 = result({
      scenarioId: 'P1-06',
      oracleStatus: 'failed',
      expectedOracleStatus: 'failed',
      expectationMet: true,
      failedOracle: 'SAFETY_UNEXPECTED_EGRESS',
      failures: [
        { phase: 'network_policy', kind: 'safety', message: 'a' },
        { phase: 'network_policy', kind: 'safety', message: 'b' },
        { phase: 'network_policy', kind: 'safety', message: 'c' },
        { phase: 'oracle', kind: 'oracle', message: 'd', oracleId: 'SAFETY_UNEXPECTED_EGRESS' },
      ],
      evidenceManifest: manifest('P1-06'),
    })
    expect(triageRun(p106).decision).toBe('expected')
    expect(startsInvestigation(triageRun(p106))).toBe(false)
  })

  it('investigates an unexpected product oracle failure', () => {
    const outcome = triageRun(result({
      scenarioId: 'P1-04',
      oracleStatus: 'failed',
      expectationMet: false,
      failedOracle: 'P1-04_FAILURE_TITLE',
      failures: [{ phase: 'scenario', kind: 'oracle', message: 'x', oracleId: 'P1-04_FAILURE_TITLE' }],
    }))
    expect(outcome.decision).toBe('investigate')
    expect(startsInvestigation(outcome)).toBe(true)
  })

  it('routes infrastructure failure away from the model even when an oracle failed', () => {
    expect(triageRun(result({
      executionStatus: 'infrastructure_failed',
      oracleStatus: 'failed',
      expectedOracleStatus: 'failed',
      expectationMet: false,
      failedOracle: 'SAFETY_UNEXPECTED_EGRESS',
    })).decision).toBe('infrastructure_defect')
  })

  it('routes rejected artifacts away from the model', () => {
    expect(triageRun(result({
      oracleStatus: 'failed',
      expectationMet: false,
      failedOracle: 'P1-02_COMPLETED_REPORT',
      evidenceManifest: null,
      artifactValidation: { status: 'failed', report: 'r.json', violationCount: 1, rejectedBundleRemoved: true },
    })).decision).toBe('artifact_rejected')
  })

  it('routes an incomplete oracle away from the model', () => {
    expect(triageRun(result({ oracleStatus: 'incomplete', expectationMet: false })).decision).toBe('oracle_incomplete')
    expect(triageRun(result({ oracleStatus: 'not_run', expectationMet: false })).decision).toBe('oracle_incomplete')
  })

  it('keeps a cleanup-only failure on the human-review path', () => {
    const outcome = triageRun(result({
      expectationMet: false,
      failures: [{ phase: 'cleanup', kind: 'cleanup', message: 'Injected cleanup failure' }],
    }))
    expect(outcome.decision).toBe('unexpected_shape')
    expect(startsInvestigation(outcome)).toBe(false)
  })
})
