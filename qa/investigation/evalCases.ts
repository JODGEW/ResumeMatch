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
  /** Evaluation-only transient faults, for benign cases only. */
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
 * `expectedTriage` is a prediction to be confirmed by running each case, not an
 * assertion of observed behavior: only B1 and B2 have been executed so far, and
 * both matched. Every other row stays a prediction until the runner exists.
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
