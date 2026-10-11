import { describe, expect, it } from 'vitest'

import {
  buildFinding, classify, FINDING_SCHEMA_VERSION, FINDING_SCHEMA_VERSION_V1, MINIMAL_NARRATIVE_EXAMPLE, NARRATIVE_JSON_SCHEMA,
  parseStoredFinding, ROOT_CAUSE_ATTRIBUTIONS, ROOT_CAUSE_FAILURE_MODES, ROOT_CAUSE_ROUTE_TEMPLATES, validateNarrative,
} from './finding'
import type { DeterministicFacts, ModelNarrative } from './finding'

const RUN_REF = 'runs/p1-04-11111111-2222-4333-8444-555555555555/network-events.json'

function narrative(overrides: Partial<Record<string, unknown>> = {}): unknown {
  return {
    expectedBehavior: 'The failed analysis renders its recovery state.',
    observedBehavior: 'The processing status never resolved.',
    reasoningSummary: 'Polling stopped before the terminal response arrived.',
    evidenceRefs: [RUN_REF],
    hypotheses: [{ statement: 'Polling stops early.', evidenceRefs: [RUN_REF], confidence: 'high' }],
    rootCause: { attribution: 'product_defect', routeTemplate: '/analysis/:analysisId', failureMode: 'stopped_early' },
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
    policyBlocked: false, budgetExhausted: false, rejectedCalls: [], coercedArgs: 0,
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
      'evaluationIdentity', 'resumematchCommit', 'harnessCommit', 'adapterCommit', 'rejectedCalls', 'coercedArgs',
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
      'adapterCommit', 'classification', 'coercedArgs', 'evidenceRefs', 'expectedBehavior', 'failedOracle',
      'findingId', 'harnessCommit', 'hypotheses', 'model', 'observedBehavior', 'probesSelected', 'reasoningSummary',
      'rejectedCalls', 'reproductionOracleResult', 'reproductionSequence', 'resumematchCommit', 'rootCause', 'safetyViolations',
      'scenarioId', 'schemaVersion', 'sourceCommit', 'sourceRunId', 'usage',
    ])
    expect({
      resumematchCommit: finding.resumematchCommit, harnessCommit: finding.harnessCommit, adapterCommit: finding.adapterCommit,
    }).toEqual({ resumematchCommit: 'b'.repeat(40), harnessCommit: 'c'.repeat(40), adapterCommit: 'd'.repeat(40) })
  })
})

describe('corpus shapes', () => {
  it('confirms D2: the rejected upload body and the navigation it prevented (D2 shape)', () => {
    const d2 = facts({
      failedOracle: 'P1-02_RESULTS_NAVIGATION',
      reproductionOracleResult: repro('failed', ['CONTRACT_UPLOAD_BODY', 'P1-02_RESULTS_NAVIGATION']),
    })
    expect(classify(d2)).toBe('confirmed')
  })

  it('leaves B1 not_reproduced when the same anchor passes on retry (B1 regression)', () => {
    const b1 = facts({
      failedOracle: 'P1-02_RESULTS_NAVIGATION',
      reproductionOracleResult: repro('passed', []),
    })
    expect(classify(b1)).toBe('not_reproduced')
  })
})

