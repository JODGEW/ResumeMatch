import type { ReactNode } from 'react';

type KeywordPillProps = {
  tone: 'success' | 'danger';
  children: ReactNode;
};

export function KeywordPill({ tone, children }: KeywordPillProps) {
  return (
    <span className={`landing-pill landing-pill--${tone}`}>
      <span className="landing-pill__dot" />
      {children}
    </span>
  );
}
