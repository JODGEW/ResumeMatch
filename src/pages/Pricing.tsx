import { useState } from 'react';
import { useEntitlements } from '../hooks/useEntitlements';
import { createCheckoutSession, type CheckoutPlan } from '../api/checkout';
import {
  FREE_PLAN_FEATURES,
  PRO_PLAN_FEATURES,
  SPRINT_PLAN_FEATURES,
} from '../config/planFeatures';
import './Pricing.css';

type Stage = 'idle' | 'creating_session' | 'redirecting';

function FeatureCheck() {
  return (
    <svg
      className="pricing-card__check"
      width="15"
      height="15"
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <polyline
        points="3,8.5 6.5,12 13,4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function formatActiveUntil(activeUntil: string | null): string {
  // The resolver exposes the exact parsed `currentPeriodEnd` from the Users
  // row — format it directly instead of reconstructing today+daysRemaining.
  if (!activeUntil) return '';
  const d = new Date(activeUntil);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export function Pricing() {
  const {
    entitlements,
    isLoading,
    error: entitlementsError,
    refresh: refreshEntitlements,
  } = useEntitlements();
  const [stage, setStage] = useState<Stage>('idle');
  const [activePlan, setActivePlan] = useState<CheckoutPlan | null>(null);
  const [error, setError] = useState('');

  const isSubmitting = stage !== 'idle';

  async function handleCheckout(plan: CheckoutPlan) {
    if (isSubmitting) return;
    setError('');
    setActivePlan(plan);
    setStage('creating_session');
    try {
      const { checkoutUrl } = await createCheckoutSession(plan);
      setStage('redirecting');
      window.location.href = checkoutUrl;
    } catch (err: unknown) {
      const axiosErr = err as {
        response?: { status?: number; data?: { error?: string; errorMessage?: string; message?: string } };
      };
      const data = axiosErr?.response?.data;
      const message =
        data?.error ||
        data?.errorMessage ||
        data?.message ||
        (err instanceof Error ? err.message : null) ||
        'Failed to start checkout. Please try again.';
      setError(message);
      setStage('idle');
      setActivePlan(null);
    }
  }

  if (isLoading) {
    return (
      <div className="page-container">
        <div className="pricing-loading">
          <span className="loading-spinner" />
        </div>
      </div>
    );
  }

  // useEntitlements surfaces non-404 errors and drops entitlements to null —
  // render an error state with Retry instead of misleading "Current plan"
  // badges built from stale or default data.
  if (entitlementsError || !entitlements) {
    return (
      <div className="page-container">
        <div className="page-header animate-in">
          <h1>Choose your plan</h1>
        </div>
        <div className="pricing-error-state animate-in">
          <p className="pricing-error-state__message">
            We couldn't load your plan details. Please try again in a moment.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => refreshEntitlements()}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const plan = entitlements.plan;
  const status = entitlements.subscriptionStatus;
  const isOnFree = plan === 'free';
  const isOnProMonthly = plan === 'pro_monthly';
  const isOnSprint = plan === 'pro_sprint';
  const isGrandfathered = isOnProMonthly && status === 'grandfathered';
  const sprintActiveUntil = formatActiveUntil(entitlements.sprint.activeUntil);

  return (
    <div className="page-container">
      <div className="page-header animate-in">
        <h1>Choose your plan</h1>
        <p>Beta users keep their grandfathered Pro access. Upgrade to lock in a paid plan when beta ends.</p>
      </div>

      {error && (
        <div className="pricing-error animate-in">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="7" stroke="var(--danger)" strokeWidth="1.5" />
            <path d="M8 5v3.5M8 10.5v.5" stroke="var(--danger)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      <div className="pricing-grid">
        {/* ── Free ───────────────────────────────────── */}
        <div className="card pricing-card pricing-card--free animate-in stagger-1">
          <div className="pricing-card__titlerow">
            <h3 className="pricing-card__title">Free</h3>
            {isOnFree && (
              <span className="pricing-card__current-badge">Current plan</span>
            )}
          </div>
          <div className="pricing-card__price">
            <span className="pricing-card__amount">$0</span>
            <span className="pricing-card__period">/ forever</span>
          </div>
          <p className="pricing-card__subtitle">Core matching for occasional applications.</p>
          <ul className="pricing-card__features">
            {FREE_PLAN_FEATURES.map((f) => (
              <li key={f} className="pricing-card__feature">
                <FeatureCheck />
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <div className="pricing-card__slot">
            {isOnFree && (
              <div className="pricing-card__current-pill">Your current plan</div>
            )}
          </div>
        </div>

        {/* ── Pro Monthly ────────────────────────────── */}
        <div className="card pricing-card animate-in stagger-2">
          <div className="pricing-card__titlerow">
            <h3 className="pricing-card__title">Pro Monthly</h3>
            {isGrandfathered && (
              <span className="pricing-card__current-badge">Current plan (Beta)</span>
            )}
            {isOnProMonthly && !isGrandfathered && (
              <span className="pricing-card__current-badge">Current plan</span>
            )}
          </div>
          <div className="pricing-card__price">
            <span className="pricing-card__amount">$14.99</span>
            <span className="pricing-card__period">/ month</span>
          </div>
          <p className="pricing-card__subtitle">Recurring Pro access for an ongoing search.</p>
          <ul className="pricing-card__features">
            {PRO_PLAN_FEATURES.map((f) => (
              <li key={f} className="pricing-card__feature">
                <FeatureCheck />
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <div className="pricing-card__slot">
            {isOnProMonthly ? (
              <div className="pricing-card__current-pill">Your current plan</div>
            ) : (
              <button
                type="button"
                className="btn btn-secondary pricing-card__cta"
                disabled={isSubmitting}
                onClick={() => handleCheckout('pro_monthly')}
              >
                {activePlan === 'pro_monthly' ? (
                  <>
                    <span className="loading-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                    {stage === 'redirecting' ? 'Redirecting to checkout…' : 'Starting checkout…'}
                  </>
                ) : (
                  'Upgrade to Pro Monthly'
                )}
              </button>
            )}
          </div>
        </div>

        {/* ── Career Sprint ──────────────────────────── */}
        <div className="card pricing-card pricing-card--featured animate-in stagger-3">
          <div className="pricing-card__titlerow">
            <h3 className="pricing-card__title">Career Sprint</h3>
            <span className="pricing-card__badge">Best value</span>
            {isOnSprint && (
              <span className="pricing-card__current-badge">
                {sprintActiveUntil ? `Active until ${sprintActiveUntil}` : 'Active'}
              </span>
            )}
          </div>
          <div className="pricing-card__price">
            <s className="pricing-card__price-strike">$24.99</s>
            <span className="pricing-card__amount">$19.99</span>
            <span className="pricing-card__period">/ 60 days</span>
          </div>
          <p className="pricing-card__subtitle">One-time Pro access for an active job search.</p>
          <div className="pricing-card__founding">
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.4" />
              <path d="M8 5v3l2 1.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <span>Founding price, available through October 31, 2026.</span>
          </div>
          <ul className="pricing-card__features">
            {SPRINT_PLAN_FEATURES.map((f) => (
              <li key={f} className="pricing-card__feature">
                <FeatureCheck />
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <div className="pricing-card__slot">
            {isOnSprint ? (
              <div className="pricing-card__current-pill">Your current plan</div>
            ) : (
              /* Founding price through 2026-10-31; switch back to 'pro_sprint' after. */
              <button
                type="button"
                className="btn btn-primary pricing-card__cta"
                disabled={isSubmitting}
                onClick={() => handleCheckout('pro_founding_sprint')}
              >
                {activePlan === 'pro_founding_sprint' ? (
                  <>
                    <span className="loading-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                    {stage === 'redirecting' ? 'Redirecting to checkout…' : 'Starting checkout…'}
                  </>
                ) : (
                  'Start 60-day Sprint'
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="pricing-footnotes animate-in">
        <span>Cancel anytime — Pro Monthly renews until you stop it.</span>
        <span>Career Sprint is a one-time charge, not a subscription.</span>
      </div>
    </div>
  );
}
