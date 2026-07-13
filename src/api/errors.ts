/**
 * Backend error bodies carry the user-facing copy under one of these keys —
 * notably the daily-limit 429s from /upload and /interview/start. Axios's own
 * err.message for those is just "Request failed with status code 429", so
 * callers must prefer the body. Key order matches the long-standing Upload
 * behavior: error, then errorMessage, then message.
 */
export function extractApiErrorMessage(err: unknown, fallback: string): string {
  const axiosErr = err as {
    response?: { data?: { error?: string; errorMessage?: string; message?: string } };
  };
  const data = axiosErr?.response?.data;
  return data?.error
    || data?.errorMessage
    || data?.message
    || (err instanceof Error ? err.message : '')
    || fallback;
}
