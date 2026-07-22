/**
 * Tracks which finished analyses the user hasn't opened from History yet, so the
 * History card can carry a "New" badge.
 *
 * Persisted because the badge would otherwise never be seen: the real flow is
 * Upload -> in-progress screen -> report, and History is visited later, by which
 * point in-memory state is gone.
 *
 * Marked when an analysis completes on the in-progress screen; cleared when the
 * user opens that analysis *from History*. The auto-reveal of the report right
 * after completion deliberately does not clear it — that would retire the badge
 * before it was ever visible.
 */

const STORAGE_KEY = 'resumematch_new_analyses';
/** Entries older than this are dropped, so an abandoned id can't linger forever. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Hard cap so a burst of analyses can't grow the entry unbounded. */
const MAX_ENTRIES = 50;

type NewAnalysisMap = Record<string, number>;

function read(): NewAnalysisMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const cutoff = Date.now() - MAX_AGE_MS;
    const entries = Object.entries(parsed as Record<string, unknown>)
      .filter((entry): entry is [string, number] =>
        typeof entry[1] === 'number' && Number.isFinite(entry[1]) && entry[1] >= cutoff);
    return Object.fromEntries(entries);
  } catch {
    // Private browsing / disabled storage: degrade to "nothing is new".
    return {};
  }
}

function write(map: NewAnalysisMap): void {
  try {
    const trimmed = Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_ENTRIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(trimmed)));
  } catch {
    // Nothing to do — the badge is cosmetic.
  }
}

export function getNewAnalysisIds(): Set<string> {
  return new Set(Object.keys(read()));
}

export function markAnalysisNew(analysisId: string): void {
  if (!analysisId) return;
  const map = read();
  if (map[analysisId]) return;
  map[analysisId] = Date.now();
  write(map);
}

export function clearAnalysisNew(analysisId: string): void {
  if (!analysisId) return;
  const map = read();
  if (!(analysisId in map)) return;
  delete map[analysisId];
  write(map);
}
