import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('./client', () => ({ default: {} }));

import { uploadFileToS3, uploadNextStep } from './upload';

const file = new File(['resume'], 'resume.pdf', { type: 'application/pdf' });

// What the Upload page sees: null if uploadFileToS3 resolved, else what it threw.
async function settle(fetchImpl: () => Promise<Response>): Promise<unknown> {
  vi.stubGlobal('fetch', vi.fn(fetchImpl));
  try {
    await uploadFileToS3('https://bucket.example.com', { key: 'k' }, file);
    return null;
  } catch (err) {
    return err;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('S3 upload outcome', () => {
  it('proceeds on a 2xx response', async () => {
    const err = await settle(async () => new Response(null, { status: 204 }));
    expect(err).toBeNull();
    expect(uploadNextStep(err)).toBe('proceed');
  });

  it('fails on a non-2xx response', async () => {
    const err = await settle(async () => new Response('AccessDenied', { status: 403 }));
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('S3 upload failed: 403');
    expect(uploadNextStep(err)).toBe('fail');
  });

  it('proceeds when fetch throws a TypeError (CORS-unreadable response)', async () => {
    const err = await settle(async () => { throw new TypeError('Failed to fetch'); });
    expect(err).toBeInstanceOf(TypeError);
    expect(uploadNextStep(err)).toBe('proceed');
  });

  it('fails on any other error', async () => {
    const err = await settle(async () => { throw new DOMException('The operation was aborted.', 'AbortError'); });
    expect(err).not.toBeInstanceOf(TypeError);
    expect(uploadNextStep(err)).toBe('fail');
    expect(uploadNextStep(new Error('boom'))).toBe('fail');
  });
});
