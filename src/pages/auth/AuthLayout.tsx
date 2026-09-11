import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LogoMark } from '../../components/LogoMark';
import { BackChevronIcon } from './authIcons';
import './Auth.css';

/* Top-right "prompt + button" switch. The prompt is dropped on phones, where
   the button alone has to fit beside the brand. */
export function AuthSwitch({ prompt, to, label, disabled }: {
  prompt: string;
  to: string;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div className={`auth-topbar__switch${disabled ? ' is-disabled' : ''}`}>
      <span className="auth-topbar__prompt">{prompt}</span>{' '}
      <Link to={to} tabIndex={disabled ? -1 : undefined}>{label}</Link>
    </div>
  );
}

/* The same switch again at the foot of the card: on wide screens the top-right
   one sits at the viewport edge, far from where the user is looking. */
export function AuthCardSwitch({ prompt, to, label, disabled }: {
  prompt?: string;
  to: string;
  label: string;
  disabled?: boolean;
}) {
  return (
    <p className={`auth-card-switch${disabled ? ' is-disabled' : ''}`}>
      {/* The space is for the text content (copy, screen readers); flex gap does the visual spacing. */}
      {prompt && <span>{prompt}</span>}{prompt && ' '}
      <Link to={to} tabIndex={disabled ? -1 : undefined}>{label}</Link>
    </p>
  );
}

export function AuthBackLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="auth-back">
      <BackChevronIcon />
      {label}
    </Link>
  );
}

type AuthLayoutProps = {
  title: string;
  subtitle: ReactNode;
  children: ReactNode;
  /** Top-right control: the sign-in / sign-up switch, or a back link. */
  switcher?: ReactNode;
  /** Two-step flows: [current, total], rendered as a progress row above the title. */
  step?: [number, number];
  /** Rendered under the card, outside it (e.g. the demo entry on Login). */
  belowCard?: ReactNode;
};

export function AuthLayout({ title, subtitle, children, switcher, step, belowCard }: AuthLayoutProps) {
  return (
    <div className="auth-page">
      <header className="auth-topbar">
        <Link to="/" className="auth-topbar__brand" aria-label="ResumeMatch home">
          <LogoMark width={24} height={24} />
          <span>ResumeMatch</span>
        </Link>
        {switcher}
      </header>

      <main className="auth-main">
        <div className="auth-box">
          <div className="auth-box__head">
            {step && (
              <div className="auth-progress">
                {Array.from({ length: step[1] }, (_, i) => (
                  <span
                    key={i}
                    className={`auth-progress__bar${i < step[0] ? ' is-done' : ''}`}
                    aria-hidden="true"
                  />
                ))}
                <span className="auth-progress__label">
                  <span className="sr-only">Step </span>
                  {step[0]} / {step[1]}
                </span>
              </div>
            )}
            <h1 className="auth-box__title">{title}</h1>
            <p className="auth-box__sub">{subtitle}</p>
          </div>
          {children}
        </div>
        {belowCard}
      </main>

      <footer className="auth-footer">
        {/* TODO(phase 2): /support has no route yet — the catch-all redirects it to /. */}
        <Link to="/support">Support</Link>
        <Link to="/privacy">Privacy</Link>
        <Link to="/terms">Terms</Link>
      </footer>
    </div>
  );
}
