// Capture constraints tuned for speech transcription: mono, 48 kHz, with the
// browser's standard voice-processing chain. These are advisory hints (not
// `{ exact }`), so a device that can't honor them downgrades rather than failing —
// but some browsers still reject the whole request, so callers fall back to a bare
// `{ audio: true }` stream.
export const TRANSCRIPTION_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  channelCount: 1,
  sampleRate: 48000,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

/**
 * Acquire a microphone stream suitable for transcription. Tries the tuned
 * constraints first and falls back to a plain audio request if the browser rejects
 * them. Permission / no-device errors are re-thrown unchanged so the existing
 * permission UIs keep working.
 */
export async function getTranscriptionAudioStream(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: TRANSCRIPTION_AUDIO_CONSTRAINTS });
  } catch (err) {
    if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'NotFoundError')) {
      throw err;
    }
    // The device couldn't satisfy the tuned constraints — retry with a bare request.
    return navigator.mediaDevices.getUserMedia({ audio: true });
  }
}
