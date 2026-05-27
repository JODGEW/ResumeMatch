type UploadErrorData = {
  error?: unknown;
  errorMessage?: unknown;
  message?: unknown;
  upgradeRequired?: unknown;
};

type UploadErrorResponse = {
  response?: {
    status?: number;
    data?: UploadErrorData;
  };
};

function responseMessage(data?: UploadErrorData): string {
  if (!data || typeof data !== 'object') return '';
  return [data.error, data.errorMessage, data.message]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();
}

export function isUploadQuotaError(err: unknown): boolean {
  const axiosErr = err as UploadErrorResponse;
  const response = axiosErr?.response;
  if (response?.status !== 429) return false;
  if (response.data?.upgradeRequired === true) return true;

  const message = responseMessage(response.data);
  if (!message) return true;

  return /analysis|analyses|resume|quota|limit|upgrade|daily/.test(message);
}
