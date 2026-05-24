import { describe, it, expect } from 'vitest';
import {
  resolveEntitlements,
  freeFallbackEntitlements,
  FREE_LIMITS,
  PRO_LIMITS,
  usagePeriodKey,
} from './entitlements';
import type { UserSubscription } from '../types/entitlements';

const NOW = new Date('2026-05-17T12:00:00.000Z');
const TODAY = usagePeriodKey(NOW); // '2026-05-17'

function daysFromNow(n: number): string {
  return new Date(NOW.getTime() + n * 86_400_000).toISOString();
}

describe('resolveEntitlements — representative users (Free-pro-tier.md §2.3)', () => {
  it('free new user → Free limits, full quota, upgrade CTA', () => {
    const e = resolveEntitlements({ userId: 'u', plan: 'free' }, NOW);
    expect(e.plan).toBe('free');
    expect(e.hasPro).toBe(false);
    expect(e.limits).toBe(FREE_LIMITS);
    expect(e.remaining).toEqual({ analyses: 2, interviews: 1 });
    expect(e.can.startAnalysis).toBe(true);
    expect(e.can.startInterview).toBe(true);
    expect(e.can.downloadOptimized).toBe(false);
    expect(e.feature('rewriteSuggestions')).toBe(false);
    expect(e.showUpgradeCta).toBe(true);
    expect(e.sprint.daysRemaining).toBeNull();
  });

  it('free exhausted user → no remaining, still no premium', () => {
    const u: UserSubscription = {
      userId: 'u',
      plan: 'free',
      resumeAnalysesUsed: 2,
      mockInterviewsUsed: 1,
      usagePeriodKey: TODAY,
    };
    const e = resolveEntitlements(u, NOW);
    expect(e.remaining).toEqual({ analyses: 0, interviews: 0 });
    expect(e.can.startAnalysis).toBe(false);
    expect(e.can.startInterview).toBe(false);
  });

  it('Free interview limit is 1/day (D2 authoritative, not §1.1 stale 2)', () => {
    expect(FREE_LIMITS.interviewsPerDay).toBe(1);
    expect(FREE_LIMITS.analysesPerDay).toBe(2);
  });

  it('pro monthly active → Pro limits + every feature', () => {
    const e = resolveEntitlements(
      { userId: 'u', plan: 'pro_monthly', subscriptionStatus: 'active' },
      NOW,
    );
    expect(e.hasPro).toBe(true);
    expect(e.limits).toBe(PRO_LIMITS);
    expect(e.remaining).toEqual({ analyses: 10, interviews: 5 });
    expect(e.feature('docxExport')).toBe(true);
    expect(e.feature('technicalInterview')).toBe(true);
    expect(e.showUpgradeCta).toBe(false);
  });

  it('pro monthly canceled but still in period → keeps Pro', () => {
    const e = resolveEntitlements(
      {
        userId: 'u',
        plan: 'pro_monthly',
        subscriptionStatus: 'canceled',
        cancelAtPeriodEnd: true,
        currentPeriodEnd: daysFromNow(5),
      },
      NOW,
    );
    expect(e.hasPro).toBe(true);
  });

  it('pro monthly canceled and period ended → Free', () => {
    const e = resolveEntitlements(
      {
        userId: 'u',
        plan: 'pro_monthly',
        subscriptionStatus: 'canceled',
        currentPeriodEnd: daysFromNow(-1),
      },
      NOW,
    );
    expect(e.hasPro).toBe(false);
    expect(e.limits).toBe(FREE_LIMITS);
  });

  it('pro sprint active (day 5) → Pro, daysRemaining counts down', () => {
    const e = resolveEntitlements(
      {
        userId: 'u',
        plan: 'pro_sprint',
        currentPeriodStart: daysFromNow(-5),
        currentPeriodEnd: daysFromNow(55),
      },
      NOW,
    );
    expect(e.hasPro).toBe(true);
    expect(e.sprint.isActive).toBe(true);
    expect(e.sprint.daysRemaining).toBe(55);
    expect(e.subscriptionStatus).toBe('sprint_active');
  });

  it('pro sprint active (day 59) → still Pro, 1 day left', () => {
    const e = resolveEntitlements(
      { userId: 'u', plan: 'pro_sprint', currentPeriodEnd: daysFromNow(1) },
      NOW,
    );
    expect(e.hasPro).toBe(true);
    expect(e.sprint.daysRemaining).toBe(1);
  });

  it('pro sprint expired (day 60, period end == now) → Free', () => {
    const e = resolveEntitlements(
      { userId: 'u', plan: 'pro_sprint', currentPeriodEnd: NOW.toISOString() },
      NOW,
    );
    expect(e.hasPro).toBe(false);
    expect(e.sprint.isActive).toBe(false);
    expect(e.sprint.daysRemaining).toBe(0);
    expect(e.subscriptionStatus).toBe('sprint_expired');
    expect(e.limits).toBe(FREE_LIMITS);
  });

  it('pro sprint long expired (day 100) → Free', () => {
    const e = resolveEntitlements(
      { userId: 'u', plan: 'pro_sprint', currentPeriodEnd: daysFromNow(-40) },
      NOW,
    );
    expect(e.hasPro).toBe(false);
    expect(e.sprint.daysRemaining).toBe(0);
  });

  it('past_due monthly → Free (PAST_DUE_RETAINS_PRO default false)', () => {
    const e = resolveEntitlements(
      { userId: 'u', plan: 'pro_monthly', subscriptionStatus: 'past_due' },
      NOW,
    );
    expect(e.hasPro).toBe(false);
    expect(e.limits).toBe(FREE_LIMITS);
  });
});

