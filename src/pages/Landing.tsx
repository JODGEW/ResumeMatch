import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ThemeToggle } from '../components/ThemeToggle';
import { LogoMark } from '../components/LogoMark';
import { Mascot } from '../components/Mascot';
import { useAuth } from '../auth/AuthContext';
import { ProductPreview } from './landing/ProductPreview';
import { SuggestionsCard, InterviewCard } from './landing/WorkflowCards';
import { LandingFooter } from './landing/LandingFooter';
import { ArrowRightIcon, ListCheckIcon, TrustCheckIcon } from './landing/icons';
import { siteConfig } from '../config/site';
import './Landing.css';

const sectionLinks = [
  { href: '#how', label: 'How it works' },
  { href: '#workflow', label: 'After the score' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'FAQ' },
];

const steps = [
  {
    number: '01',
    title: 'Upload your resume',
    body: 'PDF in. Returning users reuse their last one in a click.',
  },
  {
    number: '02',
    title: 'Paste the job description',
    body: 'The real posting, not a job title. Every result is tied to it.',
  },
  {
    number: '03',
    title: 'Fix what matters',
    body: 'Match score, ranked missing keywords, and rewritten bullets, downloadable as Word where the posting supports it.',
  },
  {
    number: '04',
    title: 'Practice the interview',
    body: 'Voice mock interview built from the same posting, scored across five dimensions.',
  },
];

const betaFeatures = [
  '10 resume analyses per day',
  '5 mock interview sessions per day',
  'Limits reset daily at 00:00 UTC',
  'Match score and keyword gaps',
  'Rewritten resume (.docx) when safe edits are found',
  'Interview reports and transcripts',
  'Application tracker and saved history',
];

const trustChips = ['No data sold', 'Not used to train models', 'Delete everything in one email'];

const faqs = [
  {
    question: 'Do I need to rewrite my entire resume?',
    answer:
      'No. The point is to find the few changes that matter for one specific role and focus the revision there.',
  },
  {
    question: 'How is this different from a generic resume checker?',
    answer:
      'Generic checkers judge the document in isolation. ResumeMatch compares it to a real job description, ranks the gaps that matter for that role, and carries the same context into interview practice.',
  },
  {
    question: 'Is the mock interview based on the same role?',
    answer:
      'Yes. Questions are generated from the same posting and your analysis, so practice stays relevant to the application you are preparing.',
  },
  {
    question: 'How much can I use in a day?',
    answer:
      'During beta, 10 resume analyses and 5 mock interview sessions per day, per account. Limits reset at 00:00 UTC.',
  },
  {
    question: 'What happens to my resume and my data?',
    answer: null, // rendered inline — contains mailto links
  },
  {
    question: 'Who is this for?',
    answer:
      'Job seekers who would rather send five well-targeted applications than fifty generic ones.',
  },
];

