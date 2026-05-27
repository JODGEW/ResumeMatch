// Single source of truth for plan limits + the pure entitlement resolver.
//
// `resolveEntitlements` is the shared decision logic referenced by
// Free-pro-tier.md §2.3. It is deterministic and side-effect free so it can be
// unit-snapshotted and (conceptually) re-implemented identically on the backend
// enforcement Lambdas. UI never branches on `plan` directly — it calls this.

import type {
  Entitlements,
  FeatureKey,
  Plan,
  PlanLimits,
  SubscriptionStatus,
  UserSubscription,
} from '../types/entitlements';

// ===========================================================================
// CONSTANTS DRIFT GUARD — read before changing any number below.
//
//  * FREE_LIMITS / PRO_LIMITS are the SINGLE SOURCE OF TRUTH for entitlement
//    gating. Nothing else may declare these values.
//  * Every backend enforcement Lambda — analysis quota, interview quota,
//    optimized-download gate, history cap — MUST use these same values. It may
//    NOT re-declare them locally.
//  * No shared FE/BE constants module exists yet (TS app vs Python Lambdas).
//    Whoever builds the backend must EITHER (a) extract these into a shared
//    module both sides import, OR (b) at minimum add a comment in the Lambda
//    pointing at THIS file and stating the values must match byte-for-byte.
//  * Silent drift between frontend and backend limit constants is the
//    highest-risk failure mode of this layer (users gated differently than the
//    UI claims, or paywall bypassable). Treat ANY divergence as a
//    release-blocking bug, not a cleanup item.
// ---------------------------------------------------------------------------
// Limits — keep in lockstep with Free-pro-tier.md §1.1 / §1.2 and README.
// Numbers resolved against the (now-fixed) planning-doc conflicts:
//   - Free interviews/day = 1  (D2 authoritative; Free-pro-tier.md updated to
//     match — this constant remains the binding source of truth).
// ===========================================================================

const NO_FEATURES: Record<FeatureKey, boolean> = {
  categoryExplanations: false,
  fullMissingKeywords: false,
  rewriteSuggestions: false,
  sideBySideDiff: false,
  docxExport: false,
  technicalInterview: false,
  followUpQuestions: false,
  perTurnFeedback: false,
  transcriptExport: false,
  fullAssessment: false,
};

const ALL_FEATURES: Record<FeatureKey, boolean> = {
  categoryExplanations: true,
  fullMissingKeywords: true,
  rewriteSuggestions: true,
  sideBySideDiff: true,
  docxExport: true,
  technicalInterview: true,
  followUpQuestions: true,
  perTurnFeedback: true,
  transcriptExport: true,
  fullAssessment: true,
};

export const FREE_LIMITS: PlanLimits = {
  analysesPerDay: 2,
  interviewsPerDay: 1,
  interviewQuestions: 5,
  historyVisibleRows: 5,
  features: NO_FEATURES,
};

// pro_monthly and pro_sprint share identical limits (Free-pro-tier.md §2.2).
export const PRO_LIMITS: PlanLimits = {
  analysesPerDay: 10,
  interviewsPerDay: 5,
  interviewQuestions: 10,
  historyVisibleRows: 500,
  features: ALL_FEATURES,
};

export const CAREER_SPRINT_DAYS = 60;

// ---------------------------------------------------------------------------
// Product micro-decisions not explicitly resolved in the planning doc.
// Centralized here as named toggles so they are a one-line change and are
// auditable. Flagged to the user in the implementation handoff — confirm.
// ---------------------------------------------------------------------------

/** A failed-payment (Stripe-retrying) monthly sub. `false` = safest: drop to
 *  Free limits immediately. Set `true` to grant a grace window instead. */
export const PAST_DUE_RETAINS_PRO = false;

const VALID_PLANS: ReadonlySet<string> = new Set<Plan>([
  'free',
  'pro_monthly',
  'pro_sprint',
]);

/** UTC YYYY-MM-DD — must match backend `usagePeriodKey` format (D7). */
export function usagePeriodKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function clampCount(n: unknown): number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function daysBetween(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / 86_400_000);
}

