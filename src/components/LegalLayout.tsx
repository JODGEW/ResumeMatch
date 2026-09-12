import { useEffect, useRef, useState } from 'react';
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
  /** Omit for the site default; pass null on pages that carry no revision date. */
  lastUpdated?: string | null;
  children: ReactNode;
};

export function LegalLayout({ eyebrow, title, intro, chips, toc, lastUpdated, children }: LegalLayoutProps) {
  const { user } = useAuth();
  // The nav button is this page's "Sign in" equivalent, so it stays on /login.
  const actionHref = user ? '/upload' : '/login';
  const actionLabel = user ? 'Open app' : 'Sign in';
  // The closing CTA is a "start using it" entry point: a signed-out visitor has
  // no account yet, so it opens signup, matching Landing and the shared footer.
  const ctaHref = user ? '/upload' : '/signup';
  const [activeId, setActiveId] = useState(toc[0]?.id);
  const tocNavRef = useRef<HTMLElement>(null);

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

  // Below 767px the TOC is a horizontally scrolling chip row, so the active chip
  // can sit off-screen. Only scroll when the row actually overflows — on desktop
  // the nav is a vertical column and must not be touched.
  useEffect(() => {
    const nav = tocNavRef.current;
    if (!nav || nav.scrollWidth <= nav.clientWidth + 4) return;
    const chip = nav.querySelector<HTMLAnchorElement>('a[aria-current="true"]');
    if (!chip) return;
    const target = chip.offsetLeft - (nav.clientWidth - chip.offsetWidth) / 2;
    nav.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
  }, [activeId]);

  return (
    <div className="legal-page">
      <a className="skip-link" href="#main-content">Skip to main content</a>
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

      <main id="main-content" tabIndex={-1}>
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
            {lastUpdated !== null && (
              <div className="legal-updated">
                Last updated {lastUpdated ?? siteConfig.legalLastUpdated}
              </div>
            )}
          </div>
        </header>

        <div className="legal-body">
          <aside className="legal-toc">
            <div className="legal-toc__label">On this page</div>
            <nav aria-label="On this page" ref={tocNavRef}>
              {toc.map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className={activeId === item.id ? 'is-active' : undefined}
                  aria-current={activeId === item.id ? 'true' : undefined}
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
            <div className="legal-cta__glow" aria-hidden="true" />
            <div className="legal-cta__hairline" aria-hidden="true" />
            <div className="legal-cta__content">
              <h2>See how your resume matches the role</h2>
              <p>Analyze your resume against a real job description, then practice for the same role.</p>
              <Link to={ctaHref} className="legal-btn legal-btn--primary">
                Analyze my resume
              </Link>
            </div>
          </div>
        </section>
      </main>

      <LandingFooter narrow />
    </div>
  );
}
