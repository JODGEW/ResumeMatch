import { execFileSync } from 'node:child_process'
import { access, mkdir, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import type { BrowserContext, ConsoleMessage, Page } from '@playwright/test'

import { PLAYWRIGHT_NETWORK_ENFORCEMENT_SCOPE } from './types'
import type { ArtifactReferences, EvidenceManifest, NetworkEvent, NetworkSummary, RunFailure, SafetyViolation, ScenarioId, SourceIdentity, TransitionEvent } from './types'

interface ConsoleEvidence { type: string; text: string }

/**
 * Remove credential, token, and non-synthetic-identity patterns from text that
 * reaches an artifact. Exported so Phase 2 reproduction evidence passes through
 * the same redaction as Phase 1 console and page-error capture.
 * @param value - raw observed text.
 * @returns the redacted text.
 */
export function redactText(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/\bAKIA[A-Z0-9]{16}\b/g, '[REDACTED_AWS_ACCESS_KEY]')
    .replace(/\b[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED_TOKEN]')
    .replace(/([?&](?:x-amz-(?:signature|credential|security-token)|token|code)=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/((?:authorization|cookie|set-cookie|x-api-key|api[_-]?key)\s*[:=]\s*)(?!qa-synthetic-api-key-not-secret)[^\s,;}]+/gi, '$1[REDACTED]')
    .replace(/\b(?![^@\s]+@(qa\.invalid|example\.com)\b)[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[REDACTED_EMAIL]')
}

function readSourceIdentity(releaseEligible: boolean): SourceIdentity {
  const env = { PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin:/sbin` }
  try {
    const headCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: process.cwd(), encoding: 'utf8', env }).trim()
    const worktreeDirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: process.cwd(), encoding: 'utf8', env }).trim().length > 0
    const exactCommittedSource = !worktreeDirty
    return { headCommit, worktreeDirty, exactCommittedSource, releaseGrade: exactCommittedSource && releaseEligible }
  } catch {
    return { headCommit: null, worktreeDirty: null, exactCommittedSource: false, releaseGrade: false }
  }
}

export interface PersistEvidenceInput {
  browserVersion: string
  durationMs: number
  executionStatus: EvidenceManifest['executionStatus']
  oracleStatus: EvidenceManifest['oracleStatus']
  expectedOracleStatus: EvidenceManifest['expectedOracleStatus']
  expectationMet: boolean
  failedOracle: string | null
  failures: RunFailure[]
  networkEvents: NetworkEvent[]
  networkSummary: NetworkSummary
  transitions: TransitionEvent[]
  safetyViolations: SafetyViolation[]
}

export class EvidenceCollector {
  readonly tracePath: string
  readonly checkpointScreenshots: string[] = []
  readonly consoleEvents: ConsoleEvidence[] = []
  readonly pageErrors: string[] = []
  failureScreenshot: string | null = null
  private readonly attachedPages = new WeakSet<Page>()

  constructor(readonly runId: string, readonly scenarioId: ScenarioId, readonly runDirectory: string) {
    this.tracePath = path.join(runDirectory, 'trace.zip')
  }

  async initialize(): Promise<void> {
    await mkdir(path.join(this.runDirectory, 'video'), { mode: 0o700 })
  }

  attachToContext(context: BrowserContext): void {
    context.on('page', page => this.attach(page))
    for (const page of context.pages()) this.attach(page)
  }

  attach(page: Page): void {
    if (this.attachedPages.has(page)) return
    this.attachedPages.add(page)
    page.on('console', (message: ConsoleMessage) => this.consoleEvents.push({ type: message.type(), text: redactText(message.text()) }))
    page.on('pageerror', error => this.pageErrors.push(redactText(error.message)))
  }

  async checkpoint(page: Page, name: string): Promise<void> {
    const destination = path.join(this.runDirectory, `checkpoint-${name}.png`)
    await page.screenshot({ path: destination, fullPage: true })
    this.checkpointScreenshots.push(destination)
  }

  async captureFailure(page: Page): Promise<void> {
    const destination = path.join(this.runDirectory, 'failure.png')
    await page.screenshot({ path: destination, fullPage: true })
    this.failureScreenshot = destination
  }

  async persist(input: PersistEvidenceInput): Promise<EvidenceManifest> {
    const consolePath = await this.writeJson('console-events.json', this.consoleEvents)
    const pageErrorsPath = await this.writeJson('page-errors.json', this.pageErrors)
    const networkPath = await this.writeJson('network-events.json', input.networkEvents)
    const transitionsPath = await this.writeJson('scenario-transitions.json', input.transitions)
    const safetyPath = await this.writeJson('safety-violations.json', input.safetyViolations)
    const videos = (await readdir(path.join(this.runDirectory, 'video')))
      .filter(name => name.endsWith('.webm'))
      .map(name => path.join(this.runDirectory, 'video', name))
    const artifacts: ArtifactReferences = {
      trace: await this.fileExists(this.tracePath) ? this.reference(this.tracePath) : null,
      video: videos.map(file => this.reference(file)),
      failureScreenshot: this.failureScreenshot ? this.reference(this.failureScreenshot) : null,
      checkpointScreenshots: this.checkpointScreenshots.map(file => this.reference(file)),
      consoleEvents: this.reference(consolePath),
      pageErrors: this.reference(pageErrorsPath),
      networkEvents: this.reference(networkPath),
      transitionLog: this.reference(transitionsPath),
      safetyViolations: this.reference(safetyPath),
    }
    const manifest: EvidenceManifest = {
      runId: this.runId,
      scenarioId: this.scenarioId,
      browserVersion: input.browserVersion,
      durationMs: input.durationMs,
      sourceIdentity: readSourceIdentity(input.executionStatus === 'completed' && input.expectationMet),
      executionStatus: input.executionStatus,
      oracleStatus: input.oracleStatus,
      expectedOracleStatus: input.expectedOracleStatus,
      expectationMet: input.expectationMet,
      failedOracle: input.failedOracle,
      failures: structuredClone(input.failures),
      artifactsAccepted: true,
      networkEnforcementScope: PLAYWRIGHT_NETWORK_ENFORCEMENT_SCOPE,
      networkSummary: input.networkSummary,
      artifacts,
      opaqueArtifactValidation: [
        'Known API and S3 request bodies, mocked responses, and local build resources are positively validated against independent synthetic inputs',
        'PNG, JPEG, and WebM receive format-signature checks only; this is not semantic content redaction or OCR',
      ],
    }
    await this.writeJson('manifest.json', manifest)
    return manifest
  }

  private async writeJson(fileName: string, value: unknown): Promise<string> {
    const destination = path.join(this.runDirectory, fileName)
    await writeFile(destination, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    return destination
  }

  private reference(filePath: string): string { return path.relative(this.runDirectory, filePath) }
  private async fileExists(filePath: string): Promise<boolean> {
    try { await access(filePath); return true } catch { return false }
  }
}
