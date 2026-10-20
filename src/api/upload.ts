import client from './client';

export async function getResumeUrl(analysisId: string, userId: string): Promise<string> {
  const { data } = await client.get(`/resume/${analysisId}?userId=${userId}`);
  return data.url;
}

export async function fetchLastResume(): Promise<{
  analysisId: string;
  fileName: string;
  uploadedAt: string;
} | null> {
  const { data } = await client.get('/user/last-resume');
  return data.lastResume ?? null;
}

export async function requestUploadUrl(fileName: string, jobDescription: string) {
  const { data } = await client.post('/upload', { fileName, jobDescription });
  return data; // returns { presignedUrl, presignedFields, analysisId, s3Key }
}

export async function requestUploadWithReuse(
  existingAnalysisId: string,
  jobDescription: string
) {
  const { data } = await client.post('/upload', { existingAnalysisId, jobDescription });
  return data; // returns { analysisId, reused: true, presignedUrl: null, presignedFields: null }
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

/**
 * What the Upload page does once uploadFileToS3 settles: 'proceed' saves the
 * resume as the last one used and navigates to Results; 'fail' shows an error
 * and stays put. `uploadErr` is what uploadFileToS3 threw, or null if it resolved.
 *
 * The only tolerated failure is a TypeError from fetch: the S3 presigned POST
 * can store the file and still leave the browser unable to read the response
 * (CORS). A real network failure throws the same TypeError; usePolling catches
 * that case when the row never leaves pending_upload. A non-2xx response or
 * any other error means the file did not reach S3.
 */
export function uploadNextStep(uploadErr: unknown): 'proceed' | 'fail' {
  return uploadErr === null || uploadErr instanceof TypeError ? 'proceed' : 'fail';
}
