import { Link } from 'react-router-dom';
import { ThemeToggle } from '../components/ThemeToggle';
import { useAuth } from '../auth/AuthContext';
import './Landing.css';

const resultImage = new URL('../../screenshots/result.png', import.meta.url).href;

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

const benefits = [
  {
    title: 'Get the interview',
    body: 'See whether your resume is making the right case before you apply.',
  },
  {
    title: 'Improve the application',
    body: 'Focus on the gaps and edits that will make the application more relevant.',
  },
  {
    title: 'Practice for the interview',
    body: 'Turn the same role into interview practice after the resume is in better shape.',
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
    question: 'Who is this for?',
    answer: 'ResumeMatch is for job seekers who want a more targeted way to improve applications and prepare for interviews.',
  },
];

function LogoMark() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="24" height="24" rx="6" stroke="var(--accent)" strokeWidth="2" />
      <path d="M8 9h12M8 14h8M8 19h10" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

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
            <a href="#pricing">Pricing</a>
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

        <section className="landing-section">
          <div className="page-container landing-section__inner">
            <div className="landing-section__header">
              <p className="landing-eyebrow">What you get</p>
              <h2>Three outcomes, one workflow</h2>
            </div>

            <div className="landing-benefits" role="list">
              {benefits.map((benefit) => (
                <article key={benefit.title} className="landing-benefit" role="listitem">
                  <h3>{benefit.title}</h3>
                  <p>{benefit.body}</p>
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
              {plans.map((plan, index) => (
                <article
                  key={plan.name}
                  className={`landing-plan${index === 1 ? ' landing-plan--featured' : ''}`}
                  role="listitem"
                >
                  <div>
                    <h3>{plan.name}</h3>
                    <p>{plan.body}</p>
                  </div>
                  <ul className="landing-plan__features">
                    {plan.features.map((feature) => (
                      <li key={feature}>{feature}</li>
                    ))}
                  </ul>
                  {index === 1 ? (
                    <button type="button" className="btn btn-primary" disabled aria-disabled="true">
                      {plan.cta}
                    </button>
                  ) : (
                    <Link to={appHref} className="btn btn-ghost">
                      {plan.cta}
                    </Link>
                  )}
                </article>
              ))}
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
    </div>
  );
}
