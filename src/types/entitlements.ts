// Free / Pro tier — shared entitlement contract.
//
// This is the single source of truth for what a plan means on the FRONTEND.
// The backend `Users` table + enforcement Lambdas must mirror the same limits
// (see .planning/Free-pro-tier.md §2 and the AWS task list at the bottom of
// the implementation handoff). Plan ≠ entitlement: gating code asks the
// resolver in `src/utils/entitlements.ts`, never `if (plan === 'pro_monthly')`.

export type Plan = 'free' | 'pro_monthly' | 'pro_sprint';

export type SubscriptionStatus =
  | 'inactive'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'grandfathered'
  | 'sprint_active'
  | 'sprint_expired';

/**
 * Shape of the backend `Users` table row as returned by `GET /users/me`.
 * Every billing/usage field is optional: pre-billing and older records will
 * not have them, and the resolver must degrade safely to Free when they are
 * missing or malformed (Free-pro-tier.md §2.1 integration tests).
 */
export interface UserSubscription {
  userId: string; // Cognito `sub` (not email — email can change, sub cannot)
  plan?: Plan;
  subscriptionStatus?: SubscriptionStatus;

  billingProvider?: string;
  billingCustomerId?: string;
  stripeSubscriptionId?: string; // monthly only; the Stripe webhook writes this exact field
  billingPaymentIntentId?: string; // sprint only
  currentPeriodStart?: string; // ISO 8601
  // Epoch SECONDS from the deployed webhook (may arrive as number or numeric
  // string) or ISO 8601 from older rows; sprint = purchase + 60d. The resolver
  // normalizes via parsePeriodEnd — never feed this to `new Date()` raw.
  currentPeriodEnd?: string | number;
  cancelAtPeriodEnd?: boolean; // monthly only
  sprintPurchaseCount?: number;

  // Usage counters (daily reset, keyed by usagePeriodKey)
  resumeAnalysesUsed?: number;
  mockInterviewsUsed?: number;
  optimizedDownloadsUsed?: number;
  usagePeriodKey?: string; // YYYY-MM-DD in UTC (Free-pro-tier.md D7)
}

/** Pro-only capabilities, gated individually at product boundaries (§1.3). */
export type FeatureKey =
  | 'categoryExplanations'
  | 'fullMissingKeywords'
  | 'rewriteSuggestions'
  | 'sideBySideDiff'
  | 'docxExport'
  | 'technicalInterview'
  | 'followUpQuestions'
  | 'perTurnFeedback'
  | 'transcriptExport'
  | 'fullAssessment';

export interface PlanLimits {
  analysesPerDay: number;
  interviewsPerDay: number;
  interviewQuestions: number;
  historyVisibleRows: number;
  features: Record<FeatureKey, boolean>;
}

/** Resolved decision object. UI gating + analytics read this, nothing else. */
export interface Entitlements {
  plan: Plan;
  subscriptionStatus: SubscriptionStatus;
  /** Passed through from the raw row — Layout uses this to decide whether to
   *  surface the "Manage subscription" link (Stripe Customer Portal). Sprint
   *  and grandfathered users have no subscription to manage, so this is
   *  undefined for them. */
  stripeSubscriptionId?: string;
  /** pro_monthly and pro_sprint normalized to a single gating boolean. */
  hasPro: boolean;
  limits: PlanLimits;
  usage: {
    analysesUsed: number;
    interviewsUsed: number;
    periodKey: string | null;
  };
  remaining: {
    analyses: number;
    interviews: number;
  };
  can: {
    startAnalysis: boolean;
    startInterview: boolean;
    downloadOptimized: boolean;
  };
  /** Per-feature gate. Prefer this over reading `limits.features` directly. */
  feature: (key: FeatureKey) => boolean;
  showUpgradeCta: boolean;
  sprint: {
    isActive: boolean;
    /** Whole days left on a Career Sprint, or null if not on a sprint. */
    daysRemaining: number | null;
    /** ISO timestamp of the sprint period end (parsed from the Users row),
     *  or null when not on a sprint / no valid period end. Prefer this over
     *  reconstructing a date from daysRemaining. */
    activeUntil: string | null;
  };
}
