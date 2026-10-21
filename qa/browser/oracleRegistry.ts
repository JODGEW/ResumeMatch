import { errors } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

import { OracleFailure } from './oracles'
import type { ScenarioInstance } from './scenarios'
import type { NetworkSummary, ScenarioId } from './types'
import { SYNTHETIC_BACKEND_ERROR, SYNTHETIC_EXISTING_FILE_NAME, SYNTHETIC_FILE_NAME } from '../fixtures/data'

/**
 * Confirmation window per observation when the original failure is not a
 * registry id, so no Phase 1 wait chain exists to share.
 *
 * Every other sweep waits until the original failure's chain deadline instead:
 * the investigator is never told to wait before `run_oracle`, so a fixed short
 * window would judge a reproduction by a waiting rule it was never given.
 */
export const SWEEP_TIMEOUT_MS = 3_000

/** `requireVisible`'s budget in `oracles.ts`. */
export const PHASE1_VISIBLE_MS = 8_000

/** `requireUrl`'s budget in `oracles.ts`. */
export const PHASE1_URL_MS = 30_000

/**
 * Playwright's default navigation and action budget, which `runReleaseCheck.ts`
 * leaves in place for its `goto` and `click` calls.
 */
const PLAYWRIGHT_DEFAULT_MS = 30_000

/** `POLL_TIMEOUT_MS` in `src/hooks/usePolling.ts`; Phase 1 advances the clock 240 001 ms past it. */
const POLL_TIMEOUT_MS = 240_000

/** What a registry oracle may read besides the page. */
export interface OracleContext {
  scenario: ScenarioInstance
  networkSummary(): NetworkSummary
  /** Poll count observed when the timeout state first appeared; P1-05 only. */
  analysisCountAtTimeout: number | null
}

/** Wait for a state within a budget; rejects with a Playwright timeout when it does not arrive. */
export type Settle = (page: Page, timeoutMs: number) => Promise<void>

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
  /**
   * Precondition expressed as an observation rather than a transition.
   *
   * Used where the meaningful precondition is that a request was *attempted*:
   * a rejected request records a violation and no acceptance transition, so
   * keying on the transition would skip exactly the case worth judging.
   * Overrides {@link preconditionTransition} when present.
   */
  precondition?(context: OracleContext): boolean
  /**
   * The wait chain Phase 1 ran before raising this id, for judging it as the
   * original failure.
   *
   * The chain starts at the last transition beginning with `after` and its
   * budgets sum to `withinMs`, so the reproduction waits until then and never
   * less than Phase 1 did; time already spent since the trigger counts. Ids
   * checked on a state that has already rendered get that state's chain plus
   * one `requireVisible` when they are visible checks, and the state's chain
   * alone when they are conditions. Absent for an id Phase 1 never raises.
   */
  chain?: { after: string; withinMs: number }
  /** What Phase 1 waited for before checking this id. */
  settle?: Settle
  /**
   * Whether a controlled-clock state had a fair chance to appear.
   *
   * Time under the controlled clock passes only when the reproduction advances
   * it, so no wait can stand in for that. Consulted only for the original
   * failure, and only when it failed: it stands between a failure and a
   * confirmation, never between a pass and `not_reproduced`.
   */
  fairChance?(context: OracleContext): boolean
  /** The check itself, made at once; the waiting is {@link settle}'s. */
  evaluate(page: Page, context: OracleContext): Promise<void>
}

/** Whether this reproduction sent the upload request at all. */
function uploadAttempted(context: OracleContext): boolean {
  return context.scenario.counters.upload >= 1
}

async function visible(locator: Locator, id: string): Promise<void> {
  condition(await locator.isVisible(), id, `Expected visible element was not found: ${id}`)
}

function condition(value: boolean, id: string, message: string): void {
  if (!value) throw new OracleFailure(id, message)
}

/** Run waits in order within one budget. */
function inTurn(...steps: Settle[]): Settle {
  return async (page, timeoutMs) => {
    const end = Date.now() + timeoutMs
    // A zero timeout means "no limit" to Playwright, so the floor is 1 ms.
    for (const step of steps) await step(page, Math.max(1, end - Date.now()))
  }
}

/** Phase 1's `goto` waited for this load state before its first check. */
function loaded(state: 'load' | 'networkidle'): Settle {
  return (page, timeout) => page.waitForLoadState(state, { timeout })
}

