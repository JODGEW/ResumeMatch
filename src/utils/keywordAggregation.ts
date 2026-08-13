import type { Analysis } from '../types';

// Cross-JD keyword aggregation for the History page's "Recurring gaps" panel.
//
// Deliberately NOT a cross-JD score ranking: matchScore values are not
// comparable across different job descriptions (measured 2026-07-09, see the
// jobs-feed retro). Aggregating requirement *text* sidesteps that entirely —
// counting how many unique JDs demand a keyword needs no score at all.

export interface RecurringGap {
  /** Display form: the most frequent original casing seen in the data. */
  keyword: string;
  /** Number of unique JDs whose analysis lists the keyword as missing. */
  missingIn: number;
  /** Number of unique JDs that demand the keyword at all (missing or present). */
  demandedIn: number;
}

export interface KeywordAggregation {
  /** Unique completed job descriptions counted (after dedup). */
  jdCount: number;
  /** Keywords missing in at least MIN_RECURRENCE unique JDs, most-missed first. */
  gaps: RecurringGap[];
}

/** A gap must recur across at least this many unique JDs to surface. */
export const MIN_RECURRENCE = 2;
/** The panel needs at least this many unique JDs before aggregation means anything. */
export const MIN_UNIQUE_JDS = 3;

// Variant -> canonical merge key, so "Golang" and "Go" count as one demand.
// Mirrors the spirit of the backend's KEYWORD_ALIASES (analyzeResume): a small
// closed list of genuine shorthand only — an unknown term stays itself rather
// than being guessed at. Keys and values are normalized (lowercase, trimmed).
const MERGE_ALIASES: Record<string, string> = {
  'golang': 'go',
  'k8s': 'kubernetes',
  'k8': 'kubernetes',
  'postgres': 'postgresql',
  'gha': 'github actions',
  'js': 'javascript',
  'ts': 'typescript',
  'reactjs': 'react',
  'react.js': 'react',
  'nodejs': 'node.js',
  'node': 'node.js',
  'nextjs': 'next.js',
  'amazon web services': 'aws',
  'google cloud platform': 'google cloud',
  'gcp': 'google cloud',
  'continuous integration': 'ci/cd',
  'continuous delivery': 'ci/cd',
  'continuous deployment': 'ci/cd',
};

function normalizeKeyword(raw: string): string {
  const norm = raw.trim().replace(/\s+/g, ' ').toLowerCase();
  return MERGE_ALIASES[norm] ?? norm;
}

// One JD analyzed twice (re-upload, cache hit, tweak-and-retry) must count
// once. jobDescription text is the strongest identity; jobTitle is the
// fallback for rows the API returns without it (older records, demo
// fixtures); analysisId last, which simply disables dedup for that row.
function dedupKey(a: Analysis): string {
  const jd = a.jobDescription?.trim().replace(/\s+/g, ' ').toLowerCase();
  if (jd) return `jd#${jd}`;
  const title = a.jobTitle?.trim().toLowerCase();
  if (title) return `title#${title}`;
  return `id#${a.analysisId}`;
}

/**
 * Aggregate keyword demand across a user's analyses.
 *
 * Callers pass the list newest-first (History's load order); when several
 * analyses share a JD, the first one seen — the newest — is the one counted.
 * Only completed analyses that actually carry keyword data participate.
 */
export function aggregateKeywords(analyses: Analysis[]): KeywordAggregation {
  const seenJds = new Set<string>();
  let jdCount = 0;

  interface Tally {
    missingIn: number;
    demandedIn: number;
    casings: Map<string, number>;
    firstSeen: number;
  }
  const tallies = new Map<string, Tally>();

  function tally(raw: string, missing: boolean) {
    const key = normalizeKeyword(raw);
    if (!key) return;
    let t = tallies.get(key);
    if (!t) {
      t = { missingIn: 0, demandedIn: 0, casings: new Map(), firstSeen: tallies.size };
      tallies.set(key, t);
    }
    t.demandedIn += 1;
    if (missing) t.missingIn += 1;
    const display = raw.trim().replace(/\s+/g, ' ');
    t.casings.set(display, (t.casings.get(display) ?? 0) + 1);
  }

  for (const a of analyses) {
    if (a.status !== 'completed') continue;
    const missing = a.missingKeywords ?? [];
    const present = a.presentKeywords ?? [];
    if (missing.length + present.length === 0) continue;

    const key = dedupKey(a);
    if (seenJds.has(key)) continue;
    seenJds.add(key);
    jdCount += 1;

    // Per-JD dedup of the keyword lists themselves: a keyword listed twice in
    // one analysis is still one demand. Present wins over missing on the
    // (defensive) chance a keyword appears in both — evidence exists.
    const presentSet = new Set(present.map(normalizeKeyword));
    const counted = new Set<string>();
    for (const raw of [...present, ...missing]) {
      const norm = normalizeKeyword(raw);
      if (!norm || counted.has(norm)) continue;
      counted.add(norm);
      tally(raw, !presentSet.has(norm));
    }
  }

  const gaps: RecurringGap[] = [...tallies.values()]
    .filter(t => t.missingIn >= MIN_RECURRENCE)
    .map(t => {
      let display = '';
      let best = -1;
      for (const [casing, count] of t.casings) {
        if (count > best) {
          best = count;
          display = casing;
        }
      }
      return { keyword: display, missingIn: t.missingIn, demandedIn: t.demandedIn, firstSeen: t.firstSeen };
    })
    .sort((x, y) =>
      y.missingIn - x.missingIn
      || y.demandedIn - x.demandedIn
      || x.firstSeen - y.firstSeen,
    )
    .map(({ keyword, missingIn, demandedIn }) => ({ keyword, missingIn, demandedIn }));

  return { jdCount, gaps };
}
