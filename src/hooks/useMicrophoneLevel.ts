import { useCallback, useEffect, useRef, useState } from 'react';

export type MicLevelStatus = 'idle' | 'starting' | 'active' | 'denied' | 'error';

export interface UseMicrophoneLevelReturn {
  status: MicLevelStatus;
  bins: number[];
  start: () => Promise<boolean>;
  stop: () => void;
  error: string | null;
}

const BAR_COUNT = 5;
const SMOOTHING = 0.4;
const FFT_SIZE = 64;
const BOOST = 1.6;

function getErrorMessage(err: unknown): string {
  if (err instanceof DOMException) {
    if (err.name === 'NotAllowedError') return 'Microphone permission was denied.';
    if (err.name === 'NotFoundError') return 'No microphone was found.';
  }
  if (err instanceof Error && err.message) return err.message;
  return 'Could not access your microphone.';
}

export function useMicrophoneLevel(): UseMicrophoneLevelReturn {
  const [status, setStatus] = useState<MicLevelStatus>('idle');
  const [bins, setBins] = useState<number[]>(() => Array(BAR_COUNT).fill(0));
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataRef = useRef<Uint8Array | null>(null);
  const rafRef = useRef<number | null>(null);
  const smoothedRef = useRef<number[]>(Array(BAR_COUNT).fill(0));
  const mountedRef = useRef(true);
  const statusRef = useRef<MicLevelStatus>('idle');
  statusRef.current = status;

  const stop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (sourceRef.current) {
      try { sourceRef.current.disconnect(); } catch { /* node already disconnected */ }
      sourceRef.current = null;
    }
    analyserRef.current = null;
    dataRef.current = null;
    if (ctxRef.current && ctxRef.current.state !== 'closed') {
      ctxRef.current.close().catch(() => { /* context already closing */ });
    }
    ctxRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    smoothedRef.current = Array(BAR_COUNT).fill(0);
    if (mountedRef.current) {
      setBins(Array(BAR_COUNT).fill(0));
      setStatus(prev => (prev === 'denied' || prev === 'error') ? prev : 'idle');
    }
  }, []);

  const start = useCallback(async (): Promise<boolean> => {
    if (statusRef.current === 'active') return true;
    if (statusRef.current === 'starting') return false;

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      if (mountedRef.current) {
        setStatus('error');
        setError('Microphone API not available.');
      }
      return false;
    }

    if (mountedRef.current) {
      setStatus('starting');
      setError(null);
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mountedRef.current) {
        stream.getTracks().forEach(t => t.stop());
        return false;
      }
      streamRef.current = stream;

      const Ctx: typeof AudioContext = window.AudioContext
        || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) {
        stop();
        if (mountedRef.current) {
          setStatus('error');
          setError('Audio analysis not available.');
        }
        return false;
      }
      const ctx = new Ctx();
      ctxRef.current = ctx;
      // Some browsers create AudioContext suspended outside a user gesture;
      // resume() may no-op silently — meter will show flat bars until next gesture.
      if (ctx.state === 'suspended') {
        try { await ctx.resume(); } catch { /* gesture required */ }
      }

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0.7;
      source.connect(analyser);
      sourceRef.current = source;
      analyserRef.current = analyser;
      dataRef.current = new Uint8Array(analyser.frequencyBinCount);

      if (mountedRef.current) setStatus('active');

      const tick = () => {
        const a = analyserRef.current;
        const data = dataRef.current;
        if (!a || !data) return;
        a.getByteFrequencyData(data);
        const usable = Math.floor(data.length * 0.75);
        const groupSize = Math.max(1, Math.floor(usable / BAR_COUNT));
        const next: number[] = [];
        for (let i = 0; i < BAR_COUNT; i++) {
          let sum = 0;
          for (let j = 0; j < groupSize; j++) {
            sum += data[i * groupSize + j];
          }
          const avg = (sum / groupSize) / 255;
          const boosted = Math.min(1, avg * BOOST);
          const prev = smoothedRef.current[i];
          const smoothed = SMOOTHING * boosted + (1 - SMOOTHING) * prev;
          smoothedRef.current[i] = smoothed;
          next.push(smoothed);
        }
        if (mountedRef.current) setBins(next);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
      return true;
    } catch (err) {
      stop();
      const isDenied = err instanceof DOMException && err.name === 'NotAllowedError';
      if (mountedRef.current) {
        setStatus(isDenied ? 'denied' : 'error');
        setError(getErrorMessage(err));
      }
      return false;
    }
  }, [stop]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stop();
    };
  }, [stop]);

  return { status, bins, start, stop, error };
}
