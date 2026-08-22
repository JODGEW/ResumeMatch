import { randomUUID } from 'node:crypto'
import { createInterface } from 'node:readline'
import path from 'node:path'
import process from 'node:process'

import { INVESTIGATION_BUDGET } from './budget'
import { CostLedger, INVESTIGATION_COST_LIMIT_USD } from './cost'
import type { PeakWindow } from './cost'
import { InvestigationError } from './errors'
import { readManifest } from './evidenceReader'
import { approvedArtifactRoot, createInvestigationDirectory, newInvestigationId, resolveAcceptedRunDirectory } from './paths'
import { buildDigest, detectSourceDrift, sourceDigest } from './evalRunner/digest'
import { PlaywrightReproduction } from './reproduction'
import { InvestigationSession } from './session'
import { scenarioActionPolicy } from './actions'
import { triageAcceptedManifest } from './triage'

interface Request {
  id?: number
  tool?: string
  args?: unknown
  control?: 'status' | 'usage' | 'close'
  usage?: { cacheHitTokens: number; cacheMissTokens: number; completionTokens: number; requestedAt?: string }
}

/**
 * Build the cost gate from the adapter's pricing configuration.
 *
 * Absent rates mean a keyless run, which spends nothing and needs no gate; a
 * partially supplied pair is a configuration error rather than a free run.
 * @returns the ledger, or undefined for a keyless run.
 */
function costLedger(): CostLedger | undefined {
  const input = argumentValue('--input-rate')
  const output = argumentValue('--output-rate')
  if (input === undefined && output === undefined) return undefined
  const inputPerMillion = Number(input)
  const outputPerMillion = Number(output)
  if (!Number.isFinite(inputPerMillion) || !Number.isFinite(outputPerMillion) || inputPerMillion < 0 || outputPerMillion < 0) {
    throw new Error('investigate requires both --input-rate and --output-rate as non-negative USD per million tokens')
  }
  const limit = argumentValue('--cost-limit')
  const windows = argumentValue('--peak-windows')
  let peakWindows: PeakWindow[] | undefined
  if (windows !== undefined) {
    peakWindows = windows.split(',').map(entry => {
      const [start, end] = entry.split('-').map(Number)
      if (!Number.isInteger(start) || !Number.isInteger(end)) {
        throw new Error('--peak-windows must be comma-separated <startMinutes>-<endMinutes> past UTC midnight')
      }
      return { startMinutes: start, endMinutes: end }
    })
  }
  return new CostLedger(
    { inputPerMillion, outputPerMillion },
    limit === undefined ? INVESTIGATION_COST_LIMIT_USD : Number(limit),
    peakWindows,
  )
}

function argumentValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  return index === -1 ? undefined : process.argv[index + 1]
}

/**
 * Read one checkout identity from the command line.
 *
 * The adapter is the only caller that can see the harness and adapter
 * checkouts, so it supplies all three; anything that is not a full commit is
 * recorded as unknown rather than trusted.
 * @param flag - the argument naming the checkout.
 * @returns a full lowercase commit, or `unknown`.
 */
function checkoutCommit(flag: string): string {
  const value = argumentValue(flag)
  return value !== undefined && /^[0-9a-f]{40}$/.test(value) ? value : 'unknown'
}

