import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { siteConfig } from '../config/site';
import { ThemeToggle } from './ThemeToggle';
import { PublicFooter } from './PublicFooter';
import { LogoMark } from './LogoMark';
import './LegalLayout.css';

type LegalLayoutProps = {
  eyebrow: string;
  title: string;
  intro: string;
  children: ReactNode;
};

export function LegalLayout({ eyebrow, title, intro, children }: LegalLayoutProps) {
  const { user } = useAuth();
  const actionHref = user ? '/upload' : '/login';
  const actionLabel = user ? 'Open app' : 'Sign in';

  return (
    <div className="legal-page">
      <header className="legal-header">
        <div className="page-container legal-header__inner">
          <Link to="/" className="legal-header__brand" aria-label={`${siteConfig.name} home`}>
            <LogoMark />
            <span>{siteConfig.name}</span>
          </Link>

          <div className="legal-header__actions">
            <ThemeToggle />
            <Link to={actionHref} className="btn btn-ghost btn--sm">
              {actionLabel}
            </Link>
          </div>
        </div>
      </header>

      <main className="legal-main">
        <section className="legal-hero">
          <div className="page-container legal-hero__inner">
            <p className="legal-eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
            <p className="legal-intro">{intro}</p>
            <p className="legal-meta">Last updated {siteConfig.legalLastUpdated}</p>
          </div>
        </section>

        <section className="legal-content">
          <div className="page-container legal-content__inner">
            <article className="legal-copy">{children}</article>
          </div>
        </section>

        <section className="legal-cta">
          <div className="page-container legal-cta__inner">
            <p className="legal-eyebrow">Back to ResumeMatch</p>
            <h2>See how your resume matches the role</h2>
            <p className="legal-cta__copy">
              Analyze your resume against a real job description, then practice for the same role.
            </p>
            <Link to={actionHref} className="btn btn-primary">
              Analyze My Resume
            </Link>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
