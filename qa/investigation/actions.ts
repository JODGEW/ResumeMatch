import { invalidArguments, policyBlocked } from './errors'
import type { ArgumentHelp } from './errors'
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
  /** The accessible names this scenario will click, published so a caller need not guess. */
  clickNames: readonly ApprovedClickName[]
  fill: boolean
  attach: boolean
  clock: boolean
}

/** What each scenario's own definition makes reachable. Nothing else is authorized. */
const SCENARIO_POLICY: Record<ScenarioId, ScenarioActionPolicy> = {
  'P1-01': { routes: ['sample'], states: [], clickNames: APPROVED_CLICK_NAMES, fill: false, attach: false, clock: false },
  'P1-02': { routes: ['upload', 'results'], states: ['upload_ready', 'processing', 'completed_report'], clickNames: APPROVED_CLICK_NAMES, fill: true, attach: true, clock: false },
  'P1-03': { routes: ['upload', 'results'], states: ['upload_ready', 'processing', 'completed_report'], clickNames: APPROVED_CLICK_NAMES, fill: true, attach: false, clock: false },
  'P1-04': { routes: ['results'], states: ['processing', 'failed_report'], clickNames: APPROVED_CLICK_NAMES, fill: false, attach: false, clock: false },
  'P1-05': { routes: ['results'], states: ['processing', 'timeout_report'], clickNames: APPROVED_CLICK_NAMES, fill: false, attach: false, clock: true },
  'P1-06': { routes: ['sample'], states: [], clickNames: APPROVED_CLICK_NAMES, fill: false, attach: false, clock: false },
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

/** The closed action grammar, published with every malformed-action rejection. */
export const ACTION_JSON_SCHEMA = {
  type: 'object',
  required: ['kind'],
  oneOf: [
    { properties: { kind: { const: 'open_route' }, route: { enum: ['sample', 'upload', 'results'] } }, required: ['kind', 'route'], additionalProperties: false },
    { properties: { kind: { const: 'fill_synthetic_text' }, field: { const: 'job_description' } }, required: ['kind', 'field'], additionalProperties: false },
    { properties: { kind: { const: 'attach_synthetic_file' }, file: { const: 'qa_synthetic_resume' } }, required: ['kind', 'file'], additionalProperties: false },
    { properties: { kind: { const: 'click_by_role' }, role: { enum: ['button', 'link'] }, name: { enum: APPROVED_CLICK_NAMES } }, required: ['kind', 'role', 'name'], additionalProperties: false },
    { properties: { kind: { const: 'wait_for_state' }, state: { enum: ['upload_ready', 'processing', 'completed_report', 'failed_report', 'timeout_report'] } }, required: ['kind', 'state'], additionalProperties: false },
  ],
} as const

/**
 * Schema and a scenario-appropriate example for a malformed action.
 *
 * The example names a route this scenario actually defines, so repairing
 * against it cannot produce a second refusal for a different reason.
 * @param scenarioId - the scenario under investigation.
 * @returns the repair material returned with the rejection.
 */
export function actionHelp(scenarioId: ScenarioId): ArgumentHelp {
  const policy = SCENARIO_POLICY[scenarioId]
  return {
    schema: ACTION_JSON_SCHEMA,
    example: { action: { kind: 'open_route', route: policy.routes[0] } },
    scenarioPolicy: policy,
  }
}

/**
 * Validate one untrusted action against the closed grammar and this scenario's policy.
 *
 * `POLICY_BLOCKED` is reserved for reaching outside the application: a route
 * that is not one of its own. Everything a caller could fix by reading the
 * scenario's policy — a route or state this scenario does not define, a name
 * that is not on the click list — is `INVALID_ARGUMENTS` and carries that
 * policy back, because latching an investigation for a guessable value spends
 * the whole run on a typo.
 * @param scenarioId - the scenario under investigation.
 * @param input - the untrusted action.
 * @returns the validated action.
 * @throws `INVALID_ARGUMENTS` for a fixable argument, `POLICY_BLOCKED` for an out-of-application route.
 */
export function validateAction(scenarioId: ScenarioId, input: unknown): AllowedAction {
  const help = actionHelp(scenarioId)
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    // Echo what arrived: the first live run sent a stringified JSON object seven
    // times against a message that only restated the requirement.
    const received = input === null ? 'null' : Array.isArray(input) ? 'array' : typeof input
    throw invalidArguments(`An action must be an object; received ${received}`, help)
  }
  const candidate = input as Record<string, unknown>
  const policy = SCENARIO_POLICY[scenarioId]
  const exactKeys = (count: number, names: string): void => {
    if (Object.keys(candidate).length !== count) throw invalidArguments(`${String(candidate.kind)} accepts only ${names}`, help)
  }
  switch (candidate.kind) {
    case 'open_route': {
      const route = candidate.route
      exactKeys(2, 'kind and route')
      // Anything that is not one of the application's own routes is an attempt
      // to leave it, which is the finding rather than a fixable argument.
      if (!['sample', 'upload', 'results'].includes(String(route))) throw policyBlocked(`route must name an application route, not ${String(route)}`)
      if (!policy.routes.includes(route as SemanticRoute)) {
        throw invalidArguments(`Scenario ${scenarioId} defines the routes ${policy.routes.join(', ')}, not ${String(route)}`, help)
      }
      return { kind: 'open_route', route: route as SemanticRoute }
    }
    case 'fill_synthetic_text': {
      exactKeys(2, 'kind and field')
      if (candidate.field !== 'job_description') throw invalidArguments(`field must be job_description, not ${String(candidate.field)}`, help)
      if (!policy.fill) throw invalidArguments(`Scenario ${scenarioId} has no job description to fill`, help)
      return { kind: 'fill_synthetic_text', field: 'job_description' }
    }
    case 'attach_synthetic_file': {
      exactKeys(2, 'kind and file')
      if (candidate.file !== 'qa_synthetic_resume') throw invalidArguments(`file must be qa_synthetic_resume, not ${String(candidate.file)}`, help)
      if (!policy.attach) throw invalidArguments(`Scenario ${scenarioId} reuses an existing resume and attaches no file`, help)
      return { kind: 'attach_synthetic_file', file: 'qa_synthetic_resume' }
    }
    case 'click_by_role': {
      exactKeys(3, 'kind, role, and name')
      if (candidate.role !== 'button' && candidate.role !== 'link') throw invalidArguments('role must be button or link', help)
      if (!APPROVED_CLICK_NAMES.includes(candidate.name as ApprovedClickName)) {
        throw invalidArguments(
          `Accessible name ${JSON.stringify(candidate.name)} is not on the click list; the names are ${APPROVED_CLICK_NAMES.join(', ')}`,
          help,
        )
      }
      return { kind: 'click_by_role', role: candidate.role, name: candidate.name as ApprovedClickName }
    }
    case 'wait_for_state': {
      exactKeys(2, 'kind and state')
      if (!['upload_ready', 'processing', 'completed_report', 'failed_report', 'timeout_report'].includes(String(candidate.state))) {
        throw invalidArguments(`state must be one of the five semantic states, not ${String(candidate.state)}`, help)
      }
      if (!policy.states.includes(candidate.state as SemanticState)) {
        throw invalidArguments(`Scenario ${scenarioId} defines the states ${policy.states.join(', ')}, not ${String(candidate.state)}`, help)
      }
      return { kind: 'wait_for_state', state: candidate.state as SemanticState }
    }
    default:
      throw invalidArguments(
        `action.kind must be one of open_route, fill_synthetic_text, attach_synthetic_file, click_by_role, wait_for_state; received ${String(candidate.kind)}`,
        help,
      )
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
