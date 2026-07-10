import axios from 'axios';
import client from './client';

/**
 * A contact returned by the enrichment proxy. The shape is aligned to the
 * Application.contact block so a hit can be written straight back with
 * updateApplication(id, { contact }).
 */
export interface FoundContact {
  name: string;
  role: string;
  email?: string;
  linkedinUrl?: string;
  source: string;
  /**
   * How the Lambda resolved the company. "domain" is an exact lookup;
   * "company" is fuzzy name matching against Hunter's org index and can hit a
   * different company with a similar name, so the UI shows a caution.
   */
  lookupMethod: 'domain' | 'company';
}

/**
 * Wire contract for POST /outreach/find-contact.
 *
 *   Request:  { applicationId, companyName, domain? }
 *   200:      { contact: FoundContact }   a contact was found
 *   404:      the lookup ran but found nobody (the defined not found signal)
 *   other:    any other status, or a network failure, means the lookup itself
 *             is unavailable, which the caller surfaces separately from
 *             "not found"
 *
 * The Hunter or Apollo secret lives only in the Lambda behind this route, the
 * same way the Deepgram secret lives behind /interview/deepgram-token. The
 * frontend only ever calls our own API Gateway route through the shared client
 * (x-api-key plus the Cognito Bearer token), so no third party key is shipped
 * to the browser. Identity is derived server side from the JWT, so no userId is
 * sent here.
 */

interface FindContactResponse {
  contact: FoundContact;
}

/** A 404 is the agreed "lookup ran, found nobody" signal, distinct from a failure. */
function isNotFound(err: unknown): boolean {
  return axios.isAxiosError(err) && err.response?.status === 404;
}

/** Surface the backend's validation message instead of axios's opaque status text. */
function apiError(err: unknown, fallback: string): Error {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: string; errors?: string[] } | undefined;
    const message = data?.errors?.join(', ') || data?.error;
    if (message) return new Error(message);
  }
  return err instanceof Error ? err : new Error(fallback);
}

/**
 * Parameters for findContact.
 *
 * companyName is the clean value from the Application record. The Lambda needs
 * it because the ResumeAnalysis table has no company attribute: the company
 * only appears in free text, sometimes after an "@" in jobTitle and often not
 * at all, so the server cannot reconstruct it. applicationId is passed for log
 * correlation only; the Lambda does not key on it. domain is sent only when the
 * Application already has one, and is omitted otherwise.
 */
export interface FindContactParams {
  applicationId: string;
  companyName: string;
  domain?: string;
}

/**
 * Ask the enrichment proxy to find a hiring contact for an application.
 *
 * Returns the found contact, or null when the lookup ran but found nobody
 * (HTTP 404, the defined not found signal). Throws on any other failure, which
 * the caller treats as "lookup unavailable" rather than "no contact found".
 */
export async function findContact(params: FindContactParams): Promise<FoundContact | null> {
  if (!params.companyName) {
    throw new Error('companyName is required');
  }
  try {
    const { data } = await client.post<FindContactResponse>(
      '/outreach/find-contact',
      params,
    );
    return data.contact;
  } catch (err) {
    if (isNotFound(err)) return null;
    throw apiError(err, 'Contact lookup failed');
  }
}
