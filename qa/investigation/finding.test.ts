import { describe, expect, it } from 'vitest'

import { buildFinding, classify, FINDING_SCHEMA_VERSION, validateNarrative } from './finding'
import type { DeterministicFacts, ModelNarrative } from './finding'

const RUN_REF = 'runs/p1-04-11111111-2222-4333-8444-555555555555/network-events.json'

function narrative(overrides: Partial<Record<string, unknown>> = {}): unknown {
  return {
    expectedBehavior: 'The failed analysis renders its recovery state.',
    observedBehavior: 'The processing status never resolved.',
    reasoningSummary: 'Polling stopped before the terminal response arrived.',
    evidenceRefs: [RUN_REF],
    hypotheses: [{ statement: 'Polling stops early.', evidenceRefs: [RUN_REF], confidence: 'high' }],
    ...overrides,
  }
}

/** A reproduction verdict whose failure set holds the given oracle ids. */
function repro(status: 'passed' | 'failed' | 'incomplete' | 'not_run', ids: string[], preconditionMet = true) {
  return {
    oracleStatus: status,
    failedOracle: ids[0] ?? null,
    failures: ids.map(id => ({ phase: 'scenario', kind: 'oracle' as const, message: `failed: ${id}`, oracleId: id })),
    preconditionMet,
    evaluated: ids,
    skipped: [],
  }
}

function facts(overrides: Partial<DeterministicFacts> = {}): DeterministicFacts {
  return {
    findingId: 'f-1', sourceRunId: 'p1-04-11111111-2222-4333-8444-555555555555', scenarioId: 'P1-04',
    sourceCommit: '6955de44ccfae897785292dcc0b78be84d36cdb4', failedOracle: 'P1-04_FAILURE_TITLE',
    checkouts: { resumematchCommit: 'b'.repeat(40), harnessCommit: 'c'.repeat(40), adapterCommit: 'd'.repeat(40) },
    probesSelected: ['read_network_events'], reproductionSequence: [],
    reproductionOracleResult: repro('failed', ['P1-04_FAILURE_TITLE']),
    safetyViolations: [], model: { provider: 'fake', modelId: 'fake-1' },
    usage: { toolCalls: 1, cacheHitTokens: 0, cacheMissTokens: 0, completionTokens: 0, costUsd: 0, requests: [] },
    policyBlocked: false, budgetExhausted: false, rejectedCalls: [],
    ...overrides,
  }
}

describe('classify', () => {
  it('confirms when the original failure is anywhere in the reproduction failure set (D4 shape)', () => {
    // The reproduction fails an earlier assertion first; the original id is still present.
    const d4 = facts({
      failedOracle: 'P1-02_COMPLETED_REPORT',
      reproductionOracleResult: repro('failed', ['COMPLETED_JOB_TITLE', 'P1-02_COMPLETED_REPORT']),
    })
    expect(d4.reproductionOracleResult?.failedOracle).toBe('COMPLETED_JOB_TITLE')
    expect(classify(d4)).toBe('confirmed')
  })

  it('is inconclusive when the reproduction never reached the precondition (D3 shape)', () => {
    const d3 = facts({
      failedOracle: 'CONTRACT_S3_COUNT',
      reproductionOracleResult: {
        oracleStatus: 'failed', failedOracle: 'P1-02_UPLOAD_PAGE',
        failures: [{ phase: 'scenario', kind: 'oracle', message: 'x', oracleId: 'P1-02_UPLOAD_PAGE' }],
        preconditionMet: false, evaluated: ['P1-02_UPLOAD_PAGE'], skipped: ['CONTRACT_S3_COUNT'],
      },
    })
    expect(classify(d3)).toBe('inconclusive')
  })

  it('is not_reproduced when the whole sweep passed', () => {
    expect(classify(facts({ reproductionOracleResult: repro('passed', []) }))).toBe('not_reproduced')
  })

  it('confirms only when the reproduction fails the same oracle', () => {
    expect(classify(facts())).toBe('confirmed')
    expect(classify(facts({ reproductionOracleResult: repro('failed', ['OTHER_ORACLE']) }))).toBe('inconclusive')
  })

  it('reports a passing reproduction as not reproduced', () => {
    expect(classify(facts({ reproductionOracleResult: repro('passed', []) }))).toBe('not_reproduced')
  })

  it('does not downgrade a completed reproduction for a spent budget', () => {
    // The spend reaches the verdict through its consequence — a reproduction cut
    // short has no completed oracle — not as a penalty of its own.
    expect(classify(facts({ budgetExhausted: true }))).toBe('confirmed')
    expect(classify(facts({ budgetExhausted: true, reproductionOracleResult: null }))).toBe('inconclusive')
  })

  it('lets an unauthorized action outrank every other signal', () => {
    expect(classify(facts({ policyBlocked: true, budgetExhausted: true }))).toBe('policy_blocked')
    expect(classify(facts({ policyBlocked: true }))).toBe('policy_blocked')
  })

  it('records refused calls without letting them change the verdict', () => {
    const rejected = [
      { tool: 'read_safety_violations', reason: 'Budget for probes is exhausted (limit 6)' },
      { tool: 'count_requests', reason: 'Budget for probes is exhausted (limit 6)' },
      { tool: 'read_network_events', reason: 'Budget for probes is exhausted (limit 6)' },
    ]
    expect(classify(facts({ rejectedCalls: rejected }))).toBe('confirmed')
  })

  it('is inconclusive without a completed reproduction oracle', () => {
    expect(classify(facts({ reproductionOracleResult: null }))).toBe('inconclusive')
    expect(classify(facts({ reproductionOracleResult: repro('incomplete', []) }))).toBe('inconclusive')
    expect(classify(facts({ reproductionOracleResult: repro('not_run', []) }))).toBe('inconclusive')
  })
})

