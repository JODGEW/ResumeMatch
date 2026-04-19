import { useEffect, useRef, useState } from 'react';
import { getAnalysis } from '../api/analysis';
import type { Analysis } from '../types';

const POLL_TIMEOUT_MS = 120_000; // 2 minutes

export function isInProgress(status: string): boolean {
  return status === 'pending' || status === 'processing' || status === 'pending_upload';
}

export function usePolling(analysisId: string | null, intervalMs = 3000) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
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

  return { analysis, loading, error, timedOut };
}
