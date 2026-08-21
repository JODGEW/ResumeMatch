import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { expect, test } from '@playwright/test'
import type { BrowserContext, Page } from '@playwright/test'

import { StatefulContractRouter } from '../../qa/browser/contractRouter'
import { generatedBuildResourcePaths, NetworkPolicy, QA_API_ORIGIN, QA_APP_ORIGIN, QA_S3_ORIGIN } from '../../qa/browser/networkPolicy'
import { createScenario } from '../../qa/browser/scenarios'
import { installUploadObservation } from '../../qa/browser/uploadObservation'
import { SYNTHETIC_FILE_NAME, SYNTHETIC_JOB_DESCRIPTION } from '../../qa/fixtures/data'

type BrowserUploadEntry =
  | { kind: 'text'; name: string; value: string }
  | { kind: 'file'; name: string; bytes: number[]; fileName: string; mimeType: string }

interface BrowserUpload { entries: BrowserUploadEntry[]; query?: string }

const validTextEntries: BrowserUploadEntry[] = [
  { kind: 'text', name: 'key', value: 'qa-synthetic/qa-new-1/qa-synthetic-resume.pdf' },
  { kind: 'text', name: 'x-amz-meta-qa', value: 'qa-synthetic' },
]

async function syntheticBytes(): Promise<number[]> {
  return [...await readFile(path.join(process.cwd(), 'qa', 'fixtures', SYNTHETIC_FILE_NAME))]
}

function fileEntry(bytes: number[], name = 'file'): BrowserUploadEntry {
  return { kind: 'file', name, bytes, fileName: SYNTHETIC_FILE_NAME, mimeType: 'application/pdf' }
}

async function installPolicy(context: BrowserContext, scenario: ReturnType<typeof createScenario>): Promise<NetworkPolicy> {
  const policy = new NetworkPolicy({
    appOrigin: QA_APP_ORIGIN, apiOrigin: QA_API_ORIGIN, s3Origin: QA_S3_ORIGIN, startedAt: Date.now(),
    contractRouter: new StatefulContractRouter(scenario),
    allowedLocalResourcePaths: await generatedBuildResourcePaths(path.join(process.cwd(), '.qa-dist')),
  })
  await policy.install(context)
  return policy
}

async function rejectedAtBrowserBoundary(context: BrowserContext, page: Page, upload: BrowserUpload): Promise<void> {
  const scenario = createScenario('P1-02')
  await installUploadObservation(context, scenario, QA_S3_ORIGIN)
  await installPolicy(context, scenario)
  await page.goto(`${QA_APP_ORIGIN}/sample`, { waitUntil: 'networkidle' })
  const outcome = await page.evaluate(async ({ entries, query }) => {
    const form = new FormData()
    for (const entry of entries) {
      if (entry.kind === 'text') form.append(entry.name, entry.value)
      else form.append(entry.name, new File([new Uint8Array(entry.bytes)], entry.fileName, { type: entry.mimeType }))
    }
    try { await fetch(`https://s3.qa.invalid/synthetic-upload${query ?? ''}`, { method: 'POST', body: form }); return 'resolved' }
    catch { return 'blocked' }
  }, upload)
  expect(outcome).toBe('blocked')
  expect(scenario.contractViolations).toContain('s3-multipart-schema-or-count')
}

test('S3 browser-boundary proof rejects empty bytes with correct metadata', async ({ context, page }) => {
  await rejectedAtBrowserBoundary(context, page, { entries: [...validTextEntries, fileEntry([])] })
})

test('S3 browser-boundary proof rejects a wrong presigned field value', async ({ context, page }) => {
  const entries = structuredClone(validTextEntries)
  const keyEntry = entries[0] as Extract<BrowserUploadEntry, { kind: 'text' }>
  keyEntry.value = 'qa-synthetic/wrong.pdf'
  await rejectedAtBrowserBoundary(context, page, { entries: [...entries, fileEntry(await syntheticBytes())] })
})

test('S3 browser-boundary proof rejects unexpected S3 query parameters', async ({ context, page }) => {
  await rejectedAtBrowserBoundary(context, page, { entries: [...validTextEntries, fileEntry(await syntheticBytes())], query: '?unexpected=1' })
})

test('S3 browser-boundary proof rejects the wrong file hash', async ({ context, page }) => {
  const bytes = Array<number>(610).fill(0)
  bytes.splice(0, 5, 0x25, 0x50, 0x44, 0x46, 0x2d)
  await rejectedAtBrowserBoundary(context, page, { entries: [...validTextEntries, fileEntry(bytes)] })
})

test('S3 browser-boundary proof preserves and rejects a correct file under the wrong field name', async ({ context, page }) => {
  await rejectedAtBrowserBoundary(context, page, { entries: [...validTextEntries, fileEntry(await syntheticBytes(), 'resume')] })
})

test('S3 browser-boundary proof rejects two file entries', async ({ context, page }) => {
  const bytes = await syntheticBytes()
  await rejectedAtBrowserBoundary(context, page, { entries: [...validTextEntries, fileEntry(bytes), fileEntry(bytes)] })
})

test('S3 browser-boundary proof rejects a duplicate presigned field', async ({ context, page }) => {
  await rejectedAtBrowserBoundary(context, page, {
    entries: [...validTextEntries, { kind: 'text', name: 'key', value: 'qa-synthetic/qa-new-1/qa-synthetic-resume.pdf' }, fileEntry(await syntheticBytes())],
  })
})

test('S3 browser-boundary proof rejects a missing required field', async ({ context, page }) => {
  await rejectedAtBrowserBoundary(context, page, { entries: [validTextEntries[0], fileEntry(await syntheticBytes())] })
})

test('S3 browser-boundary proof rejects an unexpected additional field', async ({ context, page }) => {
  await rejectedAtBrowserBoundary(context, page, {
    entries: [...validTextEntries, { kind: 'text', name: 'unexpected', value: 'qa-synthetic' }, fileEntry(await syntheticBytes())],
  })
})

test('API upload browser boundary rejects any query and never fulfills success', async ({ context, page }) => {
  const scenario = createScenario('P1-02')
  const policy = await installPolicy(context, scenario)
  await page.goto(`${QA_APP_ORIGIN}/sample`, { waitUntil: 'networkidle' })
  const outcome = await page.evaluate(async ({ jobDescription }) => {
    try {
      const response = await fetch('https://api.qa.invalid/upload?unexpected=1', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fileName: 'qa-synthetic-resume.pdf', jobDescription }),
      })
      return `status:${response.status}`
    } catch { return 'blocked' }
  }, { jobDescription: SYNTHETIC_JOB_DESCRIPTION })
  expect(outcome).toBe('blocked')
  expect(scenario.contractViolations).toContain('upload-method-count-or-mode')
  expect(policy.events).toContainEqual(expect.objectContaining({
    originAlias: 'resumematch-api-sentinel', routeTemplate: '/upload', queryKeys: ['unexpected'], mockDecision: 'blocked', status: null,
  }))
})
