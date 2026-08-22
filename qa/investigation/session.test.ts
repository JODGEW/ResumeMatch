import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { beforeEach, describe, expect, it } from 'vitest'

import { InvestigationSession, type ReproductionDriver } from './session'
import { createInvestigationDirectory, newInvestigationId } from './paths'
import type { AllowedAction } from './actions'
import type { ReproductionOracleResult } from './finding'
import type { EvidenceManifest, NetworkEvent, SafetyViolation } from '../browser/types'

class FakeDriver implements ReproductionDriver {
  started = 0
  actions: AllowedAction[] = []
  clockMs = 0
  oracle: ReproductionOracleResult = { oracleStatus: 'failed', failedOracle: 'P1-04_FAILURE_TITLE', failures: [] }
  events: NetworkEvent[] = []
  violations: SafetyViolation[] = []
  constructor(private readonly reproductionDirectory: string) {}
  async start(): Promise<void> { this.started += 1 }
  async executeAction(action: AllowedAction): Promise<{ semanticState: string }> { this.actions.push(action); return { semanticState: 'ok' } }
  async inspect(): Promise<{ present: boolean; visible: boolean; count: number; text: string | null }> {
    return { present: true, visible: true, count: 1, text: 'QA synthetic' }
  }
  async captureRegionScreenshot(label: string): Promise<string> {
    const file = path.join(this.reproductionDirectory, `${label}.png`)
    await writeFile(file, 'png')
    return file
  }
  async captureAccessibilitySnapshot(label: string): Promise<{ file: string; excerpt: string }> {
    const file = path.join(this.reproductionDirectory, `${label}.yaml`)
    await writeFile(file, '- heading "QA"')
    return { file, excerpt: '- heading "QA"' }
  }
  async advanceClock(ms: number): Promise<void> { this.clockMs += ms }
  async runOracle(): Promise<ReproductionOracleResult> { return this.oracle }
  networkEvents(): NetworkEvent[] { return this.events }
  safetyViolations(): SafetyViolation[] { return this.violations }
  async close(): Promise<void> {}
}

const RUN_ID = `p1-04-${randomUUID()}`
let approvedRoot: string
let runDirectory: string
let driver: FakeDriver
let session: InvestigationSession
let findingId: string
let investigationDirectory: string

const NARRATIVE = {
  expectedBehavior: 'The failed analysis renders a recovery state.',
  observedBehavior: 'The failure heading never appeared.',
  reasoningSummary: 'The terminal response was treated as in progress.',
  evidenceRefs: [] as string[],
  hypotheses: [{ statement: 'Terminal status is misclassified.', evidenceRefs: [] as string[], confidence: 'high' }],
}

function manifest(): EvidenceManifest {
  return {
    runId: RUN_ID, scenarioId: 'P1-04', failedOracle: 'P1-04_FAILURE_TITLE',
    sourceIdentity: { headCommit: 'a'.repeat(40), worktreeDirty: false, exactCommittedSource: true, releaseGrade: false },
    failures: [{ phase: 'scenario', kind: 'oracle', message: 'missing', oracleId: 'P1-04_FAILURE_TITLE' }],
  } as unknown as EvidenceManifest
}

beforeEach(async () => {
  approvedRoot = await realpath(await mkdtemp(path.join(tmpdir(), 'qa-session-')))
  runDirectory = path.join(approvedRoot, 'runs', RUN_ID)
  await mkdir(runDirectory, { recursive: true })
  await writeFile(path.join(runDirectory, 'manifest.json'), JSON.stringify(manifest()))
  await writeFile(path.join(runDirectory, 'safety-violations.json'), JSON.stringify([]))
  await writeFile(path.join(runDirectory, 'network-events.json'), JSON.stringify([]))
  await writeFile(path.join(runDirectory, 'page-errors.json'), JSON.stringify([]))
  await writeFile(path.join(runDirectory, 'console-events.json'), JSON.stringify([{ type: 'error', text: 'boom' }, { type: 'log', text: 'x' }]))
  const investigationId = newInvestigationId()
  findingId = `f-${randomUUID()}`
  const directories = await createInvestigationDirectory(approvedRoot, investigationId)
  investigationDirectory = directories.directory
  driver = new FakeDriver(directories.reproductionDirectory)
  session = new InvestigationSession({
    investigationId, findingId, runDirectory, manifest: manifest(), directories, driver,
    model: { provider: 'fake', modelId: 'fake-1' },
  })
})

