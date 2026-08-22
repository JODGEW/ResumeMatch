import { policyBlocked } from './errors'
import type { ScenarioId } from '../browser/types'

/** Routes named semantically; the concrete path comes from the scenario, never from the caller. */
export type SemanticRoute = 'sample' | 'upload' | 'results'

/** Semantic page states a reproduction may wait for. */
export type SemanticState = 'upload_ready' | 'processing' | 'completed_report' | 'failed_report' | 'timeout_report'

/** Accessible names a reproduction may click. Every entry is a string Phase 1 already drives or asserts. */
export const APPROVED_CLICK_NAMES = [
  'Analyze Resume',
  'New analysis',
  'Check again',
  'Upload again',
  'Go to History',
  'Start a new analysis',
] as const

export type ApprovedClickName = (typeof APPROVED_CLICK_NAMES)[number]

/** Roles a reproduction may inspect. Closed so no selector language is reachable. */
export const INSPECTABLE_ROLES = ['button', 'link', 'heading', 'status', 'alert', 'dialog', 'region', 'textbox', 'paragraph'] as const

export type InspectableRole = (typeof INSPECTABLE_ROLES)[number]

export type AllowedAction =
  | { kind: 'open_route'; route: SemanticRoute }
  | { kind: 'fill_synthetic_text'; field: 'job_description' }
  | { kind: 'attach_synthetic_file'; file: 'qa_synthetic_resume' }
  | { kind: 'click_by_role'; role: 'button' | 'link'; name: ApprovedClickName }
  | { kind: 'wait_for_state'; state: SemanticState }

interface ScenarioActionPolicy {
  routes: SemanticRoute[]
  states: SemanticState[]
  fill: boolean
  attach: boolean
  clock: boolean
}

/** What each scenario's own definition makes reachable. Nothing else is authorized. */
const SCENARIO_POLICY: Record<ScenarioId, ScenarioActionPolicy> = {
  'P1-01': { routes: ['sample'], states: [], fill: false, attach: false, clock: false },
  'P1-02': { routes: ['upload', 'results'], states: ['upload_ready', 'processing', 'completed_report'], fill: true, attach: true, clock: false },
  'P1-03': { routes: ['upload', 'results'], states: ['upload_ready', 'processing', 'completed_report'], fill: true, attach: false, clock: false },
  'P1-04': { routes: ['results'], states: ['processing', 'failed_report'], fill: false, attach: false, clock: false },
  'P1-05': { routes: ['results'], states: ['processing', 'timeout_report'], fill: false, attach: false, clock: true },
  'P1-06': { routes: ['sample'], states: [], fill: false, attach: false, clock: false },
}

/** The analysis id each scenario's contract router accepts, or null when it has none. */
const SCENARIO_ANALYSIS_ID: Record<ScenarioId, string | null> = {
  'P1-01': null, 'P1-02': 'qa-new-1', 'P1-03': 'qa-reuse-1', 'P1-04': 'qa-failed-1', 'P1-05': 'qa-timeout-1', 'P1-06': null,
}

/** Whether this scenario may advance the controlled clock; only P1-05 installs one. */
export function allowsControlledClock(scenarioId: ScenarioId): boolean {
  return SCENARIO_POLICY[scenarioId].clock
}

/** The actions this scenario authorizes, for the model-facing tool description. */
export function scenarioActionPolicy(scenarioId: ScenarioId): ScenarioActionPolicy {
  return SCENARIO_POLICY[scenarioId]
}

/**
 * Validate one untrusted action against the closed grammar and this scenario's policy.
 * @throws `POLICY_BLOCKED` for anything the scenario does not authorize.
 */
