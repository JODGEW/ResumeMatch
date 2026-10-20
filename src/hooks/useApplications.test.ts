import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Application } from '../types/tracker';

vi.mock('../auth/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../api/applications', () => ({ createApplication: vi.fn() }));

import * as api from '../api/applications';
import { syncLocalApplications } from './useApplications';

const STORAGE_KEY = 'resumematch_tracker_applications';
const OWNER_KEY = 'resumematch_tracker_migration_owner';
const ME = 'me@example.com';

const createApplication = vi.mocked(api.createApplication);

function makeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

function app(companyName: string): Application {
  return {
    id: `local-${companyName}`,
    companyName,
    roleTitle: 'Engineer',
    dateApplied: '2025-01-01',
    resumeVersion: 'frontend',
    skillMatch: { matchedSkills: [], missingSkills: [], matchPercentage: 50 },
    applicationStatus: 'applied',
    outreachWorth: false,
    companySize: 'startup',
    outreachStatus: 'not_started',
    notes: '',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  };
}

function seed(apps: Application[], owner?: string) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(apps));
  if (owner) localStorage.setItem(OWNER_KEY, owner);
}

function stored(): string[] | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as Application[]).map(a => a.companyName) : null;
}

// Succeeds for every company except the ones listed.
function failFor(...companies: string[]) {
  createApplication.mockImplementation(async payload => {
    if (companies.includes(payload.companyName)) throw new Error('Request failed with status code 500');
    return { ...payload, id: `remote-${payload.companyName}`, outreachWorth: false, createdAt: 'x', updatedAt: 'x' };
  });
}

// Holds the nth create open until the returned release() is called; the others
// keep the implementation already set by failFor().
function holdCreate(n: number): () => void {
  const succeed = createApplication.getMockImplementation()!;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let calls = 0;
  createApplication.mockImplementation(async payload => {
    if (++calls === n) await gate;
    return succeed(payload);
  });
  return release;
}

const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

beforeEach(() => {
  vi.stubGlobal('localStorage', makeStorage());
  createApplication.mockReset();
  warn.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('syncLocalApplications', () => {
  it('removes both keys when every create succeeds', async () => {
    seed([app('Acme'), app('Globex'), app('Initech')]);
    failFor();

    const result = await syncLocalApplications([], ME);

    expect(result.map(a => a.id)).toEqual(['remote-Acme', 'remote-Globex', 'remote-Initech']);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(OWNER_KEY)).toBeNull();
  });

  it('keeps only the failed records when some creates fail', async () => {
    seed([app('Acme'), app('Globex'), app('Initech')]);
    failFor('Globex');

    const result = await syncLocalApplications([], ME);

    expect(result.map(a => a.id)).toEqual(['remote-Acme', 'remote-Initech']);
    expect(stored()).toEqual(['Globex']);
    expect(localStorage.getItem(OWNER_KEY)).toBe(ME);
  });

  it('keeps every record and both keys when all creates fail', async () => {
    seed([app('Acme'), app('Globex')]);
    failFor('Acme', 'Globex');

    const result = await syncLocalApplications([], ME);

    expect(result).toEqual([]);
    expect(stored()).toEqual(['Acme', 'Globex']);
    expect(localStorage.getItem(OWNER_KEY)).toBe(ME);
  });

  it('has already removed migrated records when the loop stops mid-way', async () => {
    seed([app('Acme'), app('Globex'), app('Initech')]);
    failFor();
    // Second create is held open: stands in for the tab closing mid-loop.
    const release = holdCreate(2);

    const run = syncLocalApplications([], ME);
    await vi.waitFor(() => expect(createApplication).toHaveBeenCalledTimes(2));

    expect(stored()).toEqual(['Globex', 'Initech']);
    expect(localStorage.getItem(OWNER_KEY)).toBe(ME);

    release();
    await run;
  });

  it('returns without touching storage or creating anything while a run is in flight', async () => {
    seed([app('Acme'), app('Globex')]);
    failFor();
    const release = holdCreate(1);
    const existing = { ...app('Acme'), id: 'remote-Acme' };

    const first = syncLocalApplications([], ME);
    await vi.waitFor(() => expect(createApplication).toHaveBeenCalledTimes(1));
    const before = { apps: localStorage.getItem(STORAGE_KEY), owner: localStorage.getItem(OWNER_KEY) };
    const setItem = vi.spyOn(localStorage, 'setItem');
    const removeItem = vi.spyOn(localStorage, 'removeItem');

    // Remount of Tracker while the first loop is still running.
    const second = await syncLocalApplications([existing], ME);

    expect(second).toEqual([existing]);
    expect(createApplication).toHaveBeenCalledTimes(1);
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect({ apps: localStorage.getItem(STORAGE_KEY), owner: localStorage.getItem(OWNER_KEY) }).toEqual(before);

    release();
    const result = await first;
    expect(result.map(a => a.id)).toEqual(['remote-Acme', 'remote-Globex']);
    expect(createApplication).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(OWNER_KEY)).toBeNull();
  });

  it('retries leftover records for the same account even when the API is no longer empty', async () => {
    seed([app('Globex')], ME);
    failFor();
    const existing = { ...app('Acme'), id: 'remote-Acme' };

    const result = await syncLocalApplications([existing], ME);

    expect(result.map(a => a.id)).toEqual(['remote-Globex', 'remote-Acme']);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(OWNER_KEY)).toBeNull();
  });

  it('leaves both keys untouched when the migration belongs to another account', async () => {
    seed([app('Globex')], 'someone-else@example.com');
    failFor();

    const result = await syncLocalApplications([], ME);

    expect(result).toEqual([]);
    expect(createApplication).not.toHaveBeenCalled();
    expect(stored()).toEqual(['Globex']);
    expect(localStorage.getItem(OWNER_KEY)).toBe('someone-else@example.com');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('does not start a first migration when the API already has data', async () => {
    seed([app('Globex')]);
    const existing = { ...app('Acme'), id: 'remote-Acme' };

    const result = await syncLocalApplications([existing], ME);

    expect(result).toEqual([existing]);
    expect(createApplication).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('logs failures without record contents', async () => {
    seed([app('Globex')]);
    createApplication.mockRejectedValue(Object.assign(new Error('Network Error'), {
      config: { data: JSON.stringify({ companyName: 'Globex' }) },
    }));

    await syncLocalApplications([], ME);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).toContain('Network Error');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('Globex');
  });
});
