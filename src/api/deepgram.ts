import client from './client';
import { correctTranscript, applyNonsenseAliases, type TranscriptWord } from '../utils/transcriptCorrection';

export interface DeepgramTokenResponse {
  accessToken: string;
  expiresIn: number;
}

/**
 * Mint a short-lived Deepgram access token for the given interview session.
 *
 * The returned token is a JWT with ~30 second TTL. It only needs to be valid
 * during the initial WebSocket handshake; after Deepgram accepts the
 * connection, the WebSocket stays open independently of token expiry.
 *
 * Throws on auth failure, inactive session, or token mint cap reached.
 */
export async function getDeepgramToken(sessionId: string): Promise<DeepgramTokenResponse> {
  if (!sessionId) {
    throw new Error('sessionId is required');
  }

  const { data } = await client.post<DeepgramTokenResponse>(
    '/interview/deepgram-token',
    { sessionId },
  );

  return data;
}

const DEEPGRAM_LISTEN_URL = 'https://api.deepgram.com/v1/listen';

interface DeepgramWord {
  word?: string;
  punctuated_word?: string;
  confidence?: number;
}

interface DeepgramListenResponse {
  results?: {
    channels?: Array<{
      alternatives?: Array<{ transcript?: string; words?: DeepgramWord[] }>;
    }>;
  };
}

/**
 * Transcribe a fully recorded answer with Deepgram's pre-recorded REST endpoint.
 *
 * Streaming transcription optimizes for latency and tends to garble words; running
 * the complete audio through the batch endpoint after the user stops talking yields
 * a more accurate transcript for grading. Kept as a standalone function so the STT
 * source can be swapped without touching the recording hook.
 *
 * `accessToken` must be a fresh Deepgram token (see getDeepgramToken). Mint it right
 * before calling — temporary tokens expire ~30s after issue, so one minted at the
 * start of a long answer is already dead by stop time.
 *
 * Returns the transcript, or '' when Deepgram returns no text. Throws on HTTP error
 * so the caller can fall back to the streaming transcript.
 *
 * Before returning, the parsed transcript runs through a conservative post-STT
 * correction layer (see utils/transcriptCorrection) that recovers mis-transcribed
 * technical terms. `keyterms` is still the curated Deepgram keyterm prompt;
 * `canonicalTerms` is the FULL session keyterm array used as correction targets —
 * the two are intentionally separate.
 */
export async function transcribeFinal(
  blob: Blob,
  keyterms: string[],
  accessToken: string,
  canonicalTerms: string[] = [],
): Promise<string> {
  const params = new URLSearchParams({
    model: 'nova-3',
    smart_format: 'true',
    language: 'en-US',
  });
  keyterms.forEach((term) => {
    const trimmed = term.trim();
    if (trimmed) params.append('keyterm', trimmed);
  });

  const res = await fetch(`${DEEPGRAM_LISTEN_URL}?${params.toString()}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': blob.type || 'audio/webm',
    },
    body: blob,
  });

  if (!res.ok) {
    throw new Error(`Deepgram batch transcription failed (${res.status})`);
  }

  const data = (await res.json()) as DeepgramListenResponse;
  const alternative = data.results?.channels?.[0]?.alternatives?.[0];
  const transcript = alternative?.transcript?.trim() ?? '';
  if (!transcript) return '';

  // Layer 1 needs per-word confidence; when the words array is present, run the
  // full correction pipeline. Without it, fall back to Layer 2 (nonsense aliases)
  // on the plain transcript so we never throw on missing confidences.
  const rawWords = alternative?.words ?? [];
  if (rawWords.length === 0) {
    return applyNonsenseAliases(transcript);
  }

  const words: TranscriptWord[] = rawWords.map((w) => ({
    word: (w.punctuated_word ?? w.word ?? '').trim(),
    confidence: typeof w.confidence === 'number' ? w.confidence : 0,
  }));
  return correctTranscript(words, canonicalTerms).trim();
}
