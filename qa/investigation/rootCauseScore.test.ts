import { describe, expect, it } from 'vitest'

import { FINDING_SCHEMA_VERSION, FINDING_SCHEMA_VERSION_V1 } from './finding'
import type { Finding, FindingV1, RootCause } from './finding'
import { goldRootCause, PUBLIC_ROOT_CAUSE_GOLD } from './rootCauseGold'
import { gradeRootCause, scoreRootCauses } from './rootCauseScore'

const D4_GOLD: RootCause = { attribution: 'product_defect', routeTemplate: '/analysis/:analysisId', failureMode: 'stopped_early' }

/** A stored finding with only the fields grading reads; invented values. */
function finding(rootCause: RootCause | null): Finding {
  return { schemaVersion: FINDING_SCHEMA_VERSION, rootCause } as Finding
}

describe('gradeRootCause', () => {
  it('grades an exact answer correct on attribution and triple', () => {
    expect(gradeRootCause(finding(D4_GOLD), D4_GOLD))
      .toEqual({ graded: true, attributionCorrect: true, tripleCorrect: true, undetermined: false, policyBlocked: false })
  })

  it('grades a wrong attribution wrong on both', () => {
    const transient: RootCause = { attribution: 'transient_or_environment', routeTemplate: '/analysis/:analysisId', failureMode: 'aborted_response' }
    expect(gradeRootCause(finding(transient), D4_GOLD))
      .toEqual({ graded: true, attributionCorrect: false, tripleCorrect: false, undetermined: false, policyBlocked: false })
  })

  it('credits the right attribution but not the triple when the route is wrong', () => {
    expect(gradeRootCause(finding({ ...D4_GOLD, routeTemplate: '/upload' }), D4_GOLD))
      .toEqual({ graded: true, attributionCorrect: true, tripleCorrect: false, undetermined: false, policyBlocked: false })
    expect(gradeRootCause(finding({ ...D4_GOLD, failureMode: 'missing_request' }), D4_GOLD))
      .toMatchObject({ attributionCorrect: true, tripleCorrect: false })
  })

  it('grades undetermined as an abstention that scores nothing', () => {
    expect(gradeRootCause(finding({ attribution: 'undetermined', routeTemplate: null, failureMode: null }), D4_GOLD))
      .toEqual({ graded: true, attributionCorrect: false, tripleCorrect: false, undetermined: true, policyBlocked: false })
  })

  it('grades a policy-blocked finding, whose narrative was discarded, as a tagged miss', () => {
    expect(gradeRootCause(finding(null), D4_GOLD))
      .toEqual({ graded: true, attributionCorrect: false, tripleCorrect: false, undetermined: false, policyBlocked: true })
  })

  it('does not grade a phase2-finding/1 finding, which predates rootCause', () => {
    const v1 = { schemaVersion: FINDING_SCHEMA_VERSION_V1 } as FindingV1
    expect(gradeRootCause(v1, D4_GOLD)).toEqual({ graded: false, reason: 'v1_finding' })
  })

  it('does not grade a case without an answer, or a case with no finding', () => {
    expect(gradeRootCause(finding(D4_GOLD), null)).toEqual({ graded: false, reason: 'no_gold' })
    expect(gradeRootCause(null, D4_GOLD)).toEqual({ graded: false, reason: 'no_finding' })
  })
})

describe('scoreRootCauses', () => {
  it('counts each rate over graded findings only', () => {
    expect(scoreRootCauses([
      gradeRootCause(finding(D4_GOLD), D4_GOLD),
      gradeRootCause(finding({ ...D4_GOLD, routeTemplate: '/upload' }), D4_GOLD),
      gradeRootCause(finding({ attribution: 'undetermined', routeTemplate: null, failureMode: null }), D4_GOLD),
      gradeRootCause(finding(null), D4_GOLD),
      gradeRootCause(finding(D4_GOLD), null),
      gradeRootCause(null, D4_GOLD),
    ])).toEqual({ graded: 4, attributionCorrect: 2, tripleCorrect: 1, undetermined: 1, policyBlocked: 1 })
  })
})

describe('goldRootCause', () => {
  it('holds the approved answers for the public investigated cases', () => {
    expect(goldRootCause('D1')).toEqual({ attribution: 'product_defect', routeTemplate: '/analysis/:analysisId', failureMode: 'unexpected_request' })
    expect(goldRootCause('D2')).toEqual({ attribution: 'product_defect', routeTemplate: '/upload', failureMode: 'malformed_request' })
    expect(goldRootCause('D3')).toEqual({ attribution: 'product_defect', routeTemplate: '/synthetic-upload', failureMode: 'missing_request' })
    expect(goldRootCause('D4')).toEqual(D4_GOLD)
    expect(goldRootCause('B1')).toEqual({ attribution: 'transient_or_environment', routeTemplate: '/upload', failureMode: 'error_response' })
    expect(goldRootCause('B2')).toEqual({ attribution: 'transient_or_environment', routeTemplate: '/analysis/:analysisId', failureMode: 'aborted_response' })
  })

  it('treats never-investigated, later and held-out cases as not graded', () => {
    for (const caseId of ['C1', 'C2', 'C3', 'B3', 'D5', 'D6', 'B4', 'D7', 'D8', 'D9', 'B5']) expect(goldRootCause(caseId)).toBeNull()
    expect([...PUBLIC_ROOT_CAUSE_GOLD.keys()].sort()).toEqual(['B1', 'B2', 'B3', 'C1', 'C2', 'C3', 'D1', 'D2', 'D3', 'D4'])
  })
})
