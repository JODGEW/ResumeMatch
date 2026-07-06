import { Link } from 'react-router-dom';
import { ThemeToggle } from '../components/ThemeToggle';
import { PublicFooter } from '../components/PublicFooter';
import { LogoMark } from '../components/LogoMark';
import { useAuth } from '../auth/AuthContext';
import { BILLING_UI_ENABLED } from '../config/billing';
import './Landing.css';

const resultImage = new URL('../../screenshots/landing_result.JPG', import.meta.url).href;
const suggestionImage = new URL('../../screenshots/landing_suggestion.JPG', import.meta.url).href;
const interviewImage = new URL('../../screenshots/landing_interview.JPG', import.meta.url).href;

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
    alt: 'Role-based mock interview results showing interview questions, transcript feedback, and evaluation for the same job context.',
    frameClassName: ' landing-shot--preview-portrait',
    imageClassName: ' landing-shot__image--portrait',
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
    name: 'Free',
    tagline: 'For testing the waters.',
    price: '$0',
    priceNote: 'forever',
    priceSub: null,
    priceStrike: null,
    foundingNote: null,
    badge: null,
    cta: 'Start free',
    features: [
      '2 analyses / day',
      '1 interview / day',
      'Top 3 keyword gaps',
      'Application tracker',
    ],
    footnote: 'Good for getting a feel for the product.',
  },
  {
    name: 'Pro',
    tagline: 'For active job searches.',
    price: '$14.99',
    priceNote: 'per month, cancel anytime',
    priceSub: null,
    priceStrike: null,
    foundingNote: null,
    badge: null,
    cta: 'Subscribe',
    features: [
      '10 analyses + 5 interviews / day',
      'Full keyword gap analysis',
      'DOCX export + rewrite',
      'All interview modes',
    ],
    footnote: 'Best for ongoing, multi-month searches.',
  },
  {
    name: 'Career Sprint',
    tagline: 'For focused 60-day pushes.',
    price: '$19.99',
    priceNote: 'once',
    priceSub: '60 days, no auto-renewal',
    priceStrike: '$24.99',
    foundingNote:
      'Founding price: $19.99 for the 60-day Career Sprint, available through October 31, 2026.',
    badge: 'Best value',
    cta: 'Buy once',
    features: [
      'Everything in Pro',
      'One payment, no subscription',
      '60-day focused window',
      'No cancellation needed',
    ],
    footnote: 'For focused job search sprints.',
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
    question: 'Who is this for?',
    answer: 'ResumeMatch is for job seekers who want a more targeted way to improve applications and prepare for interviews.',
  },
];

export function Landing() {
  const { user } = useAuth();
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
            <a href="#why">Why ResumeMatch</a>
            <a href="#how-it-works">How it works</a>
            <a href="#features">Features</a>
            {BILLING_UI_ENABLED && <a href="#pricing">Pricing</a>}
            <a href="#faq">FAQ</a>
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
          </div>
        </div>
      </header>

      <main>
        <section className="landing-hero">
          <img className="landing-hero__image" src={resultImage} alt="" aria-hidden="true" />
          <div className="landing-hero__scrim" />
          <div className="page-container landing-hero__content">
            <p className="landing-eyebrow">For real job applications</p>
            <h1>Get the interview. Then pass it.</h1>
            <div className="landing-reading-wrap">
              <p className="landing-hero__lede">
                Match your resume to a real job description, improve the application
                before you send it, and practice for the interview for that same role.
              </p>
            </div>
            <div className="landing-hero__actions">
              <Link to={appHref} className="btn btn-primary landing-hero__primary">
                {primaryLabel}
              </Link>
              <a href="#how-it-works" className="btn btn-ghost landing-hero__secondary">
                See how it works
              </a>
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
                alt="Resume analysis results showing an overall match score, breakdown, and role-specific evaluation before applying."
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
                ResumeMatch turns role-specific gaps into resume edits, then carries the same role into interview practice.
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
                Start with resume analysis. Move into interview practice once the
                application is stronger.
              </p>
            </div>
          </div>
        </section>

        {BILLING_UI_ENABLED && (
        <section className="landing-section" id="pricing">
          <div className="page-container landing-section__inner">
            <div className="landing-section__header">
              <p className="landing-eyebrow">Pricing</p>
              <h2>Start free, upgrade for the full loop</h2>
            </div>

            <div className="landing-reading-wrap landing-pricing__intro">
              <p className="landing-reading-copy">
                Free lets you try the core workflow. Pro keeps it going month to
                month. Career Sprint is a focused one-time push.
              </p>
            </div>

            <div className="landing-pricing" role="list">
              {plans.map((plan) => {
                const featured = plan.badge !== null;
                return (
                  <article
                    key={plan.name}
                    className={`landing-plan${featured ? ' landing-plan--featured' : ''}`}
                    role="listitem"
                  >
                    {plan.badge ? (
                      <span className="landing-plan__badge">{plan.badge}</span>
                    ) : null}

                    <div className="landing-plan__head">
                      <h3>{plan.name}</h3>
                      <p className="landing-plan__tagline">{plan.tagline}</p>
                    </div>

                    <div className="landing-plan__price">
                      <span className="landing-plan__price-amount">{plan.price}</span>
                      <span className="landing-plan__price-note">{plan.priceNote}</span>
                    </div>
                    {plan.priceSub ? (
                      <p className="landing-plan__price-sub">
                        {plan.priceStrike ? (
                          <s className="landing-plan__price-strike">{plan.priceStrike}</s>
                        ) : null}
                        {plan.priceSub}
                      </p>
                    ) : null}
                    {plan.foundingNote ? (
                      <p className="landing-plan__price-sub">{plan.foundingNote}</p>
                    ) : null}

                    <ul className="landing-plan__features">
                      {plan.features.map((feature) => (
                        <li key={feature}>{feature}</li>
                      ))}
                    </ul>

                    <Link
                      to={appHref}
                      className={`btn landing-plan__cta ${featured ? 'btn-primary' : 'btn-ghost'}`}
                    >
                      {plan.cta}
                    </Link>

                    <p className="landing-plan__footnote">{plan.footnote}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
        )}

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