export function Landing() {
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  // Hero mascot celebrates while the hero's primary CTA is hovered or
  // keyboard-focused.
  const [ctaHovered, setCtaHovered] = useState(false);
  const [ctaFocused, setCtaFocused] = useState(false);
  const appHref = user ? '/upload' : '/login';
  // A signed-out visitor has no account yet, so every primary action — the three
  // "Analyze my resume" buttons and the "Start free" pricing CTA — opens signup
  // rather than a sign-in form. Only the nav "Sign in" link stays on /login.
  // Deliberate departure from Landing v2, which dropped the signup entry from
  // the nav entirely.
  const ctaHref = user ? '/upload' : '/signup';

  return (
    <div className="landing-page">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <header className="landing-nav">
        <div className="landing-nav__inner">
          <Link to="/" className="landing-nav__brand" aria-label="ResumeMatch home">
            <LogoMark />
            <span>ResumeMatch</span>
          </Link>

          <nav className="landing-nav__links" aria-label="Landing page">
            {sectionLinks.map((link) => (
              <a key={link.href} href={link.href}>
                {link.label}
              </a>
            ))}
            <Link to="/support">Support</Link>
          </nav>

          <div className="landing-nav__actions">
            <Link
              to={appHref}
              className="landing-btn landing-btn--ghost landing-btn--nav landing-nav__signin"
            >
              {user ? 'Open app' : 'Sign in'}
            </Link>
            <Link to={ctaHref} className="landing-btn landing-btn--solid landing-btn--nav">
              Analyze my resume
            </Link>
            <ThemeToggle />
            <button
              type="button"
              className="landing-nav__menu-btn"
              aria-expanded={menuOpen}
              aria-controls="landing-mobile-nav"
              aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span aria-hidden="true" />
              <span aria-hidden="true" />
              <span aria-hidden="true" />
            </button>
          </div>
        </div>

        {menuOpen && (
          <nav id="landing-mobile-nav" className="landing-nav__mobile" aria-label="Landing page sections">
            {sectionLinks.map((link) => (
              <a key={link.href} href={link.href} onClick={() => setMenuOpen(false)}>
                {link.label}
              </a>
            ))}
            <Link to="/support" onClick={() => setMenuOpen(false)}>
              Support
            </Link>
            <Link
              to={appHref}
              className="landing-nav__mobile-signin"
              onClick={() => setMenuOpen(false)}
            >
              {user ? 'Open app' : 'Sign in'}
            </Link>
          </nav>
        )}
      </header>

      <main id="main-content" tabIndex={-1}>
        <section className="landing-hero" id="top">
          <div className="landing-hero__glow" aria-hidden="true" />
          <div className="landing-hero__content">
            <div className="landing-hero__mascot" aria-hidden="true">
              <Mascot state={ctaHovered || ctaFocused ? 'success' : 'idle'} size={168} />
            </div>
            <div className="landing-hero__badge">
              <span className="landing-hero__badge-dot" aria-hidden="true" />
              Free during beta · no credit card
            </div>
            <h1>Know your match before you apply.</h1>
            <p className="landing-hero__lede">
              Paste a job description. ResumeMatch scores your resume against it, shows the exact
              keywords you are missing, rewrites the weak bullets, and then interviews you for that
              same role.
            </p>
            <div className="landing-hero__actions">
              <Link
                to={ctaHref}
                className="landing-btn landing-btn--primary landing-btn--md"
                onPointerEnter={() => setCtaHovered(true)}
                onPointerLeave={() => setCtaHovered(false)}
                onFocus={(e) => setCtaFocused(e.currentTarget.matches(':focus-visible'))}
                onBlur={() => setCtaFocused(false)}
              >
                Analyze my resume
                <ArrowRightIcon />
              </Link>
              <Link to="/sample" className="landing-btn landing-btn--ghost landing-btn--md">
                See a sample analysis
              </Link>
            </div>
            <div className="landing-hero__trust" aria-label="Privacy assurances">
              {trustChips.map((chip) => (
                <span key={chip} className="landing-chip">
                  <TrustCheckIcon />
                  {chip}
                </span>
              ))}
            </div>
          </div>

          <ProductPreview />
        </section>

        <section className="landing-section" id="how">
          <div className="landing-section__head">
            <div>
              <div className="landing-eyebrow">How it works</div>
              <h2 className="landing-h2">One role, start to finish.</h2>
            </div>
            <p className="landing-section__aside">
              Generic checkers grade your resume in a vacuum. ResumeMatch grades it against the job
              you actually want — then keeps that context all the way to the interview.
            </p>
          </div>
          <div className="landing-steps" role="list">
            {steps.map((step) => (
              <article key={step.number} className="landing-step" role="listitem">
                <div className="landing-step__num">{step.number}</div>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-section" id="workflow">
          <div className="landing-eyebrow">After the score</div>
          <h2 className="landing-h2 landing-h2--gap-lg">
            A number is not a plan. This is what you actually get.
          </h2>
          <div className="landing-grid landing-grid--pair">
            <SuggestionsCard />
            <InterviewCard />
          </div>
        </section>

        <section className="landing-pricing-band" id="pricing">
          <div className="landing-pricing">
            <div>
              <div className="landing-eyebrow">Beta</div>
              <h2 className="landing-h2 landing-h2--gap-sm">Free while we&apos;re in beta.</h2>
              <p className="landing-lede landing-lede--pricing">
                The whole workflow is included during beta, with daily limits. Pricing isn&apos;t set
                yet. If that changes, we&apos;ll say so before it does.
              </p>
              <p className="landing-pricing__note">
                No credit card. Delete your account and data any time by email.
              </p>
            </div>
            <article className="landing-plan">
              <div className="landing-plan__title">
                <h3>Beta access</h3>
                <span className="landing-plan__badge">Beta</span>
              </div>
              <div className="landing-plan__price">$0</div>
              <ul className="landing-plan__features">
                {betaFeatures.map((feature) => (
                  <li key={feature}>
                    <ListCheckIcon />
                    {feature}
                  </li>
                ))}
              </ul>
              <Link to={ctaHref} className="landing-btn landing-btn--primary landing-btn--plan landing-plan__cta">
                Start free
              </Link>
            </article>
          </div>
        </section>

        <section className="landing-section landing-faq-section" id="faq">
          <div className="landing-faq__header">
            <div className="landing-eyebrow">FAQ</div>
            <h2 className="landing-h2 landing-h2--gap-sm">Questions before you start</h2>
            <p className="landing-faq__contact">
              Anything else? <a href={`mailto:${siteConfig.supportEmail}`}>{siteConfig.supportEmail}</a>
            </p>
          </div>
          <div className="landing-faq" role="list">
            {faqs.map((faq) => (
              <article key={faq.question} className="landing-faq__item" role="listitem">
                <h3>{faq.question}</h3>
                {faq.answer !== null ? (
                  <p>{faq.answer}</p>
                ) : (
                  <p>
                    Your resume, job descriptions, analyses, and transcripts are stored privately in
                    your account. Interview audio streams to Deepgram for live transcription and is
                    never stored; we opt out of their model-improvement program on every request.
                    Analyses run on Amazon Bedrock, which does not use customer inputs to train its
                    models. We never sell your data. Email{' '}
                    <a href={`mailto:${siteConfig.supportEmail}`}>{siteConfig.supportEmail}</a> and
                    your content is deleted within 7 days; system logs age out separately within 90
                    days.
                  </p>
                )}
              </article>
            ))}
          </div>
        </section>

        <section className="landing-cta">
          <div className="landing-cta__card">
            <div className="landing-cta__glow" aria-hidden="true" />
            <div className="landing-cta__hairline" aria-hidden="true" />
            <div className="landing-cta__content">
              <h2>Your next application, checked against the real posting.</h2>
              <p>Upload once, paste the job description, and see where you stand before you apply.</p>
              <Link to={ctaHref} className="landing-btn landing-btn--primary landing-btn--lg">
                Analyze my resume
                <ArrowRightIcon />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
