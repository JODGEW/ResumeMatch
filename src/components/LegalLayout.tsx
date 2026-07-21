import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { siteConfig } from '../config/site';
import { ThemeToggle } from './ThemeToggle';
import { LogoMark } from './LogoMark';
import { LandingFooter } from '../pages/landing/LandingFooter';
import { TrustCheckIcon } from '../pages/landing/icons';
import './LegalLayout.css';

export type LegalTocItem = { id: string; label: string };

type LegalLayoutProps = {
  eyebrow: string;
  title: string;
  intro: string;
  chips: string[];
  toc: LegalTocItem[];
  lastUpdated?: string;
  children: ReactNode;
};

export function LegalLayout({ eyebrow, title, intro, chips, toc, lastUpdated, children }: LegalLayoutProps) {
  const { user } = useAuth();
  const actionHref = user ? '/upload' : '/login';
  const actionLabel = user ? 'Open app' : 'Sign in';
  const [activeId, setActiveId] = useState(toc[0]?.id);
  const [tocOpen, setTocOpen] = useState(false);
  const activeLabel = toc.find((item) => item.id === activeId)?.label ?? toc[0]?.label;

  useEffect(() => {
    const sections = toc
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => el !== null);
    if (sections.length === 0) return;

    // Scrollspy parameters from the design bundle: a section is "active" when
    // it enters the band between the sticky nav and the upper third of the viewport.
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: '-88px 0px -68% 0px', threshold: 0 },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [toc]);

  return (
    <div className="legal-page">
      <header className="legal-nav">
        <div className="legal-nav__inner">
          <Link to="/" className="legal-nav__brand" aria-label={`${siteConfig.name} home`}>
            <LogoMark />
            <span>{siteConfig.name}</span>
          </Link>
          <div className="legal-nav__spacer" />
          <ThemeToggle />
          <Link to={actionHref} className="legal-btn legal-btn--ghost">
            {actionLabel}
          </Link>
        </div>
      </header>

      <main>
        <header className="legal-hero">
          <div className="legal-hero__glow" aria-hidden="true" />
          <div className="legal-hero__inner">
            <div className="legal-eyebrow">{eyebrow}</div>
            <h1>{title}</h1>
            <p className="legal-intro">{intro}</p>
            <div className="legal-chips">
              {chips.map((chip) => (
                <span key={chip} className="legal-chip">
                  <TrustCheckIcon />
                  {chip}
                </span>
              ))}
            </div>
            <div className="legal-updated">Last updated {lastUpdated ?? siteConfig.legalLastUpdated}</div>
          </div>
        </header>

        <div className="legal-body">
          <aside className={`legal-toc${tocOpen ? ' is-open' : ''}`}>
            <div className="legal-toc__label">On this page</div>
            <button
              type="button"
              className="legal-toc__toggle"
              aria-expanded={tocOpen}
              onClick={() => setTocOpen((open) => !open)}
            >
              <span className="legal-toc__toggle-label">On this page</span>
              <span className="legal-toc__toggle-current">{activeLabel}</span>
              <svg
                className="legal-toc__chevron"
                width="12"
                height="12"
                viewBox="0 0 12 12"
                aria-hidden="true"
              >
                <polyline
                  points="2.5,4.5 6,8 9.5,4.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <nav aria-label="On this page">
              {toc.map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className={activeId === item.id ? 'is-active' : undefined}
                  onClick={() => setTocOpen(false)}
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </aside>
          <div className="legal-sections">{children}</div>
        </div>

        <section className="legal-cta">
          <div className="legal-cta__card">
            <div className="legal-eyebrow legal-cta__eyebrow">Ready when you are</div>
            <h2>See how your resume matches the role</h2>
            <p>Analyze your resume against a real job description, then practice for the same role.</p>
            <Link to={actionHref} className="legal-btn legal-btn--primary">
              Analyze My Resume
            </Link>
          </div>
        </section>
      </main>

      <LandingFooter appHref={actionHref} narrow />
    </div>
  );
}
