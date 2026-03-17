import { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from '../auth/AuthContext';
import type { Application } from '../types/tracker';
import { SAMPLE_DATA, calculateOutreachScore } from '../types/tracker';
import * as api from '../api/applications';

const STORAGE_KEY = 'resumematch_tracker_applications';

export function useApplications() {
  const { user } = useAuth();
  const isDemo = user?.email === 'demo123@resumeapp.com';

  const [applications, setApplications] = useState<Application[]>([]);
  const [isLoading, setIsLoading] = useState(!isDemo);
  const [error, setError] = useState<string | null>(null);
  const hasFetched = useRef(false);

  // Fetch applications from API on mount (non-demo only)
  useEffect(() => {
    if (isDemo || hasFetched.current) return;
    hasFetched.current = true;

    async function fetchAndMigrate() {
      try {
        const remote = await api.getApplications();

        // One-time localStorage migration: if API is empty but localStorage has data
        const raw = localStorage.getItem(STORAGE_KEY);
        const local: Application[] = raw ? JSON.parse(raw) : [];

        if (remote.length === 0 && local.length > 0) {
          // Migrate localStorage data to DynamoDB
          const migrated: Application[] = [];
          for (const app of local) {
            try {
              const { id: _id, createdAt: _ca, updatedAt: _ua, outreachWorth: _ow, ...payload } = app;
              const created = await api.createApplication(payload);
              created.outreachWorth = calculateOutreachScore(created).worth;
              migrated.push(created);
            } catch {
              // Skip individual failures, keep going
            }
          }
          setApplications(migrated);
          localStorage.removeItem(STORAGE_KEY);
        } else {
          setApplications(remote);
          // Clean up localStorage if API has data (migration already done)
          if (remote.length > 0 && local.length > 0) {
            localStorage.removeItem(STORAGE_KEY);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load applications');
      } finally {
        setIsLoading(false);
      }
    }

    fetchAndMigrate();
  }, [isDemo]);

  // Demo mode: return sample data with no API calls
  if (isDemo) {
    return {
      applications: SAMPLE_DATA,
      isReadOnly: true,
      isLoading: false,
      error: null,
      addApplication: () => {},
      updateApplication: () => {},
      deleteApplication: () => {},
    };
  }

  const addApplication = useCallback(async (
    data: Omit<Application, 'id' | 'createdAt' | 'updatedAt' | 'outreachWorth'>,
  ) => {
    try {
      const created = await api.createApplication(data);
      created.outreachWorth = calculateOutreachScore(created).worth;
      setApplications(prev => [created, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add application');
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
      setError(err instanceof Error ? err.message : 'Failed to update application');
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
      setError(err instanceof Error ? err.message : 'Failed to delete application');
    }
  }, [applications]);

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
