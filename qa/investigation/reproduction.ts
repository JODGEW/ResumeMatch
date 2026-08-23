import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import { chromium } from '@playwright/test'
import type { Browser, BrowserContext, Locator, Page } from '@playwright/test'

import { redactText } from '../browser/evidence'
import { generatedBuildResourcePaths, NetworkPolicy, QA_API_ORIGIN, QA_APP_ORIGIN, QA_S3_ORIGIN } from '../browser/networkPolicy'
import { OracleFailure } from '../browser/oracles'
import { oracleById, oraclesForScenario } from '../browser/oracleRegistry'
import type { OracleContext } from '../browser/oracleRegistry'
import { StatefulContractRouter } from '../browser/contractRouter'
import { createScenario, type ScenarioInstance } from '../browser/scenarios'
import { installUploadObservation } from '../browser/uploadObservation'
import type { NetworkEvent, RunFailure, SafetyViolation, ScenarioId } from '../browser/types'
import { SYNTHETIC_FILE_NAME, SYNTHETIC_JOB_DESCRIPTION } from '../fixtures/data'
import type { AllowedAction, SemanticState } from './actions'
import { InvestigationError } from './errors'
import type { ReproductionOracleResult } from './finding'
import type { ReproductionDriver } from './session'

const ACTION_TIMEOUT_MS = 10_000
const MAX_ARIA_EXCERPT = 8_000
const MAX_INSPECT_TEXT = 400

/** Semantic states resolved to the locators Phase 1 already asserts. */
function stateLocator(page: Page, state: SemanticState): Locator {
  switch (state) {
    case 'upload_ready': return page.getByRole('button', { name: /Analyze Resume/ })
    case 'processing': return page.getByRole('status')
    case 'completed_report': return page.getByRole('heading', { name: 'QA Synthetic Software Engineer' })
    case 'failed_report': return page.getByRole('heading', { name: 'Analysis could not be completed' })
    case 'timeout_report': return page.getByRole('heading', { name: 'This is taking longer than it should' })
  }
}

/**
 * Drives one fresh reproduction context.
 *
 * Every browser primitive stays inside this class: the session hands it
 * validated semantic actions, so no page, context, or selector ever reaches a
 * model. The scenario instance, browser context, and storage are new, and the
 * oracle is the same Phase 1 function the original run used.
 */
export class PlaywrightReproduction implements ReproductionDriver {
  private browser: Browser | null = null
  private context: BrowserContext | null = null
  private page: Page | null = null
  private policy: NetworkPolicy | null = null
  private scenario: ScenarioInstance | null = null
  private analysisCountAtTimeout: number | null = null
  private readonly startedAt = Date.now()

  constructor(
    private readonly scenarioId: ScenarioId,
    private readonly reproductionDirectory: string,
    private readonly options: { headless?: boolean; buildDirectory?: string } = {},
  ) {}

