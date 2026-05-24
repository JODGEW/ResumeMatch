import client from './client';
import type { UserSubscription } from '../types/entitlements';

const DEV_MODE = import.meta.env.VITE_DEV_BYPASS === 'true';

/**
 * Fetch the caller's billing/usage row.
 *
 * Backend contract (to be created in the AWS console — see handoff):
 *   GET /users/me
 *   - auth: Cognito JWT (the authorizer identifies the user by `sub`;
 *     no userId query param — unlike the legacy analysis/history routes)
 *   - 200: UserSubscription
 *   - 404: no row yet → caller treats as a brand-new Free user
 *
 * Defensive on purpose: a missing/garbled row must resolve to Free, never
 * throw into the render path. The resolver in utils/entitlements handles the
 * safe-default logic; this layer only normalizes transport.
 */
export async function getMe(): Promise<UserSubscription | null> {
  if (DEV_MODE) {
    // Dev bypass skips Cognito; expose full Pro so local work isn't paywalled.
    return {
      userId: 'dev',
      plan: 'pro_monthly',
      subscriptionStatus: 'active',
    };
  }

  try {
    const { data } = await client.get<UserSubscription>('/users/me');
    if (!data || typeof data !== 'object') return null;
    return data;
  } catch (err: unknown) {
    // 404 = no Users row provisioned yet → brand-new Free user, not an error.
    const status =
      typeof err === 'object' && err !== null && 'response' in err
        ? (err as { response?: { status?: number } }).response?.status
        : undefined;
    if (status === 404) return null;
    throw err;
  }
}