export function validateAction(scenarioId: ScenarioId, input: unknown): AllowedAction {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw policyBlocked('An action must be an object')
  const candidate = input as Record<string, unknown>
  const policy = SCENARIO_POLICY[scenarioId]
  switch (candidate.kind) {
    case 'open_route': {
      const route = candidate.route
      if (!policy.routes.includes(route as SemanticRoute)) throw policyBlocked(`Scenario ${scenarioId} does not define the route ${String(route)}`)
      if (Object.keys(candidate).length !== 2) throw policyBlocked('open_route accepts only kind and route')
      return { kind: 'open_route', route: route as SemanticRoute }
    }
    case 'fill_synthetic_text': {
      if (!policy.fill || candidate.field !== 'job_description') throw policyBlocked(`Scenario ${scenarioId} does not authorize filling ${String(candidate.field)}`)
      if (Object.keys(candidate).length !== 2) throw policyBlocked('fill_synthetic_text accepts only kind and field')
      return { kind: 'fill_synthetic_text', field: 'job_description' }
    }
    case 'attach_synthetic_file': {
      if (!policy.attach || candidate.file !== 'qa_synthetic_resume') throw policyBlocked(`Scenario ${scenarioId} does not authorize attaching ${String(candidate.file)}`)
      if (Object.keys(candidate).length !== 2) throw policyBlocked('attach_synthetic_file accepts only kind and file')
      return { kind: 'attach_synthetic_file', file: 'qa_synthetic_resume' }
    }
    case 'click_by_role': {
      if (candidate.role !== 'button' && candidate.role !== 'link') throw policyBlocked('click_by_role accepts only the button and link roles')
      if (!APPROVED_CLICK_NAMES.includes(candidate.name as ApprovedClickName)) throw policyBlocked(`Accessible name ${String(candidate.name)} is not on the approved click list`)
      if (Object.keys(candidate).length !== 3) throw policyBlocked('click_by_role accepts only kind, role, and name')
      return { kind: 'click_by_role', role: candidate.role, name: candidate.name as ApprovedClickName }
    }
    case 'wait_for_state': {
      if (!policy.states.includes(candidate.state as SemanticState)) throw policyBlocked(`Scenario ${scenarioId} does not define the state ${String(candidate.state)}`)
      if (Object.keys(candidate).length !== 2) throw policyBlocked('wait_for_state accepts only kind and state')
      return { kind: 'wait_for_state', state: candidate.state as SemanticState }
    }
    default:
      throw policyBlocked(`Unsupported action kind: ${String(candidate.kind)}`)
  }
}

/**
 * Resolve a semantic route to the one path this scenario's router accepts.
 * @throws `POLICY_BLOCKED` when the scenario has no such route.
 */
export function resolveRoute(scenarioId: ScenarioId, route: SemanticRoute): string {
  if (route === 'sample') return '/sample'
  if (route === 'upload') return '/upload'
  const analysisId = SCENARIO_ANALYSIS_ID[scenarioId]
  if (analysisId === null) throw policyBlocked(`Scenario ${scenarioId} has no results route`)
  return `/results/${analysisId}`
}

/** Validate an inspection target: a closed role plus a bounded accessible name. */
export function validateInspectionTarget(input: unknown): { role: InspectableRole; name?: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw policyBlocked('An inspection target must be an object')
  const candidate = input as Record<string, unknown>
  if (!INSPECTABLE_ROLES.includes(candidate.role as InspectableRole)) throw policyBlocked(`Role ${String(candidate.role)} is not inspectable`)
  const extra = Object.keys(candidate).filter(key => key !== 'role' && key !== 'name')
  if (extra.length > 0) throw policyBlocked(`An inspection target accepts only role and name, not ${extra.join(', ')}`)
  if (candidate.name === undefined) return { role: candidate.role as InspectableRole }
  if (typeof candidate.name !== 'string' || candidate.name.length === 0 || candidate.name.length > 120 || /[\n\r]/.test(candidate.name)) {
    throw policyBlocked('An accessible name must be a single line of at most 120 characters')
  }
  return { role: candidate.role as InspectableRole, name: candidate.name }
}
