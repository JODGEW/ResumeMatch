import { useEffect, useRef, useState } from 'react';
import { getAnalysis } from '../api/analysis';
import type { Analysis } from '../types';

const POLL_TIMEOUT_MS = 120_000; // 2 minutes

export type NormalizedAnalysisStatus =
  | 'pending'
  | 'processing'
  | 'pending_upload'
  | 'completed'
  | 'failed'
  | 'unknown';

export function normalizeAnalysisStatus(status: unknown): NormalizedAnalysisStatus {
  const normalized = String(status ?? '').trim().toLowerCase().replace(/-/g, '_');

  if (
    normalized === 'pending'
    || normalized === 'processing'
    || normalized === 'pending_upload'
    || normalized === 'completed'
    || normalized === 'failed'
  ) {
    return normalized;
  }

  return 'unknown';
}

export function isInProgress(status: unknown): boolean {
  const normalized = normalizeAnalysisStatus(status);
  return normalized === 'pending'
    || normalized === 'processing'
    || normalized === 'pending_upload'
    || normalized === 'unknown';
}

export function usePolling(analysisId: string | null, intervalMs = 3000) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    setAnalysis(null);
    setError(null);
    setTimedOut(false);
    setLoading(Boolean(analysisId));

    if (!analysisId) return;

    let cancelled = false;

    async function poll() {
      try {
        const data = await getAnalysis(analysisId!);
        if (cancelled) return;
        setAnalysis(data);
        setLoading(false);
        if (!isInProgress(data.status)) {
          clearInterval(timerRef.current);
          clearTimeout(timeoutRef.current);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Polling failed');
        setLoading(false);
        clearInterval(timerRef.current);
        clearTimeout(timeoutRef.current);
      }
    }

    // Fetch once first, only start polling if still in progress
    (async () => {
      try {
        const data = await getAnalysis(analysisId);
        if (cancelled) return;
        setAnalysis(data);
        setLoading(false);
        if (isInProgress(data.status)) {
          timerRef.current = setInterval(poll, intervalMs);
          timeoutRef.current = setTimeout(() => {
            clearInterval(timerRef.current);
            setTimedOut(true);
          }, POLL_TIMEOUT_MS);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Polling failed');
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      clearInterval(timerRef.current);
      clearTimeout(timeoutRef.current);
    };
  }, [analysisId, intervalMs]);

  const hasStaleAnalysis = Boolean(analysisId && analysis && analysis.analysisId !== analysisId);

  return {
    analysis: hasStaleAnalysis ? null : analysis,
    loading: loading || hasStaleAnalysis,
    error,
    timedOut,
  };
}
