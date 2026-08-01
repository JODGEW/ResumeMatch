/**
 * The match-score rubric — five tiers, documented in README.md.
 *
 * Single source of truth on purpose: these thresholds previously lived in three
 * places (ProgressRing, the History card, the Results breakdown bars) and drifted,
 * so the same number could render green in one part of a card and blue in another.
 * Every score-coloured surface reads from here.
 *
 * The design bundles band on four (85 / 70 / 55); we keep five because the tiers
 * carry user-facing labels and actions that README documents. If that ever
 * changes, it changes here and in README together.
 */

export type ScoreTier = 'high' | 'good' | 'mid' | 'low' | 'poor';

export interface ScoreBand {
  tier: ScoreTier;
  label: string;
  /** Solid colour: rings, bar fills, numeric readouts. */
  color: string;
  /** Tinted background for pills. */
  dim: string;
  /** Pill border. */
  border: string;
}

const BANDS: ReadonlyArray<{ min: number } & ScoreBand> = [
  { min: 86, tier: 'high', label: 'Strong Match', color: 'var(--score-high)', dim: 'var(--score-high-dim)', border: 'var(--success-border)' },
  { min: 76, tier: 'good', label: 'Good Match', color: 'var(--score-good)', dim: 'var(--score-good-dim)', border: 'var(--info-border)' },
  { min: 61, tier: 'mid', label: 'Moderate Match', color: 'var(--score-mid)', dim: 'var(--score-mid-dim)', border: 'var(--warning-border)' },
  { min: 41, tier: 'low', label: 'Weak Match', color: 'var(--score-low)', dim: 'var(--score-low-dim)', border: 'var(--score-low-border)' },
  { min: Number.NEGATIVE_INFINITY, tier: 'poor', label: 'Poor Match', color: 'var(--score-poor)', dim: 'var(--score-poor-dim)', border: 'var(--danger-border)' },
];

export function getScoreBand(score: number): ScoreBand {
  const clamped = Math.max(0, Math.min(100, Number(score) || 0));
  return BANDS.find(b => clamped >= b.min) ?? BANDS[BANDS.length - 1];
}

export function getScoreColor(score: number): string {
  return getScoreBand(score).color;
}