function shown(locate: (page: Page) => Locator): Settle {
  return (page, timeout) => locate(page).waitFor({ state: 'visible', timeout })
}

function reached(pathname: string): Settle {
  return (page, timeout) => page.waitForURL(url => url.pathname === pathname, { timeout })
}

/** A visible-element observation: Phase 1 waited for the element itself, after `before`. */
function seen(id: string, locate: (page: Page) => Locator, before: Settle[] = []): Pick<OracleDefinition, 'settle' | 'evaluate'> {
  return { settle: inTurn(...before, shown(locate)), evaluate: page => visible(locate(page), id) }
}

/** Reaching the upload form is the precondition for every new-upload observation. */
const UPLOAD_ACCEPTED = 'upload-contract:accepted-new-resume'
const REUSE_ACCEPTED = 'upload-contract:accepted-existing-resume'

/** The upload and reuse chains start where Phase 1 started waiting: the submit click. */
const CLICKED = 'reproduction-click:Analyze Resume'
const UPLOAD_OPENED = 'reproduction-open:/upload'

const COMPLETED_HEADING = (page: Page) => page.getByRole('heading', { name: 'QA Synthetic Software Engineer' })

/** requireUrl, then requireVisible for processing, then for the completed report. */
const COMPLETED_GATE_MS = PHASE1_URL_MS + PHASE1_VISIBLE_MS + PHASE1_VISIBLE_MS