describe('resolveEntitlements — safe fallbacks (Free-pro-tier.md §1.1 + §2.1)', () => {
  it('null user → Free', () => {
    expect(resolveEntitlements(null, NOW).hasPro).toBe(false);
    expect(resolveEntitlements(undefined, NOW).plan).toBe('free');
  });

  it('unknown/garbage plan → treated as Free', () => {
    const e = resolveEntitlements(
      { userId: 'u', plan: 'enterprise_ultra' as never },
      NOW,
    );
    expect(e.plan).toBe('free');
    expect(e.hasPro).toBe(false);
  });

  it('Pro plan with missing billing fields → does not unlock Pro', () => {
    const e = resolveEntitlements({ userId: 'u', plan: 'pro_monthly' }, NOW);
    expect(e.hasPro).toBe(false);
  });

  it('freeFallbackEntitlements never unlocks Pro', () => {
    const e = freeFallbackEntitlements(NOW);
    expect(e.hasPro).toBe(false);
    expect(e.limits).toBe(FREE_LIMITS);
  });
});

describe('resolveEntitlements — usage counters (Free-pro-tier.md §2.2)', () => {
  it('counters from a stale period key are ignored (lazy daily reset)', () => {
    const e = resolveEntitlements(
      {
        userId: 'u',
        plan: 'free',
        resumeAnalysesUsed: 2,
        mockInterviewsUsed: 1,
        usagePeriodKey: '2026-05-16', // yesterday
      },
      NOW,
    );
    expect(e.usage.analysesUsed).toBe(0);
    expect(e.remaining).toEqual({ analyses: 2, interviews: 1 });
    expect(e.usage.periodKey).toBe(TODAY);
  });

  it('remaining never goes negative even if used exceeds the limit', () => {
    const e = resolveEntitlements(
      {
        userId: 'u',
        plan: 'free',
        resumeAnalysesUsed: 99,
        mockInterviewsUsed: 99,
        usagePeriodKey: TODAY,
      },
      NOW,
    );
    expect(e.remaining.analyses).toBe(0);
    expect(e.remaining.interviews).toBe(0);
  });

  it('negative / NaN counters clamp to 0', () => {
    const e = resolveEntitlements(
      {
        userId: 'u',
        plan: 'free',
        resumeAnalysesUsed: -5,
        mockInterviewsUsed: Number.NaN,
        usagePeriodKey: TODAY,
      },
      NOW,
    );
    expect(e.usage.analysesUsed).toBe(0);
    expect(e.usage.interviewsUsed).toBe(0);
  });

  it('usagePeriodKey is UTC YYYY-MM-DD', () => {
    expect(usagePeriodKey(new Date('2026-01-09T23:30:00.000Z'))).toBe(
      '2026-01-09',
    );
  });
});
