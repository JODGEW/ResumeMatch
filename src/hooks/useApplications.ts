import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import type { Application } from '../types/tracker';
import { SAMPLE_DATA, calculateOutreachScore } from '../types/tracker';

const STORAGE_KEY = 'resumematch_tracker_applications';

function useIsDemo(): boolean {
  const { user } = useAuth();
  return user?.email === 'demo123@resumeapp.com';
}

function loadFromStorage(): Application[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveToStorage(apps: Application[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(apps));
}

export function useApplications() {
  const isDemo = useIsDemo();
  const [applications, setApplications] = useState<Application[]>(() =>
    isDemo ? SAMPLE_DATA : loadFromStorage()
  );

  useEffect(() => {
    if (!isDemo) {
      saveToStorage(applications);
    }
  }, [applications, isDemo]);

  const addApplication = useCallback((app: Omit<Application, 'id' | 'createdAt' | 'updatedAt' | 'outreachWorth'>) => {
    if (isDemo) return;
    const now = new Date().toISOString();
    const newApp: Application = {
      ...app,
      id: crypto.randomUUID(),
      outreachWorth: calculateOutreachScore(app as Application).worth,
      createdAt: now,
      updatedAt: now,
    };
    setApplications(prev => [newApp, ...prev]);
    return newApp;
  }, [isDemo]);

  const updateApplication = useCallback((id: string, updates: Partial<Application>) => {
    if (isDemo) return;
    setApplications(prev =>
      prev.map(app => {
        if (app.id !== id) return app;
        const updated = { ...app, ...updates, updatedAt: new Date().toISOString() };
        updated.outreachWorth = calculateOutreachScore(updated).worth;
        return updated;
      })
    );
  }, [isDemo]);

  const deleteApplication = useCallback((id: string) => {
    if (isDemo) return;
    setApplications(prev => prev.filter(app => app.id !== id));
  }, [isDemo]);

  return {
    applications,
    isReadOnly: isDemo,
    addApplication,
    updateApplication,
    deleteApplication,
  };
}
