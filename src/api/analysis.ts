import client from './client';
import { fetchAuthSession } from 'aws-amplify/auth';
import type { Analysis } from '../types';

const DEV_MODE = import.meta.env.VITE_DEV_BYPASS === 'true';

async function getUserId(): Promise<string> {
  if (DEV_MODE) return 'dev@example.com';
  const session = await fetchAuthSession();
  return session.tokens?.idToken?.payload?.email as string;
}

export async function getAnalysis(analysisId: string): Promise<Analysis> {
  const userId = await getUserId();
  const { data } = await client.get<Analysis>(`/analysis/${analysisId}?userId=${userId}`);
  return data;
}

export async function getAnalysisHistory(): Promise<Analysis[]> {
  const userId = await getUserId();
  const { data } = await client.get<Analysis[]>(`/history/${userId}`);
  return data;
}