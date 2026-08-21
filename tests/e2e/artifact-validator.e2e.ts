import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmod, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { expect, test } from '@playwright/test'

import { validateEvidenceBundle } from '../../qa/browser/artifactValidator'
import { QA_API_ORIGIN, QA_S3_ORIGIN } from '../../qa/browser/networkPolicy'
import { runReleaseCheck } from '../../qa/browser/runReleaseCheck'
import { PLAYWRIGHT_NETWORK_ENFORCEMENT_SCOPE, type EvidenceManifest, type NetworkEvent } from '../../qa/browser/types'
import { SYNTHETIC_FILE_NAME, SYNTHETIC_JOB_DESCRIPTION } from '../../qa/fixtures/data'

const opaqueArtifactValidation = [
  'Known API and S3 request bodies, mocked responses, and local build resources are positively validated against independent synthetic inputs',
  'PNG, JPEG, and WebM receive format-signature checks only; this is not semantic content redaction or OCR',
]

function hash(value: Buffer): string { return createHash('sha1').update(value).digest('hex') }

async function writeTrace(
  bundle: string,
  networkRecords: unknown[] = [{}],
  resources: Array<{ name: string; body: Buffer }> = [],
  traceRecords: unknown[] = [{}],
): Promise<void> {
  const traceSource = path.join(bundle, '.trace-source')
  await mkdir(path.join(traceSource, 'resources'), { recursive: true })
  await writeFile(path.join(traceSource, 'trace.trace'), `${traceRecords.map(record => JSON.stringify(record)).join('\n')}\n`)
  await writeFile(path.join(traceSource, 'trace.network'), `${networkRecords.map(record => JSON.stringify(record)).join('\n')}\n`)
  for (const resource of resources) await writeFile(path.join(traceSource, 'resources', resource.name), resource.body)
  execFileSync('zip', ['-q', '-r', path.join(bundle, 'trace.zip'), 'trace.trace', 'trace.network', ...(resources.length ? ['resources'] : [])], { cwd: traceSource })
  await rm(traceSource, { recursive: true })
}

async function validBundle(bundle: string): Promise<EvidenceManifest> {
  await mkdir(path.join(bundle, 'video'), { recursive: true })
  await writeFile(path.join(bundle, 'checkpoint-sample.png'), Buffer.from('89504e470d0a1a0a', 'hex'))
  await writeFile(path.join(bundle, 'video', 'sample.webm'), Buffer.from('1a45dfa3', 'hex'))
  for (const name of ['console-events.json', 'page-errors.json', 'network-events.json', 'scenario-transitions.json', 'safety-violations.json']) {
    await writeFile(path.join(bundle, name), '[]\n')
  }
  await writeTrace(bundle)
  const manifest: EvidenceManifest = {
    runId: 'p1-01-00000000-0000-4000-8000-000000000001', scenarioId: 'P1-01', browserVersion: 'qa-chromium', durationMs: 1,
    sourceIdentity: { headCommit: '0000000000000000000000000000000000000000', worktreeDirty: true, exactCommittedSource: false, releaseGrade: false },
    executionStatus: 'completed', oracleStatus: 'passed', expectedOracleStatus: 'passed', expectationMet: true,
    failedOracle: null, failures: [], artifactsAccepted: true, networkEnforcementScope: PLAYWRIGHT_NETWORK_ENFORCEMENT_SCOPE,
    networkSummary: { resumeMatchRest: 0, cognito: 0, s3: 0, deepgram: 0, outreach: 0, unexpectedEgress: 0, locallyFulfilled: 0 },
    artifacts: {
      trace: 'trace.zip', video: ['video/sample.webm'], failureScreenshot: null,
      checkpointScreenshots: ['checkpoint-sample.png'], consoleEvents: 'console-events.json', pageErrors: 'page-errors.json',
      networkEvents: 'network-events.json', transitionLog: 'scenario-transitions.json', safetyViolations: 'safety-violations.json',
    },
    opaqueArtifactValidation,
  }
  await writeFile(path.join(bundle, 'manifest.json'), `${JSON.stringify(manifest)}\n`)
  return manifest
}

