import { diffWords, type Change } from 'diff';

/**
 * Single source of truth for the resume diff.
 *
 * Both the caption on Results ("N safe edits found.") and the highlighted diff in DiffView
 * read from here, so they can never disagree about how many changes there are.
 */
export function diffResumeParts(original: string, suggested: string): Change[] {
  return diffWords(original, suggested);
}

/**
 * How many edits the rewrite guard actually let through.
 *
 * Counts inserted runs, skipping whitespace-only ones so a re-wrapped line doesn't inflate
 * the number (diffWords already normalizes whitespace, so this is belt-and-braces: a Pass 3
 * edit whose original line was hard-wrapped comes back as one joined line).
 */
export function countSafeEdits(original: string, suggested: string): number {
  return diffResumeParts(original, suggested)
    .filter((part) => part.added && part.value.trim().length > 0)
    .length;
}
