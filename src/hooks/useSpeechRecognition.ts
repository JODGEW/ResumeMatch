import { useState, useRef, useCallback, useEffect } from 'react';
import { DeepgramClient } from '@deepgram/sdk';
import { getDeepgramToken, transcribeFinal } from '../api/deepgram';
import { getTranscriptionAudioStream } from '../utils/audioStream';
import { applyNonsenseAliases } from '../utils/transcriptCorrection';

// Proper nouns only — generic tokens like "AI"/"LLM" hurt more than they help
// (Deepgram biases toward them and garbles ordinary speech).
const UNIVERSAL_KEYTERMS = [
  'OpenAI',
  'ChatGPT',
  'Anthropic',
  'Claude',
];

const MAX_KEYTERMS = 25;

// Hard ceiling on how long stopListening() will wait for the final transcript
// (batch transcription + token mint) before falling back to streaming text. The
// user is never blocked longer than this.
const FINALIZE_TIMEOUT_MS = 15000;

const PREFERRED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
];

function pickMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const mimeType of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(mimeType)) return mimeType;
  }
  return null;
}

function checkSupport(): { supported: boolean; reason: string | null } {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { supported: false, reason: 'No browser environment' };
  }
  if (!window.isSecureContext) {
    return { supported: false, reason: 'Microphone requires HTTPS or localhost' };
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return { supported: false, reason: 'getUserMedia not available' };
  }
  if (typeof MediaRecorder === 'undefined') {
    return { supported: false, reason: 'MediaRecorder not available' };
  }
  if (!pickMimeType()) {
    return { supported: false, reason: 'No supported audio MIME type' };
  }
  return { supported: true, reason: null };
}

type DeepgramConnection = {
  on(event: 'open' | 'message' | 'close' | 'error', callback: (...args: unknown[]) => void): void;
  connect(): DeepgramConnection;
  waitForOpen(): Promise<unknown>;
  sendMedia(data: Blob): void;
  sendCloseStream(message: { type: 'CloseStream' }): void;
  close(): void;
};

interface Attempt {
  id: number;
  cancelled: boolean;
  recorder: MediaRecorder | null;
  stream: MediaStream | null;
  connection: DeepgramConnection | null;
  stopRequested: boolean;
  stopResolver: ((text: string) => void) | null;
  sessionId: string;
  keyterms: string[];
  // Full session keyterm array (up to ~50), kept separate from `keyterms` (the
  // curated 25-term Deepgram prompt). Used only as post-STT correction targets.
  canonicalKeyterms: string[];
  mimeType: string;
  chunks: Blob[];
  finalizing: boolean;
}

export interface UseSpeechRecognitionReturn {
  transcript: string;
  interimTranscript: string;
  isListening: boolean;
  isArming: boolean;
  isFinalizing: boolean;
  isSupported: boolean;
  error: string | null;
  startListening: (sessionId: string, keyterms?: string[]) => void;
  stopListening: () => Promise<string>;
  resetTranscript: () => void;
}

function getFinalText(transcript: string, interim: string): string {
  return `${transcript} ${interim}`.trim();
}

function mergeKeyterms(sessionKeyterms: string[] = []): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();

  [...sessionKeyterms, ...UNIVERSAL_KEYTERMS].forEach(term => {
    const normalized = term.trim();
    if (!normalized) return;

    const key = normalized.toLowerCase();
    if (seen.has(key)) return;

    seen.add(key);
    merged.push(normalized);
  });

  return merged.slice(0, MAX_KEYTERMS);
}