describe('lifecycle', () => {
  it('runs read, reproduce, judge, submit and classifies confirmed', async () => {
    await session.call('read_failed_assertion', {})
    await session.call('start_fresh_reproduction', {})
    expect(driver.started).toBe(1)
    await session.call('execute_allowed_action', { action: { kind: 'open_route', route: 'results' } })
    const oracle = await session.call('run_oracle', {}) as ReproductionOracleResult
    expect(oracle.failedOracle).toBe('P1-04_FAILURE_TITLE')
    const submitted = await session.call('submit_finding', { finding: NARRATIVE }) as { classification: string }
    expect(submitted.classification).toBe('confirmed')
    const persisted = JSON.parse(await readFile(path.join(investigationDirectory, 'finding.json'), 'utf8'))
    expect(persisted.classification).toBe('confirmed')
    expect(persisted.findingId).toBe(findingId)
    expect(persisted.sourceCommit).toBe('a'.repeat(40))
    expect(persisted.probesSelected).toEqual(['read_failed_assertion'])
    expect(persisted.reproductionSequence).toHaveLength(1)
    expect(session.status().state).toBe('done')
  })

  it('classifies a passing reproduction as not reproduced', async () => {
    driver.oracle = { oracleStatus: 'passed', failedOracle: null, failures: [] }
    await session.call('start_fresh_reproduction', {})
    await session.call('run_oracle', {})
    await session.call('submit_finding', { finding: NARRATIVE })
    expect(session.submittedFinding()?.classification).toBe('not_reproduced')
  })

  it('refuses a second reproduction', async () => {
    await session.call('start_fresh_reproduction', {})
    await expect(session.call('start_fresh_reproduction', {})).rejects.toMatchObject({ code: 'INVALID_STATE' })
    expect(driver.started).toBe(1)
  })

  it('refuses browser actions before a reproduction exists', async () => {
    await expect(session.call('execute_allowed_action', { action: { kind: 'open_route', route: 'results' } }))
      .rejects.toMatchObject({ code: 'INVALID_STATE' })
    await expect(session.call('run_oracle', {})).rejects.toMatchObject({ code: 'INVALID_STATE' })
  })

  it('refuses a reproduction pointed at another run', async () => {
    await expect(session.call('start_fresh_reproduction', { sourceRunId: 'p1-01-11111111-1111-4111-8111-111111111111' }))
      .rejects.toMatchObject({ code: 'POLICY_BLOCKED' })
  })
})

describe('authorization latches', () => {
  it('latches policy_blocked after an unauthorized action and forces the classification', async () => {
    await session.call('start_fresh_reproduction', {})
    await expect(session.call('execute_allowed_action', { action: { kind: 'open_route', route: 'sample' } }))
      .rejects.toMatchObject({ code: 'POLICY_BLOCKED' })
    await expect(session.call('read_page_errors', {})).rejects.toMatchObject({ code: 'POLICY_BLOCKED' })
    await session.call('submit_finding', { finding: NARRATIVE })
    expect(session.submittedFinding()?.classification).toBe('policy_blocked')
  })

  it('blocks an unsupported tool name', async () => {
    await expect(session.call('read_file', { path: '/etc/passwd' })).rejects.toMatchObject({ code: 'POLICY_BLOCKED' })
  })

  it('blocks the controlled clock outside the timeout scenario', async () => {
    await session.call('start_fresh_reproduction', {})
    await expect(session.call('advance_controlled_clock', { ms: 1000 })).rejects.toMatchObject({ code: 'POLICY_BLOCKED' })
  })

  it('forces inconclusive when the probe budget is exhausted', async () => {
    for (let index = 0; index < 6; index += 1) await session.call('read_page_errors', {})
    await expect(session.call('read_page_errors', {})).rejects.toMatchObject({ code: 'BUDGET_EXHAUSTED' })
    await session.call('start_fresh_reproduction', {})
    await session.call('run_oracle', {})
    await session.call('submit_finding', { finding: NARRATIVE })
    expect(session.submittedFinding()?.classification).toBe('inconclusive')
  })

  it('exhausts the action budget after eight actions', async () => {
    await session.call('start_fresh_reproduction', {})
    for (let index = 0; index < 8; index += 1) {
      await session.call('execute_allowed_action', { action: { kind: 'open_route', route: 'results' } })
    }
    await expect(session.call('execute_allowed_action', { action: { kind: 'open_route', route: 'results' } }))
      .rejects.toMatchObject({ code: 'BUDGET_EXHAUSTED' })
    expect(driver.actions).toHaveLength(8)
  })

  it('allows only one oracle run', async () => {
    await session.call('start_fresh_reproduction', {})
    await session.call('run_oracle', {})
    await expect(session.call('run_oracle', {})).rejects.toMatchObject({ code: 'INVALID_STATE' })
  })
})

describe('evidence containment', () => {
  it('returns reproduction artifacts as references inside the approved root', async () => {
    await session.call('start_fresh_reproduction', {})
    const shot = await session.call('capture_region_screenshot', { label: 'timeout-state' }) as { artifactRef: string }
    expect(shot.artifactRef).toMatch(/^investigations\/inv-[0-9a-f-]{36}\/reproduction\/timeout-state\.png$/)
    const aria = await session.call('capture_accessibility_snapshot', { label: 'aria' }) as { artifactRef: string; excerpt: string }
    expect(aria.artifactRef).toMatch(/^investigations\/inv-[0-9a-f-]{36}\/reproduction\/aria\.yaml$/)
    expect(aria.excerpt).toContain('heading')
  })

  it('refuses a traversal label', async () => {
    await session.call('start_fresh_reproduction', {})
    await expect(session.call('capture_region_screenshot', { label: '../escape' })).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' })
  })

  it('never writes into the accepted run bundle', async () => {
    await session.call('start_fresh_reproduction', {})
    await session.call('capture_region_screenshot', { label: 'shot' })
    await session.call('run_oracle', {})
    await session.call('submit_finding', { finding: NARRATIVE })
    const { readdir } = await import('node:fs/promises')
    expect((await readdir(runDirectory)).sort()).toEqual([
      'console-events.json', 'manifest.json', 'network-events.json', 'page-errors.json', 'safety-violations.json',
    ])
  })
})

describe('probe arguments', () => {
  it('filters console events by type and bounds the limit', async () => {
    expect(await session.call('read_console_events', { typeFilter: 'error' })).toEqual([{ type: 'error', text: 'boom' }])
    await expect(session.call('read_console_events', { limit: 0 })).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' })
    await expect(session.call('read_console_events', { grep: 'x' })).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' })
  })
})
