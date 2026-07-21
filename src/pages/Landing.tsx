import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ThemeToggle } from '../components/ThemeToggle';
import { LogoMark } from '../components/LogoMark';
import { useAuth } from '../auth/AuthContext';
import { HeroCards } from './landing/HeroCards';
import { SampleAnalysisPanel } from './landing/SampleAnalysisPanel';
import { SuggestionsCard, InterviewCard } from './landing/WorkflowCards';
import { LandingFooter } from './landing/LandingFooter';
import { TrustCheckIcon, ListCheckIcon } from './landing/icons';
import './Landing.css';

const navLinks = [
  { href: '#why', label: 'Why ResumeMatch' },
  { href: '#how', label: 'How it works' },
  { href: '#features', label: 'Features' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'FAQ' },
];

const steps = [
  {
    number: '01',
    title: 'Upload your resume',
    body: 'Start with the resume you already have.',
  },
  {
    number: '02',
    title: 'Paste the job description',
    body: 'Get feedback tied to the role you want, not generic resume advice.',
  },
  {
    number: '03',
    title: 'Improve your resume',
    body: 'See where you match, what is missing, and what to change before you apply.',
  },
  {
    number: '04',
    title: 'Practice the interview',
    body: 'Use the same role to practice once the application is stronger.',
  },
];

const features = [
  {
    title: 'Resume Match',
    body: 'See how your resume lines up with the role before you apply.',
  },
  {
    title: 'Missing Keywords & Gaps',
    body: 'Identify the requirements and language your resume is not communicating clearly enough.',
  },
  {
    title: 'Targeted Resume Edits',
    body: 'Get practical suggestions to strengthen the application for the role you want.',
  },
  {
    title: 'Role-Based Mock Interview',
    body: 'Practice with interview questions built from the same role once the resume is stronger.',
  },
];

const freePlanFeatures = [
  '10 resume analyses per day',
  '5 mock interview sessions per day',
  'Complete resume analysis',
  'Keyword and alignment breakdown',
  'Targeted improvement suggestions',
  'Mock interview access',
  'Saved history and session review',
];

const proPlanFeatures = ['Expanded limits', 'Future premium benefits', 'Pricing and details to be announced.'];

const faqs = [
  {
    question: 'Do I need to rewrite my entire resume?',
    answer:
      'No. ResumeMatch is built to help you find the changes that matter most for a specific role so you can focus the revision where it will count.',
  },
  {
    question: 'How is this different from a generic resume checker?',
    answer:
      'Generic resume checkers judge the document in isolation. ResumeMatch compares your resume to a specific job description, shows the gaps that matter for that role, and carries that same context into interview practice.',
  },
  {
    question: 'Is the mock interview based on the same role?',
    answer:
      'Yes. The interview step uses the same role context, so your practice stays relevant to the application you are preparing.',
  },
  {
    question: 'Is ResumeMatch free right now?',
    answer:
      'Yes. ResumeMatch is currently free during beta. You can use the full workflow today, with daily limits on analyses and mock interview sessions.',
  },
  {
    question: 'What happens to my resume and my data?',
    answer: null, // rendered inline — contains a mailto link
  },
  {
    question: 'Who is this for?',
    answer:
      'ResumeMatch is for job seekers who want a more targeted way to improve applications and prepare for interviews.',
  },
];

