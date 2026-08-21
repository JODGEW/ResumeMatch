import type { ScenarioId, TransitionEvent, UploadObservation } from './types'
import {
  completedAnalysis,
  SYNTHETIC_BACKEND_ERROR,
  SYNTHETIC_EXISTING_FILE_NAME,
  SYNTHETIC_FILE_NAME,
} from '../fixtures/data'

import type { Analysis } from '../../src/types'

export interface ScenarioCounters {
  lastResume: number
  upload: number
  s3: number
  analysis: number
}

export interface LastResumeFixture {
  analysisId: string
  fileName: string
  uploadedAt: string
}

export interface ScenarioInstance {
  id: ScenarioId
  startedAt: number
  transitions: TransitionEvent[]
  counters: ScenarioCounters
  contractViolations: string[]
  lastResume: LastResumeFixture | null
  expectedUpload: 'none' | 'new' | 'reuse'
  analysisId: string | null
  analysisResponses: Analysis[]
  repeatLastAnalysisResponse: boolean
  uploadObservation: UploadObservation | null
  recordTransition(event: string): void
  recordContractViolation(violation: string): void
}

export function createScenario(scenarioId: ScenarioId): ScenarioInstance {
  if (!['P1-01', 'P1-02', 'P1-03', 'P1-04', 'P1-05', 'P1-06'].includes(scenarioId)) {
    throw new Error(`Scenario ${scenarioId} is not implemented yet`)
  }

  const startedAt = Date.now()
  const transitions: TransitionEvent[] = []
  const analysisId = scenarioId === 'P1-02'
    ? 'qa-new-1'
    : scenarioId === 'P1-03'
      ? 'qa-reuse-1'
      : scenarioId === 'P1-04'
        ? 'qa-failed-1'
        : scenarioId === 'P1-05'
          ? 'qa-timeout-1'
      : null
  const fileName = scenarioId === 'P1-03' ? SYNTHETIC_EXISTING_FILE_NAME : SYNTHETIC_FILE_NAME
  const analysisResponses: Analysis[] = scenarioId === 'P1-05' && analysisId
    ? [{ analysisId, status: 'processing', createdAt: '2026-01-15T12:00:00Z', fileName }]
    : scenarioId === 'P1-04' && analysisId
    ? [
        { analysisId, status: 'processing', createdAt: '2026-01-15T12:00:00Z', fileName },
        {
          analysisId,
          status: 'failed',
          createdAt: '2026-01-15T12:00:00Z',
          fileName,
          errorMessage: SYNTHETIC_BACKEND_ERROR,
        },
      ]
    : analysisId
      ? [
        { analysisId, status: 'pending_upload', createdAt: '2026-01-15T12:00:00Z', fileName },
        { analysisId, status: 'processing', createdAt: '2026-01-15T12:00:00Z', fileName },
        completedAnalysis(analysisId, fileName),
      ]
      : []

  return {
    id: scenarioId,
    startedAt,
    transitions,
    counters: { lastResume: 0, upload: 0, s3: 0, analysis: 0 },
    contractViolations: [],
    lastResume: scenarioId === 'P1-03'
      ? {
          analysisId: 'qa-existing-source-1',
          fileName: SYNTHETIC_EXISTING_FILE_NAME,
          uploadedAt: '2026-01-14T12:00:00Z',
        }
      : null,
    expectedUpload: scenarioId === 'P1-02' ? 'new' : scenarioId === 'P1-03' ? 'reuse' : 'none',
    analysisId,
    analysisResponses,
    repeatLastAnalysisResponse: scenarioId === 'P1-05',
    uploadObservation: null,
    recordTransition(event) {
      transitions.push({
        sequence: transitions.length + 1,
        relativeTimestampMs: Date.now() - startedAt,
        event,
      })
    },
    recordContractViolation(violation) {
      this.contractViolations.push(violation)
      this.recordTransition(`contract-violation:${violation}`)
    },
  }
}
