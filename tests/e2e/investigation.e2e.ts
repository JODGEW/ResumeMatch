import { randomUUID } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

import { expect, test } from '@playwright/test'

import { runReleaseCheck } from '../../qa/browser/runReleaseCheck'
import type { EvidenceManifest, TransientFault } from '../../qa/browser/types'
import { buildDigest, sourceDigest } from '../../qa/investigation/evalRunner/digest'
import { approvedArtifactRoot, createInvestigationDirectory, newInvestigationId } from '../../qa/investigation/paths'
import { PlaywrightReproduction } from '../../qa/investigation/reproduction'
import { InvestigationSession } from '../../qa/investigation/session'
import { triageAcceptedManifest, triageRun } from '../../qa/investigation/triage'
import type { Finding } from '../../qa/investigation/finding'

const NARRATIVE = {
  expectedBehavior: 'The upload flow reaches a completed report.',
  observedBehavior: 'The original run never reached the completed report.',
  reasoningSummary: 'A single transient upload failure did not recur in a fresh context.',
  evidenceRefs: [] as string[],
  hypotheses: [{ statement: 'The upload request failed once and did not recur.', evidenceRefs: [] as string[], confidence: 'medium' }],
}

async function investigate(manifest: EvidenceManifest, runDirectory: string): Promise<{ finding: Finding; directory: string }> {
  const approvedRoot = approvedArtifactRoot()
  const directories = await createInvestigationDirectory(approvedRoot, newInvestigationId())
  const driver = new PlaywrightReproduction(manifest.scenarioId, directories.reproductionDirectory)
  const session = new InvestigationSession({
    investigationId: path.basename(directories.directory), findingId: `f-${randomUUID()}`,
    runDirectory, manifest, directories, driver, model: { provider: 'fake-provider', modelId: 'fake-deterministic' },
  })
  try {
    await session.call('read_failed_assertion', {})
    await session.call('start_fresh_reproduction', {})
    await session.call('execute_allowed_action', { action: { kind: 'open_route', route: 'upload' } })
    await session.call('execute_allowed_action', { action: { kind: 'fill_synthetic_text', field: 'job_description' } })
    if (manifest.scenarioId === 'P1-02') {
      await session.call('execute_allowed_action', { action: { kind: 'attach_synthetic_file', file: 'qa_synthetic_resume' } })
    }
    await session.call('execute_allowed_action', { action: { kind: 'click_by_role', role: 'button', name: 'Analyze Resume' } })
    await session.call('execute_allowed_action', { action: { kind: 'wait_for_state', state: 'completed_report' } })
    await session.call('run_oracle', {})
    await session.call('submit_finding', { finding: NARRATIVE })
  } finally {
    await driver.close()
  }
  const finding = session.submittedFinding()
  expect(finding).not.toBeNull()
  return { finding: finding as Finding, directory: directories.directory }
}

async function failingRun(fault: TransientFault) {
  // A run that injects a fault must declare it: without an evaluation identity
  // the validator judges the bundle under the strict release allowlist and
  // rejects the transient response, so the run never becomes investigable.
  const result = await runReleaseCheck('P1-02', {
    transientFaults: [fault],
    evaluationIdentity: {
      caseId: fault === 'upload_503_once' ? 'B1' : 'B2',
      mutationApplied: null,
      transientFaults: [fault],
      sourceDigest: await sourceDigest(process.cwd()),
      buildDigest: await buildDigest(path.join(process.cwd(), '.qa-dist')),
      worktreeLabel: 'harness-inline-e2e',
    },
  })
  expect(result.executionStatus).toBe('completed')
  expect(result.oracleStatus).toBe('failed')
  expect(result.expectationMet).toBe(false)
  expect(result.artifactValidation.status).toBe('passed')
  expect(result.evidenceManifest).not.toBeNull()
  expect(result.evidenceManifest?.sourceIdentity.releaseGrade).toBe(false)
  expect(result.evidenceManifest?.evaluationIdentity?.transientFaults).toEqual([fault])
  expect(triageRun(result).decision).toBe('investigate')
  const manifest = result.evidenceManifest as EvidenceManifest
  expect(triageAcceptedManifest(manifest).decision).toBe('investigate')
  return { result, manifest, runDirectory: path.join(approvedArtifactRoot(), 'runs', result.runId) }
}

test('B1: a single transient upload failure is investigable and does not reproduce', async () => {
  test.setTimeout(120_000)
  const { manifest, runDirectory } = await failingRun('upload_503_once')
  expect(manifest.failedOracle).toBe('P1-02_RESULTS_NAVIGATION')

  const { finding, directory } = await investigate(manifest, runDirectory)
  expect(finding.classification).toBe('not_reproduced')
  expect(finding.reproductionOracleResult?.oracleStatus).toBe('passed')
  expect(finding.sourceRunId).toBe(manifest.runId)
  expect(finding.model).toEqual({ provider: 'fake-provider', modelId: 'fake-deterministic' })
  expect(JSON.parse(await readFile(path.join(directory, 'finding.json'), 'utf8')).classification).toBe('not_reproduced')
})

test('B2: one interrupted analysis poll is investigable and does not reproduce', async () => {
  test.setTimeout(120_000)
  const { manifest, runDirectory } = await failingRun('analysis_interrupted_once')
  expect(manifest.failedOracle).toBe('P1-02_COMPLETED_REPORT')

  const { finding } = await investigate(manifest, runDirectory)
  expect(finding.classification).toBe('not_reproduced')
})

test('an investigation writes nothing into the accepted evidence bundle', async () => {
  test.setTimeout(120_000)
  const { manifest, runDirectory } = await failingRun('upload_503_once')
  const before = (await readdir(runDirectory)).sort()
  const beforeManifest = await readFile(path.join(runDirectory, 'manifest.json'), 'utf8')

  await investigate(manifest, runDirectory)

  expect((await readdir(runDirectory)).sort()).toEqual(before)
  expect(await readFile(path.join(runDirectory, 'manifest.json'), 'utf8')).toBe(beforeManifest)
})

test('P1-06 safety self-test never becomes an investigation', async () => {
  const result = await runReleaseCheck('P1-06')
  expect(result.expectationMet).toBe(true)
  expect(triageRun(result).decision).toBe('expected')
  expect(triageAcceptedManifest(result.evidenceManifest as EvidenceManifest).decision).toBe('expected')
})
