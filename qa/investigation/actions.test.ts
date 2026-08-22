import { describe, expect, it } from 'vitest'

import { allowsControlledClock, resolveRoute, validateAction, validateInspectionTarget } from './actions'

describe('validateAction', () => {
  it('accepts the gold reproduction sequence for a new upload', () => {
    const actions = [
      { kind: 'open_route', route: 'upload' },
      { kind: 'fill_synthetic_text', field: 'job_description' },
      { kind: 'attach_synthetic_file', file: 'qa_synthetic_resume' },
      { kind: 'click_by_role', role: 'button', name: 'Analyze Resume' },
      { kind: 'wait_for_state', state: 'completed_report' },
    ]
    for (const action of actions) expect(validateAction('P1-02', action)).toEqual(action)
  })

  it('refuses a route the scenario does not define', () => {
    expect(() => validateAction('P1-01', { kind: 'open_route', route: 'upload' })).toThrow(/does not define the route/)
    expect(() => validateAction('P1-04', { kind: 'open_route', route: 'sample' })).toThrow(/does not define the route/)
  })

  it('refuses free-form navigation, selectors, and scripts', () => {
    for (const action of [
      { kind: 'open_route', route: 'https://example.com' },
      { kind: 'open_route', route: '/upload', selector: '.progress-ring' },
      { kind: 'evaluate', script: 'fetch("/api")' },
      { kind: 'click_by_css', selector: 'button.primary' },
    ]) {
      expect(() => validateAction('P1-02', action)).toThrow(/POLICY|not on the approved|does not define|only kind|Unsupported/)
    }
  })

  it('refuses an unapproved accessible name', () => {
    expect(() => validateAction('P1-02', { kind: 'click_by_role', role: 'button', name: 'Delete account' }))
      .toThrow(/not on the approved click list/)
  })

  it('refuses attaching a file in a scenario that reuses a resume', () => {
    expect(() => validateAction('P1-03', { kind: 'attach_synthetic_file', file: 'qa_synthetic_resume' })).toThrow(/does not authorize attaching/)
  })

  it('refuses a state the scenario cannot reach', () => {
    expect(() => validateAction('P1-04', { kind: 'wait_for_state', state: 'completed_report' })).toThrow(/does not define the state/)
    expect(() => validateAction('P1-01', { kind: 'wait_for_state', state: 'processing' })).toThrow(/does not define the state/)
  })
})

describe('resolveRoute', () => {
  it('maps a semantic route to the path the scenario router accepts', () => {
    expect(resolveRoute('P1-02', 'results')).toBe('/results/qa-new-1')
    expect(resolveRoute('P1-03', 'results')).toBe('/results/qa-reuse-1')
    expect(resolveRoute('P1-04', 'results')).toBe('/results/qa-failed-1')
    expect(resolveRoute('P1-05', 'results')).toBe('/results/qa-timeout-1')
    expect(resolveRoute('P1-01', 'sample')).toBe('/sample')
  })

  it('refuses a results route for a scenario without one', () => {
    expect(() => resolveRoute('P1-01', 'results')).toThrow(/has no results route/)
  })
})

describe('controlled clock authorization', () => {
  it('is available only to the timeout scenario', () => {
    expect(allowsControlledClock('P1-05')).toBe(true)
    for (const scenario of ['P1-01', 'P1-02', 'P1-03', 'P1-04', 'P1-06'] as const) {
      expect(allowsControlledClock(scenario)).toBe(false)
    }
  })
})

describe('validateInspectionTarget', () => {
  it('accepts a closed role with a bounded name', () => {
    expect(validateInspectionTarget({ role: 'heading', name: 'Score Breakdown' })).toEqual({ role: 'heading', name: 'Score Breakdown' })
    expect(validateInspectionTarget({ role: 'status' })).toEqual({ role: 'status' })
  })

  it('refuses selectors and unbounded names', () => {
    expect(() => validateInspectionTarget({ role: 'css', name: '.x' })).toThrow(/is not inspectable/)
    expect(() => validateInspectionTarget({ role: 'heading', selector: '.x' })).toThrow(/only role and name/)
    expect(() => validateInspectionTarget({ role: 'heading', name: 'x'.repeat(121) })).toThrow(/at most 120 characters/)
  })
})
