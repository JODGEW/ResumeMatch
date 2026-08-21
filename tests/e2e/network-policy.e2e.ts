import { expect, test } from '@playwright/test'

import { runReleaseCheck } from '../../qa/browser/runReleaseCheck'

test('P1-06: routed HTTP, same-origin fetch, and WebSocket probes are expected failures', async () => {
  const result = await runReleaseCheck('P1-06')

  expect(result.executionStatus).toBe('completed')
  expect(result.oracleStatus).toBe('failed')
  expect(result.expectedOracleStatus).toBe('failed')
  expect(result.expectationMet).toBe(true)
  expect(result.failedOracle).toBe('SAFETY_UNEXPECTED_EGRESS')
  expect(result.safetyViolations).toHaveLength(3)
  expect(result.safetyViolations).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: 'SAFETY_UNEXPECTED_EGRESS', resourceType: 'fetch', blockedByPlaywrightRoute: true, target: 'https://unapproved.qa.invalid/probe?marker' }),
    expect.objectContaining({ code: 'SAFETY_UNEXPECTED_BROWSER_REQUEST', resourceType: 'fetch', blockedByPlaywrightRoute: true, target: 'http://127.0.0.1:4173/api/unexpected?probe' }),
    expect.objectContaining({ code: 'SAFETY_UNEXPECTED_EGRESS', resourceType: 'websocket', blockedByPlaywrightRoute: true, target: 'wss://unapproved.qa.invalid/socket' }),
  ]))
  expect(result.failures).toHaveLength(4)
  expect(result.failures.filter(item => item.phase === 'network_policy' && item.kind === 'safety')).toHaveLength(3)
  expect(result.failures).toContainEqual(expect.objectContaining({ phase: 'oracle', kind: 'oracle', oracleId: 'SAFETY_UNEXPECTED_EGRESS' }))
  expect(result.evidenceManifest?.networkSummary).toMatchObject({ unexpectedEgress: 3, locallyFulfilled: 1 })
})
