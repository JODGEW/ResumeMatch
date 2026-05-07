import client from './client';

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
