import { TagLinesIcon } from './icons';

const SUGGESTIONS = [
  {
    tag: 'AWS Lambda',
    text: 'Work experience or projects section highlighting any AWS Lambda work, or update to include AWS migration experience',
    reason:
      'Job requires hands-on AWS Lambda experience; resume shows Azure Functions and GCP Cloud Run instead. AWS is the required cloud provider.',
  },
  {
    tag: 'DynamoDB',
    text: 'Consider adding a project or work experience demonstrating NoSQL database design with DynamoDB',
    reason:
      'Critical requirement for this role; resume shows PostgreSQL, MongoDB, and MySQL but no DynamoDB experience.',
  },
  {
    tag: 'Jest',
    text: 'Update technical skills or add a project demonstrating Jest usage for unit/integration testing',
    reason: 'Job explicitly requires Jest for testing; resume mentions Mocha/Chai instead.',
  },
];

export function SuggestionsCard() {
  return (
    <article className="landing-work-card">
      <div className="landing-work-card__caption">
        <h3>Targeted resume edits</h3>
        <p>
          Key missing requirements come with a suggested edit and the reason it matters for this
          posting.
        </p>
      </div>
      <div className="landing-work-card__embed">
        <div className="landing-embed-title">Suggestions</div>
        <div className="landing-embed-subtitle">Recommended additions to improve your match score</div>
        {/* Rows, not cards, as on Results: a column header, then one
            hairline-separated row per keyword. Each row carries its own labels,
            visually hidden while the header shows and visible once rows stack. */}
        <div className="landing-suggestions">
          <div className="landing-suggestions__head" aria-hidden="true">
            <span>Keyword</span>
            <span>Where to add</span>
            <span>Why</span>
          </div>
          {SUGGESTIONS.map((item) => (
            <div key={item.tag} className="landing-suggestion">
              <div>
                <span className="landing-suggestion__tag">
                  <TagLinesIcon />
                  {item.tag}
                </span>
              </div>
              <div>
                <span className="landing-suggestion__label">Where to add</span>
                <div className="landing-suggestion__text">{item.text}</div>
              </div>
              <div>
                <span className="landing-suggestion__label">Why</span>
                <div className="landing-suggestion__reason">{item.reason}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

export function InterviewCard() {
  return (
    <article className="landing-work-card">
      <div className="landing-work-card__caption">
        <h3>Role-based mock interview</h3>
        <p>
          Answer out loud. A behavioral run is scored on structure, STAR usage, specificity,
          relevance, and self-awareness — and shows which one costs you most.
        </p>
      </div>
      <div className="landing-work-card__embed">
        <div className="landing-session__role">Full-Stack Software Development Engineer @ Bramble Commerce</div>
        {/* Same "·" rule as .ir-head__meta: drawn by CSS, clipped at line starts. */}
        <div className="landing-session__meta">
          <span className="landing-session__file">casey_morgan_resume.pdf</span>
          <span>Jul 12, 2026</span>
          <span>6:12 PM</span>
          <span>Behavioral</span>
          <span>10 questions</span>
          <span>19 min</span>
          <span className="landing-session__match">Resume match 61%</span>
        </div>
        <div className="landing-chip-row">
          <span className="landing-chip-btn landing-chip-btn--primary">
            <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M2.5 8a5.5 5.5 0 1 1 1.6 3.9M2.5 12v-3h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
            Interview again
          </span>
          <span className="landing-chip-btn">
            <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M8 2v8M5 7l3 3 3-3M3 13h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
            Interview report
          </span>
          <span className="landing-chip-btn">
            <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true">
              <rect x="5" y="5" width="8" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.3" fill="none" />
              <path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2H4a1.5 1.5 0 0 0-1.5 1.5V10" stroke="currentColor" strokeWidth="1.3" fill="none" />
            </svg>
            Copy transcript
          </span>
          <span className="landing-chip-btn">
            <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M4 2h6l3 3v9H4V2Z" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinejoin="round" />
              <path d="M10 2v3h3" stroke="currentColor" strokeWidth="1.3" fill="none" />
            </svg>
            View full analysis
          </span>
        </div>
        <div className="landing-session__jd">
          <span className="landing-session__jd-label">Job Description</span>
          <span className="landing-session__jd-hint">
            View full posting
            <svg width="9" height="9" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
          </span>
        </div>
        <div className="landing-tabs">
          <span className="landing-tab landing-tab--active">
            <svg width="10" height="10" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3 13V7M7 13V3M11 13V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            Assessment
          </span>
          <span className="landing-tab">
            <svg width="10" height="10" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3 4h10M3 8h10M3 12h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            Transcript
          </span>
        </div>
        <div className="landing-session__assess-head">
          <span className="landing-session__section">Assessment</span>
          <span className="landing-session__ai">
            <svg width="9" height="9" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M8 1.5l1.6 3.9 4.2.3-3.2 2.7 1 4.1L8 10.9 4.4 12.6l1-4.1L2.2 5.7l4.2-.3L8 1.5Z" fill="currentColor" />
            </svg>
            AI-generated
          </span>
          <span className="landing-session__ai-link">Show details</span>
        </div>
        {/* Mirrors .ir-overall: ring with score and rating inside, summary beside
            it, and the costliest row under a hairline. STAR Framework Usage is
            what findCostliestCategory() returns for the sample session:
            (100-75)*25 = 625, ahead of Role Relevance at 520, so round(625/100)
            = 6 pts. */}
        <div className="landing-overall">
          <div className="landing-overall__ring">
            <svg width="72" height="72" viewBox="0 0 64 64" aria-hidden="true">
              <circle cx="32" cy="32" r="27" fill="none" className="lp-stroke-track" strokeWidth="5" />
              <circle
                cx="32"
                cy="32"
                r="27"
                fill="none"
                className="lp-stroke-score-good"
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray="130.6 39"
                transform="rotate(-90 32 32)"
              />
            </svg>
            <span className="landing-overall__value">
              77%
              <span className="landing-overall__grade">Good</span>
            </span>
          </div>
          <div className="landing-overall__summary">
            <div className="landing-overall__label">Summary</div>
            <p>
              The candidate demonstrates solid full-stack fundamentals, genuine ownership of past
              features, and a credible learning-under-pressure track record backed by concrete
              metrics. Answers follow a mostly clear STAR structure with specific technical
              detail—notably the PostgreSQL optimization deep-dive—though depth thins out on AWS
              experience and mentorship, and some responses contain minor redundancy. Overall, a
              strong junior-to-mid candidate whose honesty about gaps and consistent use of
              measurable outcomes make them a competitive fit for the role.
            </p>
          </div>
          <div className="landing-overall__cost">
            <span className="landing-overall__cost-label">Costing you the most</span>
            <span>
              <b>STAR Framework Usage&nbsp;&middot;&nbsp;&minus;6&nbsp;pts.</b> Its weight and gap drag
              the overall score down more than any other category.
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}
