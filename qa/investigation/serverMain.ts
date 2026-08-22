import { randomUUID } from 'node:crypto'
import { createInterface } from 'node:readline'
import path from 'node:path'
import process from 'node:process'

import { INVESTIGATION_BUDGET } from './budget'
import { InvestigationError } from './errors'
import { readManifest } from './evidenceReader'
import { approvedArtifactRoot, createInvestigationDirectory, newInvestigationId, resolveAcceptedRunDirectory } from './paths'
import { PlaywrightReproduction } from './reproduction'
import { InvestigationSession } from './session'
import { scenarioActionPolicy } from './actions'
import { triageAcceptedManifest } from './triage'

interface Request {
  id?: number
  tool?: string
  args?: unknown
  control?: 'status' | 'usage' | 'close'
  usage?: { inputTokens: number; outputTokens: number }
}

function argumentValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  return index === -1 ? undefined : process.argv[index + 1]
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

  const investigationId = newInvestigationId()
  const findingId = `f-${randomUUID()}`
  const directories = await createInvestigationDirectory(approvedRoot, investigationId)
  const driver = new PlaywrightReproduction(manifest.scenarioId, directories.reproductionDirectory)
  const session = new InvestigationSession({
    investigationId, findingId, runDirectory, manifest, directories, driver,
    model: { provider: argumentValue('--model-provider') ?? 'unknown', modelId: argumentValue('--model-id') ?? 'unknown' },
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
      session.recordUsage({ inputTokens: request.usage?.inputTokens ?? 0, outputTokens: request.usage?.outputTokens ?? 0 })
      write({ id: request.id, ok: true, result: { recorded: true } })
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
