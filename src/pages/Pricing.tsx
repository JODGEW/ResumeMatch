import { useState } from 'react';
import { useEntitlements } from '../hooks/useEntitlements';
import { createCheckoutSession, type CheckoutPlan } from '../api/checkout';
import './Pricing.css';

type Stage = 'idle' | 'creating_session' | 'redirecting';

const FREE_FEATURES = [
  '2 resume analyses per day',
  '1 behavioral interview per day (5 questions)',
  '5 most recent analyses in history',
  'Match score and missing keywords',
];

const PRO_MONTHLY_FEATURES = [
  '10 resume analyses per day',
  '5 interviews per day (10 questions each)',
  'Behavioral AND technical interview modes',
  'Full history (up to 500 analyses)',
  'AI resume rewrite suggestions',
  'DOCX export with edit diff',
];

const SPRINT_FEATURES = [
  '60-day Pro access',
  '10 resume analyses per day',
  '5 interviews per day (10 questions each)',
  'Behavioral AND technical interview modes',
  'Full history (up to 500 analyses)',
  'AI resume rewrite suggestions',
  'DOCX export with edit diff',
];

function activeUntilFromDays(daysRemaining: number | null): string {
  // useEntitlements only exposes sprint.daysRemaining (not raw currentPeriodEnd),
  // so we reconstruct the end date as today + daysRemaining. ±24hr imprecision
  // is acceptable for a display label.
  if (daysRemaining == null || daysRemaining < 0) return '';
  const d = new Date();
  d.setDate(d.getDate() + daysRemaining);
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
  const sprintActiveUntil = activeUntilFromDays(entitlements.sprint.daysRemaining);

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
        <div className="card pricing-card animate-in stagger-1">
          <div className="pricing-card__head">
            <h3 className="pricing-card__title">Free</h3>
            <div className="pricing-card__price">$0 / forever</div>
            <p className="pricing-card__subtitle">Core matching for occasional applications.</p>
            {isOnFree && (
              <span className="pricing-card__current-badge">Current plan</span>
            )}
          </div>
          <ul className="pricing-card__features">
            {FREE_FEATURES.map((f) => (
              <li key={f} className="pricing-card__feature">{f}</li>
            ))}
          </ul>
        </div>

        {/* ── Pro Monthly ────────────────────────────── */}
        <div className="card pricing-card animate-in stagger-2">
          <div className="pricing-card__head">
            <h3 className="pricing-card__title">Pro Monthly</h3>
            <div className="pricing-card__price">$14.99 / month</div>
            <p className="pricing-card__subtitle">Recurring Pro access for an ongoing search.</p>
            {isGrandfathered && (
              <span className="pricing-card__current-badge">Current plan (Beta)</span>
            )}
            {isOnProMonthly && !isGrandfathered && (
              <span className="pricing-card__current-badge">Current plan</span>
            )}
          </div>
          <ul className="pricing-card__features">
            {PRO_MONTHLY_FEATURES.map((f) => (
              <li key={f} className="pricing-card__feature">{f}</li>
            ))}
          </ul>
          {!isOnProMonthly && (
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

        {/* ── Career Sprint ──────────────────────────── */}
        <div className="card pricing-card pricing-card--featured animate-in stagger-3">
          <span className="pricing-card__badge">Best value</span>
          <div className="pricing-card__head">
            <h3 className="pricing-card__title">Career Sprint</h3>
            <div className="pricing-card__price">$24.99 / 60 days</div>
            <p className="pricing-card__subtitle">One-time Pro access for an active job search.</p>
            {isOnSprint && (
              <span className="pricing-card__current-badge">
                {sprintActiveUntil ? `Active until ${sprintActiveUntil}` : 'Active'}
              </span>
            )}
          </div>
          <ul className="pricing-card__features">
            {SPRINT_FEATURES.map((f) => (
              <li key={f} className="pricing-card__feature">{f}</li>
            ))}
          </ul>
          {!isOnSprint && (
            <button
              type="button"
              className="btn btn-primary pricing-card__cta"
              disabled={isSubmitting}
              onClick={() => handleCheckout('pro_sprint')}
            >
              {activePlan === 'pro_sprint' ? (
                <>
                  <span className="loading-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                  {stage === 'redirecting' ? 'Redirecting to checkout…' : 'Starting checkout…'}
                </>
              ) : (
                'Start 60-Day Sprint'
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
