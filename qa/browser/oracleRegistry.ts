import { errors } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

import { OracleFailure } from './oracles'
import type { ScenarioInstance } from './scenarios'
import type { NetworkSummary, ScenarioId } from './types'
import { SYNTHETIC_BACKEND_ERROR, SYNTHETIC_EXISTING_FILE_NAME, SYNTHETIC_FILE_NAME } from '../fixtures/data'

/**
 * Confirmation window for a registry sweep.
 *
 * Shorter than the 8s Phase 1 spends while driving a scenario, because a sweep
 * runs after the caller has already waited for the state it wanted: this budget
 * confirms what is on the page, it does not wait for it to arrive.
 */
const SWEEP_TIMEOUT_MS = 3_000

/** What a registry oracle may read besides the page. */
export interface OracleContext {
  scenario: ScenarioInstance
  networkSummary(): NetworkSummary
  /** Poll count observed when the timeout state first appeared; P1-05 only. */
  analysisCountAtTimeout: number | null
}

/**
 * One deterministic observation, addressable by id.
 *
 * The registry exists so a reproduction can evaluate the whole scenario and
 * collect every failure. Phase 1 keeps driving scenarios through `oracles.ts`,
 * which stops at the first failure; nothing here changes that.
 */
export interface OracleDefinition {
  id: string
  scenarioId: ScenarioId
  /**
   * Where Phase 1 raises this id.
   *
   * `driver` observations belong to a transient step — the upload form before
   * submission, the processing state before it resolves — so a sweep run at the
   * end of a reproduction would fail them for having moved on. Only the
   * `verify` set describes the terminal state, which is why a sweep evaluates
   * that set plus whichever id the original run failed.
   */
  stage: 'driver' | 'verify'
  /**
   * Transition that must appear in the scenario log before this observation
   * means anything. A reproduction that never reached it is missing a
   * precondition, not observing a defect.
   */
  preconditionTransition: string | null
  evaluate(page: Page, context: OracleContext): Promise<void>
}

async function visible(locator: Locator, id: string): Promise<void> {
  try {
    await locator.waitFor({ state: 'visible', timeout: SWEEP_TIMEOUT_MS })
  } catch (error) {
    if (error instanceof errors.TimeoutError) throw new OracleFailure(id, `Expected visible element was not found: ${id}`)
    throw error
  }
}

function condition(value: boolean, id: string, message: string): void {
  if (!value) throw new OracleFailure(id, message)
}

/** Reaching the upload form is the precondition for every new-upload observation. */
const UPLOAD_ACCEPTED = 'upload-contract:accepted-new-resume'
const REUSE_ACCEPTED = 'upload-contract:accepted-existing-resume'

