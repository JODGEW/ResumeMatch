import type { Request } from '@playwright/test'

import { QA_API_ORIGIN, QA_S3_ORIGIN, type ContractResponse, type ContractRouteHandler } from './networkPolicy'
import type { ScenarioInstance } from './scenarios'
import type { RequestFieldEvidence, RequestFieldName, UploadFileEntry, UploadTextEntry } from './types'
import {
  SYNTHETIC_FILE_NAME, SYNTHETIC_JOB_DESCRIPTION, SYNTHETIC_PDF_SHA256, SYNTHETIC_PDF_SIZE,
  TRANSIENT_S3_FAILURE_STATUS, TRANSIENT_UPLOAD_FAILURE_BODY, TRANSIENT_UPLOAD_FAILURE_STATUS,
} from '../fixtures/data'

function jsonResponse(body: unknown, status = 200): ContractResponse {
  return {
    status,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(body),
  }
}

function hasExactKeys(value: Record<string, unknown>, expected: string[]): boolean {
  const actual = Object.keys(value).sort()
  const expectedKeys = [...expected].sort()
  return actual.length === expectedKeys.length && actual.every((key, index) => key === expectedKeys[index])
}

export class StatefulContractRouter implements ContractRouteHandler {
  constructor(private readonly scenario: ScenarioInstance) {}

  normalizedRequestFields(request: Request): RequestFieldEvidence[] | null {
    const url = new URL(request.url())
    if (url.origin !== QA_S3_ORIGIN || url.pathname !== '/synthetic-upload' || !this.scenario.uploadObservation) return null
    return this.scenario.uploadObservation.entries.map(entry => ({
      name: entry.name as RequestFieldName,
      length: entry.kind === 'file' ? entry.size : entry.length,
      sha256: entry.sha256,
    }))
  }

  async handle(request: Request): Promise<ContractResponse | null> {
    const url = new URL(request.url())

    if (url.origin === QA_API_ORIGIN && url.pathname === '/user/last-resume') {
      return this.handleLastResume(request)
    }
    if (url.origin === QA_API_ORIGIN && url.pathname === '/upload') {
      return this.handleUpload(request)
    }
    if (url.origin === QA_API_ORIGIN && /^\/analysis\/[^/]+$/.test(url.pathname)) {
      return this.handleAnalysis(request, url)
    }
    if (url.origin === QA_S3_ORIGIN && url.pathname === '/synthetic-upload') {
      return this.handleS3(request)
    }

    this.scenario.recordContractViolation(`unexpected-route:${request.method()}`)
    return null
  }

  private handleLastResume(request: Request): ContractResponse | null {
    this.scenario.counters.lastResume += 1
    const url = new URL(request.url())
    if (
      request.method() !== 'GET'
      || this.scenario.counters.lastResume !== 1
      || this.scenario.expectedUpload === 'none'
      || url.search !== ''
      || request.postData() !== null
    ) {
      this.scenario.recordContractViolation('last-resume-method-or-count')
      return null
    }
    // A contract-legal request whose response never arrives. The upload page
    // then has no previous resume to offer, so the reuse path is unavailable.
    if (this.scenario.consumeTransientFault('last_resume_interrupted_once')) return null
    this.scenario.recordTransition(`last-resume:${this.scenario.lastResume ? 'existing' : 'none'}`)
    return jsonResponse({ lastResume: this.scenario.lastResume })
  }

  private handleUpload(request: Request): ContractResponse | null {
    this.scenario.counters.upload += 1
    const url = new URL(request.url())
    if (
      request.method() !== 'POST'
      || url.search !== ''
      || this.scenario.counters.upload !== 1
      || this.scenario.expectedUpload === 'none'
    ) {
      this.scenario.recordContractViolation('upload-method-count-or-mode')
      return null
    }

    let body: Record<string, unknown>
    try {
      body = request.postDataJSON() as Record<string, unknown>
    } catch {
      this.scenario.recordContractViolation('upload-invalid-json')
      return null
    }
    if (this.scenario.expectedUpload === 'reuse') {
      if (
        !hasExactKeys(body, ['existingAnalysisId', 'jobDescription'])
        || body.existingAnalysisId !== this.scenario.lastResume?.analysisId
        || body.jobDescription !== SYNTHETIC_JOB_DESCRIPTION
      ) {
        this.scenario.recordContractViolation('reuse-upload-body-schema')
        return null
      }

      if (this.scenario.consumeTransientFault('upload_503_once')) {
        return jsonResponse(TRANSIENT_UPLOAD_FAILURE_BODY, TRANSIENT_UPLOAD_FAILURE_STATUS)
      }
      this.scenario.recordTransition('upload-contract:accepted-existing-resume')
      return jsonResponse({
        analysisId: this.scenario.analysisId,
        reused: true,
        presignedUrl: null,
        presignedFields: null,
      })
    }

    if (
      !hasExactKeys(body, ['fileName', 'jobDescription'])
      || body.fileName !== SYNTHETIC_FILE_NAME
      || body.jobDescription !== SYNTHETIC_JOB_DESCRIPTION
    ) {
      this.scenario.recordContractViolation('new-upload-body-schema')
      return null
    }

    if (this.scenario.consumeTransientFault('upload_503_once')) {
      return jsonResponse(TRANSIENT_UPLOAD_FAILURE_BODY, TRANSIENT_UPLOAD_FAILURE_STATUS)
    }
    this.scenario.recordTransition('upload-contract:accepted-new-resume')
    return jsonResponse({
      presignedUrl: `${QA_S3_ORIGIN}/synthetic-upload`,
      presignedFields: {
        key: 'qa-synthetic/qa-new-1/qa-synthetic-resume.pdf',
        'x-amz-meta-qa': 'qa-synthetic',
      },
      analysisId: this.scenario.analysisId,
      s3Key: 'qa-synthetic/qa-new-1/qa-synthetic-resume.pdf',
    })
  }

