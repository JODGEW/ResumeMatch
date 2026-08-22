import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { EVAL_CASES } from '../evalCases'
import type { EvalCase } from '../evalCases'
import type { Finding } from '../finding'
import { firstProbe } from '../goldProbe'
import { applyMutationById } from './mutation'
import type { MutationRegistry } from './mutation'
import { createEvaluationWorktree, removeEvaluationWorktree } from './worktree'

/** Everything the runner needs that varies by machine. No value is defaulted silently. */
export interface EvalRunnerOptions {
  /** Main ResumeMatch checkout; never mutated. */
  repositoryPath: string
  /** Commit every evaluation copy is created from. */
  commit: string
  /** Node that runs the ResumeMatch QA launcher. */
  productNodePath: string
  /** Node that runs the DeepSeek Harness; named explicitly rather than taken from PATH. */
  harnessNodePath: string
  /** The harness checkout. */
  harnessPath: string
  /** The adapter checkout inside the harness. */
  adapterPath: string
  /** Where per-case JSON results are written. */
  outputDirectory: string
}

/** One case outcome, deterministic apart from the narrative inside the finding. */
export interface EvalCaseResult {
  caseId: string
  kind: EvalCase['kind']
  scenarioId: string
  runId: string | null
  oracleStatus: string | null
  expectationMet: boolean | null
  failedOracle: string | null
  artifactValidation: string | null
  releaseGrade: boolean | null
  triage: string | null
  expectedTriage: string
  triageMatched: boolean
  harnessLaunched: boolean
  modelRequests: number
  classification: string | null
  expectedClassification: string | null
  classificationMatched: boolean
  firstProbe: string | null
  goldFirstProbe: string | null
  goldProbeHit: boolean | null
  worktreeRemoved: boolean
  errors: string[]
}

const TASK = 'Investigate the recorded release failure.'

function registry(): MutationRegistry {
  return caseId => EVAL_CASES.find(item => item.id === caseId)?.mutation
}

async function findFinding(worktree: string): Promise<Finding | null> {
  const root = path.join(worktree, '.qa-artifacts', 'investigations')
  let entries: string[]
  try {
    entries = await readdir(root)
  } catch {
    // No investigations directory: the case never triggered one.
    return null
  }
  for (const entry of entries.sort()) {
    try {
      return JSON.parse(await readFile(path.join(root, entry, 'finding.json'), 'utf8')) as Finding
    } catch {
      // A directory without a finding belongs to an investigation that never submitted.
      continue
    }
  }
  return null
}

/**
 * Run the ResumeMatch scenario for one case inside its evaluation copy.
 * @returns the recorded case result, or null when the launcher failed.
 */
async function runScenario(worktree: string, caseId: string, label: string, options: EvalRunnerOptions): Promise<Record<string, unknown> | null> {
  const resultPath = path.join(worktree, '.qa-eval-result.json')
  const outcome = spawnSync(options.productNodePath, ['qa/browser/qaCommand.mjs', 'test', 'tests/e2e/evalCase.e2e.ts'], {
    cwd: worktree,
    env: {
      PATH: process.env.PATH ?? '/usr/bin:/bin',
      HOME: process.env.HOME ?? worktree,
      QA_EVAL_CASE: caseId,
      QA_EVAL_RESULT: resultPath,
      QA_EVAL_WORKTREE_LABEL: label,
    },
    encoding: 'utf8',
  })
  if (outcome.status !== 0) return null
  return JSON.parse(await readFile(resultPath, 'utf8')) as Record<string, unknown>
}

/**
 * Run one investigation over an evaluation copy through the real agent loop.
 *
 * The harness runs under its own Node, named explicitly so the result does not
 * depend on which Node happens to be first on PATH.
 * @returns the number of model requests the provider recorded.
 */