function completedReportOracles(scenarioId: ScenarioId, expectedAnalysisId: string, expectS3: boolean, precondition: string): OracleDefinition[] {
  const at = (id: string, evaluate: OracleDefinition['evaluate']): OracleDefinition =>
    ({ id, scenarioId, stage: 'verify', preconditionTransition: precondition, evaluate })
  return [
    at('COMPLETED_JOB_TITLE', page => visible(page.getByRole('heading', { name: 'QA Synthetic Software Engineer' }), 'COMPLETED_JOB_TITLE')),
    at('COMPLETED_RESULTS_ROUTE', async page => {
      condition(new URL(page.url()).pathname === `/results/${expectedAnalysisId}`, 'COMPLETED_RESULTS_ROUTE', 'Unexpected results route')
    }),
    at('COMPLETED_MATCH_SCORE', page => visible(page.locator('.progress-ring__value').getByText('84', { exact: true }), 'COMPLETED_MATCH_SCORE')),
    at('COMPLETED_SCORE_BREAKDOWN', page => visible(page.getByRole('heading', { name: 'Score Breakdown' }), 'COMPLETED_SCORE_BREAKDOWN')),
    at('COMPLETED_KEYWORD_COUNTS', page => visible(page.getByText('Matched 3 of 5 required keywords', { exact: true }), 'COMPLETED_KEYWORD_COUNTS')),
    at('COMPLETED_MATCHED_KEYWORDS', page => visible(page.getByRole('heading', { name: /Matched Keywords\s*3/ }), 'COMPLETED_MATCHED_KEYWORDS')),
    at('COMPLETED_MATCHED_KEYWORD_VALUE', page => visible(page.getByText('Playwright', { exact: true }), 'COMPLETED_MATCHED_KEYWORD_VALUE')),
    at('COMPLETED_MISSING_KEYWORDS', page => visible(page.getByRole('heading', { name: /Missing Keywords\s*2/ }), 'COMPLETED_MISSING_KEYWORDS')),
    at('COMPLETED_MISSING_KEYWORD_VALUE', page => visible(page.getByText('Fault isolation', { exact: true }).first(), 'COMPLETED_MISSING_KEYWORD_VALUE')),
    at('COMPLETED_NO_FAILURE', async page => {
      condition(await page.getByRole('heading', { name: 'Analysis could not be completed' }).count() === 0, 'COMPLETED_NO_FAILURE', 'Failure report rendered')
    }),
    at('COMPLETED_NO_TIMEOUT', async page => {
      condition(await page.getByRole('heading', { name: 'This is taking longer than it should' }).count() === 0, 'COMPLETED_NO_TIMEOUT', 'Timeout report rendered')
    }),
    at('CONTRACT_UPLOAD_COUNT', async (_page, ctx) => {
      condition(ctx.scenario.counters.upload === 1, 'CONTRACT_UPLOAD_COUNT', 'Expected exactly one upload request')
    }),
    at('CONTRACT_LAST_RESUME_COUNT', async (_page, ctx) => {
      condition(ctx.scenario.counters.lastResume === 1, 'CONTRACT_LAST_RESUME_COUNT', 'Expected exactly one last-resume request')
    }),
    at('CONTRACT_S3_COUNT', async (_page, ctx) => {
      condition(ctx.scenario.counters.s3 === (expectS3 ? 1 : 0), 'CONTRACT_S3_COUNT', 'Unexpected S3 request count')
    }),
    at('CONTRACT_ANALYSIS_COUNT', async (_page, ctx) => {
      condition(ctx.scenario.counters.analysis === 3, 'CONTRACT_ANALYSIS_COUNT', 'Expected three ordered analysis responses')
    }),
    at('CONTRACT_NO_VIOLATIONS', async (_page, ctx) => {
      condition(ctx.scenario.contractViolations.length === 0, 'CONTRACT_NO_VIOLATIONS', 'Scenario contract was violated')
    }),
  ]
}

const SAMPLE_OPENED = 'reproduction-open:/sample'

const P1_01: OracleDefinition[] = [
  { id: 'P1-01_SAMPLE_REPORT_REGION', scenarioId: 'P1-01', stage: 'verify', preconditionTransition: SAMPLE_OPENED, evaluate: page => visible(page.getByRole('region', { name: 'Sample report' }), 'P1-01_SAMPLE_REPORT_REGION') },
  { id: 'P1-01_SCORE_BREAKDOWN', scenarioId: 'P1-01', stage: 'verify', preconditionTransition: SAMPLE_OPENED, evaluate: page => visible(page.getByRole('heading', { name: 'Score Breakdown' }), 'P1-01_SCORE_BREAKDOWN') },
  { id: 'P1-01_MATCHED_KEYWORDS', scenarioId: 'P1-01', stage: 'verify', preconditionTransition: SAMPLE_OPENED, evaluate: page => visible(page.getByRole('heading', { name: /Matched Keywords/ }), 'P1-01_MATCHED_KEYWORDS') },
  { id: 'P1-01_MISSING_KEYWORDS', scenarioId: 'P1-01', stage: 'verify', preconditionTransition: SAMPLE_OPENED, evaluate: page => visible(page.getByRole('heading', { name: /Missing Keywords/ }), 'P1-01_MISSING_KEYWORDS') },
  {
    id: 'P1-01_SIGNUP_PROMPT', scenarioId: 'P1-01', stage: 'verify', preconditionTransition: SAMPLE_OPENED,
    // Opens the dialog it asserts, exactly as the Phase 1 oracle does.
    evaluate: async page => {
      await page.getByRole('button', { name: 'New analysis' }).first().click({ timeout: SWEEP_TIMEOUT_MS })
      await visible(page.getByRole('dialog', { name: 'Run Your Own Analysis' }), 'P1-01_SIGNUP_PROMPT')
    },
  },
  { id: 'P1-01_NO_REST', scenarioId: 'P1-01', stage: 'verify', preconditionTransition: SAMPLE_OPENED, evaluate: async (_page, ctx) => condition(ctx.networkSummary().resumeMatchRest === 0, 'P1-01_NO_REST', 'Sample page made a ResumeMatch REST request') },
  { id: 'P1-01_NO_COGNITO', scenarioId: 'P1-01', stage: 'verify', preconditionTransition: SAMPLE_OPENED, evaluate: async (_page, ctx) => condition(ctx.networkSummary().cognito === 0, 'P1-01_NO_COGNITO', 'Sample page made a Cognito request') },
  { id: 'P1-01_NO_S3', scenarioId: 'P1-01', stage: 'verify', preconditionTransition: SAMPLE_OPENED, evaluate: async (_page, ctx) => condition(ctx.networkSummary().s3 === 0, 'P1-01_NO_S3', 'Sample page made an S3 request') },
  { id: 'P1-01_NO_DEEPGRAM', scenarioId: 'P1-01', stage: 'verify', preconditionTransition: SAMPLE_OPENED, evaluate: async (_page, ctx) => condition(ctx.networkSummary().deepgram === 0, 'P1-01_NO_DEEPGRAM', 'Sample page made a Deepgram request') },
  { id: 'P1-01_NO_OUTREACH', scenarioId: 'P1-01', stage: 'verify', preconditionTransition: SAMPLE_OPENED, evaluate: async (_page, ctx) => condition(ctx.networkSummary().outreach === 0, 'P1-01_NO_OUTREACH', 'Sample page made an outreach request') },
  { id: 'P1-01_NO_UNEXPECTED_EGRESS', scenarioId: 'P1-01', stage: 'verify', preconditionTransition: SAMPLE_OPENED, evaluate: async (_page, ctx) => condition(ctx.networkSummary().unexpectedEgress === 0, 'P1-01_NO_UNEXPECTED_EGRESS', 'Sample page attempted unexpected egress') },
]

