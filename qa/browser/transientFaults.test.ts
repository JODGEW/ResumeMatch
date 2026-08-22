import type { Request } from '@playwright/test'
import { describe, expect, it } from 'vitest'

import { StatefulContractRouter } from './contractRouter'
import { createScenario } from './scenarios'
import type { ContractResponse } from './networkPolicy'
import type { TransientFault, UploadObservation } from './types'
import {
  SYNTHETIC_FILE_NAME, SYNTHETIC_JOB_DESCRIPTION, SYNTHETIC_PDF_SHA256, SYNTHETIC_PDF_SIZE,
  TRANSIENT_S3_FAILURE_STATUS, TRANSIENT_UPLOAD_FAILURE_STATUS,
} from '../fixtures/data'

function request(overrides: {
  url: string
  method?: string
  postData?: string | null
  headers?: Record<string, string>
}): Request {
  return {
    url: () => overrides.url,
    method: () => overrides.method ?? 'GET',
    postData: () => overrides.postData ?? null,
    postDataJSON: () => JSON.parse(overrides.postData ?? 'null'),
    headers: () => overrides.headers ?? {},
  } as unknown as Request
}

const UPLOAD_BODY = JSON.stringify({ fileName: SYNTHETIC_FILE_NAME, jobDescription: SYNTHETIC_JOB_DESCRIPTION })

const UPLOAD_OBSERVATION: UploadObservation = {
  entries: [
    { name: 'key', kind: 'text', value: 'qa-synthetic/qa-new-1/qa-synthetic-resume.pdf', length: 1, sha256: 'a'.repeat(64) },
    { name: 'x-amz-meta-qa', kind: 'text', value: 'qa-synthetic', length: 1, sha256: 'b'.repeat(64) },
    {
      name: 'file', kind: 'file', fileName: SYNTHETIC_FILE_NAME, mimeType: 'application/pdf',
      size: SYNTHETIC_PDF_SIZE, sha256: SYNTHETIC_PDF_SHA256, signatureHex: '255044462d',
    },
  ],
}

function newUploadScenario(faults: TransientFault[] = []) {
  const scenario = createScenario('P1-02', { transientFaults: faults })
  return { scenario, router: new StatefulContractRouter(scenario) }
}

describe('default scenarios carry no transient faults', () => {
  it('keeps every Phase 1 contract response unchanged', async () => {
    const { scenario, router } = newUploadScenario()
    const upload = await router.handle(request({ url: 'https://api.qa.invalid/upload', method: 'POST', postData: UPLOAD_BODY })) as ContractResponse
    expect(upload.status).toBe(200)
    expect(JSON.parse(upload.body).analysisId).toBe('qa-new-1')
    scenario.uploadObservation = UPLOAD_OBSERVATION
    const s3 = await router.handle(request({
      url: 'https://s3.qa.invalid/synthetic-upload', method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=x' },
    })) as ContractResponse
    expect(s3.status).toBe(204)
    expect(scenario.contractViolations).toEqual([])
  })

  it('reports no fault to consume', () => {
    expect(createScenario('P1-02').consumeTransientFault('upload_503_once')).toBe(false)
  })
})

describe('B1: one transient upload failure', () => {
  it('returns the fixed synthetic failure body without a contract violation', async () => {
    const { scenario, router } = newUploadScenario(['upload_503_once'])
    const response = await router.handle(request({ url: 'https://api.qa.invalid/upload', method: 'POST', postData: UPLOAD_BODY })) as ContractResponse
    expect(response.status).toBe(TRANSIENT_UPLOAD_FAILURE_STATUS)
    expect(JSON.parse(response.body)).toEqual({ message: 'qa-synthetic transient upload failure' })
    expect(scenario.contractViolations).toEqual([])
    expect(scenario.transitions.map(item => item.event)).toContain('transient-fault:upload_503_once')
  })

  it('fires at most once per scenario instance', () => {
    const scenario = createScenario('P1-02', { transientFaults: ['upload_503_once'] })
    expect(scenario.consumeTransientFault('upload_503_once')).toBe(true)
    expect(scenario.consumeTransientFault('upload_503_once')).toBe(false)
  })
})

describe('B2: one interrupted analysis poll', () => {
  it('aborts the second poll without a contract violation and keeps the sequence advancing', async () => {
    const scenario = createScenario('P1-02', { transientFaults: ['analysis_interrupted_once'] })
    const router = new StatefulContractRouter(scenario)
    const poll = () => router.handle(request({ url: 'https://api.qa.invalid/analysis/qa-new-1?userId=dev@example.com' }))
    expect(JSON.parse((await poll() as ContractResponse).body).status).toBe('pending_upload')
    expect(await poll()).toBeNull()
    expect(JSON.parse((await poll() as ContractResponse).body).status).toBe('completed')
    expect(scenario.contractViolations).toEqual([])
    expect(scenario.transitions.map(item => item.event)).toContain('transient-fault:analysis_interrupted_once')
  })
})

describe('B3: S3 accepts the object but its response fails', () => {
  it('records the accepted multipart and then fails the response once', async () => {
    const scenario = createScenario('P1-02', { transientFaults: ['s3_response_500_once'] })
    const router = new StatefulContractRouter(scenario)
    scenario.uploadObservation = UPLOAD_OBSERVATION
    const response = await router.handle(request({
      url: 'https://s3.qa.invalid/synthetic-upload', method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=x' },
    })) as ContractResponse
    expect(response.status).toBe(TRANSIENT_S3_FAILURE_STATUS)
    expect(response.body).toBe('')
    expect(scenario.contractViolations).toEqual([])
    const events = scenario.transitions.map(item => item.event)
    expect(events).toContain('s3-contract:accepted-multipart')
    expect(events).toContain('transient-fault:s3_response_500_once')
  })
})
