import client from './client';
import { fetchAuthSession } from 'aws-amplify/auth';

export async function getResumeUrl(analysisId: string, userId: string): Promise<string> {
  const { data } = await client.get(`/resume/${analysisId}?userId=${userId}`);
  return data.url;
}

export async function requestUploadUrl(fileName: string, jobDescription: string) {
  const session = await fetchAuthSession();
  const userId = (session.tokens?.idToken?.payload?.email as string) || 'dev@example.com';

  const { data } = await client.post('/upload', { userId, fileName, jobDescription });
  return data; // returns { presignedUrl, presignedFields, analysisId, s3Key }
}

export async function uploadFileToS3(
  uploadUrl: string,
  presignedFields: Record<string, string>,
  file: File
): Promise<void> {
  const formData = new FormData();
  Object.entries(presignedFields).forEach(([key, value]) => {
    formData.append(key, value);
  });
  formData.append('file', file);

  const response = await fetch(uploadUrl, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    throw new Error(`S3 upload failed: ${response.status}`);
  }
}