const P1_02: OracleDefinition[] = [
  { id: 'P1-02_UPLOAD_PAGE', scenarioId: 'P1-02', stage: 'driver', preconditionTransition: 'reproduction-open:/upload', evaluate: page => visible(page.getByRole('heading', { name: 'New Analysis' }), 'P1-02_UPLOAD_PAGE') },
  { id: 'P1-02_SELECTED_FILE', scenarioId: 'P1-02', stage: 'driver', preconditionTransition: 'reproduction-open:/upload', evaluate: page => visible(page.getByText(SYNTHETIC_FILE_NAME, { exact: true }), 'P1-02_SELECTED_FILE') },
  {
    id: 'P1-02_RESULTS_NAVIGATION', scenarioId: 'P1-02', stage: 'driver', preconditionTransition: UPLOAD_ACCEPTED,
    evaluate: async page => condition(new URL(page.url()).pathname === '/results/qa-new-1', 'P1-02_RESULTS_NAVIGATION', 'Application did not reach the expected route: P1-02_RESULTS_NAVIGATION'),
  },
  { id: 'P1-02_PROCESSING_STATE', scenarioId: 'P1-02', stage: 'driver', preconditionTransition: UPLOAD_ACCEPTED, evaluate: page => visible(page.getByRole('status'), 'P1-02_PROCESSING_STATE') },
  { id: 'P1-02_COMPLETED_REPORT', scenarioId: 'P1-02', stage: 'driver', preconditionTransition: UPLOAD_ACCEPTED, evaluate: page => visible(page.getByRole('heading', { name: 'QA Synthetic Software Engineer' }), 'P1-02_COMPLETED_REPORT') },
  ...completedReportOracles('P1-02', 'qa-new-1', true, UPLOAD_ACCEPTED),
]

const P1_03: OracleDefinition[] = [
  { id: 'P1-03_EXISTING_FILE', scenarioId: 'P1-03', stage: 'driver', preconditionTransition: 'reproduction-open:/upload', evaluate: page => visible(page.getByText(SYNTHETIC_EXISTING_FILE_NAME, { exact: true }), 'P1-03_EXISTING_FILE') },
  {
    id: 'P1-03_RESULTS_NAVIGATION', scenarioId: 'P1-03', stage: 'driver', preconditionTransition: REUSE_ACCEPTED,
    evaluate: async page => condition(new URL(page.url()).pathname === '/results/qa-reuse-1', 'P1-03_RESULTS_NAVIGATION', 'Application did not reach the expected route: P1-03_RESULTS_NAVIGATION'),
  },
  { id: 'P1-03_PROCESSING_STATE', scenarioId: 'P1-03', stage: 'driver', preconditionTransition: REUSE_ACCEPTED, evaluate: page => visible(page.getByRole('status'), 'P1-03_PROCESSING_STATE') },
  { id: 'P1-03_COMPLETED_REPORT', scenarioId: 'P1-03', stage: 'driver', preconditionTransition: REUSE_ACCEPTED, evaluate: page => visible(page.getByRole('heading', { name: 'QA Synthetic Software Engineer' }), 'P1-03_COMPLETED_REPORT') },
  ...completedReportOracles('P1-03', 'qa-reuse-1', false, REUSE_ACCEPTED),
]