function codes(result: Awaited<ReturnType<typeof validateEvidenceBundle>>): Set<string> {
  return new Set(result.violations.map(item => item.code))
}

function validNetworkEvent(): NetworkEvent {
  return {
    sequence: 1, relativeTimestampMs: 1, method: 'GET', resourceType: 'document', originAlias: 'local-app',
    routeTemplate: '/sample', queryKeys: [], status: 200, durationMs: 1, mockDecision: 'local-application', requestFields: [],
  }
}

function requestRecord(url: string, mimeType: string, resourceName: string): unknown {
  return { type: 'resource-snapshot', snapshot: { request: { url, method: 'POST', postData: { mimeType, _sha1: resourceName } } } }
}

function responseRecord(url: string, mimeType: string, resourceName: string): unknown {
  return { type: 'resource-snapshot', snapshot: { request: { url, method: 'GET' }, response: { status: 200, content: { mimeType, _sha1: resourceName } } } }
}

function multipartBody(pdf: Buffer, boundary = 'qa-synthetic-boundary'): Buffer {
  return Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="key"\r\n\r\nqa-synthetic/qa-new-1/qa-synthetic-resume.pdf\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="x-amz-meta-qa"\r\n\r\nqa-synthetic\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${SYNTHETIC_FILE_NAME}"\r\nContent-Type: application/pdf\r\n\r\n`),
    pdf,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ])
}

test('strict validator accepts a complete manifest-owned synthetic bundle', async ({ browserName }, testInfo) => {
  expect(browserName).toBe('chromium')
  const bundle = testInfo.outputPath('valid-bundle')
  await validBundle(bundle)
  await expect(validateEvidenceBundle(bundle)).resolves.toEqual({ valid: true, violations: [] })
})

test('strict inventory rejects unknown, unreferenced, and missing artifacts', async ({ browserName }, testInfo) => {
  expect(browserName).toBe('chromium')
  const bundle = testInfo.outputPath('inventory-bundle')
  const manifest = await validBundle(bundle)
  await writeFile(path.join(bundle, 'unknown.bin'), 'x')
  await writeFile(path.join(bundle, 'failure.png'), Buffer.from('89504e470d0a1a0a', 'hex'))
  await rm(path.join(bundle, manifest.artifacts.networkEvents))
  const result = await validateEvidenceBundle(bundle)
  expect(codes(result)).toContain('UNKNOWN_ARTIFACT_TYPE')
  expect(codes(result)).toContain('UNREFERENCED_ARTIFACT')
  expect(codes(result)).toContain('MISSING_ARTIFACT')
})

test('normalized evidence schemas reject raw and encoded bodies plus closed-schema bypasses', async ({ browserName }, testInfo) => {
  expect(browserName).toBe('chromium')
  const pdf = await readFile(path.join(process.cwd(), 'qa', 'fixtures', SYNTHETIC_FILE_NAME))
  const bypasses: unknown[] = [
    { ...validNetworkEvent(), routeTemplate: SYNTHETIC_JOB_DESCRIPTION },
    { ...validNetworkEvent(), routeTemplate: 'QA Test Candidate - Synthetic Resume' },
    { ...validNetworkEvent(), originAlias: 'local-app', raw: pdf.toString('latin1') },
    { ...validNetworkEvent(), requestFields: [{ name: 'fileName', length: 1, sha256: '0'.repeat(64), value: SYNTHETIC_JOB_DESCRIPTION }] },
    { ...validNetworkEvent(), routeTemplate: pdf.toString('base64') },
  ]
  for (const [index, bypass] of bypasses.entries()) {
    const bundle = testInfo.outputPath(`closed-evidence-${index}`)
    await validBundle(bundle)
    await writeFile(path.join(bundle, 'network-events.json'), JSON.stringify([structuredClone(bypass)]))
    expect((await validateEvidenceBundle(bundle)).valid, `bypass ${index}`).toBe(false)
  }
})

