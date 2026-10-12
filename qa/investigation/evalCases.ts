import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import type { ScenarioId, TransientFault } from '../browser/types'
import type { Classification } from './finding'
import type { TriageDecision } from './triage'

/**
 * One evaluation case. Seeded-defect cases carry an exact source anchor rather
 * than a patch file, so a drifted anchor fails loudly instead of mutating the
 * wrong line. Nothing here applies a mutation; the runner is a later change.
 */
export interface EvalCase {
  id: string
  kind: 'clean' | 'seeded_defect' | 'benign_transient'
  scenarioId: ScenarioId
  summary: string
  /**
   * Exact single-occurrence source anchor, for seeded defects only.
   *
   * `approvedRequestHashes` declares the request bodies the mutation is expected
   * to produce. A defect that changes a request's shape produces a body the
   * closed synthetic allowlist cannot know, so without this its evidence is
   * rejected and the case never reaches an investigator.
   */
  mutation?: { file: string; find: string; replace: string; approvedRequestHashes?: string[] }
  /**
   * Evaluation-only transient faults. In a benign case the fault is the cause;
   * in a seeded defect it masks or imitates the defect in the original run only,
   * since a fresh reproduction never re-injects a fault.
   */
  transientFaults?: TransientFault[]
  expectedTriage: TriageDecision
  /** The classification a correct investigation reaches, when one is triggered. */
  expectedClassification: Classification | null
  /** The probe a correct investigation reaches for first. */
  goldFirstProbe?: string
}

/**
 * The public half of the corpus: every case whose implementation may inform
 * prompts, probe rules, and tool descriptions.
 *
 * Held-out cases live in `evalCases.heldout.ts` with no mutation, fault, or gold
 * probe, and their definitions stay in the gitignored `heldout/` directory.
 *
 * Each case is executed by the evaluation runner (`evalRunner/`, `qaCommand
 * evaluate`). C1-C3, D1-D4 and B1-B3 matched their expected triage and
 * classification in the 2026-10-08 sweep at `9c5e6d7` (docs/qa-phase2.md).
 * D7, D8, D9 and B5 were added in slice 4; their triage and original failed
 * oracle were measured with the scripted provider in the slice 5 pilot.
 */
