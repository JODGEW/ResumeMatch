import { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from '../auth/AuthContext';
import type { Application } from '../types/tracker';
import { SAMPLE_DATA, calculateOutreachScore } from '../types/tracker';
import * as api from '../api/applications';
import { extractApiErrorMessage } from '../api/errors';

const STORAGE_KEY = 'resumematch_tracker_applications';
// Email of the account that started the localStorage migration. While it is set,
// leftover records are retried on each load by that account only.
const MIGRATION_OWNER_KEY = 'resumematch_tracker_migration_owner';
// True while a migration loop runs in this page. Leaving Tracker does not cancel
// the loop, so a remount must not start a second one over the same records.
let migrationInFlight = false;

/**
 * Migrate legacy localStorage applications to the API and return the list to show.
 *
 * A first migration starts only when the API has no applications. Each record is
 * removed from storage as soon as its create succeeds; failed records stay and are
 * retried on the next load, as long as the same account is signed in. Both keys
 * are removed once no records remain.
 */
export async function syncLocalApplications(remote: Application[], userEmail: string): Promise<Application[]> {
  if (migrationInFlight) return remote;
  const raw = localStorage.getItem(STORAGE_KEY);
  const local: Application[] = raw ? JSON.parse(raw) : [];
  if (local.length === 0) return remote;

  const owner = localStorage.getItem(MIGRATION_OWNER_KEY);
  if (owner !== null && owner !== userEmail) {
    console.warn('Tracker migration belongs to a different account; leaving local records untouched');
    return remote;
  }
  if (owner === null) {
    if (remote.length > 0) {
      // Clean up localStorage if API has data (migration already done)
      localStorage.removeItem(STORAGE_KEY);
      return remote;
    }
    localStorage.setItem(MIGRATION_OWNER_KEY, userEmail);
  }

  const migrated: Application[] = [];
  let remaining = local;
  migrationInFlight = true;
  for (const app of local) {
    try {
      const { id, createdAt, updatedAt, outreachWorth, ...payload } = app;
      void id;
      void createdAt;
      void updatedAt;
      void outreachWorth;
      const created = await api.createApplication(payload);
      remaining = remaining.filter(r => r !== app);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(remaining));
      created.outreachWorth = calculateOutreachScore(created).worth;
      migrated.push(created);
    } catch (err) {
      // Message only: an axios error carries the request body, i.e. the record.
      console.warn('Tracker migration: create failed, will retry on next load:', err instanceof Error ? err.message : 'unknown error');
    }
  }
  migrationInFlight = false;
  if (remaining.length === 0) {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(MIGRATION_OWNER_KEY);
  }
  return [...migrated, ...remote];
}

export function useApplications() {
  const { user } = useAuth();
  const userEmail = user?.email;
  const isDemo = userEmail === 'demo123@resumeapp.com';

  const [applications, setApplications] = useState<Application[]>([]);
  const [isLoading, setIsLoading] = useState(!isDemo);
  const [error, setError] = useState<string | null>(null);
  const hasFetched = useRef(false);

  // Fetch applications from API on mount (non-demo only)
  useEffect(() => {
    if (isDemo || !userEmail || hasFetched.current) return;
    hasFetched.current = true;

    async function fetchAndMigrate(email: string) {
      try {
        const remote = await api.getApplications();
        setApplications(await syncLocalApplications(remote, email));
      } catch (err) {
        setError(extractApiErrorMessage(err, 'Failed to load applications'));
      } finally {
        setIsLoading(false);
      }
    }

    fetchAndMigrate(userEmail);
  }, [isDemo, userEmail]);

  const addApplication = useCallback(async (
    data: Omit<Application, 'id' | 'createdAt' | 'updatedAt' | 'outreachWorth'>,
  ) => {
    try {
      const created = await api.createApplication(data);
      created.outreachWorth = calculateOutreachScore(created).worth;
      setApplications(prev => [created, ...prev]);
    } catch (err) {
      setError(extractApiErrorMessage(err, 'Failed to add application'));
      throw err;
    }
  }, []);

  const updateApplication = useCallback(async (
    id: string,
    updates: Partial<Application>,
  ) => {
    // Auto-set statusChangedAt only when advancing to a new stage (not when reverting)
    const APP_STAGE_ORDER = ['not_applied', 'applied', 'screening', 'interviewing', 'offer', 'rejected'] as const;
    const enriched = { ...updates };

    // Use functional updater to read the truly current state
    let resolvedEnriched = enriched;
    setApplications(prev => {
      const existing = prev.find(app => app.id === id);
      if (existing && updates.applicationStatus && updates.applicationStatus !== existing.applicationStatus) {
        const oldIdx = APP_STAGE_ORDER.indexOf(existing.applicationStatus);
        const newIdx = APP_STAGE_ORDER.indexOf(updates.applicationStatus);
        if (newIdx > oldIdx) {
          enriched.statusChangedAt = new Date().toISOString();
        }
      }
      resolvedEnriched = { ...enriched };
      return prev.map(app => {
        if (app.id !== id) return app;
        const updated = { ...app, ...enriched, updatedAt: new Date().toISOString() };
        updated.outreachWorth = calculateOutreachScore(updated).worth;
        return updated;
      });
    });

    try {
      await api.updateApplication(id, resolvedEnriched);
    } catch (err) {
      // Revert on failure — re-fetch from server
      setError(extractApiErrorMessage(err, 'Failed to update application'));
      try {
        const remote = await api.getApplications();
        setApplications(remote);
      } catch {
        // If re-fetch also fails, leave the optimistic state
      }
    }
  }, []);

  const deleteApplication = useCallback(async (id: string) => {
    const prev = applications;
    // Optimistic delete
    setApplications(apps => apps.filter(app => app.id !== id));

    try {
      await api.deleteApplication(id);
    } catch (err) {
      // Revert on failure
      setApplications(prev);
      setError(extractApiErrorMessage(err, 'Failed to delete application'));
    }
  }, [applications]);

  const noopAddApplication = useCallback(async () => {}, []);
  const noopUpdateApplication = useCallback(async () => {}, []);
  const noopDeleteApplication = useCallback(async () => {}, []);

  // Demo mode: return sample data with no API calls
  if (isDemo) {
    return {
      applications: SAMPLE_DATA,
      isReadOnly: true,
      isLoading: false,
      error: null,
      addApplication: noopAddApplication,
      updateApplication: noopUpdateApplication,
      deleteApplication: noopDeleteApplication,
    };
  }

  return {
    applications,
    isReadOnly: false,
    isLoading,
    error,
    addApplication,
    updateApplication,
    deleteApplication,
  };
}
