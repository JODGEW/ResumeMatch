import { errors } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

import type { NetworkSummary } from './types'
import type { ScenarioInstance } from './scenarios'
import { SYNTHETIC_BACKEND_ERROR } from '../fixtures/data'

export class OracleFailure extends Error {
  constructor(readonly oracleId: string, message: string) {
    super(message)
    this.name = 'OracleFailure'
  }
}

export async function requireVisible(locator: Locator, oracleId: string): Promise<void> {
  try {
    await locator.waitFor({ state: 'visible', timeout: 8_000 })
  } catch (error) {
    if (error instanceof errors.TimeoutError) {
      throw new OracleFailure(oracleId, `Expected visible element was not found: ${oracleId}`)
    }
    throw error
  }
}

export function requireCondition(condition: boolean, oracleId: string, message: string): void {
  if (!condition) throw new OracleFailure(oracleId, message)
}

export async function verifySamplePage(page: Page, getSummary: () => NetworkSummary): Promise<void> {
  const reportRegion = page.getByRole('region', { name: 'Sample report' })
  await requireVisible(reportRegion, 'P1-01_SAMPLE_REPORT_REGION')
  await requireVisible(page.getByRole('heading', { name: 'Score Breakdown' }), 'P1-01_SCORE_BREAKDOWN')
  await requireVisible(page.getByRole('heading', { name: /Matched Keywords/ }), 'P1-01_MATCHED_KEYWORDS')
  await requireVisible(page.getByRole('heading', { name: /Missing Keywords/ }), 'P1-01_MISSING_KEYWORDS')

  await page.getByRole('button', { name: 'New analysis' }).first().click()
  await requireVisible(page.getByRole('dialog', { name: 'Run Your Own Analysis' }), 'P1-01_SIGNUP_PROMPT')

  const summary = getSummary()
  requireCondition(summary.resumeMatchRest === 0, 'P1-01_NO_REST', 'Sample page made a ResumeMatch REST request')
  requireCondition(summary.cognito === 0, 'P1-01_NO_COGNITO', 'Sample page made a Cognito request')
  requireCondition(summary.s3 === 0, 'P1-01_NO_S3', 'Sample page made an S3 request')
  requireCondition(summary.deepgram === 0, 'P1-01_NO_DEEPGRAM', 'Sample page made a Deepgram request')
  requireCondition(summary.outreach === 0, 'P1-01_NO_OUTREACH', 'Sample page made an outreach request')
  requireCondition(summary.unexpectedEgress === 0, 'P1-01_NO_UNEXPECTED_EGRESS', 'Sample page attempted unexpected egress')
}

export async function verifyUsableCompletedReport(
  page: Page,
  scenario: ScenarioInstance,
  expectedAnalysisId: string,
  expectS3: boolean,
): Promise<void> {
  await requireVisible(page.getByRole('heading', { name: 'QA Synthetic Software Engineer' }), 'COMPLETED_JOB_TITLE')
  requireCondition(new URL(page.url()).pathname === `/results/${expectedAnalysisId}`, 'COMPLETED_RESULTS_ROUTE', 'Unexpected results route')
  await requireVisible(page.locator('.progress-ring__value').getByText('84', { exact: true }), 'COMPLETED_MATCH_SCORE')
  await requireVisible(page.getByRole('heading', { name: 'Score Breakdown' }), 'COMPLETED_SCORE_BREAKDOWN')
  await requireVisible(page.getByText('Matched 3 of 5 required keywords', { exact: true }), 'COMPLETED_KEYWORD_COUNTS')
  await requireVisible(page.getByRole('heading', { name: /Matched Keywords\s*3/ }), 'COMPLETED_MATCHED_KEYWORDS')
  await requireVisible(page.getByText('Playwright', { exact: true }), 'COMPLETED_MATCHED_KEYWORD_VALUE')
  await requireVisible(page.getByRole('heading', { name: /Missing Keywords\s*2/ }), 'COMPLETED_MISSING_KEYWORDS')
  await requireVisible(page.getByText('Fault isolation', { exact: true }).first(), 'COMPLETED_MISSING_KEYWORD_VALUE')
  requireCondition(await page.getByRole('heading', { name: 'Analysis could not be completed' }).count() === 0, 'COMPLETED_NO_FAILURE', 'Failure report rendered')
  requireCondition(await page.getByRole('heading', { name: 'This is taking longer than it should' }).count() === 0, 'COMPLETED_NO_TIMEOUT', 'Timeout report rendered')
  requireCondition(scenario.counters.upload === 1, 'CONTRACT_UPLOAD_COUNT', 'Expected exactly one upload request')
  requireCondition(scenario.counters.lastResume === 1, 'CONTRACT_LAST_RESUME_COUNT', 'Expected exactly one last-resume request')
  requireCondition(scenario.counters.s3 === (expectS3 ? 1 : 0), 'CONTRACT_S3_COUNT', 'Unexpected S3 request count')
  requireCondition(scenario.counters.analysis === 3, 'CONTRACT_ANALYSIS_COUNT', 'Expected three ordered analysis responses')
  requireCondition(scenario.contractViolations.length === 0, 'CONTRACT_NO_VIOLATIONS', 'Scenario contract was violated')
}

