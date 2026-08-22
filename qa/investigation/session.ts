import { writeFile } from 'node:fs/promises'
import path from 'node:path'

import { resolveRoute, validateAction, validateInspectionTarget, allowsControlledClock, scenarioActionPolicy, type AllowedAction } from './actions'
import { BudgetLedger, INVESTIGATION_BUDGET } from './budget'
import { CostLedger } from './cost'
import { InvestigationError, policyBlocked } from './errors'
import {
  countRequests, failedAssertion, filterEvents, readConsoleEvents, readManifest, readNetworkEvents,
  readPageErrors, readSafetyViolations, readTransitionLog, type RequestGrouping,
} from './evidenceReader'
import { buildFinding, validateNarrative, type CheckoutIdentity, type DeterministicFacts, type Finding, type ReproductionOracleResult } from './finding'
import { evidenceReference, type InvestigationDirectory } from './paths'
import type { EvidenceManifest, NetworkEvent, SafetyViolation } from '../browser/types'

/** Where the agent is in the fixed investigation lifecycle. */
export type SessionState = 'read' | 'reproducing' | 'judged' | 'done'

/** The reproduction surface the session drives. Implemented by Playwright, faked in tests. */
export interface ReproductionDriver {
  start(): Promise<void>
  executeAction(action: AllowedAction, concretePath: string | null): Promise<{ semanticState: string }>
  inspect(target: { role: string; name?: string }): Promise<{ present: boolean; visible: boolean; count: number; text: string | null }>
  captureRegionScreenshot(label: string): Promise<string>
  captureAccessibilitySnapshot(label: string): Promise<{ file: string; excerpt: string }>
  advanceClock(ms: number): Promise<void>
  runOracle(): Promise<ReproductionOracleResult>
  networkEvents(): NetworkEvent[]
  safetyViolations(): SafetyViolation[]
  close(): Promise<void>
}

export interface SessionOptions {
  investigationId: string
  findingId: string
  runDirectory: string
  manifest: EvidenceManifest
  directories: InvestigationDirectory
  driver: ReproductionDriver
  model: { provider: string; modelId: string }
  checkouts: CheckoutIdentity
  /** Cost gate for this investigation; absent for a keyless run that spends nothing. */
  cost?: CostLedger
  now?: () => number
}

/** One recorded reproduction step: the validated action and what the page reported. */
export interface ReproductionStep {
  sequence: number
  action: AllowedAction
  outcome: { semanticState: string } | { error: string }
}

const READ_TOOLS = new Set([
  'read_failure_manifest', 'read_failed_assertion', 'read_console_events', 'read_page_errors',
  'read_network_events', 'read_scenario_transition_log', 'read_safety_violations', 'count_requests',
])

const MAX_CONSOLE_EVENTS = 200

function requireObject(input: unknown, tool: string): Record<string, unknown> {
  if (input === undefined || input === null) return {}
  if (typeof input !== 'object' || Array.isArray(input)) throw new InvestigationError('INVALID_ARGUMENTS', `${tool} arguments must be an object`)
  return input as Record<string, unknown>
}

function requireKnownKeys(args: Record<string, unknown>, allowed: string[], tool: string): void {
  const extra = Object.keys(args).filter(key => !allowed.includes(key))
  if (extra.length > 0) throw new InvestigationError('INVALID_ARGUMENTS', `${tool} does not accept ${extra.join(', ')}`)
}

/**
 * The authorization core: one dispatch point for every model-reachable action.
 *
 * Lifecycle state, budgets, argument validation, and evidence containment are
 * all decided here, so the adapter that speaks the harness tool protocol holds
 * no policy of its own. Two latches survive to the finding: an attempted
 * unauthorized action forces `policy_blocked`, and a spent budget forces
 * `inconclusive`.
 */
export class InvestigationSession {
  private state: SessionState = 'read'
  private policyBlockedLatch = false
  private readonly ledger: BudgetLedger
  private readonly probes: string[] = []
  private readonly steps: ReproductionStep[] = []
  private reproductionOracleResult: ReproductionOracleResult | null = null
  private toolCalls = 0
  private finding: Finding | null = null
  private started = false

  constructor(private readonly options: SessionOptions) {
    this.ledger = new BudgetLedger((options.now ?? Date.now)(), options.now ?? Date.now)
  }

