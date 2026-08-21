import { access } from 'node:fs/promises'
import path from 'node:path'

import { expect, test } from '@playwright/test'

import { OracleFailure, requireVisible } from '../../qa/browser/oracles'
import { runReleaseCheck } from '../../qa/browser/runReleaseCheck'

async function exists(value: string): Promise<boolean> {
  try { await access(value); return true } catch { return false }
}

test('a real missing-element timeout becomes the intended oracle failure', async ({ page }) => {
  await page.setContent('<main>QA synthetic page without the expected status</main>')

  const outcome = requireVisible(page.getByRole('status'), 'P1-MISSING-STATUS')

  await expect(outcome).rejects.toBeInstanceOf(OracleFailure)
  await expect(outcome).rejects.toMatchObject({ oracleId: 'P1-MISSING-STATUS' })
})

test('setup failure returns an honest structured result and rejects partial evidence', async () => {
  const result = await runReleaseCheck('P1-01', { faultInjection: 'setup' })
  expect(result.executionStatus).toBe('infrastructure_failed')
  expect(result.oracleStatus).toBe('not_run')
  expect(result.failedOracle).toBeNull()
  expect(result.expectationMet).toBe(false)
  expect(result.failures).toEqual(expect.arrayContaining([
    expect.objectContaining({ phase: 'setup', kind: 'infrastructure' }),
    expect.objectContaining({ phase: 'artifact_validation', kind: 'artifact' }),
  ]))
  expect(result.evidenceManifest).toBeNull()
  expect(result.artifactValidation.rejectedBundleRemoved).toBe(true)
})

test('scenario driver failure is infrastructure with an incomplete oracle', async () => {
  const result = await runReleaseCheck('P1-01', { faultInjection: 'execution' })
  expect(result.executionStatus).toBe('infrastructure_failed')
  expect(result.oracleStatus).toBe('incomplete')
  expect(result.failedOracle).toBeNull()
  expect(result.expectationMet).toBe(false)
  expect(result.failures).toEqual(expect.arrayContaining([
    expect.objectContaining({ phase: 'scenario_execution', kind: 'infrastructure' }),
  ]))
})

test('page closure during a pending oracle wait remains infrastructure failure', async () => {
  const result = await runReleaseCheck('P1-01', { faultInjection: 'page_close_during_oracle_wait' })
  expect(result.executionStatus).toBe('infrastructure_failed')
  expect(result.oracleStatus).toBe('incomplete')
  expect(result.failedOracle).toBeNull()
  expect(result.expectationMet).toBe(false)
  expect(result.failures).toEqual(expect.arrayContaining([
    expect.objectContaining({ phase: 'scenario_execution', kind: 'infrastructure' }),
  ]))
  expect(result.failures.some(item => item.kind === 'oracle')).toBe(false)
})

test('persistence failure preserves the artifact failure and removes the rejected bundle', async () => {
  const result = await runReleaseCheck('P1-01', { faultInjection: 'persistence' })
  expect(result.expectationMet).toBe(false)
  expect(result.failures).toEqual(expect.arrayContaining([expect.objectContaining({ phase: 'artifact_persistence', kind: 'artifact' })]))
  expect(result.evidenceManifest).toBeNull()
  expect(result.artifactValidation.rejectedBundleRemoved).toBe(true)
  expect(await exists(path.join(process.cwd(), '.qa-artifacts', 'runs', result.runId))).toBe(false)
})

test('validation failure removes the exact generated bundle and keeps a sanitized report', async () => {
  const result = await runReleaseCheck('P1-01', { faultInjection: 'validation' })
  expect(result.executionStatus).toBe('completed')
  expect(result.oracleStatus).toBe('passed')
  expect(result.failedOracle).toBeNull()
  expect(result.expectationMet).toBe(false)
  expect(result.artifactValidation).toMatchObject({ status: 'failed', violationCount: 1, rejectedBundleRemoved: true })
  expect(result.evidenceManifest).toBeNull()
  expect(await exists(path.join(process.cwd(), '.qa-artifacts', 'runs', result.runId))).toBe(false)
  expect(result.artifactValidation.report && await exists(path.resolve(result.artifactValidation.report))).toBe(true)
})

test('validation report persistence failure cannot leave artifact status passed', async () => {
  const result = await runReleaseCheck('P1-01', { faultInjection: 'validation_report' })
  expect(result.executionStatus).toBe('completed')
  expect(result.oracleStatus).toBe('passed')
  expect(result.failedOracle).toBeNull()
  expect(result.expectationMet).toBe(false)
  expect(result.artifactValidation).toMatchObject({ status: 'failed', report: null, violationCount: 1, rejectedBundleRemoved: true })
  expect(result.failures).toEqual(expect.arrayContaining([
    expect.objectContaining({ phase: 'artifact_persistence', kind: 'artifact' }),
  ]))
})

test('cleanup failure does not replace a successful primary oracle', async () => {
  const result = await runReleaseCheck('P1-01', { faultInjection: 'cleanup' })
  expect(result.executionStatus).toBe('completed')
  expect(result.oracleStatus).toBe('passed')
  expect(result.failedOracle).toBeNull()
  expect(result.expectationMet).toBe(false)
  expect(result.failures).toEqual([expect.objectContaining({ phase: 'cleanup', kind: 'cleanup', message: 'Injected cleanup failure' })])
})

test('failed oracle plus cleanup preserves both independent observations', async () => {
  const result = await runReleaseCheck('P1-06', { faultInjection: 'cleanup' })
  expect(result.executionStatus).toBe('completed')
  expect(result.oracleStatus).toBe('failed')
  expect(result.failedOracle).toBe('SAFETY_UNEXPECTED_EGRESS')
  expect(result.expectationMet).toBe(false)
  expect(result.failures).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: 'oracle', oracleId: 'SAFETY_UNEXPECTED_EGRESS' }),
    expect.objectContaining({ kind: 'cleanup', phase: 'cleanup' }),
  ]))
})

test('P1-06 cannot meet its expected failed oracle when infrastructure also fails', async () => {
  const result = await runReleaseCheck('P1-06', { faultInjection: 'post_oracle_infrastructure' })
  expect(result.executionStatus).toBe('infrastructure_failed')
  expect(result.oracleStatus).toBe('failed')
  expect(result.expectedOracleStatus).toBe('failed')
  expect(result.failedOracle).toBe('SAFETY_UNEXPECTED_EGRESS')
  expect(result.expectationMet).toBe(false)
  expect(result.failures).toEqual(expect.arrayContaining([
    expect.objectContaining({ phase: 'post_oracle_execution', kind: 'infrastructure' }),
  ]))
})