const FAILED_OPENED = 'reproduction-open:/results/qa-failed-1'

const P1_04: OracleDefinition[] = [
  { id: 'P1-04_PROCESSING_STATE', scenarioId: 'P1-04', stage: 'driver', preconditionTransition: FAILED_OPENED, evaluate: page => visible(page.getByRole('status'), 'P1-04_PROCESSING_STATE') },
  { id: 'P1-04_FAILED_STATE', scenarioId: 'P1-04', stage: 'driver', preconditionTransition: FAILED_OPENED, evaluate: page => visible(page.getByRole('heading', { name: 'Analysis could not be completed' }), 'P1-04_FAILED_STATE') },
  { id: 'P1-04_ALERT', scenarioId: 'P1-04', stage: 'verify', preconditionTransition: FAILED_OPENED, evaluate: page => visible(page.getByRole('alert'), 'P1-04_ALERT') },
  { id: 'P1-04_FAILURE_TITLE', scenarioId: 'P1-04', stage: 'verify', preconditionTransition: FAILED_OPENED, evaluate: page => visible(page.getByRole('heading', { name: 'Analysis could not be completed' }), 'P1-04_FAILURE_TITLE') },
  { id: 'P1-04_BACKEND_ERROR', scenarioId: 'P1-04', stage: 'verify', preconditionTransition: FAILED_OPENED, evaluate: page => visible(page.getByText(SYNTHETIC_BACKEND_ERROR, { exact: true }), 'P1-04_BACKEND_ERROR') },
  { id: 'P1-04_UPLOAD_AGAIN', scenarioId: 'P1-04', stage: 'verify', preconditionTransition: FAILED_OPENED, evaluate: page => visible(page.getByRole('link', { name: 'Upload again' }), 'P1-04_UPLOAD_AGAIN') },
  { id: 'P1-04_GO_TO_HISTORY', scenarioId: 'P1-04', stage: 'verify', preconditionTransition: FAILED_OPENED, evaluate: page => visible(page.getByRole('link', { name: 'Go to History' }), 'P1-04_GO_TO_HISTORY') },
  { id: 'P1-04_NO_MATCH_SCORE', scenarioId: 'P1-04', stage: 'verify', preconditionTransition: FAILED_OPENED, evaluate: async page => condition(await page.locator('.progress-ring').count() === 0, 'P1-04_NO_MATCH_SCORE', 'A match score rendered for a failed analysis') },
  { id: 'P1-04_ANALYSIS_COUNT', scenarioId: 'P1-04', stage: 'verify', preconditionTransition: FAILED_OPENED, evaluate: async (_page, ctx) => condition(ctx.scenario.counters.analysis === 2, 'P1-04_ANALYSIS_COUNT', 'Expected processing then failed responses') },
  { id: 'P1-04_CONTRACT', scenarioId: 'P1-04', stage: 'verify', preconditionTransition: FAILED_OPENED, evaluate: async (_page, ctx) => condition(ctx.scenario.contractViolations.length === 0, 'P1-04_CONTRACT', 'Scenario contract was violated') },
]

const TIMEOUT_OPENED = 'reproduction-open:/results/qa-timeout-1'