test('normalized safety evidence rejects raw fixture strings in every allowed leaf', async ({ browserName }, testInfo) => {
  expect(browserName).toBe('chromium')
  const sourceResult = await runReleaseCheck('P1-06')
  expect(sourceResult.artifactValidation.status).toBe('passed')
  const sourceBundle = path.join(process.cwd(), '.qa-artifacts', 'runs', sourceResult.runId)
  await expect(validateEvidenceBundle(sourceBundle)).resolves.toEqual({ valid: true, violations: [] })

  const mutations = [
    { field: 'reason', value: 'QA Test Candidate - Synthetic Resume', code: 'RAW_RESUME_TEXT' },
    { field: 'target', value: 'QA Test Candidate - Synthetic Resume', code: 'RAW_RESUME_TEXT' },
    { field: 'reason', value: SYNTHETIC_JOB_DESCRIPTION, code: 'RAW_JOB_DESCRIPTION' },
    { field: 'target', value: SYNTHETIC_JOB_DESCRIPTION, code: 'RAW_JOB_DESCRIPTION' },
  ] as const

  for (const [index, mutation] of mutations.entries()) {
    const bundle = testInfo.outputPath(`safety-raw-content-${index}`)
    await cp(sourceBundle, bundle, { recursive: true })
    const safetyPath = path.join(bundle, 'safety-violations.json')
    const safety = JSON.parse(await readFile(safetyPath, 'utf8')) as Array<Record<string, unknown>>
    safety[0][mutation.field] = mutation.value
    await writeFile(safetyPath, `${JSON.stringify(safety)}\n`)

    expect(codes(await validateEvidenceBundle(bundle)), `${mutation.field} mutation ${index}`).toContain(mutation.code)
  }
})

test('manifest schema rejects contradictions, malformed identity, unknown fields, and dishonest source state', async ({ browserName }, testInfo) => {
  expect(browserName).toBe('chromium')
  const mutations: Array<(manifest: Record<string, unknown>) => void> = [
    manifest => { manifest.oracleStatus = 'not_run'; manifest.expectationMet = true },
    manifest => { (manifest.sourceIdentity as Record<string, unknown>).headCommit = 'abc' },
    manifest => { manifest.unknown = true },
    manifest => Object.assign(manifest.sourceIdentity as object, { worktreeDirty: true, exactCommittedSource: true, releaseGrade: true }),
    manifest => { manifest.executionStatus = 'infrastructure_failed'; manifest.expectationMet = true },
    manifest => { manifest.artifactsAccepted = false; manifest.expectationMet = true },
  ]
  for (const [index, mutate] of mutations.entries()) {
    const bundle = testInfo.outputPath(`closed-manifest-${index}`)
    const source = await validBundle(bundle)
    const copy = structuredClone(source) as unknown as Record<string, unknown>
    mutate(copy)
    await writeFile(path.join(bundle, 'manifest.json'), JSON.stringify(copy))
    expect(codes(await validateEvidenceBundle(bundle)), `mutation ${index}`).toContain('INVALID_ARTIFACT_SCHEMA')
  }
})

test('trace rejects arbitrary and unreferenced resources', async ({ browserName }, testInfo) => {
  expect(browserName).toBe('chromium')
  const arbitrary = testInfo.outputPath('arbitrary-resource')
  await validBundle(arbitrary)
  const arbitraryBody = Buffer.from('arbitrary non-fixture request content')
  const arbitraryName = `${hash(arbitraryBody)}.dat`
  await writeTrace(arbitrary, [requestRecord(`${QA_API_ORIGIN}/upload`, 'application/json', arbitraryName)], [{ name: arbitraryName, body: arbitraryBody }])
  expect(codes(await validateEvidenceBundle(arbitrary))).toContain('INVALID_TRACE_RESOURCE')

  const orphan = testInfo.outputPath('orphan-resource')
  await validBundle(orphan)
  const orphanBody = Buffer.from('orphan')
  await writeTrace(orphan, [{}], [{ name: `${hash(orphanBody)}.dat`, body: orphanBody }])
  expect(codes(await validateEvidenceBundle(orphan))).toContain('UNREFERENCED_TRACE_RESOURCE')
})