  /**
   * Record one model request's token accounting, reported by the harness rather
   * than by the model.
   *
   * A request that crosses the cost ceiling latches the same way a spent tool
   * budget does, so the investigation can still submit but can only be
   * `inconclusive`.
   * @param usage - disjoint token counts from the provider.
   * @param requestedAt - UTC timestamp of the request.
   */
  recordUsage(
    usage: { cacheHitTokens: number; cacheMissTokens: number; completionTokens: number },
    requestedAt: Date = new Date(),
  ): void {
    try {
      this.options.cost?.record(usage, requestedAt)
    } catch (error) {
      if (!(error instanceof InvestigationError && error.code === 'BUDGET_EXHAUSTED')) throw error
    }
  }

  /** Current lifecycle state, budget remainder, and latches, for the agent's context. */
  status(): { state: SessionState; policyBlocked: boolean; budgetExhausted: boolean; remaining: Record<string, number>; scenarioId: string; actionPolicy: unknown } {
    return {
      state: this.state,
      policyBlocked: this.policyBlockedLatch,
      budgetExhausted: this.ledger.isExhausted() || (this.options.cost?.isExhausted() ?? false),
      remaining: this.ledger.remaining(),
      scenarioId: this.options.manifest.scenarioId,
      actionPolicy: scenarioActionPolicy(this.options.manifest.scenarioId),
    }
  }

  /** The finding, once submitted. */
  submittedFinding(): Finding | null {
    return this.finding
  }

  /**
   * Execute one model-requested tool.
   * @throws {@link InvestigationError} for refusals; the caller reports the code
   * to the model rather than crashing the investigation.
   */
  async call(tool: string, input: unknown): Promise<unknown> {
    this.toolCalls += 1
    if (this.state === 'done') throw new InvestigationError('INVALID_STATE', 'The investigation already submitted its finding')
    if (this.policyBlockedLatch && tool !== 'submit_finding') {
      throw policyBlocked('The investigation is blocked after an unauthorized action; only submit_finding remains')
    }
    if (this.options.cost?.isExhausted() === true && tool !== 'submit_finding') {
      throw new InvestigationError('BUDGET_EXHAUSTED', 'The investigation cost ceiling is exhausted; only submit_finding remains')
    }
    try {
      this.ledger.spend('toolCalls')
      return await this.dispatch(tool, input)
    } catch (error) {
      if (error instanceof InvestigationError && error.code === 'POLICY_BLOCKED') this.policyBlockedLatch = true
      throw error
    }
  }

  private async dispatch(tool: string, input: unknown): Promise<unknown> {
    if (READ_TOOLS.has(tool)) return this.readTool(tool, input)
    switch (tool) {
      case 'start_fresh_reproduction': return this.startReproduction(input)
      case 'execute_allowed_action': return this.executeAction(input)
      case 'inspect_element_state': return this.inspectElement(input)
      case 'capture_region_screenshot': return this.captureScreenshot(input)
      case 'capture_accessibility_snapshot': return this.captureAccessibility(input)
      case 'advance_controlled_clock': return this.advanceClock(input)
      case 'run_oracle': return this.runOracle(input)
      case 'submit_finding': return this.submitFinding(input)
      default: throw policyBlocked(`Unsupported tool: ${tool}`)
    }
  }

  private async readTool(tool: string, input: unknown): Promise<unknown> {
    if (this.state !== 'read' && this.state !== 'reproducing') {
      throw new InvestigationError('INVALID_STATE', `${tool} is not available after the reproduction oracle has run`)
    }
    const args = requireObject(input, tool)
    this.ledger.spend('probes')
    this.probes.push(tool)
    const directory = this.options.runDirectory
    switch (tool) {
      case 'read_failure_manifest':
        requireKnownKeys(args, [], tool)
        return await readManifest(directory)
      case 'read_failed_assertion':
        requireKnownKeys(args, [], tool)
        return failedAssertion(await readManifest(directory))
      case 'read_console_events': {
        requireKnownKeys(args, ['typeFilter', 'limit'], tool)
        const events = await readConsoleEvents(directory)
        const filtered = args.typeFilter === undefined ? events : events.filter(event => event.type === args.typeFilter)
        const limit = args.limit === undefined ? MAX_CONSOLE_EVENTS : Number(args.limit)
        if (!Number.isInteger(limit) || limit < 1 || limit > MAX_CONSOLE_EVENTS) {
          throw new InvestigationError('INVALID_ARGUMENTS', `limit must be an integer between 1 and ${MAX_CONSOLE_EVENTS}`)
        }
        return filtered.slice(0, limit)
      }
      case 'read_page_errors':
        requireKnownKeys(args, [], tool)
        return await readPageErrors(directory)
      case 'read_network_events': {
        requireKnownKeys(args, ['originAlias', 'routeTemplate', 'mockDecision'], tool)
        return filterEvents(await readNetworkEvents(directory), args as Record<string, string>)
      }
      case 'read_scenario_transition_log':
        requireKnownKeys(args, [], tool)
        return await readTransitionLog(directory)
      case 'read_safety_violations':
        requireKnownKeys(args, [], tool)
        return await readSafetyViolations(directory)
      case 'count_requests': {
        requireKnownKeys(args, ['groupBy', 'source'], tool)
        const groupBy = args.groupBy
        if (!['originAlias', 'routeTemplate', 'mockDecision', 'method'].includes(String(groupBy))) {
          throw new InvestigationError('INVALID_ARGUMENTS', 'groupBy must be originAlias, routeTemplate, mockDecision, or method')
        }
        const source = args.source ?? 'original'
        if (source !== 'original' && source !== 'reproduction') {
          throw new InvestigationError('INVALID_ARGUMENTS', 'source must be original or reproduction')
        }
        if (source === 'reproduction' && !this.started) throw new InvestigationError('INVALID_STATE', 'No reproduction has started')
        const events = source === 'reproduction' ? this.options.driver.networkEvents() : await readNetworkEvents(directory)
        return countRequests(events, groupBy as RequestGrouping)
      }
      default:
        throw policyBlocked(`Unsupported read tool: ${tool}`)
    }
  }

