import type { Classification } from './finding'
import type { TriageDecision } from './triage'
import type { ScenarioId } from '../browser/types'

/**
 * A held-out case, described only by what it is expected to produce.
 *
 * Everything that could tune the investigator against it — the source mutation
 * or transient fault, and the gold first probe — is deliberately absent. Those
 * definitions live in the gitignored `heldout/` directory and are read only when
 * the runner is invoked with `--held-out`.
 */
export interface HeldOutCase {
  id: string
  kind: 'seeded_defect' | 'benign_transient'
  scenarioId: ScenarioId
  expectedTriage: TriageDecision
  expectedClassification: Classification | null
}

/**
 * The held-out corpus.
 *
 * B2 was moved to the public set after being implemented and executed during
 * Phase 2 development; B4 replaces it. B4 interrupts the last-resume lookup in
 * the reuse scenario, a route and a scenario no public benign case covers, and
 * its failure signal is a missing element rather than a failed navigation or a
 * stalled poll — so a probe rule tuned on the public set does not transfer to it
 * for free.
 */
export const HELD_OUT_CASES: readonly HeldOutCase[] = [
  { id: 'D5', kind: 'seeded_defect', scenarioId: 'P1-04', expectedTriage: 'investigate', expectedClassification: 'confirmed' },
  { id: 'D6', kind: 'seeded_defect', scenarioId: 'P1-05', expectedTriage: 'investigate', expectedClassification: 'confirmed' },
  // Corrected after the case ran: the interrupted lookup fails P1-03's first
  // assertion, which precedes the scenario's first checkpoint, so the bundle is
  // rejected for having none and no investigator is reachable. See the declared
  // boundary in docs/qa-phase2.md.
  { id: 'B4', kind: 'benign_transient', scenarioId: 'P1-03', expectedTriage: 'artifact_rejected', expectedClassification: null },
  // Added in step 5 (2026-10-11), after Freeze v6, as predictions. Measured in
  // the step 5 scripted pilot (2026-10-11, b36c5af), all as predicted: triage
  // investigate for each; original failed oracles P1-02_RESULTS_NAVIGATION (D10),
  // P1-03_PROCESSING_STATE (D11) and P1-03_RESULTS_NAVIGATION (B6); scripted
  // classifications inconclusive, confirmed and not_reproduced. In P1-03 the
  // scripted upload plan's file attach is refused and the reuse path continues
  // without it. Any later correction is recorded here with its reason and date,
  // never edited silently.
  { id: 'D10', kind: 'seeded_defect', scenarioId: 'P1-02', expectedTriage: 'investigate', expectedClassification: 'inconclusive' },
  { id: 'D11', kind: 'seeded_defect', scenarioId: 'P1-03', expectedTriage: 'investigate', expectedClassification: 'confirmed' },
  { id: 'B6', kind: 'benign_transient', scenarioId: 'P1-03', expectedTriage: 'investigate', expectedClassification: 'not_reproduced' },
]

/** Ids whose implementations must never inform prompts, probe rules, or tool descriptions. */
export const HELD_OUT_CASE_IDS: readonly string[] = HELD_OUT_CASES.map(item => item.id)
