export function scoreColor(score: number): string {
  if (score >= 80) return 'var(--score-high)';
  if (score >= 60) return 'var(--score-good)';
  return 'var(--score-mid)';
}