function write(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`)
}

/**
 * Line-protocol front end for one investigation.
 *
 * One JSON request per stdin line, one JSON response per stdout line. Every
 * refusal is a structured `error` payload rather than an exit, so the adapter
 * can hand the code back to the model without ending the investigation.
 */
async function main(): Promise<number> {
  const runId = argumentValue('--run-id')
  if (runId === undefined) {
    write({ ready: false, error: { code: 'INVALID_ARGUMENTS', message: 'investigate requires --run-id' } })
    return 2
  }
  const approvedRoot = approvedArtifactRoot()
  const runDirectory = await resolveAcceptedRunDirectory(approvedRoot, runId)
  const manifest = await readManifest(runDirectory)
  const triage = triageAcceptedManifest(manifest)
  if (triage.decision !== 'investigate') {
    write({ ready: false, triage, error: { code: 'NOT_INVESTIGABLE', message: `Triage decision ${triage.decision}: ${triage.reason}` } })
    return 3
  }

  // An evaluation bundle must be investigated against the same mutated source
  // and build it failed on. `investigate` rebuilds, so the digests are compared
  // rather than assumed; a release bundle carries no identity and skips this.
  if (manifest.evaluationIdentity !== null) {
    const drift = detectSourceDrift(manifest.evaluationIdentity, {
      sourceDigest: await sourceDigest(process.cwd()),
      buildDigest: await buildDigest(path.join(process.cwd(), '.qa-dist')),
    })
    if (drift.drifted) {
      write({
        ready: false,
        error: {
          code: 'EVALUATION_SOURCE_DRIFT',
          message: `Evaluation checkout no longer matches the failing run: ${drift.fields.join(', ')}`,
        },
      })
      return 5
    }
  }

  const investigationId = newInvestigationId()
  const findingId = `f-${randomUUID()}`
  const directories = await createInvestigationDirectory(approvedRoot, investigationId)
  const cost = costLedger()
  const driver = new PlaywrightReproduction(manifest.scenarioId, directories.reproductionDirectory)
  const session = new InvestigationSession({
    investigationId, findingId, runDirectory, manifest, directories, driver,
    model: { provider: argumentValue('--model-provider') ?? 'unknown', modelId: argumentValue('--model-id') ?? 'unknown' },
    checkouts: {
      resumematchCommit: checkoutCommit('--resumematch-commit'),
      harnessCommit: checkoutCommit('--harness-commit'),
      adapterCommit: checkoutCommit('--adapter-commit'),
    },
    ...cost === undefined ? {} : { cost },
  })

  write({
    ready: true,
    investigationId,
    findingId,
    sourceRunId: manifest.runId,
    scenarioId: manifest.scenarioId,
    failedOracle: manifest.failedOracle,
    sourceCommit: manifest.sourceIdentity.headCommit,
    budget: INVESTIGATION_BUDGET,
    actionPolicy: scenarioActionPolicy(manifest.scenarioId),
    findingPath: path.relative(approvedRoot, path.join(directories.directory, 'finding.json')),
  })

  const input = createInterface({ input: process.stdin, crlfDelay: Infinity })
  for await (const line of input) {
    if (line.trim().length === 0) continue
    let request: Request
    try {
      request = JSON.parse(line) as Request
    } catch {
      write({ ok: false, error: { code: 'INVALID_ARGUMENTS', message: 'Each request must be one JSON object per line' } })
      continue
    }
    if (request.control === 'close') break
    if (request.control === 'status') {
      write({ id: request.id, ok: true, result: session.status() })
      continue
    }
    if (request.control === 'usage') {
      const requestedAt = request.usage?.requestedAt
      session.recordUsage({
        cacheHitTokens: request.usage?.cacheHitTokens ?? 0,
        cacheMissTokens: request.usage?.cacheMissTokens ?? 0,
        completionTokens: request.usage?.completionTokens ?? 0,
      }, requestedAt === undefined ? new Date() : new Date(requestedAt))
      write({ id: request.id, ok: true, result: { recorded: true }, status: session.status() })
      continue
    }
    if (typeof request.tool !== 'string') {
      write({ id: request.id, ok: false, error: { code: 'INVALID_ARGUMENTS', message: 'A request needs a tool name' } })
      continue
    }
    try {
      const result = await session.call(request.tool, request.args)
      write({ id: request.id, ok: true, result, status: session.status() })
    } catch (error) {
      const code = error instanceof InvestigationError ? error.code : 'REPRODUCTION_FAILED'
      write({
        id: request.id, ok: false,
        error: { code, message: error instanceof Error ? error.message : String(error) },
        status: session.status(),
      })
    }
  }

  await driver.close()
  const finding = session.submittedFinding()
  write({ closed: true, submitted: finding !== null, classification: finding?.classification ?? null })
  return finding === null ? 4 : 0
}

process.exitCode = await main()