  async start(): Promise<void> {
    if (this.browser !== null) throw new InvestigationError('INVALID_STATE', 'This reproduction already started')
    this.scenario = createScenario(this.scenarioId)
    this.browser = await chromium.launch({ headless: this.options.headless ?? true })
    this.context = await this.browser.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 1000 } })
    await installUploadObservation(this.context, this.scenario, QA_S3_ORIGIN)
    this.policy = new NetworkPolicy({
      appOrigin: QA_APP_ORIGIN, apiOrigin: QA_API_ORIGIN, s3Origin: QA_S3_ORIGIN, startedAt: this.startedAt,
      contractRouter: new StatefulContractRouter(this.scenario),
      allowedLocalResourcePaths: await generatedBuildResourcePaths(this.options.buildDirectory ?? path.join(process.cwd(), '.qa-dist')),
    })
    await this.policy.install(this.context)
    this.page = await this.context.newPage()
    if (this.scenarioId === 'P1-05') await this.page.clock.install({ time: new Date('2026-01-15T12:00:00Z') })
    this.scenario.recordTransition('reproduction-context-created')
  }

  private requirePage(): Page {
    if (this.page === null) throw new InvestigationError('INVALID_STATE', 'The reproduction has no page')
    return this.page
  }

  async executeAction(action: AllowedAction, concretePath: string | null): Promise<{ semanticState: string }> {
    const page = this.requirePage()
    switch (action.kind) {
      case 'open_route': {
        if (concretePath === null) throw new InvestigationError('INVALID_STATE', 'No resolved path for the requested route')
        await page.goto(`${QA_APP_ORIGIN}${concretePath}`, { waitUntil: 'domcontentloaded' })
        this.scenario?.recordTransition(`reproduction-open:${concretePath}`)
        return { semanticState: `opened:${concretePath}` }
      }
      case 'fill_synthetic_text':
        await page.getByRole('textbox', { name: 'Job Description' }).fill(SYNTHETIC_JOB_DESCRIPTION, { timeout: ACTION_TIMEOUT_MS })
        return { semanticState: 'filled:job_description' }
      case 'attach_synthetic_file':
        await page.getByLabel('Resume PDF file').setInputFiles(path.join(process.cwd(), 'qa', 'fixtures', SYNTHETIC_FILE_NAME), { timeout: ACTION_TIMEOUT_MS })
        return { semanticState: 'attached:qa_synthetic_resume' }
      case 'click_by_role':
        await page.getByRole(action.role, { name: action.name }).first().click({ timeout: ACTION_TIMEOUT_MS })
        return { semanticState: `clicked:${action.name}` }
      case 'wait_for_state': {
        await stateLocator(page, action.state).first().waitFor({ state: 'visible', timeout: ACTION_TIMEOUT_MS })
        if (action.state === 'timeout_report' && this.analysisCountAtTimeout === null && this.scenario) {
          this.analysisCountAtTimeout = this.scenario.counters.analysis
        }
        return { semanticState: `reached:${action.state}` }
      }
    }
  }

  async inspect(target: { role: string; name?: string }): Promise<{ present: boolean; visible: boolean; count: number; text: string | null }> {
    const page = this.requirePage()
    const locator = target.name === undefined
      ? page.getByRole(target.role as Parameters<Page['getByRole']>[0])
      : page.getByRole(target.role as Parameters<Page['getByRole']>[0], { name: target.name })
    const count = await locator.count()
    if (count === 0) return { present: false, visible: false, count: 0, text: null }
    const first = locator.first()
    const visible = await first.isVisible()
    const raw = (await first.textContent()) ?? ''
    return { present: true, visible, count, text: redactText(raw).slice(0, MAX_INSPECT_TEXT) }
  }

  async captureRegionScreenshot(label: string): Promise<string> {
    const destination = path.join(this.reproductionDirectory, `${label}.png`)
    await this.requirePage().screenshot({ path: destination, fullPage: false })
    return destination
  }

  async captureAccessibilitySnapshot(label: string): Promise<{ file: string; excerpt: string }> {
    const snapshot = redactText(await this.requirePage().locator('body').ariaSnapshot())
    const destination = path.join(this.reproductionDirectory, `${label}.yaml`)
    await writeFile(destination, `${snapshot}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    return { file: destination, excerpt: snapshot.slice(0, MAX_ARIA_EXCERPT) }
  }

  async advanceClock(ms: number): Promise<void> {
    await this.requirePage().clock.runFor(ms)
  }

  /**
   * Evaluate the whole scenario against the registry and collect every failure.
   *
   * Phase 1 stops at its first failed observation while driving, which is right
   * for a release check but leaves a reproduction unable to say whether the
   * original failure recurred: an earlier assertion failing first hides it.
   * Here the original `failedOracle` is evaluated first, then the rest of the
   * scenario, and every failure is kept.
   *
   * An observation whose precondition transition never appeared is skipped
   * rather than failed — a reproduction that never drove the scenario is
   * missing a precondition, not observing a defect.
   * @param sourceFailedOracle - the oracle the original run failed, if any.
   * @returns the collected verdict.
   */
  async runOracle(sourceFailedOracle: string | null): Promise<ReproductionOracleResult> {
    const page = this.requirePage()
    const scenario = this.scenario
    const policy = this.policy
    if (scenario === null || policy === null) throw new InvestigationError('INVALID_STATE', 'The reproduction has no scenario state')

    const context: OracleContext = {
      scenario,
      networkSummary: () => policy.summary(),
      analysisCountAtTimeout: this.analysisCountAtTimeout,
    }
    const recorded = new Set(scenario.transitions.map(item => item.event))
    const met = (oracle: { preconditionTransition: string | null }): boolean =>
      oracle.preconditionTransition === null || recorded.has(oracle.preconditionTransition)

    const source = sourceFailedOracle === null ? undefined : oracleById(this.scenarioId, sourceFailedOracle)
    const ordered = [
      ...source === undefined ? [] : [source],
      ...oraclesForScenario(this.scenarioId).filter(oracle => oracle !== source),
    ]

    const failures: RunFailure[] = []
    const evaluated: string[] = []
    const skipped: string[] = []
    for (const oracle of ordered) {
      if (!met(oracle)) {
        skipped.push(oracle.id)
        continue
      }
      evaluated.push(oracle.id)
      try {
        await oracle.evaluate(page, context)
      } catch (error) {
        if (error instanceof OracleFailure) {
          failures.push({ phase: 'scenario', kind: 'oracle', message: error.message, oracleId: error.oracleId })
          continue
        }
        return {
          oracleStatus: 'incomplete',
          failedOracle: null,
          failures: [{ phase: 'scenario_execution', kind: 'infrastructure', message: error instanceof Error ? error.message : String(error) }],
          preconditionMet: false,
          evaluated,
          skipped,
        }
      }
    }

    // Contract and safety observations are scenario-wide rather than per-id, so
    // they are applied after the sweep with Phase 1's precedence.
    if (scenario.contractViolations.length > 0 && !failures.some(item => item.oracleId === 'CONTRACT_UNEXPECTED_REQUEST')) {
      failures.push({ phase: 'oracle', kind: 'oracle', message: 'Deterministic oracle failed: CONTRACT_UNEXPECTED_REQUEST', oracleId: 'CONTRACT_UNEXPECTED_REQUEST' })
    }
    if (policy.safetyViolations.length > 0) {
      failures.push({ phase: 'oracle', kind: 'oracle', message: 'Deterministic oracle failed: SAFETY_UNEXPECTED_EGRESS', oracleId: 'SAFETY_UNEXPECTED_EGRESS' })
    }

    // The precondition that decides whether the verdict is comparable is the
    // one belonging to the original failure; without a registry entry, any
    // evaluated observation shows the reproduction reached the scenario.
    const preconditionMet = source === undefined ? evaluated.length > 0 : met(source)
    return {
      oracleStatus: failures.length === 0 ? 'passed' : 'failed',
      failedOracle: failures[0]?.oracleId ?? null,
      failures,
      preconditionMet,
      evaluated,
      skipped,
    }
  }

  networkEvents(): NetworkEvent[] {
    return this.policy?.events ?? []
  }

  safetyViolations(): SafetyViolation[] {
    return this.policy?.safetyViolations ?? []
  }

  async close(): Promise<void> {
    if (this.context) await this.context.close().catch(() => undefined)
    if (this.browser) await this.browser.close().catch(() => undefined)
    this.page = null
    this.context = null
    this.browser = null
  }
}
