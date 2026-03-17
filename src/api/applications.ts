import client from './client';
import { fetchAuthSession } from 'aws-amplify/auth';
import type { Application } from '../types/tracker';

const DEV_MODE = import.meta.env.VITE_DEV_BYPASS === 'true';

async function getUserId(): Promise<string> {
  if (DEV_MODE) return 'dev@example.com';
  const session = await fetchAuthSession();
  return session.tokens?.idToken?.payload?.email as string;
}

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
  const userId = await getUserId();
  const { data: res } = await client.post<CreateResponse>(`/applications?userId=${userId}`, data);
  const now = new Date().toISOString();
  return {
    ...data,
    id: res.applicationId,
    outreachWorth: false, // Will be recalculated by caller
    createdAt: now,
    updatedAt: now,
  };
}

export async function getApplications(): Promise<Application[]> {
  const userId = await getUserId();
  const { data } = await client.get<ListResponse>(`/applications?userId=${userId}`);
  return data.applications.map(toApplication);
}

export async function updateApplication(
  applicationId: string,
  updates: Partial<Application>,
): Promise<Application> {
  const userId = await getUserId();
  // Strip fields that shouldn't be sent to the server
  const { id: _id, createdAt: _ca, updatedAt: _ua, ...payload } = updates;
  const { data } = await client.put<UpdateResponse>(`/applications/${applicationId}?userId=${userId}`, payload);
  return toApplication(data.application);
}

export async function deleteApplication(applicationId: string): Promise<void> {
  const userId = await getUserId();
  await client.delete(`/applications/${applicationId}?userId=${userId}`);
}
