/**
 * Copy for a failed Deepgram token mint (POST /interview/deepgram-token).
 *
 * Recording starts only after the token is minted, so a failure here means the
 * user may have started speaking into nothing. The message has to say so, and
 * must not look like a microphone problem — otherwise the user debugs their
 * mic. The endpoint's own error strings ("token mint cap reached for this
 * session") are notes for us, so every status gets copy written here instead.
 */
export const VOICE_UNAVAILABLE =
  'Voice input is unavailable right now, so nothing was recorded. Wait a moment, then try the mic again.';

export function voiceTokenErrorMessage(err: unknown): string {
  const status = (err as { response?: { status?: number } })?.response?.status;

  switch (status) {
    case 400:
    case 404:
      return 'This interview is no longer active, so voice input is off. You can start a new interview.';
    case 401:
      return 'Your sign-in needs refreshing. Refresh the page, then try the mic again.';
    case 429:
      return 'Voice input has reached its limit for this interview. You can start a new interview to keep practicing.';
    default:
      // 5xx, no response (network, CORS), or anything unrecognised.
      return VOICE_UNAVAILABLE;
  }
}
