import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { canonicalApiRequestHashes, canonicalApiResponseHashes } from './artifactValidator'
import { QA_S3_ORIGIN } from './networkPolicy'
import { SYNTHETIC_JOB_DESCRIPTION, TRANSIENT_UPLOAD_FAILURE_BODY } from '../fixtures/data'
import type { EvaluationIdentity } from './types'

function hash(value: unknown): string {
  return createHash('sha256').update(Buffer.from(JSON.stringify(value))).digest('hex')
}

const RELEASE_UPLOAD_BODIES = [
  {
    presignedUrl: `${QA_S3_ORIGIN}/synthetic-upload`,
    presignedFields: { key: 'qa-synthetic/qa-new-1/qa-synthetic-resume.pdf', 'x-amz-meta-qa': 'qa-synthetic' },
    analysisId: 'qa-new-1', s3Key: 'qa-synthetic/qa-new-1/qa-synthetic-resume.pdf',
  },
  { analysisId: 'qa-reuse-1', reused: true, presignedUrl: null, presignedFields: null },
]

function identity(transientFaults: EvaluationIdentity['transientFaults']): EvaluationIdentity {
  return {
    caseId: 'B1', mutationApplied: null, transientFaults,
    sourceDigest: 'a'.repeat(64), buildDigest: 'b'.repeat(64), worktreeLabel: 'abcdef012345-b1', approvedRequestHashes: [],
  }
}

describe('canonical upload response allowlist', () => {
  it('is the Phase 1 set exactly when no evaluation identity is present', () => {
    const release = canonicalApiResponseHashes('/upload', null)
    expect([...release].sort()).toEqual(RELEASE_UPLOAD_BODIES.map(hash).sort())
    expect(release.has(hash(TRANSIENT_UPLOAD_FAILURE_BODY))).toBe(false)
  })

  it('admits the transient failure body only for a run that declared that fault', () => {
    expect(canonicalApiResponseHashes('/upload', identity(['upload_503_once'])).has(hash(TRANSIENT_UPLOAD_FAILURE_BODY))).toBe(true)
    expect(canonicalApiResponseHashes('/upload', identity([])).has(hash(TRANSIENT_UPLOAD_FAILURE_BODY))).toBe(false)
    expect(canonicalApiResponseHashes('/upload', identity(['s3_response_500_once'])).has(hash(TRANSIENT_UPLOAD_FAILURE_BODY))).toBe(false)
  })

  it('leaves other paths untouched by an evaluation identity', () => {
    for (const pathname of ['/user/last-resume', '/analysis/qa-new-1']) {
      expect([...canonicalApiResponseHashes(pathname, identity(['upload_503_once']))].sort())
        .toEqual([...canonicalApiResponseHashes(pathname, null)].sort())
    }
  })
})

describe('canonical upload request allowlist', () => {
  const D2_HASH = '33a86e49600cc12ae5c60a51f11efbeebb299967aa2d2cd0803c7ab917ed807a'

  const RELEASE_UPLOAD_REQUESTS = [
    { fileName: 'qa-synthetic-resume.pdf', jobDescription: SYNTHETIC_JOB_DESCRIPTION },
    { existingAnalysisId: 'qa-existing-source-1', jobDescription: SYNTHETIC_JOB_DESCRIPTION },
  ]

  function mutated(caseId: string, mutationApplied: string | null, hashes: string[]): EvaluationIdentity {
    return {
      caseId, mutationApplied, transientFaults: [],
      sourceDigest: 'a'.repeat(64), buildDigest: 'b'.repeat(64), worktreeLabel: 'abcdef012345-d2',
      approvedRequestHashes: hashes,
    }
  }

  it('is the Phase 1 set exactly when no evaluation identity is present', () => {
    const release = canonicalApiRequestHashes('/upload', null)
    expect([...release].sort()).toEqual(RELEASE_UPLOAD_REQUESTS.map(hash).sort())
    expect(release.has(D2_HASH)).toBe(false)
  })

  it('admits a declared hash only for the run whose own mutation produced it', () => {
    expect(canonicalApiRequestHashes('/upload', mutated('D2', 'D2', [D2_HASH])).has(D2_HASH)).toBe(true)
    // Declared but attributed to another case, or to no mutation at all.
    expect(canonicalApiRequestHashes('/upload', mutated('D2', 'D3', [D2_HASH])).has(D2_HASH)).toBe(false)
    expect(canonicalApiRequestHashes('/upload', mutated('D2', null, [D2_HASH])).has(D2_HASH)).toBe(false)
    expect(canonicalApiRequestHashes('/upload', mutated('B1', null, [])).has(D2_HASH)).toBe(false)
  })

  it('leaves every other path empty however the identity is set', () => {
    for (const pathname of ['/user/last-resume', '/analysis/qa-new-1']) {
      expect(canonicalApiRequestHashes(pathname, mutated('D2', 'D2', [D2_HASH])).size).toBe(0)
    }
  })
})