  private async startReproduction(input: unknown): Promise<unknown> {
    if (this.state !== 'read') throw new InvestigationError('INVALID_STATE', 'A reproduction has already started')
    const args = requireObject(input, 'start_fresh_reproduction')
    requireKnownKeys(args, ['sourceRunId'], 'start_fresh_reproduction')
    if (args.sourceRunId !== undefined && args.sourceRunId !== this.options.manifest.runId) {
      throw policyBlocked('A reproduction may only target the run under investigation')
    }
    this.ledger.spend('reproductions')
    await this.options.driver.start()
    this.started = true
    this.state = 'reproducing'
    return { state: 'ready', scenarioId: this.options.manifest.scenarioId, actionPolicy: scenarioActionPolicy(this.options.manifest.scenarioId) }
  }

  private requireReproducing(tool: string): void {
    if (this.state !== 'reproducing') throw new InvestigationError('INVALID_STATE', `${tool} requires an active reproduction`)
  }

  private async executeAction(input: unknown): Promise<unknown> {
    this.requireReproducing('execute_allowed_action')
    const args = requireObject(input, 'execute_allowed_action')
    requireKnownKeys(args, ['action'], 'execute_allowed_action')
    const action = validateAction(this.options.manifest.scenarioId, args.action)
    this.ledger.spend('actions')
    const concretePath = action.kind === 'open_route' ? resolveRoute(this.options.manifest.scenarioId, action.route) : null
    try {
      const outcome = await this.options.driver.executeAction(action, concretePath)
      this.steps.push({ sequence: this.steps.length + 1, action, outcome })
      return outcome
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.steps.push({ sequence: this.steps.length + 1, action, outcome: { error: message } })
      throw new InvestigationError('REPRODUCTION_FAILED', message)
    }
  }

  private async inspectElement(input: unknown): Promise<unknown> {
    this.requireReproducing('inspect_element_state')
    const args = requireObject(input, 'inspect_element_state')
    requireKnownKeys(args, ['target'], 'inspect_element_state')
    const target = validateInspectionTarget(args.target)
    this.ledger.spend('inspections')
    return this.options.driver.inspect(target)
  }

  private async captureScreenshot(input: unknown): Promise<unknown> {
    this.requireReproducing('capture_region_screenshot')
    const args = requireObject(input, 'capture_region_screenshot')
    requireKnownKeys(args, ['label'], 'capture_region_screenshot')
    const label = this.safeLabel(args.label, 'capture_region_screenshot')
    this.ledger.spend('screenshots')
    const file = await this.options.driver.captureRegionScreenshot(label)
    return { artifactRef: this.reference(file) }
  }

  private async captureAccessibility(input: unknown): Promise<unknown> {
    this.requireReproducing('capture_accessibility_snapshot')
    const args = requireObject(input, 'capture_accessibility_snapshot')
    requireKnownKeys(args, ['label'], 'capture_accessibility_snapshot')
    const label = this.safeLabel(args.label, 'capture_accessibility_snapshot')
    this.ledger.spend('accessibilitySnapshots')
    const snapshot = await this.options.driver.captureAccessibilitySnapshot(label)
    return { artifactRef: this.reference(snapshot.file), excerpt: snapshot.excerpt }
  }

