import { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from '../auth/AuthContext';
import { getMe } from '../api/users';
import {
  resolveEntitlements,
  freeFallbackEntitlements,
} from '../utils/entitlements';
import type { Entitlements } from '../types/entitlements';

/**
 * Resolves the current user's entitlements once on mount.
 *
 * Conventions matched: per-feature hook (no state manager), demo-account
 * short-circuit by email (single source of truth, same as useApplications),
 * safe Free fallback so a `/users/me` outage degrades instead of crashing.
 *
 * `entitlements` is never null — it starts at and falls back to Free, so
 * gating callers can read it unconditionally.
 */
export function useEntitlements() {
  const { user } = useAuth();
  // Demo account showcases the full product, so it resolves as Pro. This is a
  // product decision (flagged in the handoff) — flip by removing this branch.
  const isDemo = user?.email === 'demo123@resumeapp.com';

  const [entitlements, setEntitlements] = useState<Entitlements | null>(() =>
    isDemo
      ? resolveEntitlements({
          userId: 'demo',
          plan: 'pro_monthly',
          subscriptionStatus: 'active',
        })
      : freeFallbackEntitlements(),
  );
  const [isLoading, setIsLoading] = useState(!isDemo);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  const refresh = useCallback(async () => {
    if (isDemo) return;
    const id = ++reqId.current;
    setIsLoading(true);
    setError(null);
    try {
      const me = await getMe();
      if (id !== reqId.current) return; // stale response, newer refresh won
      // getMe() already converts 404 to `me === null`, which the resolver
      // safely turns into Free defaults — that's the new-signup happy path.
      setEntitlements(resolveEntitlements(me));
    } catch (err) {
      if (id !== reqId.current) return;
      // Non-404 backend error: surface to the caller so it can render an
      // error state (Pricing has a Retry button). We deliberately drop
      // entitlements to null instead of silently defaulting to Free, which
      // would hide real outages and make Pro users look like Free users.
      setEntitlements(null);
      setError(
        err instanceof Error ? err.message : 'Failed to load entitlements',
      );
    } finally {
      if (id === reqId.current) setIsLoading(false);
    }
  }, [isDemo]);

  useEffect(() => {
    if (isDemo) return;
    refresh();
  }, [isDemo, refresh]);

  return { entitlements, isLoading, error, refresh };
}