export function useSpeechRecognition(): UseSpeechRecognitionReturn {
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isArming, setIsArming] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const transcriptRef = useRef('');
  const interimRef = useRef('');
  const attemptCounterRef = useRef(0);
  const currentAttemptRef = useRef<Attempt | null>(null);
  const supportStatus = useRef(checkSupport()).current;
  const isSupported = supportStatus.supported;

  const resolveAttempt = useCallback((attempt: Attempt, rawFinalText: string) => {
    // Central, idempotent Layer-2 pass: covers every resolution path (batch
    // success — where it re-runs harmlessly — streaming fallback, unexpected
    // close, and the finalize timeout). Layer 1 only runs on the batch path
    // inside transcribeFinal, which needs per-word confidence.
    const finalText = applyNonsenseAliases(rawFinalText);
    if (currentAttemptRef.current?.id === attempt.id) {
      transcriptRef.current = finalText;
      interimRef.current = '';
      setTranscript(finalText);
      setInterimTranscript('');
      setIsListening(false);
      setIsArming(false);
      setIsFinalizing(false);
      currentAttemptRef.current = null;
    }
    attempt.stopResolver?.(finalText);
    attempt.stopResolver = null;
  }, []);

  const teardownAttempt = useCallback((attempt: Attempt) => {
    try {
      if (attempt.recorder && attempt.recorder.state !== 'inactive') {
        attempt.recorder.stop();
      }
    } catch {
      // Already stopped.
    }
    attempt.stream?.getTracks().forEach(track => track.stop());
    try {
      attempt.connection?.close();
    } catch {
      // Already closed.
    }
    if (currentAttemptRef.current?.id === attempt.id) {
      currentAttemptRef.current = null;
      setIsListening(false);
      setIsArming(false);
      setIsFinalizing(false);
    }
  }, []);

  // Assemble the retained audio chunks into one Blob and run it through Deepgram's
  // pre-recorded endpoint for the graded transcript. Falls back to the streaming
  // transcript if the batch path fails or returns nothing, so the user is never
  // blocked. A fresh token is minted here (at stop) because the ~30s streaming
  // token is already expired by the time a normal answer ends.
  const finalizeAttempt = useCallback(async (attempt: Attempt) => {
    const streamingText = getFinalText(transcriptRef.current, interimRef.current);
    let finalText = streamingText;

    const blob = attempt.chunks.length > 0
      ? new Blob(attempt.chunks, { type: attempt.mimeType || attempt.chunks[0].type })
      : null;

    if (blob && blob.size > 0 && attempt.sessionId) {
      try {
        const { accessToken } = await getDeepgramToken(attempt.sessionId);
        const batchText = await transcribeFinal(blob, attempt.keyterms, accessToken, attempt.canonicalKeyterms);
        if (batchText) finalText = batchText;
      } catch (err) {
        console.error('Batch transcription failed; using streaming transcript:', err);
      }
    }

    resolveAttempt(attempt, finalText);
  }, [resolveAttempt]);

  useEffect(() => {
    return () => {
      if (currentAttemptRef.current) {
        currentAttemptRef.current.cancelled = true;
        teardownAttempt(currentAttemptRef.current);
      }
    };
  }, [teardownAttempt]);

  const startListening = useCallback((sessionId: string, keyterms: string[] = []): void => {
    if (!isSupported) {
      setError(supportStatus.reason ?? 'Audio recording not supported');
      return;
    }
    if (!sessionId) {
      setError('Missing interview session');
      return;
    }

    if (currentAttemptRef.current) {
      currentAttemptRef.current.cancelled = true;
      teardownAttempt(currentAttemptRef.current);
    }

    setError(null);
    transcriptRef.current = '';
    interimRef.current = '';
    setTranscript('');
    setInterimTranscript('');

    const attempt: Attempt = {
      id: ++attemptCounterRef.current,
      cancelled: false,
      recorder: null,
      stream: null,
      connection: null,
      stopRequested: false,
      stopResolver: null,
      sessionId,
      keyterms: [],
      canonicalKeyterms: keyterms,
      mimeType: '',
      chunks: [],
      finalizing: false,
    };
    currentAttemptRef.current = attempt;
    setIsArming(true);

    void (async () => {
      try {
        const { accessToken } = await getDeepgramToken(sessionId);
        if (attempt.cancelled) return;

        const deepgramKeyterms = mergeKeyterms(keyterms);
        attempt.keyterms = deepgramKeyterms;
        const deepgram = new DeepgramClient({ accessToken });
        const connection = await deepgram.listen.v1.connect({
          model: 'nova-3',
          language: 'en-US',
          smart_format: 'true',
          interim_results: 'true',
          // Privacy-policy commitment: opt out of Deepgram's model-improvement
          // program on every request (mirrors the batch call in api/deepgram.ts).
          mip_opt_out: 'true',
          keyterm: deepgramKeyterms,
          Authorization: `Bearer ${accessToken}`,
        }) as DeepgramConnection;
        attempt.connection = connection;

        connection.on('message', (data) => {
          if (currentAttemptRef.current?.id !== attempt.id) return;
          const record = data as {
            type?: string;
            is_final?: boolean;
            channel?: { alternatives?: Array<{ transcript?: string }> };
          };
          if (record.type !== 'Results') return;
          const text = record.channel?.alternatives?.[0]?.transcript ?? '';
          if (!text) return;

          if (record.is_final) {
            transcriptRef.current = getFinalText(transcriptRef.current, text);
            interimRef.current = '';
            setTranscript(transcriptRef.current);
            setInterimTranscript('');
          } else {
            interimRef.current = text;
            setInterimTranscript(text);
          }
        });

        connection.on('error', (err) => {
          if (currentAttemptRef.current?.id !== attempt.id) return;
          console.error('Deepgram error:', err);
          const message = err instanceof Error ? err.message : 'Transcription error';
          setError(message);
        });

        connection.on('close', () => {
          // After a stop, finalizeAttempt owns resolution (it runs the batch
          // transcription). Only resolve here for an unexpected close while still
          // listening, falling back to whatever streaming text we have.
          if (attempt.finalizing) return;
          const finalText = getFinalText(transcriptRef.current, interimRef.current);
          resolveAttempt(attempt, finalText);
        });

        connection.connect();
        await Promise.race([
          connection.waitForOpen(),
          new Promise((_, reject) => {
            window.setTimeout(() => reject(new Error('Deepgram connection timeout')), 5000);
          }),
        ]);
        if (attempt.cancelled) {
          teardownAttempt(attempt);
          return;
        }

        const mimeType = pickMimeType();
        if (!mimeType) throw new Error('No supported audio MIME type');
        attempt.mimeType = mimeType;

        const stream = await getTranscriptionAudioStream();
        if (attempt.cancelled) {
          stream.getTracks().forEach(track => track.stop());
          teardownAttempt(attempt);
          return;
        }
        attempt.stream = stream;

        const recorder = new MediaRecorder(stream, { mimeType });
        recorder.ondataavailable = (event) => {
          if (event.data.size === 0) return;
          // Retain every chunk for the batch (graded) transcript, and also feed the
          // streaming connection for live interim text.
          attempt.chunks.push(event.data);
          if (attempt.connection) {
            try {
              attempt.connection.sendMedia(event.data);
            } catch {
              // The WebSocket may already be closing.
            }
          }
        };
        recorder.onstop = () => {
          // Flush streaming finals (so the fallback transcript is as complete as
          // possible), then hand off to the batch path. finalizeAttempt now owns
          // resolution; the 'close' handler stands down.
          attempt.finalizing = true;
          if (currentAttemptRef.current?.id === attempt.id) {
            setIsListening(false);
            setIsFinalizing(true);
          }
          try {
            attempt.connection?.sendCloseStream({ type: 'CloseStream' });
          } catch {
            // The WebSocket may already be closing.
          }
          void finalizeAttempt(attempt);
        };
        attempt.recorder = recorder;
        recorder.start(250);

        if (attempt.stopRequested) {
          try {
            recorder.stop();
          } catch {
            // Already stopped.
          }
          stream.getTracks().forEach(track => track.stop());
          return;
        }

        if (currentAttemptRef.current?.id === attempt.id) {
          setIsArming(false);
          setIsListening(true);
        }
      } catch (err) {
        if (!attempt.cancelled) {
          console.error('startListening failed:', err);
          const message = err instanceof Error ? err.message : 'Failed to start recording';
          setError(message);
        }
        if (currentAttemptRef.current?.id === attempt.id) {
          setIsArming(false);
        }
        const finalText = getFinalText(transcriptRef.current, interimRef.current);
        attempt.stopResolver?.(finalText);
        attempt.stopResolver = null;
        teardownAttempt(attempt);
      }
    })();
  }, [isSupported, resolveAttempt, finalizeAttempt, supportStatus.reason, teardownAttempt]);

  const stopListening = useCallback((): Promise<string> => {
    const attempt = currentAttemptRef.current;
    if (!attempt) {
      return Promise.resolve(transcriptRef.current.trim());
    }

    attempt.stopRequested = true;

    return new Promise<string>((resolve) => {
      attempt.stopResolver = resolve;

      if (attempt.recorder && attempt.recorder.state !== 'inactive') {
        try {
          attempt.recorder.stop();
        } catch {
          // Already stopped.
        }
        attempt.stream?.getTracks().forEach(track => track.stop());
      } else if (attempt.connection) {
        attempt.cancelled = true;
        teardownAttempt(attempt);
        const finalText = getFinalText(transcriptRef.current, interimRef.current);
        resolveAttempt(attempt, finalText);
      } else {
        attempt.cancelled = true;
        const finalText = transcriptRef.current.trim();
        resolveAttempt(attempt, finalText);
      }

      window.setTimeout(() => {
        if (attempt.stopResolver) {
          const finalText = getFinalText(transcriptRef.current, interimRef.current);
          try {
            attempt.connection?.close();
          } catch {
            // Already closed.
          }
          resolveAttempt(attempt, finalText);
        }
      }, FINALIZE_TIMEOUT_MS);
    });
  }, [resolveAttempt, teardownAttempt]);

  const resetTranscript = useCallback(() => {
    transcriptRef.current = '';
    interimRef.current = '';
    setTranscript('');
    setInterimTranscript('');
  }, []);

  return {
    transcript,
    interimTranscript,
    isListening,
    isArming,
    isFinalizing,
    isSupported,
    error,
    startListening,
    stopListening,
    resetTranscript,
  };
}
