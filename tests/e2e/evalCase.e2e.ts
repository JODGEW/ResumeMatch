import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import { test } from '@playwright/test'

import { runReleaseCheck } from '../../qa/browser/runReleaseCheck'
import type { EvaluationIdentity } from '../../qa/browser/types'
import { EVAL_CASES } from '../../qa/investigation/evalCases'
import { buildDigest, sourceDigest } from '../../qa/investigation/evalRunner/digest'
import { triageRun } from '../../qa/investigation/triage'

/**
 * Executes one evaluation case inside its own worktree.
 *
 * This lives as a Playwright test because the QA launcher already owns the
 * build, the fixed preview port, and the process lock; a second launcher would
 * have to duplicate all three. It asserts nothing about the case: the outcome is
 * the measurement, and the runner in the parent worktree judges it.
 */
test('evaluation case', async () => {
  // Skipped in the ordinary suite: this file is the evaluation runner's
  // in-worktree executor, driven by the environment the runner passes.
  test.skip(process.env.QA_EVAL_CASE === undefined, 'runs only under the evaluation runner')
  test.setTimeout(180_000)
  const caseId = process.env.QA_EVAL_CASE
  const resultPath = process.env.QA_EVAL_RESULT
  const worktreeLabel = process.env.QA_EVAL_WORKTREE_LABEL
  if (caseId === undefined || resultPath === undefined || worktreeLabel === undefined) {
    throw new Error('evalCase requires QA_EVAL_CASE, QA_EVAL_RESULT, and QA_EVAL_WORKTREE_LABEL')
  }
  const evalCase = EVAL_CASES.find(item => item.id === caseId)
  if (evalCase === undefined) throw new Error(`Unknown public evaluation case: ${caseId}`)

  const evaluationIdentity: EvaluationIdentity = {
    caseId: evalCase.id,
    mutationApplied: evalCase.mutation === undefined ? null : evalCase.id,
    transientFaults: evalCase.transientFaults ?? [],
    sourceDigest: await sourceDigest(process.cwd()),
    buildDigest: await buildDigest(path.join(process.cwd(), '.qa-dist')),
    worktreeLabel,
  }

  const result = await runReleaseCheck(evalCase.scenarioId, {
    transientFaults: evalCase.transientFaults ?? [],
    evaluationIdentity,
  })
  const triage = triageRun(result)

  await writeFile(resultPath, `${JSON.stringify({
    caseId: evalCase.id,
    kind: evalCase.kind,
    scenarioId: evalCase.scenarioId,
    runId: result.runId,
    executionStatus: result.executionStatus,
    oracleStatus: result.oracleStatus,
    expectationMet: result.expectationMet,
    failedOracle: result.failedOracle,
    artifactValidation: result.artifactValidation.status,
    releaseGrade: result.evidenceManifest?.sourceIdentity.releaseGrade ?? null,
    triage: triage.decision,
    triageReason: triage.reason,
    evaluationIdentity,
  }, null, 2)}\n`, 'utf8')
})
