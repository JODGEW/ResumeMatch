import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { EVALUATION_COST_LIMIT_USD, parseProviderLog, providerLogCostUsd, providerLogTotals, sweepHasBudget } from '../cost'
import type { TokenRates } from '../cost'
import { EVAL_CASES } from '../evalCases'
import { HELD_OUT_CASE_IDS } from '../evalCases.heldout'
import { loadHeldOutDefinition, resolveEvalCase } from '../heldoutDefinitions'
import type { EvalCase } from '../evalCases'
import type { Finding } from '../finding'
import { goldEvidenceProbes } from '../goldEvidence'
import { firstProbe, GOLD_PROBE_WINDOW, GOLD_PROBE_WINDOW_EXCLUSIVE, goldEvidenceHit, ORIENTATION_PROBES } from '../goldProbe'
import { goldRootCause } from '../rootCauseGold'
import { gradeRootCause, scoreRootCauses } from '../rootCauseScore'
import type { NotGradedReason, RootCauseGrade } from '../rootCauseScore'
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
  /** The adapter's HEAD, read once the sweep has checked that the checkout is clean. */
  adapterCommit: string
  /** Composition the harness boots; the live overlay replaces the scripted provider. */
  configFile: string
  /** Provider route the agent uses. */
  provider: string
  /** Model id the agent uses. */
  model: string
  /** Where per-case JSON results are written. */
  outputDirectory: string
  /** Cost already spent by earlier cases in this sweep. */
  spentUsd?: number
  /** Sweep ceiling; the case is refused rather than started once it is reached. */
  sweepLimitUsd?: number
  /** Whether held-out definitions may be read; off unless the operator asks. */
  heldOut?: boolean
  /** Peak rates the sweep ceiling is enforced at. */
  rates: TokenRates
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
  /** Cost of every logged request at the peak rates; the sweep ceiling reads this. */
  costUsd: number
  /** Cost the finding recorded, which excludes the closing turn that follows submission. */
  findingCostUsd: number
  wallClockMs: number
  classificationMatched: boolean
  firstProbe: string | null
  goldFirstProbe: string | null
  goldProbeHit: boolean | null
  /** Whether the gold probe appeared among the opening probes. */
  goldProbeWithinFirst3: boolean | null
  /** Whether it appeared in the opening four discriminating probes. */
  goldProbeWithinFirst4Excl: boolean | null
  /** Whether the first discriminating probe was in the case's evidence set; null when not graded. */
  goldEvidenceProbeHit: boolean | null
  /** Whether `rootCause.attribution` matched the case's answer; null when not graded. */
  rootCauseAttributionCorrect: boolean | null
  /** Whether attribution, route, and failure mode all matched; null when not graded. */
  rootCauseTripleCorrect: boolean | null
  /** Whether the finding abstained with `undetermined`; null when not graded. */
  rootCauseUndetermined: boolean | null
  /**
   * Why the case has no grade, or `policy_blocked` for a graded miss whose
   * narrative was discarded after an unauthorized submission. Null otherwise,
   * including for a case that never launched an investigation.
   */
  rootCauseGradeReason: NotGradedReason | 'policy_blocked' | null
  /** Calls the investigation refused, so an over-eager plan is visible in the summary. */
  rejectedCalls: number
  /** The sweep ceiling this case was gated against. */
  sweepLimitUsd: number
  /** The clean adapter commit the sweep ran. */
  adapterCommit: string
  worktreeRemoved: boolean
  /** File name of the captured harness transcript, when one was launched. */
  transcript?: string
  /** What the QA launcher printed, when it failed. */
  launcherFailure?: LauncherFailure
  /** Token totals across every logged request, whichever provider served them. */
  providerTokens?: { requests: number; cacheHitTokens: number; cacheMissTokens: number; completionTokens: number }
  /** Per-request accounting copied from the finding; empty for a case that spent nothing. */
  usage?: {
    cacheHitTokens: number
    cacheMissTokens: number
    completionTokens: number
    requests: Array<{ requestedAt: string; pricingWindow: string; costUsd: number }>
  }
  errors: string[]
}