  private handleS3(request: Request): ContractResponse | null {
    this.scenario.counters.s3 += 1
    const contentType = request.headers()['content-type'] ?? ''
    const url = new URL(request.url())
    const observation = this.scenario.uploadObservation
    const textEntries = observation?.entries.filter((entry): entry is UploadTextEntry => entry.kind === 'text') ?? []
    const fileEntries = observation?.entries.filter((entry): entry is UploadFileEntry => entry.kind === 'file') ?? []
    const textByName = new Map(textEntries.map(entry => [entry.name, entry]))
    if (
      request.method() !== 'POST'
      || this.scenario.counters.s3 !== 1
      || this.scenario.expectedUpload !== 'new'
      || url.search !== ''
      || !contentType.startsWith('multipart/form-data; boundary=')
      || !observation
      || observation.entries.length !== 3
      || textEntries.length !== 2
      || fileEntries.length !== 1
      || new Set(observation.entries.map(entry => entry.name)).size !== observation.entries.length
      || textByName.size !== 2
      || textByName.get('key')?.value !== 'qa-synthetic/qa-new-1/qa-synthetic-resume.pdf'
      || textByName.get('x-amz-meta-qa')?.value !== 'qa-synthetic'
      || fileEntries[0].name !== 'file'
      || fileEntries[0].fileName !== SYNTHETIC_FILE_NAME
      || fileEntries[0].mimeType !== 'application/pdf'
      || fileEntries[0].size !== SYNTHETIC_PDF_SIZE
      || fileEntries[0].signatureHex !== '255044462d'
      || fileEntries[0].sha256 !== SYNTHETIC_PDF_SHA256
    ) {
      this.scenario.recordContractViolation('s3-multipart-schema-or-count')
      return null
    }

    this.scenario.recordTransition('s3-contract:accepted-multipart')
    // The object was accepted; only the response fails, so a retry would upload twice.
    if (this.scenario.consumeTransientFault('s3_response_500_once')) {
      return { status: TRANSIENT_S3_FAILURE_STATUS, contentType: 'text/plain', body: '' }
    }
    return { status: 204, contentType: 'text/plain', body: '' }
  }

  private handleAnalysis(request: Request, url: URL): ContractResponse | null {
    this.scenario.counters.analysis += 1
    const analysisId = url.pathname.split('/').at(-1)
    const queryKeys = [...url.searchParams.keys()].sort()
    if (
      request.method() !== 'GET'
      || analysisId !== this.scenario.analysisId
      || queryKeys.length !== 1
      || queryKeys[0] !== 'userId'
      || url.searchParams.get('userId') !== 'dev@example.com'
      || request.postData() !== null
      || (
        this.scenario.counters.analysis > this.scenario.analysisResponses.length
        && !this.scenario.repeatLastAnalysisResponse
      )
    ) {
      this.scenario.recordContractViolation('analysis-method-id-query-or-count')
      return null
    }

    // A contract-legal request whose response never arrives: no violation, and the
    // response sequence still advances, so the next poll sees the following state.
    if (this.scenario.counters.analysis === 2 && this.scenario.consumeTransientFault('analysis_interrupted_once')) {
      return null
    }

    const response = this.scenario.analysisResponses[
      Math.min(this.scenario.counters.analysis - 1, this.scenario.analysisResponses.length - 1)
    ]
    this.scenario.recordTransition(`analysis:${response.status}`)
    return jsonResponse(response)
  }
}
