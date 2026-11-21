/** Session length in whole minutes ("19 min"), never below 1; null when unknown. */
export function formatDuration(seconds?: number): string | null {
  if (seconds == null || !Number.isFinite(seconds)) return null;
  return `${Math.max(1, Math.round(seconds / 60))} min`;
}