/**
 * Resolve a raw `Users` row into the gating decision object.
 *
 * Safe by construction: null / undefined / malformed / unknown-plan records
 * all resolve to Free with no premium access (Free-pro-tier.md §1.1 + §2.1).
 * Never throws, never returns negative remaining.
 */
export function resolveEntitlements(
  user: UserSubscription | null | undefined,
  now: Date = new Date(),
): Entitlements {
  const rawPlan = user?.plan;
  const plan: Plan =
    rawPlan && VALID_PLANS.has(rawPlan) ? rawPlan : 'free';

  const periodEnd = user?.currentPeriodEnd
    ? new Date(user.currentPeriodEnd)
    : null;
  const periodEndValid = periodEnd && !Number.isNaN(periodEnd.getTime());
  const withinPeriod = periodEndValid ? now < periodEnd! : false;

  // --- Normalize plan → hasPro (the single gating boolean) ---
  let hasPro = false;
  let sprintActive = false;
  let sprintDaysRemaining: number | null = null;

  if (plan === 'pro_monthly') {
    const status = user?.subscriptionStatus;
    if (status === 'active') {
      hasPro = true;
    } else if (status === 'canceled' || user?.cancelAtPeriodEnd) {
      // Canceled but paid through the period: keep access until period end.
      hasPro = withinPeriod;
    } else if (status === 'past_due') {
      hasPro = PAST_DUE_RETAINS_PRO;
    } else {
      hasPro = false;
    }
  } else if (plan === 'pro_sprint') {
    // Sprint access is purely date-bounded; usage never extends or ends it.
    sprintActive = withinPeriod;
    hasPro = sprintActive;
    sprintDaysRemaining = periodEndValid
      ? Math.max(0, daysBetween(now, periodEnd!))
      : 0;
  }

  const limits: PlanLimits = hasPro ? PRO_LIMITS : FREE_LIMITS;

  // Effective resolved status (independent of any stale stored status).
  let subscriptionStatus: SubscriptionStatus =
    user?.subscriptionStatus ?? 'inactive';
  if (plan === 'pro_sprint') {
    subscriptionStatus = sprintActive ? 'sprint_active' : 'sprint_expired';
  } else if (plan === 'free') {
    subscriptionStatus = 'inactive';
  }

  // --- Usage: lazy-reset mirror so the UI shows correct remaining even
  // before the backend rolls the counter to today's period key. ---
  const todayKey = usagePeriodKey(now);
  const storedKey = user?.usagePeriodKey ?? null;
  const periodIsToday = storedKey === todayKey;

  const analysesUsed = periodIsToday ? clampCount(user?.resumeAnalysesUsed) : 0;
  const interviewsUsed = periodIsToday ? clampCount(user?.mockInterviewsUsed) : 0;

  const remainingAnalyses = Math.max(0, limits.analysesPerDay - analysesUsed);
  const remainingInterviews = Math.max(
    0,
    limits.interviewsPerDay - interviewsUsed,
  );

  return {
    plan,
    subscriptionStatus,
    stripeSubscriptionId: user?.stripeSubscriptionId,
    hasPro,
    limits,
    usage: {
      analysesUsed,
      interviewsUsed,
      periodKey: periodIsToday ? storedKey : todayKey,
    },
    remaining: {
      analyses: remainingAnalyses,
      interviews: remainingInterviews,
    },
    can: {
      startAnalysis: remainingAnalyses > 0,
      startInterview: remainingInterviews > 0,
      downloadOptimized: limits.features.docxExport,
    },
    feature: (key: FeatureKey) => limits.features[key] === true,
    showUpgradeCta: !hasPro,
    sprint: {
      isActive: sprintActive,
      daysRemaining: plan === 'pro_sprint' ? sprintDaysRemaining : null,
    },
  };
}

/** Free-tier fallback used when `/users/me` is unreachable — gating must
 *  never crash, and a backend outage must not silently unlock Pro. */
export function freeFallbackEntitlements(now: Date = new Date()): Entitlements {
  return resolveEntitlements({ userId: 'unknown', plan: 'free' }, now);
}