export async function verifyBackendFailedReport(page: Page, scenario: ScenarioInstance): Promise<void> {
  await requireVisible(page.getByRole('alert'), 'P1-04_ALERT')
  await requireVisible(page.getByRole('heading', { name: 'Analysis could not be completed' }), 'P1-04_FAILURE_TITLE')
  await requireVisible(page.getByText(SYNTHETIC_BACKEND_ERROR, { exact: true }), 'P1-04_BACKEND_ERROR')
  await requireVisible(page.getByRole('link', { name: 'Upload again' }), 'P1-04_UPLOAD_AGAIN')
  await requireVisible(page.getByRole('link', { name: 'Go to History' }), 'P1-04_GO_TO_HISTORY')
  requireCondition(await page.locator('.progress-ring').count() === 0, 'P1-04_NO_MATCH_SCORE', 'A match score rendered for a failed analysis')
  requireCondition(scenario.counters.analysis === 2, 'P1-04_ANALYSIS_COUNT', 'Expected processing then failed responses')
  requireCondition(scenario.contractViolations.length === 0, 'P1-04_CONTRACT', 'Scenario contract was violated')
}

export async function verifyPollingTimeout(page: Page, scenario: ScenarioInstance, countAtTimeout: number): Promise<void> {
  await requireVisible(page.getByRole('heading', { name: 'This is taking longer than it should' }), 'P1-05_TIMEOUT_TITLE')
  await requireVisible(page.getByText(/We checked for two minutes and it hasn't finished/), 'P1-05_TWO_MINUTE_MESSAGE')
  await requireVisible(page.getByRole('link', { name: 'Start a new analysis' }), 'P1-05_START_NEW')
  await requireVisible(page.getByRole('button', { name: 'Check again' }), 'P1-05_CHECK_AGAIN')
  requireCondition(await page.locator('.results-score-row').count() === 0, 'P1-05_NO_COMPLETED_REPORT', 'Completed report rendered')
  requireCondition(await page.getByRole('heading', { name: 'Analysis could not be completed' }).count() === 0, 'P1-05_NO_FAILED_REPORT', 'Backend-failed report rendered')
  requireCondition(countAtTimeout >= 3, 'P1-05_ANALYSIS_COUNT', 'Multiple three-second polling attempts did not occur')
  requireCondition(countAtTimeout >= 40 && countAtTimeout <= 42, 'P1-05_POLLING_INTERVAL', `Expected about 40 controlled polling requests, received ${countAtTimeout}`)
  requireCondition(scenario.counters.analysis === countAtTimeout, 'P1-05_POLLING_STOPPED', 'Polling continued after timeout')
  requireCondition(scenario.contractViolations.length === 0, 'P1-05_CONTRACT', 'Scenario contract was violated')
}
