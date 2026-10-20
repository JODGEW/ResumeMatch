import { useEffect, useState } from 'react';
import { getAnalysis } from '../api/analysis';
import { extractApiErrorMessage } from '../api/errors';
import type { Analysis } from '../types';

const LOAD_FAILED = "We couldn't load this analysis. Please refresh the page.";

export const POLL_TIMEOUT_MS = 240_000; // 4 minutes
// A row still in pending_upload this long after polling starts means the S3 POST
// never landed: analyzeResume moves it to processing as soon as the file arrives.
// This is what catches a real network failure that Upload let through as a
// CORS-unreadable response (both surface as a fetch TypeError).
export const PENDING_UPLOAD_LIMIT_MS = 60_000;
export const MAX_CONSECUTIVE_FAILURES = 5;
const MAX_BACKOFF_MS = 30_000;

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

// Network errors (no response) and 5xx are worth another try; a 4xx will not
// change on retry.
function isRetryable(err: unknown): boolean {
  const status = (err as { response?: { status?: number } })?.response?.status;
  return typeof status !== 'number' || status >= 500;
}

export interface PollingHandlers {
  onData: (data: Analysis) => void;
  onError: (err: unknown) => void;
  onTimeout: () => void;
  onUploadMissing: () => void;
}

/**
 * Fetches once, then keeps polling every `intervalMs` while the analysis is in
 * progress. Each outcome that ends polling (terminal status, error, timeout,
 * missing upload) fires at most one handler and clears every timer. The
 * returned function stops polling the same way and silences late responses.
 */
export function startPolling(
  fetchAnalysis: () => Promise<Analysis>,
  handlers: PollingHandlers,
  intervalMs: number,
): () => void {
  const startedAt = Date.now();
  let stopped = false;
  let failures = 0;
  let nextPoll: ReturnType<typeof setTimeout> | undefined;

  function stop() {
    stopped = true;
    clearTimeout(nextPoll);
    clearTimeout(deadline);
  }

  const deadline = setTimeout(() => {
    stop();
    handlers.onTimeout();
  }, POLL_TIMEOUT_MS);

  async function poll() {
    try {
      const data = await fetchAnalysis();
      if (stopped) return;
      failures = 0;
      handlers.onData(data);
      if (!isInProgress(data.status)) {
        stop();
      } else if (
        normalizeAnalysisStatus(data.status) === 'pending_upload'
        && Date.now() - startedAt >= PENDING_UPLOAD_LIMIT_MS
      ) {
        stop();
        handlers.onUploadMissing();
      } else {
        nextPoll = setTimeout(poll, intervalMs);
      }
    } catch (err) {
      if (stopped) return;
      failures += 1;
      if (!isRetryable(err) || failures >= MAX_CONSECUTIVE_FAILURES) {
        stop();
        handlers.onError(err);
        return;
      }
      nextPoll = setTimeout(poll, Math.min(intervalMs * 2 ** failures, MAX_BACKOFF_MS));
    }
  }

  void poll();
  return stop;
}

export function usePolling(analysisId: string | null, intervalMs = 3000) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [uploadMissing, setUploadMissing] = useState(false);

  useEffect(() => {
    setAnalysis(null);
    setError(null);
    setTimedOut(false);
    setUploadMissing(false);
    setLoading(Boolean(analysisId));

    if (!analysisId) return;

    return startPolling(() => getAnalysis(analysisId), {
      onData: data => {
        setAnalysis(data);
        setLoading(false);
      },
      onError: err => {
        setError(extractApiErrorMessage(err, LOAD_FAILED));
        setLoading(false);
      },
      onTimeout: () => {
        setTimedOut(true);
        setLoading(false);
      },
      onUploadMissing: () => {
        setUploadMissing(true);
        setLoading(false);
      },
    }, intervalMs);
  }, [analysisId, intervalMs]);

  const hasStaleAnalysis = Boolean(analysisId && analysis && analysis.analysisId !== analysisId);

  return {
    analysis: hasStaleAnalysis ? null : analysis,
    loading: loading || hasStaleAnalysis,
    error,
    timedOut,
    uploadMissing,
  };
}