describe('rootCause', () => {
  const rootCause = (value: unknown) => narrative({ rootCause: value })

  it('accepts every committed attribution with a route and a failure mode, and abstention with neither', () => {
    expect(validateNarrative(narrative()).rootCause).toEqual({
      attribution: 'product_defect', routeTemplate: '/analysis/:analysisId', failureMode: 'stopped_early',
    })
    expect(validateNarrative(rootCause({ attribution: 'transient_or_environment', routeTemplate: '/upload', failureMode: 'error_response' })).rootCause)
      .toEqual({ attribution: 'transient_or_environment', routeTemplate: '/upload', failureMode: 'error_response' })
    expect(validateNarrative(rootCause({ attribution: 'undetermined', routeTemplate: null, failureMode: null })).rootCause)
      .toEqual({ attribution: 'undetermined', routeTemplate: null, failureMode: null })
  })

  it('is required', () => {
    const { rootCause: _omitted, ...withoutRootCause } = narrative() as Record<string, unknown>
    void _omitted
    expect(() => validateNarrative(withoutRootCause))
      .toThrow('rootCause is required: an object with exactly attribution, routeTemplate, and failureMode')
    for (const value of [null, 'product_defect', [], 3]) {
      expect(() => validateNarrative(rootCause(value))).toThrow(/^rootCause is required/)
    }
  })

  it('rejects unsupported fields and values outside each closed set', () => {
    const valid = { attribution: 'product_defect', routeTemplate: '/upload', failureMode: 'malformed_request' }
    expect(() => validateNarrative(rootCause({ ...valid, component: 'Upload.tsx' })))
      .toThrow('rootCause has unsupported fields: component')
    expect(() => validateNarrative(rootCause({ ...valid, attribution: 'confirmed' })))
      .toThrow('rootCause.attribution must be product_defect, transient_or_environment, or undetermined')
    for (const route of ['/sample', '/results/:analysisId', '/css2', undefined]) {
      expect(() => validateNarrative(rootCause({ ...valid, routeTemplate: route })))
        .toThrow('rootCause.routeTemplate must be /upload, /synthetic-upload, /analysis/:analysisId, /user/last-resume, or null')
    }
    expect(() => validateNarrative(rootCause({ ...valid, failureMode: 'timeout' }))).toThrow(
      'rootCause.failureMode must be unexpected_request, missing_request, malformed_request, stopped_early, error_response, aborted_response, or null',
    )
  })

  it('sets both route and failure mode unless undetermined, and neither when undetermined', () => {
    const message = 'rootCause.routeTemplate and rootCause.failureMode must both be null when attribution is undetermined, and both set otherwise'
    for (const value of [
      { attribution: 'undetermined', routeTemplate: '/upload', failureMode: null },
      { attribution: 'undetermined', routeTemplate: null, failureMode: 'error_response' },
      { attribution: 'product_defect', routeTemplate: '/upload', failureMode: null },
      { attribution: 'transient_or_environment', routeTemplate: null, failureMode: null },
    ]) {
      expect(() => validateNarrative(rootCause(value))).toThrow(message)
    }
  })

  it('returns every rejection as INVALID_ARGUMENTS with the schema and an example that passes', () => {
    try {
      validateNarrative(rootCause({ attribution: 'maybe', routeTemplate: null, failureMode: null }))
      throw new Error('expected a rejection')
    } catch (error) {
      expect(error).toMatchObject({ code: 'INVALID_ARGUMENTS', help: { schema: NARRATIVE_JSON_SCHEMA, example: MINIMAL_NARRATIVE_EXAMPLE } })
    }
    expect(validateNarrative(MINIMAL_NARRATIVE_EXAMPLE).rootCause).toEqual(MINIMAL_NARRATIVE_EXAMPLE.rootCause)
  })

  it('publishes the schema from the same closed sets the validator enforces', () => {
    expect(NARRATIVE_JSON_SCHEMA.required).toContain('rootCause')
    const { properties } = NARRATIVE_JSON_SCHEMA.properties.rootCause
    expect(properties.attribution.enum).toEqual(ROOT_CAUSE_ATTRIBUTIONS)
    expect(properties.routeTemplate.enum).toEqual([...ROOT_CAUSE_ROUTE_TEMPLATES, null])
    expect(properties.failureMode.enum).toEqual([...ROOT_CAUSE_FAILURE_MODES, null])
  })

  it('is recorded in the finding without changing its classification', () => {
    const transient = validateNarrative(rootCause({ attribution: 'transient_or_environment', routeTemplate: '/upload', failureMode: 'error_response' }))
    const finding = buildFinding(facts(), transient)
    expect(finding.classification).toBe('confirmed')
    expect(finding.rootCause).toEqual({ attribution: 'transient_or_environment', routeTemplate: '/upload', failureMode: 'error_response' })
  })

  it('is null for the narrative a session substitutes after a policy-blocked submission', () => {
    const discarded: ModelNarrative = {
      expectedBehavior: 'Not recorded.', observedBehavior: 'Not recorded.', reasoningSummary: 'Blocked.',
      evidenceRefs: [], hypotheses: [{ statement: 'Discarded.', evidenceRefs: [], confidence: 'low' }],
    }
    expect(buildFinding(facts({ policyBlocked: true }), discarded).rootCause).toBeNull()
  })
})

describe('parseStoredFinding', () => {
  /** A finding as phase2-finding/1 wrote it: no rootCause. Values are invented. */
  const V1_FINDING = {
    schemaVersion: 'phase2-finding/1', findingId: 'f-v1', sourceRunId: 'p1-04-11111111-2222-4333-8444-555555555555',
    scenarioId: 'P1-04', sourceCommit: 'a'.repeat(40), resumematchCommit: 'b'.repeat(40), harnessCommit: 'c'.repeat(40),
    adapterCommit: 'd'.repeat(40), failedOracle: 'P1-04_FAILURE_TITLE', expectedBehavior: 'e', observedBehavior: 'o',
    hypotheses: [{ statement: 's', evidenceRefs: [], confidence: 'high' }], evidenceRefs: [], probesSelected: ['read_failed_assertion'],
    reproductionSequence: [], reproductionOracleResult: null, rejectedCalls: [], coercedArgs: 0, classification: 'inconclusive',
    reasoningSummary: 'r', safetyViolations: [], model: { provider: 'fake', modelId: 'fake-1' },
    usage: { toolCalls: 1, cacheHitTokens: 0, cacheMissTokens: 0, completionTokens: 0, costUsd: 0, requests: [] },
  }

  it('still loads a phase2-finding/1 finding, which has no rootCause', () => {
    const finding = parseStoredFinding(JSON.stringify(V1_FINDING))
    expect(finding.schemaVersion).toBe(FINDING_SCHEMA_VERSION_V1)
    expect(finding).toEqual(V1_FINDING)
    expect('rootCause' in finding).toBe(false)
  })

  it('round-trips a finding written under the current version', () => {
    const finding = buildFinding(facts(), validateNarrative(narrative()))
    expect(finding.schemaVersion).toBe('phase2-finding/2')
    expect(parseStoredFinding(JSON.stringify(finding))).toEqual(finding)
  })

  it('refuses an unknown schema version rather than misreading it', () => {
    expect(() => parseStoredFinding(JSON.stringify({ ...V1_FINDING, schemaVersion: 'phase2-finding/9' })))
      .toThrow('Unknown finding schema version: phase2-finding/9')
  })
})
