import { useState, useRef, useCallback, useEffect } from 'react';
import { DeepgramClient } from '@deepgram/sdk';
import { getDeepgramToken } from '../api/deepgram';

const UNIVERSAL_KEYTERMS = [
  'OpenAI',
  'ChatGPT',
  'Anthropic',
  'Claude',
  'LLM',
  'AI',
];

const MAX_KEYTERMS = 50;

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
}

export interface UseSpeechRecognitionReturn {
  transcript: string;
  interimTranscript: string;
  isListening: boolean;
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
  const [error, setError] = useState<string | null>(null);

  const transcriptRef = useRef('');
  const interimRef = useRef('');
  const attemptCounterRef = useRef(0);
  const currentAttemptRef = useRef<Attempt | null>(null);
  const supportStatus = useRef(checkSupport()).current;
  const isSupported = supportStatus.supported;

  const resolveAttempt = useCallback((attempt: Attempt, finalText: string) => {
    if (currentAttemptRef.current?.id === attempt.id) {
      transcriptRef.current = finalText;
      interimRef.current = '';
      setTranscript(finalText);
      setInterimTranscript('');
      setIsListening(false);
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
    }
  }, []);

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
    };
    currentAttemptRef.current = attempt;

    void (async () => {
      try {
        const { accessToken } = await getDeepgramToken(sessionId);
        if (attempt.cancelled) return;

        const deepgramKeyterms = mergeKeyterms(keyterms);
        const deepgram = new DeepgramClient({ accessToken });
        const connection = await deepgram.listen.v1.connect({
          model: 'nova-3',
          language: 'en-US',
          smart_format: 'true',
          interim_results: 'true',
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

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (attempt.cancelled) {
          stream.getTracks().forEach(track => track.stop());
          teardownAttempt(attempt);
          return;
        }
        attempt.stream = stream;

        const recorder = new MediaRecorder(stream, { mimeType });
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0 && attempt.connection) {
            try {
              attempt.connection.sendMedia(event.data);
            } catch {
              // The WebSocket may already be closing.
            }
          }
        };
        recorder.onstop = () => {
          try {
            attempt.connection?.sendCloseStream({ type: 'CloseStream' });
          } catch {
            const finalText = getFinalText(transcriptRef.current, interimRef.current);
            resolveAttempt(attempt, finalText);
          }
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
          setIsListening(true);
        }
      } catch (err) {
        if (!attempt.cancelled) {
          console.error('startListening failed:', err);
          const message = err instanceof Error ? err.message : 'Failed to start recording';
          setError(message);
        }
        const finalText = getFinalText(transcriptRef.current, interimRef.current);
        attempt.stopResolver?.(finalText);
        attempt.stopResolver = null;
        teardownAttempt(attempt);
      }
    })();
  }, [isSupported, resolveAttempt, supportStatus.reason, teardownAttempt]);

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
      }, 3000);
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
    isSupported,
    error,
    startListening,
    stopListening,
    resetTranscript,
  };
}
