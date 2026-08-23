import type { Analysis } from '../../src/types'

export const SYNTHETIC_FILE_NAME = 'qa-synthetic-resume.pdf'
export const SYNTHETIC_PDF_SIZE = 610
export const SYNTHETIC_PDF_SHA256 = 'edb2f8f9110853645671152932230f3dfc56ecd5c46ac10ad44f4c57c0e2e5e3'
export const SYNTHETIC_EXISTING_FILE_NAME = 'qa-synthetic-existing-resume.pdf'
export const SYNTHETIC_JOB_DESCRIPTION = [
  'QA_SYNTHETIC_JOB_DESCRIPTION for qa.invalid.',
  'Build deterministic browser verification, TypeScript contract tests, and safe release evidence.',
  'The QA Test Candidate should understand Playwright, React, accessibility, network isolation, and failure recovery.',
].join(' ')

export const SYNTHETIC_BACKEND_ERROR = 'qa-synthetic backend analysis failure'

/**
 * The single body a transiently failing `/upload` returns under evaluation-only
 * fault injection. Fixed so artifact validation keeps a closed allowlist of
 * synthetic response bodies.
 */
export const TRANSIENT_UPLOAD_FAILURE_BODY = { message: 'qa-synthetic transient upload failure' }

/** Status of the transiently failing `/upload` response. */
export const TRANSIENT_UPLOAD_FAILURE_STATUS = 503

/** Status of a transiently failing S3 response after the object was accepted. */
export const TRANSIENT_S3_FAILURE_STATUS = 500

export function completedAnalysis(analysisId: string, fileName: string): Analysis {
  return {
    analysisId,
    status: 'completed',
    createdAt: '2026-01-15T12:00:00Z',
    timestamp: '2026-01-15T12:00:00Z',
    fileName,
    jobTitle: 'QA Synthetic Software Engineer',
    companyName: 'qa.invalid',
    matchScore: 84,
    scoreBreakdown: {
      technical: 88,
      tools: 82,
      softSkills: 76,
      experience: 90,
    },
    matchedCount: 3,
    totalCount: 5,
    scoreSummary: 'QA synthetic analysis confirms strong deterministic testing coverage.',
    presentKeywords: ['Playwright', 'TypeScript', 'Accessibility'],
    missingKeywords: ['Contract monitoring', 'Fault isolation'],
    topMissing: [
      {
        keyword: 'Contract monitoring',
        importanceScore: 9,
        reason: 'Synthetic evaluation marker for contract coverage.',
      },
    ],
    suggestions: [
      {
        keyword: 'Fault isolation',
        reason: 'Synthetic evaluation marker for safe failure handling.',
        whereToAdd: 'QA synthetic project summary',
      },
    ],
  }
}
