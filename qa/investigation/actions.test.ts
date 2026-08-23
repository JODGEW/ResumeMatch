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

  it('refuses a route the scenario does not define, naming the ones it does', () => {
    expect(() => validateAction('P1-01', { kind: 'open_route', route: 'upload' })).toThrow(/defines the routes sample/)
    expect(() => validateAction('P1-04', { kind: 'open_route', route: 'sample' })).toThrow(/defines the routes results/)
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
    // Fixable by reading the scenario's own policy, so retryable rather than latching.
    for (const fixable of [
      { kind: 'open_route', route: 'sample' },
      { kind: 'wait_for_state', state: 'timeout_report' },
      { kind: 'click_by_role', role: 'button', name: 'Delete account' },
    ]) {
      try {
        validateAction('P1-02', fixable)
        throw new Error(`expected a refusal for ${JSON.stringify(fixable)}`)
      } catch (error) {
        expect({ input: fixable, code: (error as { code?: string }).code }).toEqual({ input: fixable, code: 'INVALID_ARGUMENTS' })
      }
    }
    // Leaving the application is the finding, so it still latches.
    for (const outside of [
      { kind: 'open_route', route: 'https://example.com' },
      { kind: 'open_route', route: '/etc/passwd' },
    ]) {
      try {
        validateAction('P1-02', outside)
        throw new Error(`expected a refusal for ${JSON.stringify(outside)}`)
      } catch (error) {
        expect({ input: outside, code: (error as { code?: string }).code }).toEqual({ input: outside, code: 'POLICY_BLOCKED' })
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

  it('returns the whole click list when a name is not on it', () => {
    try {
      validateAction('P1-02', { kind: 'click_by_role', role: 'button', name: 'Analyze' })
      throw new Error('expected a refusal')
    } catch (error) {
      const failure = error as { code?: string; message: string; help?: { scenarioPolicy?: { clickNames?: string[] } } }
      expect(failure.code).toBe('INVALID_ARGUMENTS')
      expect(failure.message).toContain('Analyze Resume')
      expect(failure.help?.scenarioPolicy?.clickNames).toContain('Analyze Resume')
    }
  })

  it('publishes the scenario policy with every fixable refusal', () => {
    try {
      validateAction('P1-04', { kind: 'open_route', route: 'upload' })
      throw new Error('expected a refusal')
    } catch (error) {
      const help = (error as { help?: { scenarioPolicy?: { routes?: string[]; states?: string[] } } }).help
      expect(help?.scenarioPolicy?.routes).toEqual(['results'])
      expect(help?.scenarioPolicy?.states).toEqual(['processing', 'failed_report'])
    }
  })

  it('refuses attaching a file in a scenario that reuses a resume', () => {
    expect(() => validateAction('P1-03', { kind: 'attach_synthetic_file', file: 'qa_synthetic_resume' }))
      .toThrow(/reuses an existing resume and attaches no file/)
  })

  it('refuses a state the scenario cannot reach, naming the ones it defines', () => {
    expect(() => validateAction('P1-04', { kind: 'wait_for_state', state: 'completed_report' }))
      .toThrow(/defines the states processing, failed_report/)
    expect(() => validateAction('P1-01', { kind: 'wait_for_state', state: 'processing' })).toThrow(/defines the states /)
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

describe('argument echo', () => {
  it('names the type it received instead of only restating the requirement', () => {
    for (const [input, received] of [
      ['{"kind":"open_route","route":"upload"}', 'string'],
      [42, 'number'],
      [null, 'null'],
      [['open_route'], 'array'],
    ] as Array<[unknown, string]>) {
      expect(() => validateAction('P1-02', input)).toThrow(new RegExp(`received ${received}$`))
    }
  })
})