const TASK = 'Investigate the recorded release failure.'

/**
 * Which scripted sequence the keyless provider replays for a scenario.
 *
 * The script stands in for a model's plan, and a plan is scenario-shaped: the
 * sample page defines one route and no form actions, while the upload scenarios
 * need the whole form, and the timeout scenario opens results and advances its
 * controlled clock. A scenario with no entry falls back to the upload plan.
 */
export const SCRIPT_BY_SCENARIO: Readonly<Record<string, string>> = {
  'P1-01': 'sample',
  'P1-02': 'gold',
  'P1-03': 'gold',
  'P1-05': 'timeout',
}

function registry(evalCase: EvalCase): MutationRegistry {
  return caseId => (caseId === evalCase.id ? evalCase.mutation : EVAL_CASES.find(item => item.id === caseId)?.mutation)
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

/** Characters kept from each launcher stream: the tail, where a failure is reported. */
export const LAUNCHER_OUTPUT_LIMIT = 4_000

/**
 * What a failed QA launcher reported. Without it a failure such as an occupied
 * port leaves only "the QA launcher did not complete the scenario".
 */
export interface LauncherFailure {
  exitCode: number | null
  signal: string | null
  /** Set when the launcher could not be spawned or its output overflowed. */
  spawnError: string | null
  stdout: string
  stderr: string
}

function outputTail(text: string | null | undefined): string {
  const output = text ?? ''
  if (output.length <= LAUNCHER_OUTPUT_LIMIT) return output
  return `[${output.length - LAUNCHER_OUTPUT_LIMIT} earlier characters omitted]\n${output.slice(-LAUNCHER_OUTPUT_LIMIT)}`
}

/**
 * Run the ResumeMatch scenario for one case inside its evaluation copy.
 * @returns the recorded case result, or what the launcher printed when it failed.
 */
export async function runScenario(
  worktree: string,
  caseId: string,
  label: string,
  options: EvalRunnerOptions,
): Promise<{ scenario: Record<string, unknown> } | { failure: LauncherFailure }> {
  const resultPath = path.join(worktree, '.qa-eval-result.json')
  const outcome = spawnSync(options.productNodePath, ['qa/browser/qaCommand.mjs', 'test', 'tests/e2e/evalCase.e2e.ts'], {
    cwd: worktree,
    env: {
      PATH: process.env.PATH ?? '/usr/bin:/bin',
      HOME: process.env.HOME ?? worktree,
      QA_EVAL_CASE: caseId,
      QA_EVAL_RESULT: resultPath,
      QA_EVAL_WORKTREE_LABEL: label,
      ...options.heldOut === true
        ? { QA_EVAL_HELD_OUT: '1', QA_EVAL_HELDOUT_ROOT: options.repositoryPath }
        : {},
    },
    encoding: 'utf8',
  })
  if (outcome.status !== 0) {
    return {
      failure: {
        exitCode: outcome.status, signal: outcome.signal, spawnError: outcome.error?.message ?? null,
        stdout: outputTail(outcome.stdout), stderr: outputTail(outcome.stderr),
      },
    }
  }
  return { scenario: JSON.parse(await readFile(resultPath, 'utf8')) as Record<string, unknown> }
}

/**
 * Run one investigation over an evaluation copy through the real agent loop.
 *
 * The harness runs under its own Node, named explicitly so the result does not
 * depend on which Node happens to be first on PATH.
 * @returns the number of model requests the provider recorded.
 */
async function runInvestigation(
  worktree: string,
  runId: string,
  requestLog: string,
  transcriptPath: string,
  scenarioId: string,
  options: EvalRunnerOptions,
): Promise<{ errors: string[] }> {
  const scratch = await mkdtemp(path.join(os.tmpdir(), 'resumematch-eval-harness-'))
  const errors: string[] = []
  try {
    const outcome = spawnSync(options.harnessNodePath, [
      '--import', path.join(options.harnessPath, 'node_modules', 'tsx', 'dist', 'loader.mjs'),
      path.join(options.adapterPath, 'tests', 'fixtures', 'investigation-driver.ts'),
      options.configFile,
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
        RESUMEMATCH_QA_PROVIDER: options.provider,
        RESUMEMATCH_QA_MODEL: options.model,
        RESUMEMATCH_QA_SCRIPT: SCRIPT_BY_SCENARIO[scenarioId] ?? 'gold',
        RESUMEMATCH_QA_REQUEST_LOG: requestLog,
        // The harness child is the only process that receives the key, and it
        // receives it straight from this process's environment. Nothing writes
        // it to disk, and no other spawn below forwards it.
        ...process.env.DEEPSEEK_API_KEY === undefined ? {} : { DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY },
        ...process.env.ANTHROPIC_API_KEY === undefined ? {} : { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY },
      },
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
    // Kept because a run that submits no finding is only diagnosable from the
    // turn it actually took; the transcript is the evidence for that.
    await writeFile(transcriptPath, `${outcome.stdout ?? ''}\n--- stderr ---\n${outcome.stderr ?? ''}\n`, 'utf8')
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
  const evalCase = await resolveEvalCase(caseId, EVAL_CASES, options.heldOut === true, options.repositoryPath)
  if (evalCase === undefined) throw new Error(`Unknown evaluation case: ${caseId}`)
  // A held-out case's answers live in its gitignored definition; resolving the
  // case above has already refused it without the --held-out opt-in.
  const heldOut = HELD_OUT_CASE_IDS.includes(caseId)
    ? await loadHeldOutDefinition(caseId, options.heldOut === true, options.repositoryPath)
    : undefined
  const startedAt = Date.now()
  const errors: string[] = []
  const result: EvalCaseResult = {
    caseId, kind: evalCase.kind, scenarioId: evalCase.scenarioId, runId: null, oracleStatus: null,
    expectationMet: null, failedOracle: null, artifactValidation: null, releaseGrade: null, triage: null,
    expectedTriage: evalCase.expectedTriage, triageMatched: false, harnessLaunched: false, modelRequests: 0,
    classification: null, expectedClassification: evalCase.expectedClassification, classificationMatched: false,
    costUsd: 0, findingCostUsd: 0, wallClockMs: 0,
    firstProbe: null, goldFirstProbe: evalCase.goldFirstProbe ?? null, goldProbeHit: null,
    goldProbeWithinFirst3: null, goldProbeWithinFirst4Excl: null, goldEvidenceProbeHit: null,
    rootCauseAttributionCorrect: null, rootCauseTripleCorrect: null, rootCauseUndetermined: null, rootCauseGradeReason: null,
    rejectedCalls: 0, sweepLimitUsd: options.sweepLimitUsd ?? EVALUATION_COST_LIMIT_USD, adapterCommit: options.adapterCommit,
    worktreeRemoved: false, errors,
  }

  if (!sweepHasBudget(options.spentUsd ?? 0, result.sweepLimitUsd)) {
    errors.push('sweep cost ceiling reached before this case started')
    return result
  }

  // Created for every case, investigated or not, so a zero is a reading of the
  // provider's own counter rather than the absence of an observation.
  const { requestLog, transcript: transcriptPath } = caseArtifactPaths(options.outputDirectory, caseId)
  await writeFile(requestLog, '', 'utf8')

  const worktree = await createEvaluationWorktree(options.repositoryPath, options.commit, caseId)
  try {
    await symlink(path.join(options.repositoryPath, 'node_modules'), path.join(worktree.directory, 'node_modules'))
    if (evalCase.mutation !== undefined) await applyMutationById(worktree.directory, caseId, registry(evalCase))

    const launched = await runScenario(worktree.directory, caseId, worktree.label, options)
    if ('failure' in launched) {
      errors.push('the QA launcher did not complete the scenario')
      result.launcherFailure = launched.failure
      return result
    }
    const { scenario } = launched
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
      result.transcript = path.basename(transcriptPath)
      errors.push(...(await runInvestigation(worktree.directory, result.runId, requestLog, transcriptPath, evalCase.scenarioId, options)).errors)
      const finding = await findFinding(worktree.directory)
      recordRootCauseGrade(result, gradeRootCause(finding, goldRootCause(caseId, heldOut)))
      if (finding === null) errors.push('no finding was submitted')
      else {
        result.classification = finding.classification
        result.firstProbe = firstProbe(finding)
        result.goldProbeHit = result.goldFirstProbe === null ? null : result.firstProbe === result.goldFirstProbe
        result.goldProbeWithinFirst3 = result.goldFirstProbe === null
          ? null
          : finding.probesSelected.slice(0, GOLD_PROBE_WINDOW).includes(result.goldFirstProbe)
        result.goldProbeWithinFirst4Excl = result.goldFirstProbe === null
          ? null
          : finding.probesSelected
            .filter(item => !ORIENTATION_PROBES.includes(item))
            .slice(0, GOLD_PROBE_WINDOW_EXCLUSIVE)
            .includes(result.goldFirstProbe)
        result.goldEvidenceProbeHit = goldEvidenceHit(finding.probesSelected, goldEvidenceProbes(caseId, heldOut))
        result.rejectedCalls = finding.rejectedCalls.length
        result.findingCostUsd = finding.usage.costUsd
        result.usage = {
          cacheHitTokens: finding.usage.cacheHitTokens,
          cacheMissTokens: finding.usage.cacheMissTokens,
          completionTokens: finding.usage.completionTokens,
          requests: finding.usage.requests.map(item => ({ requestedAt: item.requestedAt, pricingWindow: item.pricingWindow, costUsd: item.costUsd })),
        }
      }
    }
    result.classificationMatched = result.classification === evalCase.expectedClassification
    return result
  } finally {
    result.wallClockMs = Date.now() - startedAt
    // Read from the adapter's log rather than the finding: the finding is written
    // at submission and cannot contain the closing turn that follows it.
    const logged = parseProviderLog(await readFile(requestLog, 'utf8'))
    const totals = providerLogTotals(logged)
    result.modelRequests = totals.requests
    result.providerTokens = totals
    result.costUsd = providerLogCostUsd(logged, options.rates)
    if (result.harnessLaunched) {
      const transcript = await readFile(transcriptPath, 'utf8')
      guardRecordedUsage(result, transcriptUsageEvents(transcript))
      guardCredential(result, transcript)
    }
    try {
      await removeEvaluationWorktree(options.repositoryPath, worktree)
      result.worktreeRemoved = true
    } catch (error) {
      errors.push(`worktree cleanup failed: ${error instanceof Error ? error.message : String(error)}`)
    }
    execFileSync('git', ['worktree', 'prune'], { cwd: options.repositoryPath, env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' } })
  }
}

/**
 * Where a case's provider log and transcript live.
 *
 * Absolute, because the harness child that appends to the log runs in its own
 * scratch directory: a relative `--output` resolved there names a directory
 * that does not exist, the append fails, and the runner reads its own empty file.
 * @param outputDirectory - the sweep's output directory, as given.
 * @param caseId - corpus case id.
 * @returns both paths, resolved against the runner's working directory.
 */
export function caseArtifactPaths(outputDirectory: string, caseId: string): { requestLog: string; transcript: string } {
  const directory = path.resolve(outputDirectory)
  return {
    requestLog: path.join(directory, `${caseId}.model-requests.log`),
    transcript: path.join(directory, `${caseId}.transcript.jsonl`),
  }
}

/** Recorded when the model spent tokens that neither the log nor the finding saw. */
export const USAGE_NOT_RECORDED = 'model usage not recorded; cost ceilings were not enforced'

/**
 * Count the assistant steps that reported usage, which is exactly the set the
 * adapter writes one log line for.
 * @param transcript - the case transcript: JSONL session events, then stderr.
 * @returns the number of `assistant/message` events carrying usage.
 */
export function transcriptUsageEvents(transcript: string): number {
  let count = 0
  for (const line of transcript.split('\n')) {
    let record: { event?: { type?: string; data?: { usage?: unknown } } } | null
    try {
      record = JSON.parse(line)
    } catch {
      continue
    }
    if (record?.event?.type === 'assistant/message' && record.event.data?.usage !== undefined) count += 1
  }
  return count
}

/**
 * Fail a case whose model spent tokens the runner never saw.
 *
 * The per-investigation ledger and the sweep ceiling are both fed from that
 * accounting, so a case that lost it ran with neither enforced, and any case
 * after it would be gated on an understated spend.
 * @param result - the case result, after the provider log was read.
 * @param usageEvents - assistant steps with usage, from the transcript.
 */
export function guardRecordedUsage(result: EvalCaseResult, usageEvents: number): void {
  if (!result.harnessLaunched || usageEvents === 0) return
  const ledgerEmpty = result.usage !== undefined && result.usage.requests.length === 0
  if (result.modelRequests > 0 && !ledgerEmpty) return
  result.errors.push(USAGE_NOT_RECORDED)
  result.classificationMatched = false
}

/** Recorded when the provider had no credential; every later model-calling case would fail the same way. */
export const MISSING_CREDENTIAL = 'the provider has no API key (MISSING_CREDENTIAL)'

/**
 * Record a turn the provider ended for want of a credential.
 *
 * Such a case spends nothing, so the usage guard never fires, and the sweep
 * would otherwise run every remaining case into the same refusal.
 * @param result - the case result.
 * @param transcript - the case transcript: JSONL session events, then stderr.
 */
export function guardCredential(result: EvalCaseResult, transcript: string): void {
  if (!result.harnessLaunched) return
  for (const line of transcript.split('\n')) {
    let record: { event?: { type?: string; data?: { reason?: { error?: { code?: unknown; message?: unknown } } } } } | null
    try {
      record = JSON.parse(line)
    } catch {
      continue
    }
    const error = record?.event?.type === 'turn/end' ? record.event.data?.reason?.error : undefined
    if (error?.code === 'MISSING_CREDENTIAL' || /no API key/i.test(String(error?.message ?? ''))) {
      result.errors.push(MISSING_CREDENTIAL)
      return
    }
  }
}

/** Errors after which no further case may start. */
export const SWEEP_STOPPING_ERRORS: readonly string[] = [USAGE_NOT_RECORDED, MISSING_CREDENTIAL]

/** Whether a case result must end the sweep before another case starts. */
export function stopsSweep(result: EvalCaseResult): boolean {
  return result.errors.some(error => SWEEP_STOPPING_ERRORS.includes(error))
}

/** Total spend across a sweep's completed cases. */
export function sweepCostUsd(results: readonly EvalCaseResult[]): number {
  return results.reduce((total, item) => total + item.costUsd, 0)
}

/**
 * The line printed under the summary table.
 * @param results - one result per case.
 * @param sweepLimitUsd - the ceiling the sweep ran under.
 * @returns the spend against that ceiling, then the evidence-probe and root-cause numbers.
 */
export function sweepTotalLine(results: readonly EvalCaseResult[], sweepLimitUsd: number): string {
  return `total cost $${sweepCostUsd(results).toFixed(4)} of the $${sweepLimitUsd.toFixed(2)} sweep ceiling; `
    + `${evidenceProbeSummary(results)}; ${rootCauseSummary(results)}`
}

/** Render the per-case results as a fixed-width summary table. */
export function summaryTable(results: readonly EvalCaseResult[]): string {
  const yn = (value: boolean | null) => (value === null ? '-' : value ? 'y' : 'n')
  const header = [
    'case', 'kind', 'triage', 'ok', 'requests', 'rejected', 'classification', 'ok', 'first probe', 'gold', 'gold3', 'gold4x',
    'goldEv', 'attr', 'triple', 'undet', 'cost', 'wall', 'clean',
  ]
  const rows = results.map(item => [
    item.caseId, item.kind, item.triage ?? '-', item.triageMatched ? 'y' : 'n', String(item.modelRequests),
    String(item.rejectedCalls),
    item.classification ?? '-', item.classification === null && item.expectedClassification === null ? 'y' : item.classificationMatched ? 'y' : 'n',
    item.firstProbe ?? '-', item.goldProbeHit === null ? '-' : item.goldProbeHit ? 'y' : 'n',
    item.goldProbeWithinFirst3 === null ? '-' : item.goldProbeWithinFirst3 ? 'y' : 'n',
    item.goldProbeWithinFirst4Excl === null ? '-' : item.goldProbeWithinFirst4Excl ? 'y' : 'n',
    yn(item.goldEvidenceProbeHit), yn(item.rootCauseAttributionCorrect), yn(item.rootCauseTripleCorrect), yn(item.rootCauseUndetermined),
    `$${item.costUsd.toFixed(4)}`, `${(item.wallClockMs / 1000).toFixed(0)}s`,
    item.worktreeRemoved ? 'y' : 'n',
  ])
  const widths = header.map((_, column) => Math.max(header[column].length, ...rows.map(row => row[column].length)))
  const line = (cells: string[]) => cells.map((cell, column) => cell.padEnd(widths[column])).join('  ')
  return [line(header), line(widths.map(width => '-'.repeat(width))), ...rows.map(line)].join('\n')
}

/**
 * The run's evidence-probe count for the total line, over the graded cases.
 * @param results - one result per case.
 * @returns e.g. `evidence probe 4/5`.
 */
export function evidenceProbeSummary(results: readonly EvalCaseResult[]): string {
  const graded = results.filter(item => item.goldEvidenceProbeHit !== null)
  if (graded.length === 0) return 'evidence probe - (0 graded)'
  return `evidence probe ${graded.filter(item => item.goldEvidenceProbeHit === true).length}/${graded.length}`
}

/**
 * Copy one finding's root-cause grade onto its case result.
 * @param result - the case result to update.
 * @param grade - the grade from {@link gradeRootCause}.
 */
export function recordRootCauseGrade(result: EvalCaseResult, grade: RootCauseGrade): void {
  if (!grade.graded) {
    result.rootCauseGradeReason = grade.reason
    return
  }
  result.rootCauseAttributionCorrect = grade.attributionCorrect
  result.rootCauseTripleCorrect = grade.tripleCorrect
  result.rootCauseUndetermined = grade.undetermined
  result.rootCauseGradeReason = grade.policyBlocked ? 'policy_blocked' : null
}

/**
 * The run's root-cause numbers for the total line, each over the graded cases.
 *
 * Attribution accuracy is the primary model-separating number; the policy-blocked
 * count separates a blocked submission from a wrong diagnosis.
 * @param results - one result per case.
 * @returns e.g. `root cause attribution 5/6, triple 4/6, undetermined 0/6, policy-blocked 0/6`.
 */
export function rootCauseSummary(results: readonly EvalCaseResult[]): string {
  const score = scoreRootCauses(results.map((item): RootCauseGrade => item.rootCauseAttributionCorrect === null
    ? { graded: false, reason: 'no_gold' }
    : {
        graded: true,
        attributionCorrect: item.rootCauseAttributionCorrect,
        tripleCorrect: item.rootCauseTripleCorrect === true,
        undetermined: item.rootCauseUndetermined === true,
        policyBlocked: item.rootCauseGradeReason === 'policy_blocked',
      }))
  if (score.graded === 0) return 'root cause attribution -, triple -, undetermined -, policy-blocked - (0 graded)'
  const of = (count: number) => `${count}/${score.graded}`
  return `root cause attribution ${of(score.attributionCorrect)}, triple ${of(score.tripleCorrect)}, `
    + `undetermined ${of(score.undetermined)}, policy-blocked ${of(score.policyBlocked)}`
}