  private async advanceClock(input: unknown): Promise<unknown> {
    this.requireReproducing('advance_controlled_clock')
    if (!allowsControlledClock(this.options.manifest.scenarioId)) {
      throw policyBlocked(`Scenario ${this.options.manifest.scenarioId} installs no controlled clock`)
    }
    const args = requireObject(input, 'advance_controlled_clock')
    requireKnownKeys(args, ['ms'], 'advance_controlled_clock')
    const ms = Number(args.ms)
    if (!Number.isInteger(ms) || ms < 1 || ms > 180_000) throw new InvestigationError('INVALID_ARGUMENTS', 'ms must be an integer between 1 and 180000')
    this.ledger.spend('clockAdvances')
    await this.options.driver.advanceClock(ms)
    return { advancedMs: ms }
  }

  private async runOracle(input: unknown): Promise<ReproductionOracleResult> {
    this.requireReproducing('run_oracle')
    requireKnownKeys(requireObject(input, 'run_oracle'), [], 'run_oracle')
    this.ledger.spend('oracleRuns')
    const result = await this.options.driver.runOracle()
    this.reproductionOracleResult = result
    this.state = 'judged'
    return result
  }

  private async submitFinding(input: unknown): Promise<{ accepted: true; findingId: string; classification: string }> {
    const args = requireObject(input, 'submit_finding')
    requireKnownKeys(args, ['finding'], 'submit_finding')
    let narrative
    try {
      narrative = validateNarrative(args.finding)
    } catch (error) {
      if (error instanceof InvestigationError && error.code === 'POLICY_BLOCKED') {
        this.policyBlockedLatch = true
        narrative = {
          expectedBehavior: 'Not recorded: the submitted finding named a deterministic authority field.',
          observedBehavior: 'Not recorded: the submitted finding named a deterministic authority field.',
          reasoningSummary: error.message,
          evidenceRefs: [],
          hypotheses: [{ statement: 'Narrative discarded after an unauthorized submission.', evidenceRefs: [], confidence: 'low' as const }],
        }
      } else throw error
    }
    const originalViolations = await readSafetyViolations(this.options.runDirectory)
    const facts: DeterministicFacts = {
      findingId: this.options.findingId,
      sourceRunId: this.options.manifest.runId,
      scenarioId: this.options.manifest.scenarioId,
      sourceCommit: this.options.manifest.sourceIdentity.headCommit,
      checkouts: this.options.checkouts,
      failedOracle: this.options.manifest.failedOracle,
      probesSelected: [...this.probes],
      reproductionSequence: [...this.steps],
      reproductionOracleResult: this.reproductionOracleResult,
      safetyViolations: [...originalViolations, ...this.options.driver.safetyViolations()],
      model: this.options.model,
      usage: this.usageSummary(),
      policyBlocked: this.policyBlockedLatch,
      budgetExhausted: this.ledger.isExhausted() || (this.options.cost?.isExhausted() ?? false),
    }
    const finding = buildFinding(facts, narrative)
    const destination = path.join(this.options.directories.directory, 'finding.json')
    await writeFile(destination, `${JSON.stringify(finding, null, 2)}\n`, { mode: 0o600, flag: 'wx' })
    this.finding = finding
    this.state = 'done'
    return { accepted: true, findingId: finding.findingId, classification: finding.classification }
  }

  /** Fold the recorded requests into the finding's usage field. */
  private usageSummary(): DeterministicFacts['usage'] {
    const requests = [...this.options.cost?.records() ?? []]
    return {
      toolCalls: this.toolCalls,
      cacheHitTokens: requests.reduce((total, item) => total + item.cacheHitTokens, 0),
      cacheMissTokens: requests.reduce((total, item) => total + item.cacheMissTokens, 0),
      completionTokens: requests.reduce((total, item) => total + item.completionTokens, 0),
      costUsd: this.options.cost?.totalUsd() ?? 0,
      requests,
    }
  }

  private safeLabel(value: unknown, tool: string): string {
    if (typeof value !== 'string' || !/^[a-z0-9-]{1,40}$/.test(value)) {
      throw new InvestigationError('INVALID_ARGUMENTS', `${tool} label must match [a-z0-9-]{1,40}`)
    }
    return value
  }

  private reference(absolutePath: string): string {
    return evidenceReference(this.options.directories.approvedRoot, absolutePath)
  }
}

export { INVESTIGATION_BUDGET }