function completedReportOracles(scenarioId: ScenarioId, expectedAnalysisId: string, expectS3: boolean, precondition: string): OracleDefinition[] {
  const shownOn = (id: string, locate: (page: Page) => Locator): OracleDefinition =>
    ({ id, scenarioId, stage: 'verify', preconditionTransition: precondition, chain: { after: CLICKED, withinMs: COMPLETED_GATE_MS + PHASE1_VISIBLE_MS }, ...seen(id, locate) })
  const at = (id: string, evaluate: OracleDefinition['evaluate']): OracleDefinition =>
    ({ id, scenarioId, stage: 'verify', preconditionTransition: precondition, chain: { after: CLICKED, withinMs: COMPLETED_GATE_MS }, settle: shown(COMPLETED_HEADING), evaluate })
  return [
    shownOn('COMPLETED_JOB_TITLE', COMPLETED_HEADING),
    at('COMPLETED_RESULTS_ROUTE', async page => {
      condition(new URL(page.url()).pathname === `/results/${expectedAnalysisId}`, 'COMPLETED_RESULTS_ROUTE', 'Unexpected results route')
    }),
    shownOn('COMPLETED_MATCH_SCORE', page => page.locator('.progress-ring__value').getByText('84', { exact: true })),
    shownOn('COMPLETED_SCORE_BREAKDOWN', page => page.getByRole('heading', { name: 'Score Breakdown' })),
    shownOn('COMPLETED_KEYWORD_COUNTS', page => page.getByText('Matched 3 of 5 required keywords', { exact: true })),
    shownOn('COMPLETED_MATCHED_KEYWORDS', page => page.getByRole('heading', { name: /Matched Keywords\s*3/ })),
    shownOn('COMPLETED_MATCHED_KEYWORD_VALUE', page => page.getByText('Playwright', { exact: true })),
    shownOn('COMPLETED_MISSING_KEYWORDS', page => page.getByRole('heading', { name: /Missing Keywords\s*2/ })),
    shownOn('COMPLETED_MISSING_KEYWORD_VALUE', page => page.getByText('Fault isolation', { exact: true }).first()),
    at('COMPLETED_NO_FAILURE', async page => {
      condition(await page.getByRole('heading', { name: 'Analysis could not be completed' }).count() === 0, 'COMPLETED_NO_FAILURE', 'Failure report rendered')
    }),
    at('COMPLETED_NO_TIMEOUT', async page => {
      condition(await page.getByRole('heading', { name: 'This is taking longer than usual' }).count() === 0, 'COMPLETED_NO_TIMEOUT', 'Timeout report rendered')
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

/** goto with networkidle, then requireVisible for the sample report region. */
const SAMPLE_GATE = { after: SAMPLE_OPENED, withinMs: PLAYWRIGHT_DEFAULT_MS + PHASE1_VISIBLE_MS }
const SAMPLE_SHOWN = { after: SAMPLE_OPENED, withinMs: SAMPLE_GATE.withinMs + PHASE1_VISIBLE_MS }
const SAMPLE_REGION = (page: Page) => page.getByRole('region', { name: 'Sample report' })
const SAMPLE_LOADED = inTurn(loaded('networkidle'), shown(SAMPLE_REGION))
const SIGNUP_DIALOG = (page: Page) => page.getByRole('dialog', { name: 'Run Your Own Analysis' })

const P1_01: OracleDefinition[] = [
  { id: 'P1-01_SAMPLE_REPORT_REGION', scenarioId: 'P1-01', stage: 'verify', preconditionTransition: SAMPLE_OPENED, chain: SAMPLE_GATE, ...seen('P1-01_SAMPLE_REPORT_REGION', SAMPLE_REGION, [loaded('networkidle')]) },
  { id: 'P1-01_SCORE_BREAKDOWN', scenarioId: 'P1-01', stage: 'verify', preconditionTransition: SAMPLE_OPENED, chain: SAMPLE_SHOWN, ...seen('P1-01_SCORE_BREAKDOWN', page => page.getByRole('heading', { name: 'Score Breakdown' }), [loaded('networkidle')]) },
  { id: 'P1-01_MATCHED_KEYWORDS', scenarioId: 'P1-01', stage: 'verify', preconditionTransition: SAMPLE_OPENED, chain: SAMPLE_SHOWN, ...seen('P1-01_MATCHED_KEYWORDS', page => page.getByRole('heading', { name: /Matched Keywords/ }), [loaded('networkidle')]) },
  { id: 'P1-01_MISSING_KEYWORDS', scenarioId: 'P1-01', stage: 'verify', preconditionTransition: SAMPLE_OPENED, chain: SAMPLE_SHOWN, ...seen('P1-01_MISSING_KEYWORDS', page => page.getByRole('heading', { name: /Missing Keywords/ }), [loaded('networkidle')]) },
  {
    id: 'P1-01_SIGNUP_PROMPT', scenarioId: 'P1-01', stage: 'verify', preconditionTransition: SAMPLE_OPENED, chain: SAMPLE_SHOWN,
    settle: inTurn(loaded('networkidle'), shown(page => page.getByRole('button', { name: 'New analysis' }).first())),
    // Opens the dialog it asserts, exactly as the Phase 1 oracle does, and
    // gives it requireVisible's budget from that click.
    evaluate: async page => {
      await page.getByRole('button', { name: 'New analysis' }).first().click({ timeout: PLAYWRIGHT_DEFAULT_MS })
      await shown(SIGNUP_DIALOG)(page, PHASE1_VISIBLE_MS).catch(error => {
        if (!(error instanceof errors.TimeoutError)) throw error
      })
      await visible(SIGNUP_DIALOG(page), 'P1-01_SIGNUP_PROMPT')
    },
  },
  { id: 'P1-01_NO_REST', scenarioId: 'P1-01', stage: 'verify', preconditionTransition: SAMPLE_OPENED, chain: SAMPLE_GATE, settle: SAMPLE_LOADED, evaluate: async (_page, ctx) => condition(ctx.networkSummary().resumeMatchRest === 0, 'P1-01_NO_REST', 'Sample page made a ResumeMatch REST request') },
  { id: 'P1-01_NO_COGNITO', scenarioId: 'P1-01', stage: 'verify', preconditionTransition: SAMPLE_OPENED, chain: SAMPLE_GATE, settle: SAMPLE_LOADED, evaluate: async (_page, ctx) => condition(ctx.networkSummary().cognito === 0, 'P1-01_NO_COGNITO', 'Sample page made a Cognito request') },
  { id: 'P1-01_NO_S3', scenarioId: 'P1-01', stage: 'verify', preconditionTransition: SAMPLE_OPENED, chain: SAMPLE_GATE, settle: SAMPLE_LOADED, evaluate: async (_page, ctx) => condition(ctx.networkSummary().s3 === 0, 'P1-01_NO_S3', 'Sample page made an S3 request') },
  { id: 'P1-01_NO_DEEPGRAM', scenarioId: 'P1-01', stage: 'verify', preconditionTransition: SAMPLE_OPENED, chain: SAMPLE_GATE, settle: SAMPLE_LOADED, evaluate: async (_page, ctx) => condition(ctx.networkSummary().deepgram === 0, 'P1-01_NO_DEEPGRAM', 'Sample page made a Deepgram request') },
  { id: 'P1-01_NO_OUTREACH', scenarioId: 'P1-01', stage: 'verify', preconditionTransition: SAMPLE_OPENED, chain: SAMPLE_GATE, settle: SAMPLE_LOADED, evaluate: async (_page, ctx) => condition(ctx.networkSummary().outreach === 0, 'P1-01_NO_OUTREACH', 'Sample page made an outreach request') },
  { id: 'P1-01_NO_UNEXPECTED_EGRESS', scenarioId: 'P1-01', stage: 'verify', preconditionTransition: SAMPLE_OPENED, chain: SAMPLE_GATE, settle: SAMPLE_LOADED, evaluate: async (_page, ctx) => condition(ctx.networkSummary().unexpectedEgress === 0, 'P1-01_NO_UNEXPECTED_EGRESS', 'Sample page attempted unexpected egress') },
]

/** goto with networkidle, then requireVisible for the upload form; the selected file adds one more. */
const UPLOAD_FORM = { after: UPLOAD_OPENED, withinMs: PLAYWRIGHT_DEFAULT_MS + PHASE1_VISIBLE_MS }
const UPLOAD_FORM_FILLED = { after: UPLOAD_OPENED, withinMs: UPLOAD_FORM.withinMs + PHASE1_VISIBLE_MS }
const ROUTE_CHAIN = { after: CLICKED, withinMs: PHASE1_URL_MS }
const PROCESSING_CHAIN = { after: CLICKED, withinMs: PHASE1_URL_MS + PHASE1_VISIBLE_MS }
const COMPLETED_CHAIN = { after: CLICKED, withinMs: COMPLETED_GATE_MS }

const P1_02: OracleDefinition[] = [
  { id: 'P1-02_UPLOAD_PAGE', scenarioId: 'P1-02', stage: 'driver', preconditionTransition: UPLOAD_OPENED, chain: UPLOAD_FORM, ...seen('P1-02_UPLOAD_PAGE', page => page.getByRole('heading', { name: 'New Analysis' }), [loaded('networkidle')]) },
  { id: 'P1-02_SELECTED_FILE', scenarioId: 'P1-02', stage: 'driver', preconditionTransition: UPLOAD_OPENED, chain: UPLOAD_FORM_FILLED, ...seen('P1-02_SELECTED_FILE', page => page.getByText(SYNTHETIC_FILE_NAME, { exact: true }), [loaded('networkidle')]) },
  {
    // Keyed on the attempt rather than the acceptance: an upload the router
    // rejects records no acceptance transition, and that is precisely the run
    // where "did the application navigate" is the question worth asking.
    id: 'P1-02_RESULTS_NAVIGATION', scenarioId: 'P1-02', stage: 'driver', preconditionTransition: UPLOAD_ACCEPTED,
    precondition: uploadAttempted,
    chain: ROUTE_CHAIN,
    settle: reached('/results/qa-new-1'),
    evaluate: async page => condition(new URL(page.url()).pathname === '/results/qa-new-1', 'P1-02_RESULTS_NAVIGATION', 'Application did not reach the expected route: P1-02_RESULTS_NAVIGATION'),
  },
  {
    /**
     * The upload request carried a body the contract does not accept.
     *
     * Phase 1 records that as a contract violation rather than an oracle, and
     * only synthesizes `CONTRACT_UNEXPECTED_REQUEST` when the scenario driver
     * returned without failing an oracle first — which a rejected upload never
     * does, because the page then fails to navigate. Naming it here gives a
     * reproduction the root observation to report alongside the symptom.
     */
    id: 'CONTRACT_UPLOAD_BODY', scenarioId: 'P1-02', stage: 'verify', preconditionTransition: null,
    precondition: uploadAttempted,
    evaluate: async (_page, ctx) => {
      const rejected = ctx.scenario.transitions.some(item => item.event === 'contract-violation:new-upload-body-schema')
      condition(!rejected, 'CONTRACT_UPLOAD_BODY', 'The upload request body was rejected by the contract')
    },
  },
  { id: 'P1-02_PROCESSING_STATE', scenarioId: 'P1-02', stage: 'driver', preconditionTransition: UPLOAD_ACCEPTED, chain: PROCESSING_CHAIN, ...seen('P1-02_PROCESSING_STATE', page => page.getByRole('status')) },
  { id: 'P1-02_COMPLETED_REPORT', scenarioId: 'P1-02', stage: 'driver', preconditionTransition: UPLOAD_ACCEPTED, chain: COMPLETED_CHAIN, ...seen('P1-02_COMPLETED_REPORT', COMPLETED_HEADING) },
  ...completedReportOracles('P1-02', 'qa-new-1', true, UPLOAD_ACCEPTED),
]

const P1_03: OracleDefinition[] = [
  { id: 'P1-03_EXISTING_FILE', scenarioId: 'P1-03', stage: 'driver', preconditionTransition: UPLOAD_OPENED, chain: UPLOAD_FORM, ...seen('P1-03_EXISTING_FILE', page => page.getByText(SYNTHETIC_EXISTING_FILE_NAME, { exact: true }), [loaded('networkidle')]) },
  {
    id: 'P1-03_RESULTS_NAVIGATION', scenarioId: 'P1-03', stage: 'driver', preconditionTransition: REUSE_ACCEPTED,
    chain: ROUTE_CHAIN,
    settle: reached('/results/qa-reuse-1'),
    evaluate: async page => condition(new URL(page.url()).pathname === '/results/qa-reuse-1', 'P1-03_RESULTS_NAVIGATION', 'Application did not reach the expected route: P1-03_RESULTS_NAVIGATION'),
  },
  { id: 'P1-03_PROCESSING_STATE', scenarioId: 'P1-03', stage: 'driver', preconditionTransition: REUSE_ACCEPTED, chain: PROCESSING_CHAIN, ...seen('P1-03_PROCESSING_STATE', page => page.getByRole('status')) },
  { id: 'P1-03_COMPLETED_REPORT', scenarioId: 'P1-03', stage: 'driver', preconditionTransition: REUSE_ACCEPTED, chain: COMPLETED_CHAIN, ...seen('P1-03_COMPLETED_REPORT', COMPLETED_HEADING) },
  ...completedReportOracles('P1-03', 'qa-reuse-1', false, REUSE_ACCEPTED),
]

const FAILED_OPENED = 'reproduction-open:/results/qa-failed-1'

/** goto (load), then requireVisible for processing, then for the failed report. */
const FAILED_PROCESSING = { after: FAILED_OPENED, withinMs: PLAYWRIGHT_DEFAULT_MS + PHASE1_VISIBLE_MS }
const FAILED_GATE = { after: FAILED_OPENED, withinMs: FAILED_PROCESSING.withinMs + PHASE1_VISIBLE_MS }
const FAILED_SHOWN = { after: FAILED_OPENED, withinMs: FAILED_GATE.withinMs + PHASE1_VISIBLE_MS }
const FAILED_HEADING = (page: Page) => page.getByRole('heading', { name: 'Analysis could not be completed' })
const FAILED_LOADED = inTurn(loaded('load'), shown(FAILED_HEADING))

const P1_04: OracleDefinition[] = [
  { id: 'P1-04_PROCESSING_STATE', scenarioId: 'P1-04', stage: 'driver', preconditionTransition: FAILED_OPENED, chain: FAILED_PROCESSING, ...seen('P1-04_PROCESSING_STATE', page => page.getByRole('status'), [loaded('load')]) },
  { id: 'P1-04_FAILED_STATE', scenarioId: 'P1-04', stage: 'driver', preconditionTransition: FAILED_OPENED, chain: FAILED_GATE, ...seen('P1-04_FAILED_STATE', FAILED_HEADING, [loaded('load')]) },
  { id: 'P1-04_ALERT', scenarioId: 'P1-04', stage: 'verify', preconditionTransition: FAILED_OPENED, chain: FAILED_SHOWN, ...seen('P1-04_ALERT', page => page.getByRole('alert'), [loaded('load')]) },
  { id: 'P1-04_FAILURE_TITLE', scenarioId: 'P1-04', stage: 'verify', preconditionTransition: FAILED_OPENED, chain: FAILED_SHOWN, ...seen('P1-04_FAILURE_TITLE', FAILED_HEADING, [loaded('load')]) },
  { id: 'P1-04_BACKEND_ERROR', scenarioId: 'P1-04', stage: 'verify', preconditionTransition: FAILED_OPENED, chain: FAILED_SHOWN, ...seen('P1-04_BACKEND_ERROR', page => page.getByText(SYNTHETIC_BACKEND_ERROR, { exact: true }), [loaded('load')]) },
  { id: 'P1-04_UPLOAD_AGAIN', scenarioId: 'P1-04', stage: 'verify', preconditionTransition: FAILED_OPENED, chain: FAILED_SHOWN, ...seen('P1-04_UPLOAD_AGAIN', page => page.getByRole('link', { name: 'Upload again' }), [loaded('load')]) },
  { id: 'P1-04_GO_TO_HISTORY', scenarioId: 'P1-04', stage: 'verify', preconditionTransition: FAILED_OPENED, chain: FAILED_SHOWN, ...seen('P1-04_GO_TO_HISTORY', page => page.getByRole('link', { name: 'Go to History' }), [loaded('load')]) },
  { id: 'P1-04_NO_MATCH_SCORE', scenarioId: 'P1-04', stage: 'verify', preconditionTransition: FAILED_OPENED, chain: FAILED_GATE, settle: FAILED_LOADED, evaluate: async page => condition(await page.locator('.progress-ring').count() === 0, 'P1-04_NO_MATCH_SCORE', 'A match score rendered for a failed analysis') },
  { id: 'P1-04_ANALYSIS_COUNT', scenarioId: 'P1-04', stage: 'verify', preconditionTransition: FAILED_OPENED, chain: FAILED_GATE, settle: FAILED_LOADED, evaluate: async (_page, ctx) => condition(ctx.scenario.counters.analysis === 2, 'P1-04_ANALYSIS_COUNT', 'Expected processing then failed responses') },
  { id: 'P1-04_CONTRACT', scenarioId: 'P1-04', stage: 'verify', preconditionTransition: FAILED_OPENED, chain: FAILED_GATE, settle: FAILED_LOADED, evaluate: async (_page, ctx) => condition(ctx.scenario.contractViolations.length === 0, 'P1-04_CONTRACT', 'Scenario contract was violated') },
]

const TIMEOUT_OPENED = 'reproduction-open:/results/qa-timeout-1'

/**
 * A controlled-clock advance the reproduction counted toward the poll timeout.
 *
 * The reproduction records one only when the status card was showing as the
 * advance began: the timeout is armed in the same step that first renders it,
 * so an earlier advance moves a clock the timeout is not yet running on.
 */
const CLOCK_ADVANCED = 'reproduction-clock:'

/** goto (load), then requireVisible for processing. */
const TIMEOUT_PROCESSING = { after: TIMEOUT_OPENED, withinMs: PLAYWRIGHT_DEFAULT_MS + PHASE1_VISIBLE_MS }
/** Phase 1's requireVisible after its clock advance; the verify set adds one more for visible ids. */
const TIMEOUT_GATE = { after: CLOCK_ADVANCED, withinMs: PHASE1_VISIBLE_MS }
const TIMEOUT_SHOWN = { after: CLOCK_ADVANCED, withinMs: TIMEOUT_GATE.withinMs + PHASE1_VISIBLE_MS }
const TIMEOUT_HEADING = (page: Page) => page.getByRole('heading', { name: 'This is taking longer than usual' })

/** More than the poll timeout advanced, counting only advances since the route was last opened. */
function clockedPastTimeout(context: OracleContext): boolean {
  const events = context.scenario.transitions.map(item => item.event)
  const opened = events.lastIndexOf(TIMEOUT_OPENED)
  if (opened < 0) return false
  const advancedMs = events.slice(opened + 1)
    .filter(event => event.startsWith(CLOCK_ADVANCED))
    .reduce((total, event) => total + Number(event.slice(CLOCK_ADVANCED.length)), 0)
  return advancedMs > POLL_TIMEOUT_MS
}

/** Every observation Phase 1 makes after its clock advance. */
function afterTimeout(oracle: Omit<OracleDefinition, 'scenarioId' | 'preconditionTransition' | 'fairChance'>): OracleDefinition {
  return { ...oracle, scenarioId: 'P1-05', preconditionTransition: TIMEOUT_OPENED, fairChance: clockedPastTimeout }
}

const P1_05: OracleDefinition[] = [
  { id: 'P1-05_PROCESSING_STATE', scenarioId: 'P1-05', stage: 'driver', preconditionTransition: TIMEOUT_OPENED, chain: TIMEOUT_PROCESSING, ...seen('P1-05_PROCESSING_STATE', page => page.getByRole('heading', { name: 'Resume analysis in progress' }), [loaded('load')]) },
  afterTimeout({ id: 'P1-05_TIMEOUT_STATE', stage: 'driver', chain: TIMEOUT_GATE, ...seen('P1-05_TIMEOUT_STATE', TIMEOUT_HEADING) }),
  afterTimeout({ id: 'P1-05_TIMEOUT_TITLE', stage: 'verify', chain: TIMEOUT_SHOWN, ...seen('P1-05_TIMEOUT_TITLE', TIMEOUT_HEADING) }),
  afterTimeout({ id: 'P1-05_TWO_MINUTE_MESSAGE', stage: 'verify', chain: TIMEOUT_SHOWN, ...seen('P1-05_TWO_MINUTE_MESSAGE', page => page.getByText("We checked for four minutes and it hasn't finished yet. It may still be running. Check History in a few minutes to see the result. Please don't submit the same resume and job description again, because that starts a second analysis.", { exact: true })) }),
  afterTimeout({ id: 'P1-05_START_NEW', stage: 'verify', chain: TIMEOUT_SHOWN, ...seen('P1-05_START_NEW', page => page.getByRole('link', { name: 'Start a new analysis' })) }),
  afterTimeout({ id: 'P1-05_CHECK_AGAIN', stage: 'verify', chain: TIMEOUT_SHOWN, ...seen('P1-05_CHECK_AGAIN', page => page.getByRole('button', { name: 'Check again' })) }),
  afterTimeout({ id: 'P1-05_NO_COMPLETED_REPORT', stage: 'verify', chain: TIMEOUT_GATE, settle: shown(TIMEOUT_HEADING), evaluate: async page => condition(await page.locator('.results-score-row').count() === 0, 'P1-05_NO_COMPLETED_REPORT', 'Completed report rendered') }),
  afterTimeout({ id: 'P1-05_NO_FAILED_REPORT', stage: 'verify', chain: TIMEOUT_GATE, settle: shown(TIMEOUT_HEADING), evaluate: async page => condition(await page.getByRole('heading', { name: 'Analysis could not be completed' }).count() === 0, 'P1-05_NO_FAILED_REPORT', 'Backend-failed report rendered') }),
  afterTimeout({ id: 'P1-05_ANALYSIS_COUNT', stage: 'verify', chain: TIMEOUT_GATE, settle: shown(TIMEOUT_HEADING), evaluate: async (_page, ctx) => condition((ctx.analysisCountAtTimeout ?? ctx.scenario.counters.analysis) >= 3, 'P1-05_ANALYSIS_COUNT', 'Multiple three-second polling attempts did not occur') }),
  afterTimeout({
    id: 'P1-05_POLLING_INTERVAL', stage: 'verify', chain: TIMEOUT_GATE, settle: shown(TIMEOUT_HEADING),
    evaluate: async (_page, ctx) => {
      const count = ctx.analysisCountAtTimeout ?? ctx.scenario.counters.analysis
      // A normal run counts 80 polls over the 240 s timeout. In B5 the aborted poll's error can be
      // handled before the 6-second poll starts; the retry then lands the count at 78 or 79, which
      // is correct product behavior.
      condition(count >= 78 && count <= 80, 'P1-05_POLLING_INTERVAL', `Expected 78 to 80 controlled polling requests, received ${count}`)
    },
  }),
  afterTimeout({ id: 'P1-05_POLLING_STOPPED', stage: 'verify', chain: TIMEOUT_GATE, settle: shown(TIMEOUT_HEADING), evaluate: async (_page, ctx) => condition(ctx.scenario.counters.analysis === (ctx.analysisCountAtTimeout ?? ctx.scenario.counters.analysis), 'P1-05_POLLING_STOPPED', 'Polling continued after timeout') }),
  afterTimeout({ id: 'P1-05_CONTRACT', stage: 'verify', chain: TIMEOUT_GATE, settle: shown(TIMEOUT_HEADING), evaluate: async (_page, ctx) => condition(ctx.scenario.contractViolations.length === 0, 'P1-05_CONTRACT', 'Scenario contract was violated') }),
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
