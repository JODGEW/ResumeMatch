import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, realpath, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { beforeAll, describe, expect, it } from 'vitest'

import { InvestigationError } from './errors'
import { countRequests, failedAssertion, filterEvents, readConsoleEvents, readEvidence, readManifest } from './evidenceReader'
import { createInvestigationDirectory, evidenceReference, isInvestigationId, newInvestigationId, resolveAcceptedRunDirectory } from './paths'
import type { EvidenceManifest, NetworkEvent } from '../browser/types'

const RUN_ID = `p1-04-${randomUUID()}`
let approvedRoot: string
let runDirectory: string

function networkEvent(overrides: Partial<NetworkEvent>): NetworkEvent {
  return {
    sequence: 1, relativeTimestampMs: 0, method: 'GET', resourceType: 'xhr',
    originAlias: 'resumematch-api-sentinel', routeTemplate: '/analysis/:analysisId', queryKeys: ['userId'],
    status: 200, durationMs: 1, mockDecision: 'fulfilled-contract', requestFields: [],
    ...overrides,
  }
}

beforeAll(async () => {
  approvedRoot = await realpath(await mkdtemp(path.join(tmpdir(), 'qa-investigation-')))
  runDirectory = path.join(approvedRoot, 'runs', RUN_ID)
  await mkdir(runDirectory, { recursive: true })
  await writeFile(path.join(runDirectory, 'manifest.json'), JSON.stringify({
    runId: RUN_ID, scenarioId: 'P1-04', failedOracle: 'P1-04_FAILURE_TITLE',
    failures: [{ phase: 'scenario', kind: 'oracle', message: 'Expected visible element was not found', oracleId: 'P1-04_FAILURE_TITLE' }],
  }))
  await writeFile(path.join(runDirectory, 'console-events.json'), JSON.stringify([{ type: 'error', text: 'qa-synthetic console' }]))
  await writeFile(path.join(runDirectory, 'page-errors.json'), JSON.stringify([]))
  await symlink(path.join(runDirectory, 'console-events.json'), path.join(runDirectory, 'network-events.json'))
})

describe('accepted-run containment', () => {
  it('resolves a real accepted run directory', async () => {
    await expect(resolveAcceptedRunDirectory(approvedRoot, RUN_ID)).resolves.toContain(RUN_ID)
  })

  it('refuses an id that Phase 1 could not have generated', async () => {
    await expect(resolveAcceptedRunDirectory(approvedRoot, '../escape')).rejects.toThrow(/not an internally generated/)
    await expect(resolveAcceptedRunDirectory(approvedRoot, 'p1-07-00000000-0000-4000-8000-000000000001')).rejects.toThrow()
  })

  it('refuses a symlinked run directory', async () => {
    const symlinkedId = `p1-01-${randomUUID()}`
    await symlink(runDirectory, path.join(approvedRoot, 'runs', symlinkedId))
    await expect(resolveAcceptedRunDirectory(approvedRoot, symlinkedId)).rejects.toThrow(/not a real directory/)
  })
})

describe('investigation write root', () => {
  it('creates a contained investigation directory separate from runs', async () => {
    const id = newInvestigationId()
    expect(isInvestigationId(id)).toBe(true)
    const directories = await createInvestigationDirectory(approvedRoot, id)
    expect(directories.directory).toBe(path.join(approvedRoot, 'investigations', id))
    expect(directories.reproductionDirectory).toBe(path.join(directories.directory, 'reproduction'))
    expect(evidenceReference(approvedRoot, path.join(directories.directory, 'finding.json'))).toBe(`investigations/${id}/finding.json`)
  })

  it('refuses an externally supplied investigation id', async () => {
    await expect(createInvestigationDirectory(approvedRoot, 'inv-../../etc')).rejects.toThrow(/not an internally generated/)
  })

  it('refuses an evidence reference outside the approved root', () => {
    expect(() => evidenceReference(approvedRoot, '/etc/passwd')).toThrow(/escapes the approved root/)
  })
})

describe('evidence reads', () => {
  it('reads an accepted artifact', async () => {
    expect(await readConsoleEvents(runDirectory)).toEqual([{ type: 'error', text: 'qa-synthetic console' }])
  })

  it('refuses a symlinked artifact', async () => {
    await expect(readEvidence(runDirectory, 'networkEvents')).rejects.toBeInstanceOf(InvestigationError)
    await expect(readEvidence(runDirectory, 'networkEvents')).rejects.toMatchObject({ code: 'EVIDENCE_UNAVAILABLE' })
  })

  it('reports a missing artifact as unavailable rather than throwing raw', async () => {
    await expect(readEvidence(runDirectory, 'safetyViolations')).rejects.toMatchObject({ code: 'EVIDENCE_UNAVAILABLE' })
  })

  it('projects the failed assertion without inventing expected or actual values', async () => {
    const manifest = await readManifest(runDirectory) as EvidenceManifest
    const assertion = failedAssertion(manifest)
    expect(assertion.failedOracle).toBe('P1-04_FAILURE_TITLE')
    expect(Object.keys(assertion)).toEqual(['failedOracle', 'failures'])
  })
})

describe('normalized network probes', () => {
  const events = [
    networkEvent({ sequence: 1 }),
    networkEvent({ sequence: 2, originAlias: 's3-sentinel', routeTemplate: '/synthetic-upload', method: 'POST', mockDecision: 'fulfilled-contract' }),
    networkEvent({ sequence: 3, mockDecision: 'blocked', status: null }),
  ]

  it('counts by a closed dimension', () => {
    expect(countRequests(events, 'originAlias')).toEqual({ 'resumematch-api-sentinel': 2, 's3-sentinel': 1 })
    expect(countRequests(events, 'mockDecision')).toEqual({ 'fulfilled-contract': 2, blocked: 1 })
  })

  it('filters by closed dimensions', () => {
    expect(filterEvents(events, { originAlias: 's3-sentinel' })).toHaveLength(1)
    expect(filterEvents(events, { mockDecision: 'blocked' })).toHaveLength(1)
    expect(filterEvents(events, {})).toHaveLength(3)
  })
})
