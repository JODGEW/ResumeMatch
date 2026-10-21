import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { Analysis } from '../types';

vi.mock('../api/analysis', () => ({ getAnalysis: vi.fn() }));

import {
  startPolling,
  POLL_TIMEOUT_MS,
  PENDING_UPLOAD_LIMIT_MS,
  MAX_CONSECUTIVE_FAILURES,
} from './usePolling';
import { AnalysisProgressCard } from '../components/AnalysisProgressCard';

const INTERVAL = 3000;

function row(status: string): Analysis {
  return { analysisId: 'a1', status } as Analysis;
}

const serverError = () => Object.assign(new Error('Request failed with status code 503'), { response: { status: 503 } });
const notFound = () => Object.assign(new Error('Request failed with status code 404'), { response: { status: 404 } });
const networkError = () => new Error('Network Error');

function handlers() {
  return { onData: vi.fn(), onError: vi.fn(), onTimeout: vi.fn(), onUploadMissing: vi.fn() };
}

// Each call takes the next scripted result; the last one repeats.
function script(...steps: Array<Analysis | Error>) {
  let i = 0;
  return vi.fn(async () => {
    const step = steps[Math.min(i++, steps.length - 1)];
    if (step instanceof Error) throw step;
    return step;
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('startPolling', () => {
  it('keeps going after a 5xx and resets the failure count on success', async () => {
    const fails = Array.from({ length: MAX_CONSECUTIVE_FAILURES - 1 }, serverError);
    const fetch = script(row('processing'), ...fails, row('processing'), ...fails, row('completed'));
    const h = handlers();
    startPolling(fetch, h, INTERVAL);

    await vi.advanceTimersByTimeAsync(POLL_TIMEOUT_MS - 1);

    expect(h.onError).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(2 * MAX_CONSECUTIVE_FAILURES + 1);
    expect(h.onData).toHaveBeenLastCalledWith(row('completed'));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('backs off between failed attempts', async () => {
    const fetch = script(networkError());
    startPolling(fetch, handlers(), INTERVAL);

    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2 * INTERVAL - 1);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(4 * INTERVAL - 1);
    expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it(`stops after ${MAX_CONSECUTIVE_FAILURES} consecutive failures`, async () => {
    const fetch = script(row('processing'), networkError(), serverError(), networkError(), serverError(), networkError());
    const h = handlers();
    startPolling(fetch, h, INTERVAL);

    await vi.advanceTimersByTimeAsync(POLL_TIMEOUT_MS * 2);

    expect(fetch).toHaveBeenCalledTimes(1 + MAX_CONSECUTIVE_FAILURES);
    expect(h.onError).toHaveBeenCalledTimes(1);
    expect(h.onError.mock.calls[0][0].message).toBe('Network Error');
    expect(h.onTimeout).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops at once on a 4xx', async () => {
    const fetch = script(row('processing'), notFound(), row('processing'));
    const h = handlers();
    startPolling(fetch, h, INTERVAL);

    await vi.advanceTimersByTimeAsync(POLL_TIMEOUT_MS * 2);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(h.onError).toHaveBeenCalledTimes(1);
    expect(h.onError.mock.calls[0][0].response.status).toBe(404);
    expect(vi.getTimerCount()).toBe(0);
  });

  it(`times out after ${POLL_TIMEOUT_MS / 1000}s and stops polling`, async () => {
    const fetch = script(row('processing'));
    const h = handlers();
    startPolling(fetch, h, INTERVAL);

    await vi.advanceTimersByTimeAsync(POLL_TIMEOUT_MS - 1);
    expect(h.onTimeout).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(h.onTimeout).toHaveBeenCalledTimes(1);

    const calls = fetch.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetch).toHaveBeenCalledTimes(calls);
    expect(h.onError).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reports a backend failed status as data, not a timeout', async () => {
    const fetch = script(row('processing'), row('failed'));
    const h = handlers();
    startPolling(fetch, h, INTERVAL);

    await vi.advanceTimersByTimeAsync(POLL_TIMEOUT_MS * 2);

    expect(h.onData).toHaveBeenLastCalledWith(row('failed'));
    expect(h.onTimeout).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it(`reports a missing upload when still pending_upload ${PENDING_UPLOAD_LIMIT_MS / 1000}s in`, async () => {
    const fetch = script(row('pending_upload'));
    const h = handlers();
    startPolling(fetch, h, INTERVAL);

    await vi.advanceTimersByTimeAsync(PENDING_UPLOAD_LIMIT_MS - 1);
    expect(h.onUploadMissing).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(h.onUploadMissing).toHaveBeenCalledTimes(1);
    expect(h.onTimeout).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not report a missing upload once the row has moved on', async () => {
    const fetch = script(row('pending_upload'), row('pending_upload'), row('processing'));
    const h = handlers();
    startPolling(fetch, h, INTERVAL);

    await vi.advanceTimersByTimeAsync(PENDING_UPLOAD_LIMIT_MS * 2);

    expect(h.onUploadMissing).not.toHaveBeenCalled();
  });

  it('clears every timer and ignores late responses when stopped (unmount)', async () => {
    let resolve!: (a: Analysis) => void;
    const fetch = vi.fn()
      .mockResolvedValueOnce(row('processing'))
      .mockImplementationOnce(() => new Promise<Analysis>(r => { resolve = r; }));
    const h = handlers();
    const stop = startPolling(fetch, h, INTERVAL);

    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(fetch).toHaveBeenCalledTimes(2);
    // The deadline, and the next poll the in-flight one scheduled when it started.
    expect(vi.getTimerCount()).toBe(2);

    stop();
    expect(vi.getTimerCount()).toBe(0);

    resolve(row('completed'));
    await vi.advanceTimersByTimeAsync(POLL_TIMEOUT_MS * 2);
    expect(h.onData).toHaveBeenCalledTimes(1);
    expect(h.onTimeout).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

// A fetch whose responses settle only when the test says so, in any order.
function deferredFetch() {
  const calls: Array<{ resolve: (a: Analysis) => void; reject: (e: unknown) => void }> = [];
  const fetch = vi.fn(() => new Promise<Analysis>((resolve, reject) => { calls.push({ resolve, reject }); }));
  return { fetch, calls };
}

describe('fixed cadence', () => {
  it('polls every interval however long responses take, a deterministic 80 times in 240s', async () => {
    const fetch = vi.fn(() => new Promise<Analysis>(() => {}));
    const h = handlers();
    startPolling(fetch, h, INTERVAL);

    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(INTERVAL - 1);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetch).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(POLL_TIMEOUT_MS - INTERVAL);
    // Polls start at 0, 3s, ... 237s; the deadline at 240s fires first and stops the next.
    expect(fetch).toHaveBeenCalledTimes(POLL_TIMEOUT_MS / INTERVAL);
    expect(fetch).toHaveBeenCalledTimes(80);
    expect(h.onTimeout).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('ignores a late processing response once completed was handled', async () => {
    const { fetch, calls } = deferredFetch();
    const h = handlers();
    startPolling(fetch, h, INTERVAL);
    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(calls).toHaveLength(2);

    calls[1].resolve(row('completed'));
    await vi.advanceTimersByTimeAsync(0);
    calls[0].resolve(row('processing'));
    await vi.advanceTimersByTimeAsync(POLL_TIMEOUT_MS);

    expect(h.onData.mock.calls.map(([data]) => data.status)).toEqual(['completed']);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('ignores an earlier-started poll whose response lands after a later one', async () => {
    const { fetch, calls } = deferredFetch();
    const h = handlers();
    startPolling(fetch, h, INTERVAL);
    await vi.advanceTimersByTimeAsync(INTERVAL);

    calls[1].resolve(row('processing'));
    await vi.advanceTimersByTimeAsync(0);
    calls[0].resolve(row('pending_upload'));
    await vi.advanceTimersByTimeAsync(0);
    expect(h.onData.mock.calls.map(([data]) => data.status)).toEqual(['processing']);

    // An earlier poll's failure is just as stale: it neither counts nor backs off.
    await vi.advanceTimersByTimeAsync(2 * INTERVAL);
    expect(calls).toHaveLength(4);
    calls[3].resolve(row('processing'));
    await vi.advanceTimersByTimeAsync(0);
    calls[2].reject(serverError());
    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(fetch).toHaveBeenCalledTimes(5);
    expect(h.onError).not.toHaveBeenCalled();
  });

  it('backs off on a 5xx, then resumes the fixed cadence after a success', async () => {
    const fetch = script(row('processing'), serverError(), row('processing'));
    const h = handlers();
    startPolling(fetch, h, INTERVAL);

    // 0s ok; 3s fails; the 6s cadence poll is replaced by a retry at 3s + 6s.
    await vi.advanceTimersByTimeAsync(3 * INTERVAL - 1);
    expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetch).toHaveBeenCalledTimes(3);
    // The retry succeeded, so polls fall back to every interval: 12s, 15s, 18s.
    await vi.advanceTimersByTimeAsync(3 * INTERVAL);
    expect(fetch).toHaveBeenCalledTimes(6);
    expect(h.onError).not.toHaveBeenCalled();
  });
});

describe('timeout and missing-upload copy', () => {
  // Link's useLayoutEffect warns under renderToStaticMarkup; the markup is unaffected.
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function render(mode: 'timeout' | 'upload_missing') {
    return renderToStaticMarkup(
      <MemoryRouter>
        <AnalysisProgressCard mode={mode} analysisId="a1" />
      </MemoryRouter>
    );
  }

  it('says the analysis may still be running, points to History, and asks not to resubmit', () => {
    const html = render('timeout');
    expect(html).toContain('This is taking longer than usual');
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/&#x27;/g, "'");
    expect(text).toContain(
      "We checked for four minutes and it hasn't finished yet. It may still be running. Check History in a few minutes to see the result. Please don't submit the same resume and job description again, because that starts a second analysis."
    );
    expect(text).toContain('Go to History');
    expect(text).toContain('Check again');
    expect(text).toContain('Start a new analysis');
    expect(text).not.toMatch(/failed|could not be completed/i);
  });

  it('tells the user the file did not reach us', () => {
    const text = render('upload_missing').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/&#x27;/g, "'");
    expect(text).toContain("Your resume didn't upload");
    expect(text).toContain("The file did not reach us, so this analysis can't start. Please try again.");
    expect(text).toContain('Start a new analysis');
  });
});