async function runInvestigation(worktree: string, runId: string, requestLog: string, options: EvalRunnerOptions): Promise<{ errors: string[] }> {
  const scratch = await mkdtemp(path.join(os.tmpdir(), 'resumematch-eval-harness-'))
  const errors: string[] = []
  try {
    const outcome = spawnSync(options.harnessNodePath, [
      '--import', path.join(options.harnessPath, 'node_modules', 'tsx', 'dist', 'loader.mjs'),
      path.join(options.adapterPath, 'tests', 'fixtures', 'investigation-driver.ts'),
      path.join(options.adapterPath, 'cordis.yml'),
      TASK,
    ], {
      cwd: scratch,
      env: {
        PATH: process.env.PATH ?? '/usr/bin:/bin',
        HOME: process.env.HOME ?? scratch,
        TSX_TSCONFIG_PATH: path.join(options.harnessPath, 'tsconfig.json'),
        DSH_HOME: path.join(scratch, '.dsh'),
        DSH_AGENTS_HOME: path.join(scratch, '.agents'),
        RESUMEMATCH_QA_REPOSITORY: worktree,
        RESUMEMATCH_QA_RUN_ID: runId,
        RESUMEMATCH_QA_SCRIPT: 'gold',
        RESUMEMATCH_QA_REQUEST_LOG: requestLog,
      },
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    })
    if (outcome.status !== 0) errors.push(`investigation exited ${String(outcome.status)}: ${outcome.stderr?.slice(0, 500) ?? ''}`)
    return { errors }
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
}

/**
 * Run one evaluation case end to end.
 *
 * Creates a temporary copy, seeds the case, runs the release check, investigates
 * it only when triage says to, and removes the copy. The main worktree is never
 * written to.
 * @param caseId - a public corpus case id.
 * @param options - machine-specific paths.
 * @returns the case result.
 */
export async function runEvalCase(caseId: string, options: EvalRunnerOptions): Promise<EvalCaseResult> {
  const evalCase = EVAL_CASES.find(item => item.id === caseId)
  if (evalCase === undefined) throw new Error(`Unknown public evaluation case: ${caseId}`)
  const errors: string[] = []
  const result: EvalCaseResult = {
    caseId, kind: evalCase.kind, scenarioId: evalCase.scenarioId, runId: null, oracleStatus: null,
    expectationMet: null, failedOracle: null, artifactValidation: null, releaseGrade: null, triage: null,
    expectedTriage: evalCase.expectedTriage, triageMatched: false, harnessLaunched: false, modelRequests: 0,
    classification: null, expectedClassification: evalCase.expectedClassification, classificationMatched: false,
    firstProbe: null, goldFirstProbe: evalCase.goldFirstProbe ?? null, goldProbeHit: null,
    worktreeRemoved: false, errors,
  }

  // Created for every case, investigated or not, so a zero is a reading of the
  // provider's own counter rather than the absence of an observation.
  const requestLog = path.join(options.outputDirectory, `${caseId}.model-requests.log`)
  await writeFile(requestLog, '', 'utf8')

  const worktree = await createEvaluationWorktree(options.repositoryPath, options.commit, caseId)
  try {
    await symlink(path.join(options.repositoryPath, 'node_modules'), path.join(worktree.directory, 'node_modules'))
    if (evalCase.mutation !== undefined) await applyMutationById(worktree.directory, caseId, registry())

    const scenario = await runScenario(worktree.directory, caseId, worktree.label, options)
    if (scenario === null) {
      errors.push('the QA launcher did not complete the scenario')
      return result
    }
    result.runId = String(scenario.runId)
    result.oracleStatus = String(scenario.oracleStatus)
    result.expectationMet = Boolean(scenario.expectationMet)
    result.failedOracle = scenario.failedOracle === null ? null : String(scenario.failedOracle)
    result.artifactValidation = String(scenario.artifactValidation)
    result.releaseGrade = scenario.releaseGrade === null ? null : Boolean(scenario.releaseGrade)
    result.triage = String(scenario.triage)
    result.triageMatched = result.triage === evalCase.expectedTriage

    if (result.triage === 'investigate') {
      result.harnessLaunched = true
      errors.push(...(await runInvestigation(worktree.directory, result.runId, requestLog, options)).errors)
      const finding = await findFinding(worktree.directory)
      if (finding === null) errors.push('no finding was submitted')
      else {
        result.classification = finding.classification
        result.firstProbe = firstProbe(finding)
        result.goldProbeHit = result.goldFirstProbe === null ? null : result.firstProbe === result.goldFirstProbe
      }
    }
    result.classificationMatched = result.classification === evalCase.expectedClassification
    return result
  } finally {
    result.modelRequests = (await readFile(requestLog, 'utf8')).split('\n').filter(line => line.trim().length > 0).length
    try {
      await removeEvaluationWorktree(options.repositoryPath, worktree)
      result.worktreeRemoved = true
    } catch (error) {
      errors.push(`worktree cleanup failed: ${error instanceof Error ? error.message : String(error)}`)
    }
    execFileSync('git', ['worktree', 'prune'], { cwd: options.repositoryPath, env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' } })
  }
}

/** Render the per-case results as a fixed-width summary table. */
export function summaryTable(results: readonly EvalCaseResult[]): string {
  const header = ['case', 'kind', 'triage', 'ok', 'requests', 'classification', 'ok', 'first probe', 'gold', 'clean']
  const rows = results.map(item => [
    item.caseId, item.kind, item.triage ?? '-', item.triageMatched ? 'y' : 'n', String(item.modelRequests),
    item.classification ?? '-', item.classification === null && item.expectedClassification === null ? 'y' : item.classificationMatched ? 'y' : 'n',
    item.firstProbe ?? '-', item.goldProbeHit === null ? '-' : item.goldProbeHit ? 'y' : 'n',
    item.worktreeRemoved ? 'y' : 'n',
  ])
  const widths = header.map((_, column) => Math.max(header[column].length, ...rows.map(row => row[column].length)))
  const line = (cells: string[]) => cells.map((cell, column) => cell.padEnd(widths[column])).join('  ')
  return [line(header), line(widths.map(width => '-'.repeat(width))), ...rows.map(line)].join('\n')
}
