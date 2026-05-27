import { describe, expect, it } from 'vitest';
import { isUploadQuotaError } from './uploadQuotaGate';

describe('isUploadQuotaError', () => {
  it('detects backend quota responses with the explicit upgrade flag', () => {
    expect(isUploadQuotaError({
      response: {
        status: 429,
        data: { upgradeRequired: true },
      },
    })).toBe(true);
  });

  it('detects 429 quota responses even when the backend omits upgradeRequired', () => {
    expect(isUploadQuotaError({
      response: {
        status: 429,
        data: { error: 'Daily analysis limit reached' },
      },
    })).toBe(true);
  });

  it('treats a bare 429 from the upload endpoint as the quota gate', () => {
    expect(isUploadQuotaError({
      response: {
        status: 429,
      },
    })).toBe(true);
  });

  it('does not classify non-429 failures as quota gates', () => {
    expect(isUploadQuotaError({
      response: {
        status: 500,
        data: { error: 'Upload failed' },
      },
    })).toBe(false);
  });
});
