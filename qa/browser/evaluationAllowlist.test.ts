import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { canonicalApiResponseHashes } from './artifactValidator'
import { QA_S3_ORIGIN } from './networkPolicy'
import { TRANSIENT_UPLOAD_FAILURE_BODY } from '../fixtures/data'
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
    sourceDigest: 'a'.repeat(64), buildDigest: 'b'.repeat(64), worktreeLabel: 'abcdef012345-b1',
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
