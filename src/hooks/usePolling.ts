import { useEffect, useRef, useState } from 'react';
import { getAnalysis } from '../api/analysis';
import type { Analysis } from '../types';

export function usePolling(analysisId: string | null, intervalMs = 3000) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    if (!analysisId) return;

    let cancelled = false;

    async function poll() {
      try {
        const data = await getAnalysis(analysisId!);
        if (cancelled) return;
        setAnalysis(data);
        setLoading(false);
        if (data.status === 'completed' || data.status === 'failed') {
          clearInterval(timerRef.current);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Polling failed');
        setLoading(false);
        clearInterval(timerRef.current);
      }
    }

    // Fetch once first, only start polling if still in progress
    (async () => {
      try {
        const data = await getAnalysis(analysisId);
        if (cancelled) return;
        setAnalysis(data);
        setLoading(false);
        if (data.status !== 'completed' && data.status !== 'failed') {
          timerRef.current = setInterval(poll, intervalMs);
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
    };
  }, [analysisId, intervalMs]);

  return { analysis, loading, error };
}
