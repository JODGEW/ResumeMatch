import { describe, expect, it } from 'vitest'

import { actionHelp, allowsControlledClock, resolveRoute, validateAction, validateInspectionTarget } from './actions'

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
      expect(() => validateAction('P1-02', action)).toThrow()
    }
  })

  it('treats a malformed action as retryable and an unauthorized one as blocking', () => {
    // Shape errors: the caller can repair them, so they must not end the run.
    for (const malformed of [
      { route: 'upload' },
      { kind: 'teleport', route: 'upload' },
      { kind: 'open_route', route: 'https://example.com' },
      { kind: 'open_route', route: 'upload', selector: '.x' },
      { kind: 'click_by_role', role: 'combobox', name: 'Analyze Resume' },
    ]) {
      try {
        validateAction('P1-02', malformed)
        throw new Error(`expected a refusal for ${JSON.stringify(malformed)}`)
      } catch (error) {
        expect({ input: malformed, code: (error as { code?: string }).code }).toEqual({ input: malformed, code: 'INVALID_ARGUMENTS' })
      }
    }
    // Authorization errors: well formed, but not what this scenario allows.
    for (const unauthorized of [
      { kind: 'open_route', route: 'sample' },
      { kind: 'wait_for_state', state: 'timeout_report' },
      { kind: 'click_by_role', role: 'button', name: 'Delete account' },
    ]) {
      try {
        validateAction('P1-02', unauthorized)
        throw new Error(`expected a refusal for ${JSON.stringify(unauthorized)}`)
      } catch (error) {
        expect({ input: unauthorized, code: (error as { code?: string }).code }).toEqual({ input: unauthorized, code: 'POLICY_BLOCKED' })
      }
    }
  })

  it('returns the grammar and a scenario-appropriate example with a malformed action', () => {
    try {
      validateAction('P1-04', { kind: 'teleport' })
      throw new Error('expected a refusal')
    } catch (error) {
      const help = (error as { help?: { schema: unknown; example: unknown } }).help
      expect(help?.schema).toMatchObject({ type: 'object', required: ['kind'] })
      expect(help?.example).toEqual({ action: { kind: 'open_route', route: 'results' } })
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
