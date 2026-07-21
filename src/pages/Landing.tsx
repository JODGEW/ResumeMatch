import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ThemeToggle } from '../components/ThemeToggle';
import { PublicFooter } from '../components/PublicFooter';
import { LogoMark } from '../components/LogoMark';
import { useAuth } from '../auth/AuthContext';
import './Landing.css';

const navLinks = [
  { href: '#why', label: 'Why ResumeMatch' },
  { href: '#how-it-works', label: 'How it works' },
  { href: '#features', label: 'Features' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'FAQ' },
];

const resultImage = new URL('../../screenshots/landing_analysis_result.jpg', import.meta.url).href;
const suggestionImage = new URL('../../screenshots/landing_suggestion.jpg', import.meta.url).href;
const interviewImage = new URL('../../screenshots/landing_interview_assessment.jpg', import.meta.url).href;
const heroKeywordsImage = new URL('../../screenshots/hero_card_keywords.jpg', import.meta.url).href;
const heroScoreImage = new URL('../../screenshots/hero_card_score.jpg', import.meta.url).href;

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

const workflowPreviews = [
  {
    title: 'Targeted resume edits',
    body: 'Move from scoring into concrete suggestions that strengthen the resume for that job description.',
    image: suggestionImage,
    alt: 'Role-specific resume suggestions showing targeted edits and changes to strengthen the application before applying.',
    frameClassName: ' landing-shot--preview-wide',
    imageClassName: ' landing-shot__image--wide',
  },
  {
    title: 'Role-based mock interview',
    body: 'Carry the same role into interview practice and review how the answers hold up.',
    image: interviewImage,
    alt: 'Mock interview assessment for the same role showing an overall score with category scores for communication structure, STAR framework usage, specificity, role relevance, and self-awareness.',
    frameClassName: ' landing-shot--preview-wide',
    imageClassName: ' landing-shot__image--wide',
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

const plans = [
  {
    name: 'Free during beta',
    body: 'Use the full ResumeMatch workflow today.',
    cta: 'Start Free',
    features: [
      '10 resume analyses per day',
      '5 mock interview sessions per day',
      'Complete resume analysis',
      'Keyword and alignment breakdown',
      'Targeted improvement suggestions',
      'Mock interview access',
      'Saved history and session review',
    ],
  },
  {
    name: 'Pro',
    body: 'Coming soon.',
    cta: 'Coming Soon',
    features: [
      'Expanded limits',
      'Future premium benefits',
      'Pricing and details to be announced.',
    ],
  },
];

const faqs = [
  {
    question: 'Do I need to rewrite my entire resume?',
    answer: 'No. ResumeMatch is built to help you find the changes that matter most for a specific role so you can focus the revision where it will count.',
  },
  {
    question: 'How is this different from a generic resume checker?',
    answer: 'Generic resume checkers judge the document in isolation. ResumeMatch compares your resume to a specific job description, shows the gaps that matter for that role, and carries that same context into interview practice.',
  },
  {
    question: 'Is the mock interview based on the same role?',
    answer: 'Yes. The interview step uses the same role context, so your practice stays relevant to the application you are preparing.',
  },
  {
    question: 'Is ResumeMatch free right now?',
    answer: 'Yes. ResumeMatch is currently free during beta. You can use the full workflow today, with daily limits on analyses and mock interview sessions.',
  },
  {
    question: 'What happens to my resume and my data?',
    answer: 'Your resume (the file and its extracted text), your job descriptions, analyses, and interview transcripts are stored privately in your account so you can come back to them. Interview audio streams to our transcription provider (Deepgram) for live speech-to-text. We never store it, we opt out of Deepgram\'s model-improvement program on every request, and per Deepgram\'s policy, opted-out audio is retained only long enough to process the request. We never sell your data, and nothing you upload is used to train AI models: analyses run on AWS Bedrock, which does not use customer inputs for training. Want everything gone? Email support@resumematchapp.com and your account and data are deleted within 7 days.',
  },
  {
    question: 'Who is this for?',
    answer: 'ResumeMatch is for job seekers who want a more targeted way to improve applications and prepare for interviews.',
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
        <div className="page-container landing-nav__inner">
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
              <Link to="/upload" className="btn btn-ghost btn--sm">
                Open app
              </Link>
            ) : (
              <>
                <Link to="/login" className="btn btn-ghost btn--sm">
                  Sign in
                </Link>
                <Link to="/signup" className="btn btn-primary btn--sm">
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
          </nav>
        )}
      </header>

      <main>
        <section className="landing-hero">
          <div className="landing-hero__glow" aria-hidden="true" />
          <div className="page-container landing-hero__inner">
            <div className="landing-hero__content">
              <p className="landing-eyebrow">For real job applications</p>
              <h1>Get the interview. Then pass it.</h1>
              <div className="landing-reading-wrap landing-hero__reading">
                <p className="landing-hero__lede">
                  Match your resume to a real job description, improve the application
                  before you send it, and practice for the interview for that same role.
                </p>
              </div>
              <div className="landing-hero__actions">
                <Link to={appHref} className="btn btn-primary landing-hero__primary">
                  {primaryLabel}
                </Link>
                {!user && (
                  <Link to="/sample" className="btn btn-ghost landing-hero__secondary">
                    See a sample analysis
                  </Link>
                )}
                <a href="#how-it-works" className="btn btn-ghost landing-hero__secondary">
                  See how it works
                </a>
              </div>
              <ul className="landing-hero__trust" aria-label="Privacy assurances">
                <li>No data sold</li>
                <li>No model training on your content</li>
              </ul>
            </div>

            <div className="landing-hero__visual" aria-hidden="true">
              <img
                className="landing-hero__card landing-hero__card--keywords"
                src={heroKeywordsImage}
                alt=""
                loading="lazy"
                decoding="async"
              />
              <img
                className="landing-hero__card landing-hero__card--score"
                src={heroScoreImage}
                alt=""
                loading="lazy"
                decoding="async"
              />
            </div>
          </div>
        </section>

        <section className="landing-showcase" aria-labelledby="landing-preview-heading">
          <div className="page-container landing-showcase__inner">
            <h2 id="landing-preview-heading" className="sr-only">
              Product preview
            </h2>
            <figure className="landing-shot landing-shot--hero">
              <img
                src={resultImage}
                alt="Resume analysis results showing a match score with breakdown, an experience-gap warning, and the matched and missing keywords for the job description."
                fetchPriority="high"
                decoding="async"
              />
            </figure>
          </div>
        </section>

        <section className="landing-section" id="why">
          <div className="page-container landing-section__inner landing-section__inner--reading">
            <p className="landing-eyebrow">Why ResumeMatch</p>
            <h2>More than a resume score</h2>
            <div className="landing-reading-wrap">
              <p className="landing-reading-copy">
                Start with a real job description. See how your resume aligns, fix the
                gaps that matter, and carry that same role into interview practice.
                One role, one workflow, from application to interview prep.
              </p>
            </div>
          </div>
        </section>

        <section className="landing-section" id="how-it-works">
          <div className="page-container landing-section__inner">
            <div className="landing-section__header">
              <p className="landing-eyebrow">How it works</p>
              <h2>From resume check to interview prep</h2>
            </div>

            <div className="landing-steps" role="list">
              {steps.map((step) => (
                <article key={step.number} className="landing-step" role="listitem">
                  <span className="landing-step__number">{step.number}</span>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="landing-section landing-section--workflow">
          <div className="page-container landing-section__inner">
            <div className="landing-section__header">
              <p className="landing-eyebrow">See the workflow in action</p>
              <h2>What happens after the analysis</h2>
            </div>

            <div className="landing-reading-wrap landing-workflow__intro">
              <p className="landing-reading-copy">
                Below: the concrete resume edits ResumeMatch suggests for the role,
                and the mock interview it builds from that same posting.
              </p>
            </div>

            <div className="landing-product-strip" role="list" aria-label="Workflow proof">
              {workflowPreviews.map((preview) => (
                <article key={preview.title} className="landing-preview-card" role="listitem">
                  <figure className={`landing-shot landing-shot--preview${preview.frameClassName ?? ''}`}>
                    <img
                      className={preview.imageClassName?.trim() || undefined}
                      src={preview.image}
                      alt={preview.alt}
                      loading="lazy"
                      decoding="async"
                    />
                  </figure>
                  <div className="landing-preview-card__body">
                    <h3>{preview.title}</h3>
                    <p>{preview.body}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="landing-section" id="features">
          <div className="page-container landing-section__inner">
            <div className="landing-section__header">
              <p className="landing-eyebrow">Core features</p>
              <h2>The tools that move one application forward</h2>
            </div>

            <div className="landing-features" role="list">
              {features.map((feature) => (
                <article key={feature.title} className="landing-feature" role="listitem">
                  <h3>{feature.title}</h3>
                  <p>{feature.body}</p>
                </article>
              ))}
            </div>

            <div className="landing-reading-wrap landing-section__afterword">
              <p className="landing-reading-copy">
                Paste a job description to see your match, the gaps that matter,
                and the edits that close them.
              </p>
            </div>
          </div>
        </section>

        <section className="landing-section" id="pricing">
          <div className="page-container landing-section__inner">
            <div className="landing-section__header">
              <p className="landing-eyebrow">Pricing</p>
              <h2>Start free. Everything is included right now.</h2>
            </div>

            <div className="landing-reading-wrap landing-pricing__intro">
              <p className="landing-reading-copy">
                ResumeMatch is currently free during beta. 
                You can use the full workflow today, with daily limits on analyses and mock interviews. 
                Pro pricing and added benefits will come later.
              </p>
            </div>

            <div className="landing-pricing" role="list">
              {plans.map((plan, index) => {
                const isFeatured = index === 0;
                return (
                  <article
                    key={plan.name}
                    className={`landing-plan${isFeatured ? ' landing-plan--featured' : ' landing-plan--muted'}`}
                    role="listitem"
                  >
                    <div className="landing-plan__head">
                      <div className="landing-plan__title">
                        <h3>{plan.name}</h3>
                        {isFeatured && <span className="landing-plan__badge">Available now</span>}
                      </div>
                      <p>{plan.body}</p>
                    </div>
                    <ul className="landing-plan__features">
                      {plan.features.map((feature) => (
                        <li key={feature}>{feature}</li>
                      ))}
                    </ul>
                    {isFeatured ? (
                      <Link to={appHref} className="btn btn-primary landing-plan__cta">
                        {plan.cta}
                      </Link>
                    ) : (
                      <button type="button" className="btn btn-ghost landing-plan__cta" disabled aria-disabled="true">
                        {plan.cta}
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="landing-section" id="faq">
          <div className="page-container landing-section__inner landing-section__inner--reading">
            <div className="landing-section__header landing-section__header--reading">
              <p className="landing-eyebrow">Frequently asked questions</p>
              <h2>Questions before you start</h2>
            </div>

            <div className="landing-faq" role="list">
              {faqs.map((faq) => (
                <article key={faq.question} className="landing-faq__item" role="listitem">
                  <h3>{faq.question}</h3>
                  <p>{faq.answer}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="landing-section landing-section--cta">
          <div className="page-container landing-section__inner landing-section__inner--reading">
            <p className="landing-eyebrow">Start with your resume</p>
            <h2>Analyze your resume against a real job description</h2>
            <div className="landing-reading-wrap">
              <p className="landing-reading-copy">
                See where you match, what to improve, and what to practice next for
                the same role.
              </p>
            </div>
            <div className="landing-cta__actions">
              <Link to={appHref} className="btn btn-primary">
                {finalCtaLabel}
              </Link>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