export function Landing() {
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const appHref = user ? '/upload' : '/login';
  const primaryLabel = user ? 'Open App' : 'Analyze My Resume';
  const finalCtaLabel = user ? 'Go to Upload' : 'Analyze My Resume';

  return (
    <div className="landing-page">
      <header className="landing-nav">
        <div className="landing-nav__inner">
          <Link to="/" className="landing-nav__brand" aria-label="ResumeMatch home">
            <LogoMark />
            <span>ResumeMatch</span>
          </Link>

          <nav className="landing-nav__links" aria-label="Landing page">
            {navLinks.map((link) => (
              <a key={link.href} href={link.href}>
                {link.label}
              </a>
            ))}
          </nav>

          <div className="landing-nav__actions">
            <ThemeToggle />
            {user ? (
              <Link to="/upload" className="landing-btn landing-btn--ghost landing-btn--nav">
                Open app
              </Link>
            ) : (
              <>
                <Link to="/login" className="landing-btn landing-btn--ghost landing-btn--nav landing-nav__signin">
                  Sign in
                </Link>
                <Link to="/signup" className="landing-btn landing-btn--primary landing-btn--sm">
                  Create account
                </Link>
              </>
            )}
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
            {navLinks.map((link) => (
              <a key={link.href} href={link.href} onClick={() => setMenuOpen(false)}>
                {link.label}
              </a>
            ))}
            {!user && (
              <Link to="/login" className="landing-nav__mobile-signin" onClick={() => setMenuOpen(false)}>
                Sign in
              </Link>
            )}
          </nav>
        )}
      </header>

      <main>
        <header className="landing-hero" id="top">
          <div className="landing-hero__row">
            <div className="landing-hero__content">
              <div className="landing-eyebrow landing-hero__eyebrow">For real job applications</div>
              <h1>Get the interview. Then pass it.</h1>
              <p className="landing-hero__lede">
                Match your resume to a real job description, improve the application before you send it, and practice
                for the interview for that same role.
              </p>
              <div className="landing-hero__actions">
                <Link to={appHref} className="landing-btn landing-btn--primary landing-btn--md">
                  {primaryLabel}
                </Link>
                {!user && (
                  <Link to="/sample" className="landing-btn landing-btn--ghost landing-btn--md">
                    See a sample analysis
                  </Link>
                )}
                <a href="#how" className="landing-btn landing-btn--ghost landing-btn--md">
                  See how it works
                </a>
              </div>
              <div className="landing-hero__trust" aria-label="Privacy assurances">
                <span className="landing-chip">
                  <TrustCheckIcon />
                  No data sold
                </span>
                <span className="landing-chip">
                  <TrustCheckIcon />
                  No model training on your content
                </span>
              </div>
            </div>
            <HeroCards />
          </div>
        </header>

        <section className="landing-sample" aria-label="Sample analysis">
          <SampleAnalysisPanel />
        </section>

        <section className="landing-section landing-section--center" id="why">
          <div className="landing-eyebrow">Why ResumeMatch</div>
          <h2 className="landing-h2 landing-h2--center">More than a resume score</h2>
          <p className="landing-lede landing-lede--center landing-lede--why">
            Start with a real job description. See how your resume aligns, fix the gaps that matter, and carry that
            same role into interview practice. One role, one workflow, from application to interview prep.
          </p>
        </section>

        <section className="landing-section" id="how">
          <div className="landing-eyebrow">How it works</div>
          <h2 className="landing-h2 landing-h2--gap-lg">From resume check to interview prep</h2>
          <div className="landing-grid landing-grid--quads" role="list">
            {steps.map((step) => (
              <article key={step.number} className="landing-card" role="listitem">
                <div className="landing-step-num">{step.number}</div>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-section" aria-label="See the workflow in action">
          <div className="landing-eyebrow">See the workflow in action</div>
          <h2 className="landing-h2 landing-h2--gap-sm">What happens after the analysis</h2>
          <p className="landing-lede landing-lede--intro">
            Below: the concrete resume edits ResumeMatch suggests for the role, and the mock interview it builds from
            that same posting.
          </p>
          <div className="landing-grid landing-grid--pair">
            <SuggestionsCard />
            <InterviewCard />
          </div>
        </section>

        <section className="landing-section" id="features">
          <div className="landing-eyebrow">Core features</div>
          <h2 className="landing-h2 landing-h2--gap-lg">The tools that move one application forward</h2>
          <div className="landing-grid landing-grid--quads" role="list">
            {features.map((feature) => (
              <article key={feature.title} className="landing-card" role="listitem">
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </article>
            ))}
          </div>
          <p className="landing-lede landing-section__afterword">
            Paste a job description to see your match, the gaps that matter, and the edits that close them.
          </p>
        </section>

        <section className="landing-section" id="pricing">
          <div className="landing-eyebrow">Pricing</div>
          <h2 className="landing-h2 landing-h2--gap-sm">Start free. Everything is included right now.</h2>
          <p className="landing-lede landing-lede--intro">
            ResumeMatch is currently free during beta. You can use the full workflow today, with daily limits on
            analyses and mock interviews. Pro pricing and added benefits will come later.
          </p>
          <div className="landing-pricing" role="list">
            <article className="landing-plan landing-plan--free" role="listitem">
              <div className="landing-plan__title">
                <h3>Free during beta</h3>
                <span className="landing-plan__badge">Available now</span>
              </div>
              <p className="landing-plan__body">Use the full ResumeMatch workflow today.</p>
              <ul className="landing-plan__features">
                {freePlanFeatures.map((feature) => (
                  <li key={feature}>
                    <ListCheckIcon />
                    {feature}
                  </li>
                ))}
              </ul>
              <Link to={appHref} className="landing-btn landing-btn--primary landing-btn--plan landing-plan__cta">
                Start Free
              </Link>
            </article>
            <article className="landing-plan" role="listitem">
              <div className="landing-plan__title">
                <h3>Pro</h3>
              </div>
              <p className="landing-plan__body landing-plan__body--muted">Coming soon.</p>
              <ul className="landing-plan__features landing-plan__features--muted">
                {proPlanFeatures.map((feature) => (
                  <li key={feature}>
                    <span className="landing-plan__dash" />
                    {feature}
                  </li>
                ))}
              </ul>
              <button type="button" className="landing-btn landing-btn--disabled landing-btn--plan landing-plan__cta" disabled aria-disabled="true">
                Coming Soon
              </button>
            </article>
          </div>
        </section>

        <section className="landing-section" id="faq">
          <div className="landing-faq__header">
            <div className="landing-eyebrow">Frequently asked questions</div>
            <h2 className="landing-h2 landing-h2--center">Questions before you start</h2>
          </div>
          <div className="landing-faq" role="list">
            {faqs.map((faq) => (
              <article key={faq.question} className="landing-faq__item" role="listitem">
                <h3>{faq.question}</h3>
                {faq.answer !== null ? (
                  <p>{faq.answer}</p>
                ) : (
                  <p>
                    Your resume (the file and its extracted text), your job descriptions, analyses, and interview
                    transcripts are stored privately in your account so you can come back to them. Interview audio
                    streams to our transcription provider (Deepgram) for live speech-to-text. We never store it, we opt
                    out of Deepgram&apos;s model-improvement program on every request, and per Deepgram&apos;s policy,
                    opted-out audio is retained only long enough to process the request. We never sell your data, and
                    nothing you upload is used to train AI models: analyses run on AWS Bedrock, which does not use
                    customer inputs for training. Want everything gone? Email{' '}
                    <a href="mailto:support@resumematchapp.com">support@resumematchapp.com</a> and your account and all
                    associated data are deleted within days.
                  </p>
                )}
              </article>
            ))}
          </div>
        </section>

        <section className="landing-section landing-section--center landing-section--cta">
          <div className="landing-eyebrow">Start with your resume</div>
          <h2 className="landing-h2 landing-h2--center landing-h2--cta">
            Analyze your resume against a real job description
          </h2>
          <p className="landing-lede landing-lede--center landing-lede--cta">
            See where you match, what to improve, and what to practice next for the same role.
          </p>
          <Link to={appHref} className="landing-btn landing-btn--primary landing-btn--lg">
            {finalCtaLabel}
          </Link>
        </section>
      </main>

      <LandingFooter appHref={appHref} />
    </div>
  );
}
