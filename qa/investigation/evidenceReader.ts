import { lstat, readFile } from 'node:fs/promises'
import path from 'node:path'

import { InvestigationError } from './errors'
import type { EvidenceManifest, NetworkEvent, RunFailure, SafetyViolation, TransitionEvent } from '../browser/types'

/** The only Phase 1 artifacts Phase 2 may read. Binary artifacts are never returned to a model. */
export const READABLE_EVIDENCE = {
  manifest: 'manifest.json',
  consoleEvents: 'console-events.json',
  pageErrors: 'page-errors.json',
  networkEvents: 'network-events.json',
  transitionLog: 'scenario-transitions.json',
  safetyViolations: 'safety-violations.json',
} as const

export type ReadableEvidence = keyof typeof READABLE_EVIDENCE

export interface ConsoleEvent { type: string; text: string }

/** The compatibility projection Phase 1 records for a failed oracle. */
export interface FailedAssertion {
  failedOracle: string | null
  failures: RunFailure[]
}

async function readJson(runDirectory: string, file: string): Promise<unknown> {
  const target = path.join(runDirectory, file)
  let stat
  try {
    stat = await lstat(target)
  } catch {
    throw new InvestigationError('EVIDENCE_UNAVAILABLE', `Evidence artifact is missing: ${file}`)
  }
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new InvestigationError('EVIDENCE_UNAVAILABLE', `Evidence artifact is not an ordinary file: ${file}`)
  }
  try {
    return JSON.parse(await readFile(target, 'utf8'))
  } catch {
    throw new InvestigationError('EVIDENCE_UNAVAILABLE', `Evidence artifact is unreadable or malformed: ${file}`)
  }
}

/** Read one accepted evidence artifact by its closed key. */
export async function readEvidence(runDirectory: string, kind: ReadableEvidence): Promise<unknown> {
  return readJson(runDirectory, READABLE_EVIDENCE[kind])
}

export async function readManifest(runDirectory: string): Promise<EvidenceManifest> {
  return await readEvidence(runDirectory, 'manifest') as EvidenceManifest
}

export async function readConsoleEvents(runDirectory: string): Promise<ConsoleEvent[]> {
  return await readEvidence(runDirectory, 'consoleEvents') as ConsoleEvent[]
}

export async function readPageErrors(runDirectory: string): Promise<string[]> {
  return await readEvidence(runDirectory, 'pageErrors') as string[]
}

export async function readNetworkEvents(runDirectory: string): Promise<NetworkEvent[]> {
  return await readEvidence(runDirectory, 'networkEvents') as NetworkEvent[]
}

export async function readTransitionLog(runDirectory: string): Promise<TransitionEvent[]> {
  return await readEvidence(runDirectory, 'transitionLog') as TransitionEvent[]
}

export async function readSafetyViolations(runDirectory: string): Promise<SafetyViolation[]> {
  return await readEvidence(runDirectory, 'safetyViolations') as SafetyViolation[]
}

/**
 * Project the failed assertion from the manifest. Phase 1 records an oracle id
 * and a human-readable message only; there is no structured expected/actual
 * pair, so none is invented here.
 */
export function failedAssertion(manifest: EvidenceManifest): FailedAssertion {
  return { failedOracle: manifest.failedOracle, failures: manifest.failures }
}

export type RequestGrouping = 'originAlias' | 'routeTemplate' | 'mockDecision' | 'method'

/** Count normalized network events by one closed dimension. */
export function countRequests(events: NetworkEvent[], groupBy: RequestGrouping): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const event of events) {
    const key = String(event[groupBy])
    counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
}

/** Filter normalized network events by the closed dimensions a probe may name. */
export function filterEvents(
  events: NetworkEvent[],
  filter: { originAlias?: string; routeTemplate?: string; mockDecision?: string },
): NetworkEvent[] {
  return events.filter(event =>
    (filter.originAlias === undefined || event.originAlias === filter.originAlias)
    && (filter.routeTemplate === undefined || event.routeTemplate === filter.routeTemplate)
    && (filter.mockDecision === undefined || event.mockDecision === filter.mockDecision))
}
