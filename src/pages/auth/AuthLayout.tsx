import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LogoMark } from '../../components/LogoMark';
import { ThemeToggle } from '../../components/ThemeToggle';
import './Auth.css';

const FEATURES = [
  'Instant match score against any job description',
  'Targeted keyword and phrasing suggestions',
  'Mock interviews tuned to the same role',
];

type AuthLayoutProps = {
  title: string;
  subtitle: ReactNode;
  children: ReactNode;
};

export function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  return (
    <div className="auth-page">
      <div className="auth-page__theme">
        <ThemeToggle />
      </div>

      <aside className="auth-aside">
        <div className="auth-aside__glow auth-aside__glow--top" aria-hidden="true" />
        <div className="auth-aside__glow auth-aside__glow--bottom" aria-hidden="true" />

        <Link to="/" className="auth-aside__brand" aria-label="ResumeMatch home">
          <LogoMark width={30} height={30} />
          <span>ResumeMatch</span>
        </Link>

        <div className="auth-aside__pitch">
          <div className="auth-aside__eyebrow">Match • Practice • Land</div>
          <h1>See how well your resume matches the role.</h1>
          <div className="auth-aside__features">
            {FEATURES.map((feature) => (
              <div key={feature} className="auth-aside__feature">
                <span className="auth-aside__feature-icon" aria-hidden="true">
                  <svg width="10" height="10" viewBox="0 0 10 10">
                    <polyline
                      points="1.5,5.5 4,8 8.5,2.5"
                      fill="none"
                      className="lp-stroke-tint"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span>{feature}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="auth-aside__privacy">
          <span className="auth-aside__privacy-icon" aria-hidden="true">
            <svg width="19" height="19" viewBox="0 0 20 20" fill="none">
              <path
                d="M10 2 4 4.2v4.3c0 3.7 2.5 7 6 8 3.5-1 6-4.3 6-8V4.2L10 2Z"
                className="lp-stroke-tint"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
              <path
                d="M7.5 10l1.8 1.8L13 8"
                className="lp-stroke-tint"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <div>
            <div className="auth-aside__privacy-title">Your data stays yours</div>
            <div className="auth-aside__privacy-text">
              No data sold, no model training on your content, and you can delete everything anytime.
            </div>
          </div>
        </div>
      </aside>

      <main className="auth-main">
        <div className="auth-box">
          <div className="auth-head">
            <Link to="/" className="auth-head__logo" aria-label="ResumeMatch home">
              <LogoMark />
            </Link>
            {/* Mobile only: the aside (which carries the brand name) is hidden there */}
            <span className="auth-head__name">ResumeMatch</span>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
