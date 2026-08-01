import axios from 'axios';
import client from './client';
import type { Application } from '../types/tracker';

/** Surface the backend's validation message ({errors:[]} / {error}) instead of axios's opaque "status code 400". */
function apiError(err: unknown, fallback: string): Error {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: string; errors?: string[] } | undefined;
    const message = data?.errors?.join(', ') || data?.error;
    if (message) return new Error(message);
  }
  return err instanceof Error ? err : new Error(fallback);
}

// Identity is derived server-side from the Cognito JWT (claims.email); the four
// /applications Lambdas ignore any client-supplied userId. The shared client's
// Authorization interceptor attaches the ID token, so no userId is sent here.

type CreatePayload = Omit<Application, 'id' | 'createdAt' | 'updatedAt' | 'outreachWorth'>;

interface CreateResponse {
  applicationId: string;
  message: string;
}

interface ListResponse {
  applications: (Omit<Application, 'id'> & { applicationId: string })[];
  count: number;
}

interface UpdateResponse {
  message: string;
  application: Omit<Application, 'id'> & { applicationId: string };
}

/** Map API's `applicationId` field to our frontend `id` field. */
function toApplication(raw: Omit<Application, 'id'> & { applicationId: string }): Application {
  const { applicationId, ...rest } = raw;
  return { ...rest, id: applicationId };
}

export async function createApplication(data: CreatePayload): Promise<Application> {
  try {
    const { data: res } = await client.post<CreateResponse>('/applications', data);
    const now = new Date().toISOString();
    return {
      ...data,
      id: res.applicationId,
      outreachWorth: false, // Will be recalculated by caller
      createdAt: now,
      updatedAt: now,
    };
  } catch (err) {
    throw apiError(err, 'Failed to add application');
  }
}

export async function getApplications(): Promise<Application[]> {
  const { data } = await client.get<ListResponse>('/applications');
  return data.applications.map(toApplication);
}

export async function updateApplication(
  applicationId: string,
  updates: Partial<Application>,
): Promise<Application> {
  // Strip fields that shouldn't be sent to the server
  const { id, createdAt, updatedAt, ...payload } = updates;
  void id;
  void createdAt;
  void updatedAt;
  try {
    const { data } = await client.put<UpdateResponse>(`/applications/${applicationId}`, payload);
    return toApplication(data.application);
  } catch (err) {
    throw apiError(err, 'Failed to update application');
  }
}

export async function deleteApplication(applicationId: string): Promise<void> {
  await client.delete(`/applications/${applicationId}`);
}
