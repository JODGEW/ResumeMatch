/**
 * Splits the session keyterm list into its two consumers.
 *
 * Both consumers are fed from one backend array, so the split has to happen
 * client-side:
 *
 *   - Deepgram keyterm prompt  -> ALL session keyterms, employers included.
 *     Employer names are proper nouns, the documented safe class for Nova-3
 *     keyterm biasing, and prompting is the ONLY channel that can recover them.
 *   - transcriptCorrection targets -> session keyterms MINUS employers.
 *     Measured employer garbles score Jaro-Winkler 0.63-0.84 against the true
 *     name (eval/stt-bench), permanently below the 0.90 gate in
 *     transcriptCorrection, so an employer target can never fire a correct
 *     rescue — it can only add false-positive surface.
 *
 * Backward compatible by construction: a backend that does not yet send
 * employerKeyterms yields correctionTargets === keyterms (old behavior).
 */
export function splitKeyterms(
  keyterms: string[] | undefined,
  employerKeyterms: string[] | undefined,
): { promptTerms: string[]; correctionTargets: string[] } {
  const promptTerms = keyterms ?? [];
  const employers = employerKeyterms ?? [];
  if (employers.length === 0) {
    return { promptTerms, correctionTargets: promptTerms };
  }
  const employerSet = new Set(employers.map((t) => t.toLowerCase()));
  return {
    promptTerms,
    correctionTargets: promptTerms.filter((t) => !employerSet.has(t.toLowerCase())),
  };
}
