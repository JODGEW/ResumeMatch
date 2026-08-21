import { execFileSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

import { expect, test } from '@playwright/test'

import { runReleaseCheck } from '../../qa/browser/runReleaseCheck'

test('P1-01: sample report is isolated from product and external services', async () => {
  const gitEnvironment = { PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin:/sbin` }
  const observedHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: process.cwd(), encoding: 'utf8', env: gitEnvironment }).trim()
  const observedDirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: process.cwd(), encoding: 'utf8', env: gitEnvironment }).trim().length > 0
  const result = await runReleaseCheck('P1-01')

  expect(result).toMatchObject({
    scenarioId: 'P1-01',
    executionStatus: 'completed',
    oracleStatus: 'passed',
    expectedOracleStatus: 'passed',
    expectationMet: true,
    failures: [],
    failedOracle: null,
    safetyViolations: [],
  })
  expect(result.artifactValidation.status).toBe('passed')
  expect(result.evidenceManifest).not.toBeNull()
  expect(result.evidenceManifest?.sourceIdentity).toEqual({
    headCommit: observedHead,
    worktreeDirty: observedDirty,
    exactCommittedSource: !observedDirty,
    releaseGrade: !observedDirty
      && result.executionStatus === 'completed'
      && result.evidenceManifest?.artifactsAccepted === true
      && result.expectationMet,
  })
})

test('P1-02: new resume upload reaches a usable completed report', async () => {
  const result = await runReleaseCheck('P1-02')

  expect(result).toMatchObject({
    scenarioId: 'P1-02',
    executionStatus: 'completed',
    oracleStatus: 'passed',
    expectationMet: true,
    failures: [],
    failedOracle: null,
    safetyViolations: [],
  })
})

test('P1-03: existing resume is reused without an S3 request', async () => {
  const result = await runReleaseCheck('P1-03')

  expect(result).toMatchObject({
    scenarioId: 'P1-03',
    executionStatus: 'completed',
    oracleStatus: 'passed',
    expectationMet: true,
    failures: [],
    failedOracle: null,
    safetyViolations: [],
  })
  expect(result.evidenceManifest?.networkSummary.s3).toBe(0)
})

test('P1-04: backend terminal failure renders recovery state without a score', async () => {
  const result = await runReleaseCheck('P1-04')

  expect(result).toMatchObject({
    scenarioId: 'P1-04',
    executionStatus: 'completed',
    oracleStatus: 'passed',
    expectationMet: true,
    failures: [],
    failedOracle: null,
    safetyViolations: [],
  })
})

test('P1-05: polling times out after two controlled minutes', async () => {
  const result = await runReleaseCheck('P1-05')

  expect(result).toMatchObject({
    scenarioId: 'P1-05',
    executionStatus: 'completed',
    oracleStatus: 'passed',
    expectationMet: true,
    failures: [],
    failedOracle: null,
    safetyViolations: [],
  })
  expect(result.durationMs).toBeLessThan(15_000)
})