test('trace accepts known API and S3 bodies but rejects an unknown resume-like request', async ({ browserName }, testInfo) => {
  expect(browserName).toBe('chromium')
  const api = testInfo.outputPath('known-api')
  await validBundle(api)
  const apiBody = Buffer.from(JSON.stringify({ fileName: SYNTHETIC_FILE_NAME, jobDescription: SYNTHETIC_JOB_DESCRIPTION }))
  const apiName = `${hash(apiBody)}.json`
  await writeTrace(api, [requestRecord(`${QA_API_ORIGIN}/upload`, 'application/json', apiName)], [{ name: apiName, body: apiBody }])
  expect((await validateEvidenceBundle(api)).valid).toBe(true)

  const s3 = testInfo.outputPath('known-s3')
  await validBundle(s3)
  const boundary = 'qa-synthetic-boundary'
  const s3Body = multipartBody(await readFile(path.join(process.cwd(), 'qa', 'fixtures', SYNTHETIC_FILE_NAME)), boundary)
  const s3Name = `${hash(s3Body)}.dat`
  await writeTrace(s3, [requestRecord(`${QA_S3_ORIGIN}/synthetic-upload`, `multipart/form-data; boundary=${boundary}`, s3Name)], [{ name: s3Name, body: s3Body }])
  expect((await validateEvidenceBundle(s3)).valid).toBe(true)

  const unknown = testInfo.outputPath('unknown-resume-request')
  await validBundle(unknown)
  const unknownBody = Buffer.from(JSON.stringify({ fileName: SYNTHETIC_FILE_NAME, jobDescription: 'Unknown resume-like request content' }))
  const unknownName = `${hash(unknownBody)}.json`
  await writeTrace(unknown, [requestRecord(`${QA_API_ORIGIN}/upload`, 'application/json', unknownName)], [{ name: unknownName, body: unknownBody }])
  expect(codes(await validateEvidenceBundle(unknown))).toContain('INVALID_TRACE_RESOURCE')
})

test('trace accepts a Vite response only when it matches the independently built asset', async ({ browserName }, testInfo) => {
  expect(browserName).toBe('chromium')
  const bundle = testInfo.outputPath('vite-asset')
  await validBundle(bundle)
  const html = await readFile(path.join(process.cwd(), '.qa-dist', 'index.html'))
  const name = `${hash(html)}.html`
  await writeTrace(bundle, [responseRecord('http://127.0.0.1:4173/sample', 'text/html', name)], [{ name, body: html }])
  expect((await validateEvidenceBundle(bundle)).valid).toBe(true)
})

test('malformed trace ZIP and missing unzip fail closed', async ({ browserName }, testInfo) => {
  expect(browserName).toBe('chromium')
  const malformed = testInfo.outputPath('malformed-trace')
  await validBundle(malformed)
  await writeFile(path.join(malformed, 'trace.zip'), 'PK-not-a-zip')
  expect(codes(await validateEvidenceBundle(malformed))).toContain('UNREADABLE_TRACE')

  const missingUnzip = testInfo.outputPath('missing-unzip')
  await validBundle(missingUnzip)
  expect(codes(await validateEvidenceBundle(missingUnzip, { unzipCommand: 'qa-unzip-does-not-exist' }))).toContain('UNREADABLE_TRACE')
})

test('unreadable ordinary evidence fails closed where permissions are enforced', async ({ browserName }, testInfo) => {
  expect(browserName).toBe('chromium')
  const bundle = testInfo.outputPath('unreadable-bundle')
  await validBundle(bundle)
  const target = path.join(bundle, 'console-events.json')
  await chmod(target, 0o000)
  try {
    let permissionsEnforced = false
    try { await readFile(target); permissionsEnforced = false } catch { permissionsEnforced = true }
    const result = await validateEvidenceBundle(bundle)
    if (permissionsEnforced) expect(codes(result)).toContain('UNREADABLE_ARTIFACT')
    else test.info().annotations.push({ type: 'limitation', description: 'Current user can read mode-000 files' })
  } finally {
    await chmod(target, 0o600)
  }
})
