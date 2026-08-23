import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import { chromium } from '@playwright/test'
import type { Browser, BrowserContext, Page } from '@playwright/test'

import { createSafeRunDirectory, ensureSafeArtifactDirectory, removeSafeRunDirectory, type SafeRunDirectory } from './artifactPaths'
import { validateEvidenceBundle, type ArtifactValidationResult } from './artifactValidator'
import { StatefulContractRouter } from './contractRouter'
import { EvidenceCollector } from './evidence'
import { generatedBuildResourcePaths, NetworkPolicy, QA_API_ORIGIN, QA_APP_ORIGIN, QA_S3_ORIGIN } from './networkPolicy'
import { OracleFailure, requireCondition, requireUrl, requireVisible, verifyBackendFailedReport, verifyPollingTimeout, verifySamplePage, verifyUsableCompletedReport } from './oracles'
import { createScenario, type ScenarioInstance } from './scenarios'
import type { EvidenceManifest, FaultInjection, RunFailure, RunOptions, RunResult, ScenarioId } from './types'
import { installUploadObservation } from './uploadObservation'
import { SYNTHETIC_EXISTING_FILE_NAME, SYNTHETIC_FILE_NAME, SYNTHETIC_JOB_DESCRIPTION } from '../fixtures/data'

function browserEnvironment(runtimeRoot: string): Record<string, string> {
  return {
    PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin:/sbin`,
    HOME: path.join(runtimeRoot, 'browser-home'), TMPDIR: path.join(runtimeRoot, 'browser-tmp'),
    LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8',
  }
}

function failure(phase: string, kind: RunFailure['kind'], error: unknown): RunFailure {
  const rawMessage = error instanceof Error ? error.message : String(error)
  const message = rawMessage
    .replaceAll(process.cwd(), '[repository]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/([?&](?:x-amz-(?:signature|credential|security-token)|token|code)=)[^&\s]+/gi, '$1[REDACTED]')
  return { phase, kind, message }
}

function hasFault(options: RunOptions, fault: FaultInjection): boolean {
  const configured = options.faultInjection
  return Array.isArray(configured) ? configured.includes(fault) : configured === fault
}

function observedOracleFailure(phase: string, oracleId: string, error: unknown): RunFailure {
  return { ...failure(phase, 'oracle', error), oracleId }
}

function expectedP106Safety(result: { safetyViolations: RunResult['safetyViolations']; failures: RunFailure[] }, locallyFulfilled: number): boolean {
  const codes = result.safetyViolations.map(item => item.code).sort()
  const nonOracleFailures = result.failures.filter(item => item.kind !== 'oracle')
  const oracleFailures = result.failures.filter(item => item.kind === 'oracle')
  return codes.join(',') === 'SAFETY_UNEXPECTED_BROWSER_REQUEST,SAFETY_UNEXPECTED_EGRESS,SAFETY_UNEXPECTED_EGRESS'
    && result.safetyViolations.some(item => item.resourceType === 'fetch' && item.target === 'https://unapproved.qa.invalid/probe?marker')
    && result.safetyViolations.some(item => item.resourceType === 'fetch' && item.target === `${QA_APP_ORIGIN}/api/unexpected?probe`)
    && result.safetyViolations.some(item => item.resourceType === 'websocket' && item.target === 'wss://unapproved.qa.invalid/socket')
    && nonOracleFailures.length === 3
    && nonOracleFailures.every(item => item.kind === 'safety')
    && oracleFailures.length === 1
    && oracleFailures[0].oracleId === 'SAFETY_UNEXPECTED_EGRESS'
    && locallyFulfilled >= 1
}

function expectationMatches(
  scenarioId: ScenarioId,
  executionStatus: RunResult['executionStatus'],
  oracleStatus: RunResult['oracleStatus'],
  failures: RunFailure[],
  policy: NetworkPolicy | null,
): boolean {
  if (executionStatus !== 'completed') return false
  if (scenarioId === 'P1-06') {
    return oracleStatus === 'failed'
      && !!policy
      && expectedP106Safety({ safetyViolations: policy.safetyViolations, failures }, policy.summary().locallyFulfilled)
  }
  return oracleStatus === 'passed' && failures.length === 0
}

async function executeScenario(
  scenarioId: ScenarioId,
  scenario: ScenarioInstance,
  page: Page,
  evidence: EvidenceCollector,
  policy: NetworkPolicy,
  options: RunOptions,
): Promise<void> {
  if (scenarioId === 'P1-01') {
    scenario.recordTransition('sample-navigation-started')
    await page.goto(`${QA_APP_ORIGIN}/sample`, { waitUntil: 'networkidle' })
    if (hasFault(options, 'page_close_during_oracle_wait')) {
      const pendingOutcome = requireVisible(
        page.getByRole('status', { name: 'QA fault-injection target that never appears' }),
        'P1-01_INJECTED_PENDING_WAIT',
      ).then(() => null, error => error)
      await new Promise(resolve => setTimeout(resolve, 25))
      await page.close()
      const error = await pendingOutcome
      if (error === null) throw new Error('Injected missing locator unexpectedly became visible')
      throw error
    }
    scenario.recordTransition('sample-report-loaded')
    await evidence.checkpoint(page, 'sample-report')
    await verifySamplePage(page, () => policy.summary())
    scenario.recordTransition('signup-prompt-opened')
  } else if (scenarioId === 'P1-02') {
    scenario.recordTransition('new-resume-navigation-started')
    await page.goto(`${QA_APP_ORIGIN}/upload`, { waitUntil: 'networkidle' })
    await requireVisible(page.getByRole('heading', { name: 'New Analysis' }), 'P1-02_UPLOAD_PAGE')
    await page.getByRole('textbox', { name: 'Job Description' }).fill(SYNTHETIC_JOB_DESCRIPTION)
    await page.getByLabel('Resume PDF file').setInputFiles(path.join(process.cwd(), 'qa', 'fixtures', SYNTHETIC_FILE_NAME))
    await requireVisible(page.getByText(SYNTHETIC_FILE_NAME, { exact: true }), 'P1-02_SELECTED_FILE')
    await evidence.checkpoint(page, 'upload-ready')
    await page.getByRole('button', { name: /Analyze Resume/ }).click()
    await requireUrl(page, '**/results/qa-new-1', 'P1-02_RESULTS_NAVIGATION')
    await requireVisible(page.getByRole('status'), 'P1-02_PROCESSING_STATE')
    await evidence.checkpoint(page, 'processing')
    await requireVisible(page.getByRole('heading', { name: 'QA Synthetic Software Engineer' }), 'P1-02_COMPLETED_REPORT')
    await evidence.checkpoint(page, 'completed-report')
    await verifyUsableCompletedReport(page, scenario, 'qa-new-1', true)
  } else if (scenarioId === 'P1-03') {
    scenario.recordTransition('reuse-navigation-started')
    await page.goto(`${QA_APP_ORIGIN}/upload`, { waitUntil: 'networkidle' })
    await requireVisible(page.getByText(SYNTHETIC_EXISTING_FILE_NAME, { exact: true }), 'P1-03_EXISTING_FILE')
    await page.getByRole('textbox', { name: 'Job Description' }).fill(SYNTHETIC_JOB_DESCRIPTION)
    await evidence.checkpoint(page, 'existing-resume-ready')
    await page.getByRole('button', { name: /Analyze Resume/ }).click()
    await requireUrl(page, '**/results/qa-reuse-1', 'P1-03_RESULTS_NAVIGATION')
    await requireVisible(page.getByRole('status'), 'P1-03_PROCESSING_STATE')
    await evidence.checkpoint(page, 'reuse-processing')
    await requireVisible(page.getByRole('heading', { name: 'QA Synthetic Software Engineer' }), 'P1-03_COMPLETED_REPORT')
    await evidence.checkpoint(page, 'reuse-completed-report')
    await verifyUsableCompletedReport(page, scenario, 'qa-reuse-1', false)
  } else if (scenarioId === 'P1-04') {
    scenario.recordTransition('failed-results-navigation-started')
    await page.goto(`${QA_APP_ORIGIN}/results/qa-failed-1`)
    await requireVisible(page.getByRole('status'), 'P1-04_PROCESSING_STATE')
    await evidence.checkpoint(page, 'backend-processing')
    await requireVisible(page.getByRole('heading', { name: 'Analysis could not be completed' }), 'P1-04_FAILED_STATE')
    await evidence.checkpoint(page, 'backend-failed')
    await verifyBackendFailedReport(page, scenario)
  } else if (scenarioId === 'P1-05') {
    scenario.recordTransition('timeout-results-navigation-started')
    await page.clock.install({ time: new Date('2026-01-15T12:00:00Z') })
    await page.goto(`${QA_APP_ORIGIN}/results/qa-timeout-1`)
    await requireVisible(page.getByRole('heading', { name: 'Resume analysis in progress' }), 'P1-05_PROCESSING_STATE')
    await evidence.checkpoint(page, 'timeout-processing')
    await page.clock.runFor(120_001)
    await requireVisible(page.getByRole('heading', { name: 'This is taking longer than it should' }), 'P1-05_TIMEOUT_STATE')
    const countAtTimeout = scenario.counters.analysis
    await page.clock.runFor(9_000)
    await evidence.checkpoint(page, 'polling-timeout')
    await verifyPollingTimeout(page, scenario, countAtTimeout)
  } else if (scenarioId === 'P1-06') {
    scenario.recordTransition('network-policy-self-test-started')
    await page.goto(`${QA_APP_ORIGIN}/sample`, { waitUntil: 'networkidle' })
    const outcomes = await page.evaluate(async () => {
      const probe = async (url: string) => { try { await fetch(url); return 'resolved' } catch { return 'blocked' } }
      const externalFetch = await probe('https://unapproved.qa.invalid/probe?marker=qa-synthetic')
      const sameOriginFetch = await probe('/api/unexpected?probe=qa-synthetic')
      const webSocket = await new Promise<string>(resolve => {
        const socket = new WebSocket('wss://unapproved.qa.invalid/socket')
        socket.addEventListener('open', () => resolve('resolved'), { once: true })
        socket.addEventListener('error', () => resolve('blocked'), { once: true })
        socket.addEventListener('close', () => resolve('blocked'), { once: true })
      })
      return { externalFetch, sameOriginFetch, webSocket }
    })
    requireCondition(Object.values(outcomes).every(value => value === 'blocked'), 'P1-06_REQUEST_NOT_BLOCKED', 'A policy probe reached a response')
    scenario.recordTransition('network-policy-self-tests-blocked')
    await evidence.checkpoint(page, 'unexpected-requests-blocked')
  }
}

export async function runReleaseCheck(scenarioId: ScenarioId, options: RunOptions = {}): Promise<RunResult> {
  const startedAt = Date.now()
  const runId = `${scenarioId.toLowerCase()}-${randomUUID()}`
  const expectedOracleStatus = scenarioId === 'P1-06' ? 'failed' : 'passed'
  const approvedRootInput = path.resolve(process.cwd(), '.qa-artifacts')
  const runsRootInput = path.resolve(options.artifactsRoot ?? path.join(approvedRootInput, 'runs'))
  const runtimeRunsRoot = path.join(approvedRootInput, 'runtime', process.env.QA_INVOCATION_ID ?? 'direct')
  let runtimePaths: SafeRunDirectory | null = null
  const failures: RunFailure[] = []
  let scenario: ScenarioInstance | null = null
  let paths: SafeRunDirectory | null = null
  let evidence: EvidenceCollector | null = null
  let browser: Browser | null = null
  let context: BrowserContext | null = null
  let page: Page | null = null
  let policy: NetworkPolicy | null = null
  let browserVersion = 'unavailable'
  let tracingStarted = false
  let failedOracle: string | null = null
  let executionStatus: RunResult['executionStatus'] = 'completed'
  let oracleStatus: RunResult['oracleStatus'] = 'not_run'
  let evidenceManifest: EvidenceManifest | null = null
  let validation: ArtifactValidationResult = { valid: false, violations: [] }
  let validationReport: string | null = null
  let rejectedBundleRemoved = false

  try {
    scenario = createScenario(scenarioId, { transientFaults: options.transientFaults ?? [] })
    paths = await createSafeRunDirectory(approvedRootInput, runsRootInput, runId)
    runtimePaths = await createSafeRunDirectory(approvedRootInput, runtimeRunsRoot, runId)
    const runtimeRoot = runtimePaths.runDirectory
    evidence = new EvidenceCollector(runId, scenarioId, paths.runDirectory)
    await evidence.initialize()
    await mkdir(path.join(runtimeRoot, 'browser-home'), { recursive: true, mode: 0o700 })
    await mkdir(path.join(runtimeRoot, 'browser-tmp'), { recursive: true, mode: 0o700 })
    if (hasFault(options, 'setup')) throw new Error('Injected setup failure')
    browser = await chromium.launch({ headless: options.headless ?? true, env: browserEnvironment(runtimeRoot) })
    browserVersion = browser.version()
    context = await browser.newContext({
      serviceWorkers: 'block', viewport: { width: 1440, height: 1000 },
      recordVideo: { dir: path.join(paths.runDirectory, 'video'), size: { width: 1440, height: 1000 } },
    })
    evidence.attachToContext(context)
    await installUploadObservation(context, scenario, QA_S3_ORIGIN)
    policy = new NetworkPolicy({
      appOrigin: QA_APP_ORIGIN, apiOrigin: QA_API_ORIGIN, s3Origin: QA_S3_ORIGIN, startedAt,
      contractRouter: new StatefulContractRouter(scenario),
      allowedLocalResourcePaths: await generatedBuildResourcePaths(path.join(process.cwd(), '.qa-dist')),
    })
    await policy.install(context)
    await context.tracing.start({ screenshots: true, snapshots: true, sources: false })
    tracingStarted = true
    page = await context.newPage()
    oracleStatus = 'incomplete'
    let scenarioDriverReturned = false
    try {
      if (hasFault(options, 'execution')) throw new Error('Injected scenario driver failure')
      await executeScenario(scenarioId, scenario, page, evidence, policy, options)
      scenarioDriverReturned = true
    } catch (error) {
      if (error instanceof OracleFailure) {
        failedOracle = error.oracleId
        oracleStatus = 'failed'
        failures.push(observedOracleFailure('scenario', error.oracleId, error))
        scenario.recordTransition(`oracle-failed:${error.oracleId}`)
      } else {
        executionStatus = 'infrastructure_failed'
        failures.push(failure('scenario_execution', 'infrastructure', error))
        scenario.recordTransition('scenario-execution-infrastructure-failed')
      }
    }
    for (const violation of scenario.contractViolations) failures.push({ phase: 'contract_router', kind: 'contract', message: violation })
    for (const violation of policy.safetyViolations) failures.push({ phase: 'network_policy', kind: 'safety', message: violation.reason })
    if (scenarioDriverReturned && oracleStatus === 'incomplete') {
      failedOracle = scenario.contractViolations.length
        ? 'CONTRACT_UNEXPECTED_REQUEST'
        : policy.safetyViolations.length
          ? 'SAFETY_UNEXPECTED_EGRESS'
          : null
      oracleStatus = failedOracle ? 'failed' : 'passed'
      if (failedOracle) {
        failures.push(observedOracleFailure('oracle', failedOracle, new OracleFailure(failedOracle, `Deterministic oracle failed: ${failedOracle}`)))
        scenario.recordTransition(`oracle-failed:${failedOracle}`)
      }
    }
    if ((oracleStatus === 'passed' || oracleStatus === 'failed') && hasFault(options, 'post_oracle_infrastructure')) {
      executionStatus = 'infrastructure_failed'
      failures.push(failure('post_oracle_execution', 'infrastructure', new Error('Injected infrastructure failure after oracle completion')))
    }
    if (oracleStatus === 'failed' && page) {
      try { await evidence.captureFailure(page) } catch (error) { failures.push(failure('failure_capture', 'infrastructure', error)); executionStatus = 'infrastructure_failed' }
    }
  } catch (error) {
    executionStatus = 'infrastructure_failed'
    failures.push(failure('setup', 'infrastructure', error))
  } finally {
    if (tracingStarted && context && evidence) {
      try { await context.tracing.stop({ path: evidence.tracePath }) } catch (error) { failures.push(failure('trace_finalization', 'cleanup', error)) }
    }
    if (context) try { await context.close() } catch (error) { failures.push(failure('context_close', 'cleanup', error)) }
    if (browser) try { await browser.close() } catch (error) { failures.push(failure('browser_close', 'cleanup', error)) }
    if (hasFault(options, 'cleanup')) failures.push(failure('cleanup', 'cleanup', new Error('Injected cleanup failure')))
    if (runtimePaths) try { await removeSafeRunDirectory(runtimePaths, runId) } catch (error) { failures.push(failure('runtime_cleanup', 'cleanup', error)) }
  }

  let expectationMet = expectationMatches(scenarioId, executionStatus, oracleStatus, failures, policy)

  if (evidence && paths) {
    try {
      if (hasFault(options, 'persistence')) throw new Error('Injected persistence failure')
      evidenceManifest = await evidence.persist({
        browserVersion, durationMs: Date.now() - startedAt, executionStatus, oracleStatus, expectedOracleStatus,
        expectationMet, failedOracle, failures, networkEvents: policy?.events ?? [],
        networkSummary: policy?.summary() ?? { resumeMatchRest: 0, cognito: 0, s3: 0, deepgram: 0, outreach: 0, unexpectedEgress: 0, locallyFulfilled: 0 },
        transitions: scenario?.transitions ?? [], safetyViolations: policy?.safetyViolations ?? [],
        evaluationIdentity: options.evaluationIdentity ?? null,
      })
      validation = hasFault(options, 'validation')
        ? { valid: false, violations: [{ code: 'INVALID_ARTIFACT_FORMAT', file: 'trace.zip', detail: 'Injected validation failure' }] }
        : await validateEvidenceBundle(paths.runDirectory)
      const validationDirectory = await ensureSafeArtifactDirectory(paths.approvedRoot, path.join(paths.approvedRoot, 'validation-results'))
      const reportPath = path.join(validationDirectory, `${runId}.json`)
      if (hasFault(options, 'validation_report')) throw new Error('Injected validation report persistence failure')
      await writeFile(reportPath, `${JSON.stringify(validation, null, 2)}\n`, { mode: 0o600, flag: 'wx' })
      validationReport = reportPath
      if (!validation.valid) {
        failures.push({ phase: 'artifact_validation', kind: 'artifact', message: `Artifact validation rejected ${validation.violations.length} item(s)`, evidenceRefs: [path.relative(process.cwd(), validationReport)] })
        expectationMet = false; evidenceManifest = null
        await removeSafeRunDirectory(paths, runId)
        rejectedBundleRemoved = true
      }
    } catch (error) {
      failures.push(failure('artifact_persistence', 'artifact', error))
      if (validation.valid) validation = {
        valid: false,
        violations: [{ code: 'UNREADABLE_ARTIFACT', file: 'validation-report.json', detail: 'Artifact validation report could not be persisted' }],
      }
      expectationMet = false; evidenceManifest = null
      try { await removeSafeRunDirectory(paths, runId); rejectedBundleRemoved = true } catch (cleanupError) {
        failures.push(failure('rejected_bundle_cleanup', 'cleanup', cleanupError))
      }
    }
  }

  return {
    runId, scenarioId, executionStatus, oracleStatus, expectedOracleStatus, expectationMet, failures, failedOracle,
    safetyViolations: policy?.safetyViolations ?? [], evidenceManifest,
    artifactValidation: { status: validation.valid ? 'passed' : 'failed', report: validationReport ? path.relative(process.cwd(), validationReport) : null, violationCount: validation.violations.length, rejectedBundleRemoved },
    durationMs: Date.now() - startedAt,
  }
}