const P1_05: OracleDefinition[] = [
  { id: 'P1-05_PROCESSING_STATE', scenarioId: 'P1-05', stage: 'driver', preconditionTransition: TIMEOUT_OPENED, evaluate: page => visible(page.getByRole('heading', { name: 'Resume analysis in progress' }), 'P1-05_PROCESSING_STATE') },
  { id: 'P1-05_TIMEOUT_STATE', scenarioId: 'P1-05', stage: 'driver', preconditionTransition: TIMEOUT_OPENED, evaluate: page => visible(page.getByRole('heading', { name: 'This is taking longer than it should' }), 'P1-05_TIMEOUT_STATE') },
  { id: 'P1-05_TIMEOUT_TITLE', scenarioId: 'P1-05', stage: 'verify', preconditionTransition: TIMEOUT_OPENED, evaluate: page => visible(page.getByRole('heading', { name: 'This is taking longer than it should' }), 'P1-05_TIMEOUT_TITLE') },
  { id: 'P1-05_TWO_MINUTE_MESSAGE', scenarioId: 'P1-05', stage: 'verify', preconditionTransition: TIMEOUT_OPENED, evaluate: page => visible(page.getByText(/We checked for two minutes and it hasn't finished/), 'P1-05_TWO_MINUTE_MESSAGE') },
  { id: 'P1-05_START_NEW', scenarioId: 'P1-05', stage: 'verify', preconditionTransition: TIMEOUT_OPENED, evaluate: page => visible(page.getByRole('link', { name: 'Start a new analysis' }), 'P1-05_START_NEW') },
  { id: 'P1-05_CHECK_AGAIN', scenarioId: 'P1-05', stage: 'verify', preconditionTransition: TIMEOUT_OPENED, evaluate: page => visible(page.getByRole('button', { name: 'Check again' }), 'P1-05_CHECK_AGAIN') },
  { id: 'P1-05_NO_COMPLETED_REPORT', scenarioId: 'P1-05', stage: 'verify', preconditionTransition: TIMEOUT_OPENED, evaluate: async page => condition(await page.locator('.results-score-row').count() === 0, 'P1-05_NO_COMPLETED_REPORT', 'Completed report rendered') },
  { id: 'P1-05_NO_FAILED_REPORT', scenarioId: 'P1-05', stage: 'verify', preconditionTransition: TIMEOUT_OPENED, evaluate: async page => condition(await page.getByRole('heading', { name: 'Analysis could not be completed' }).count() === 0, 'P1-05_NO_FAILED_REPORT', 'Backend-failed report rendered') },
  { id: 'P1-05_ANALYSIS_COUNT', scenarioId: 'P1-05', stage: 'verify', preconditionTransition: TIMEOUT_OPENED, evaluate: async (_page, ctx) => condition((ctx.analysisCountAtTimeout ?? ctx.scenario.counters.analysis) >= 3, 'P1-05_ANALYSIS_COUNT', 'Multiple three-second polling attempts did not occur') },
  {
    id: 'P1-05_POLLING_INTERVAL', scenarioId: 'P1-05', stage: 'verify', preconditionTransition: TIMEOUT_OPENED,
    evaluate: async (_page, ctx) => {
      const count = ctx.analysisCountAtTimeout ?? ctx.scenario.counters.analysis
      condition(count >= 40 && count <= 42, 'P1-05_POLLING_INTERVAL', `Expected about 40 controlled polling requests, received ${count}`)
    },
  },
  { id: 'P1-05_POLLING_STOPPED', scenarioId: 'P1-05', stage: 'verify', preconditionTransition: TIMEOUT_OPENED, evaluate: async (_page, ctx) => condition(ctx.scenario.counters.analysis === (ctx.analysisCountAtTimeout ?? ctx.scenario.counters.analysis), 'P1-05_POLLING_STOPPED', 'Polling continued after timeout') },
  { id: 'P1-05_CONTRACT', scenarioId: 'P1-05', stage: 'verify', preconditionTransition: TIMEOUT_OPENED, evaluate: async (_page, ctx) => condition(ctx.scenario.contractViolations.length === 0, 'P1-05_CONTRACT', 'Scenario contract was violated') },
]

/** Every addressable deterministic observation, P1-01 through P1-05. */
export const ORACLE_REGISTRY: readonly OracleDefinition[] = [...P1_01, ...P1_02, ...P1_03, ...P1_04, ...P1_05]

/** The observations that belong to one scenario, in evaluation order. */
export function oraclesForScenario(scenarioId: ScenarioId): OracleDefinition[] {
  return ORACLE_REGISTRY.filter(oracle => oracle.scenarioId === scenarioId)
}

/** The terminal-state set a reproduction sweeps. */
export function verifyOraclesForScenario(scenarioId: ScenarioId): OracleDefinition[] {
  return ORACLE_REGISTRY.filter(oracle => oracle.scenarioId === scenarioId && oracle.stage === 'verify')
}

/** One observation by id, scoped to its scenario. */
export function oracleById(scenarioId: ScenarioId, id: string): OracleDefinition | undefined {
  return ORACLE_REGISTRY.find(oracle => oracle.scenarioId === scenarioId && oracle.id === id)
}