export const EVAL_CASES: readonly EvalCase[] = [
  {
    id: 'C1', kind: 'clean', scenarioId: 'P1-01', summary: 'Normal sample report',
    expectedTriage: 'expected', expectedClassification: null,
  },
  {
    id: 'C2', kind: 'clean', scenarioId: 'P1-02', summary: 'Normal new upload',
    expectedTriage: 'expected', expectedClassification: null,
  },
  {
    id: 'C3', kind: 'clean', scenarioId: 'P1-03', summary: 'Normal resume reuse',
    expectedTriage: 'expected', expectedClassification: null,
  },
  {
    id: 'D1', kind: 'seeded_defect', scenarioId: 'P1-01',
    summary: 'The signed-out sample page polls the analysis API',
    mutation: {
      file: 'src/pages/Results.tsx',
      find: 'const poll = usePolling(sample || demoAnalysis ? null : (analysisId ?? null));',
      replace: "const poll = usePolling(sample ? 'qa-sample-probe' : demoAnalysis ? null : (analysisId ?? null));",
    },
    expectedTriage: 'investigate', expectedClassification: 'confirmed',
    goldFirstProbe: 'read_network_events',
  },
  {
    id: 'D2', kind: 'seeded_defect', scenarioId: 'P1-02',
    summary: 'The upload request sends filename instead of fileName',
    mutation: {
      file: 'src/api/upload.ts',
      find: "const { data } = await client.post('/upload', { fileName, jobDescription });",
      replace: "const { data } = await client.post('/upload', { filename: fileName, jobDescription });",
      // The `filename` body this mutation produces, measured from the rejected
      // bundle of the 2026-08-23 run.
      approvedRequestHashes: ['33a86e49600cc12ae5c60a51f11efbeebb299967aa2d2cd0803c7ab917ed807a'],
    },
    expectedTriage: 'investigate', expectedClassification: 'confirmed',
    goldFirstProbe: 'read_network_events',
  },
  {
    id: 'D3', kind: 'seeded_defect', scenarioId: 'P1-02',
    summary: 'A new upload never sends the S3 request',
    mutation: {
      file: 'src/pages/Upload.tsx',
      find: 'await uploadFileToS3(presignedUrl, presignedFields, file);',
      replace: 'void presignedFields;',
    },
    expectedTriage: 'investigate', expectedClassification: 'confirmed',
    goldFirstProbe: 'count_requests',
  },
  {
    id: 'D4', kind: 'seeded_defect', scenarioId: 'P1-02',
    summary: 'Polling stops after the first processing response',
    mutation: {
      file: 'src/hooks/usePolling.ts',
      find: 'timerRef.current = setInterval(poll, intervalMs);',
      replace: 'timerRef.current = setTimeout(poll, intervalMs) as ReturnType<typeof setInterval>;',
    },
    expectedTriage: 'investigate', expectedClassification: 'confirmed',
    goldFirstProbe: 'read_scenario_transition_log',
  },
  {
    id: 'B1', kind: 'benign_transient', scenarioId: 'P1-02',
    summary: 'The first upload returns 503; a fresh reproduction succeeds',
    transientFaults: ['upload_503_once'],
    expectedTriage: 'investigate', expectedClassification: 'not_reproduced',
    goldFirstProbe: 'read_network_events',
  },
  {
    // Public since it was implemented and executed during Phase 2 development.
    // It carries no gold probe: a probe rule derived from watching it run would
    // be tuned on its implementation, which is what the held-out set exists to
    // prevent.
    id: 'B2', kind: 'benign_transient', scenarioId: 'P1-02',
    summary: 'One analysis poll is interrupted; a fresh reproduction succeeds',
    transientFaults: ['analysis_interrupted_once'],
    expectedTriage: 'investigate', expectedClassification: 'not_reproduced',
  },
  {
    // The upload page swallows a failed S3 response on purpose and navigates
    // anyway, so this fault reaches no oracle: the run passes and triage never
    // reaches an investigator. Measured 2026-08-23; see docs/qa-phase2.md.
    id: 'B3', kind: 'benign_transient', scenarioId: 'P1-02',
    summary: 'S3 accepts the object but its response fails; the product continues regardless',
    transientFaults: ['s3_response_500_once'],
    expectedTriage: 'expected', expectedClassification: null,
  },
  {
    // The original run is B2's: the second poll is aborted, so the report never
    // completes. Only a fresh reproduction shows that polling also stops at
    // `processing` with no fault at all.
    // Measured in the slice 5 pilot (2026-10-11, a327a4c): triage investigate,
    // original failed oracle P1-02_COMPLETED_REPORT.
    id: 'D7', kind: 'seeded_defect', scenarioId: 'P1-02',
    summary: 'Polling stops at the processing response, and one analysis poll is interrupted',
    mutation: {
      file: 'src/hooks/usePolling.ts',
      find: 'if (!isInProgress(data.status)) {',
      replace: "if (data.status !== 'pending_upload') {",
    },
    transientFaults: ['analysis_interrupted_once'],
    expectedTriage: 'investigate', expectedClassification: 'confirmed',
  },
  {
    // The original run is B1's: the upload returns 503, so S3 is never reached.
    // In the reproduction the upload succeeds and the S3 request, sent without
    // its file part, is rejected; the page still navigates, so the original
    // failure passes and the contract failures are new.
    // Measured in the slice 5 pilot (2026-10-11, a327a4c): triage investigate,
    // original failed oracle P1-02_RESULTS_NAVIGATION.
    id: 'D8', kind: 'seeded_defect', scenarioId: 'P1-02',
    summary: 'The upload returns 503 once, and the S3 request omits the file',
    mutation: {
      file: 'src/api/upload.ts',
      find: "formData.append('file', file);",
      replace: 'void file;',
    },
    transientFaults: ['upload_503_once'],
    expectedTriage: 'investigate', expectedClassification: 'inconclusive',
  },
  {
    // The first analysis request is blocked for its query key, so polling never
    // starts and the first failure is a rendering one.
    // Measured in the slice 5 pilot (2026-10-11, a327a4c): triage investigate,
    // original failed oracle P1-02_PROCESSING_STATE.
    id: 'D9', kind: 'seeded_defect', scenarioId: 'P1-02',
    summary: 'The analysis request sends the wrong query key',
    mutation: {
      file: 'src/api/analysis.ts',
      find: 'const { data } = await client.get<Analysis>(`/analysis/${analysisId}?userId=${userId}`);',
      replace: 'const { data } = await client.get<Analysis>(`/analysis/${analysisId}?user=${userId}`);',
    },
    expectedTriage: 'investigate', expectedClassification: 'confirmed',
  },
  {
    // The second poll is aborted, polling stops, and the timeout report never
    // appears; a reproduction that advances the controlled clock reaches it.
    // Measured in the slice 5 pilot (2026-10-11, a327a4c): triage investigate,
    // original failed oracle P1-05_TIMEOUT_STATE.
    // Measured in the committed scripted pilot (2026-10-11, c51bc38): not_reproduced.
    id: 'B5', kind: 'benign_transient', scenarioId: 'P1-05',
    summary: 'One analysis poll in the timeout scenario is interrupted; a fresh reproduction reaches the timeout',
    transientFaults: ['analysis_interrupted_once'],
    expectedTriage: 'investigate', expectedClassification: 'not_reproduced',
  },
]

/**
 * Check that every seeded-defect anchor still matches exactly one place in the
 * current source, so a stale anchor is a loud failure rather than a wrong edit.
 * @param repositoryRoot - repository to resolve anchors against.
 * @returns one entry per seeded-defect case with its occurrence count.
 */
export async function verifyMutationAnchors(repositoryRoot: string = process.cwd()): Promise<Array<{ id: string; file: string; occurrences: number }>> {
  const results: Array<{ id: string; file: string; occurrences: number }> = []
  for (const testCase of EVAL_CASES) {
    if (testCase.mutation === undefined) continue
    const source = await readFile(path.join(repositoryRoot, testCase.mutation.file), 'utf8')
    results.push({ id: testCase.id, file: testCase.mutation.file, occurrences: source.split(testCase.mutation.find).length - 1 })
  }
  return results
}