describe('validateNarrative', () => {
  it('accepts a well-formed narrative', () => {
    expect(validateNarrative(narrative()).hypotheses).toHaveLength(1)
  })

  it('blocks any attempt to supply a deterministic authority field', () => {
    for (const field of [
      'classification', 'reproductionOracleResult', 'safetyViolations', 'sourceCommit', 'usage', 'model',
      'evaluationIdentity', 'resumematchCommit', 'harnessCommit', 'adapterCommit', 'rejectedCalls',
    ]) {
      expect(() => validateNarrative(narrative({ [field]: 'confirmed' }))).toThrow(/may not supply the deterministic field/)
      try { validateNarrative(narrative({ [field]: 'confirmed' })) } catch (error) { expect(error).toMatchObject({ code: 'POLICY_BLOCKED' }) }
    }
  })

  it('rejects more than three hypotheses', () => {
    const many = Array.from({ length: 4 }, () => ({ statement: 's', evidenceRefs: [], confidence: 'low' }))
    expect(() => validateNarrative(narrative({ hypotheses: many }))).toThrow(/between 1 and 3/)
  })

  it('rejects an evidence reference that escapes the accepted roots', () => {
    for (const ref of ['../../etc/passwd', '/etc/passwd', 'runs/../secrets.json', 'src/api/upload.ts']) {
      expect(() => validateNarrative(narrative({ evidenceRefs: [ref] }))).toThrow(/outside the accepted evidence roots/)
    }
  })

  it('rejects unsupported fields', () => {
    expect(() => validateNarrative(narrative({ severity: 'high' }))).toThrow(/Unsupported finding fields/)
  })
})

describe('buildFinding', () => {
  it('recomputes the classification and keeps the model out of it', () => {
    const finding = buildFinding(facts({ policyBlocked: true }), validateNarrative(narrative()) as ModelNarrative)
    expect(finding.classification).toBe('policy_blocked')
    expect(finding.schemaVersion).toBe(FINDING_SCHEMA_VERSION)
    expect(Object.keys(finding).sort()).toEqual([
      'adapterCommit', 'classification', 'evidenceRefs', 'expectedBehavior', 'failedOracle', 'findingId',
      'harnessCommit', 'hypotheses', 'model', 'observedBehavior', 'probesSelected', 'reasoningSummary',
      'rejectedCalls', 'reproductionOracleResult', 'reproductionSequence', 'resumematchCommit', 'safetyViolations',
      'scenarioId', 'schemaVersion', 'sourceCommit', 'sourceRunId', 'usage',
    ])
    expect({
      resumematchCommit: finding.resumematchCommit, harnessCommit: finding.harnessCommit, adapterCommit: finding.adapterCommit,
    }).toEqual({ resumematchCommit: 'b'.repeat(40), harnessCommit: 'c'.repeat(40), adapterCommit: 'd'.repeat(40) })
  })
})
