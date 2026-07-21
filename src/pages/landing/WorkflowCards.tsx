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

const SCORE_TILES = [
  { value: '78%', tone: 'tint', label: 'Communication Structure', weight: '(20%)' },
  { value: '75%', tone: 'tint', label: 'STAR Framework Usage', weight: '(25%)' },
  { value: '80%', tone: 'success', label: 'Specificity & Metrics', weight: '(25%)' },
  { value: '74%', tone: 'tint', label: 'Role Relevance', weight: '(20%)' },
  { value: '82%', tone: 'success', label: 'Self-Awareness', weight: '(10%)' },
] as const;

export function SuggestionsCard() {
  return (
    <article className="landing-work-card">
      <div className="landing-work-card__embed">
        <div className="landing-embed-title">Suggestions</div>
        <div className="landing-embed-subtitle">Recommended additions to improve your match score</div>
        <div className="landing-suggestions">
          {SUGGESTIONS.map((item) => (
            <div key={item.tag} className="landing-suggestion">
              <span className="landing-suggestion__tag">
                <TagLinesIcon />
                {item.tag}
              </span>
              <div className="landing-suggestion__text">{item.text}</div>
              <div className="landing-suggestion__reason">{item.reason}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="landing-work-card__caption">
        <h3>Targeted resume edits</h3>
        <p>Move from scoring into concrete suggestions that strengthen the resume for that job description.</p>
      </div>
    </article>
  );
}

export function InterviewCard() {
  return (
    <article className="landing-work-card">
      <div className="landing-work-card__embed">
        <div className="landing-session__head">
          <div className="landing-session__role">Full-Stack Software Development Engineer — Bramble Commerce</div>
          <span className="landing-session__match">61% Match</span>
        </div>
        <div className="landing-session__meta">
          <div>
            <div className="landing-session__file">casey_morgan_resume.pdf</div>
            <div className="landing-session__stamp">Jul 12, 2026 · 6:12 PM · Behavioral · 10 questions</div>
          </div>
          <div className="landing-chip-row">
            <span className="landing-chip-btn landing-chip-btn--primary">Interview Again</span>
            <span className="landing-chip-btn">Interview Report</span>
            <span className="landing-chip-btn">Copy Transcript</span>
          </div>
        </div>
        <div className="landing-session__context">
          <div className="landing-session__context-title">Analysis &amp; Context</div>
          <div className="landing-chip-row">
            <span className="landing-chip-btn">View Full Analysis ↗</span>
            <span className="landing-chip-btn">Job Description ▾</span>
          </div>
        </div>
        <div className="landing-tabs">
          <span className="landing-tab landing-tab--active">Assessment</span>
          <span className="landing-tab">Transcript</span>
        </div>
        <div className="landing-session__section">Assessment</div>
        <div className="landing-session__ai">
          ✦ AI-generated assessment <span className="landing-session__ai-link">Show details</span>
        </div>
        <div className="landing-overall">
          <div className="landing-overall__title">Overall Score</div>
          <div className="landing-overall__row">
            <svg width="56" height="56" viewBox="0 0 64 64">
              <circle cx="32" cy="32" r="26" fill="none" className="lp-stroke-track" strokeWidth="5" />
              <circle
                cx="32"
                cy="32"
                r="26"
                fill="none"
                className="lp-stroke-brand"
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray="125.8 37.6"
                transform="rotate(-90 32 32)"
              />
              <text x="32" y="37" textAnchor="middle" className="landing-overall__ring-value">
                77%
              </text>
            </svg>
            <span className="landing-overall__grade">Good</span>
          </div>
          <div className="landing-overall__note">77% overall across 5 categories</div>
        </div>
        <div className="landing-tiles">
          {SCORE_TILES.map((tile) => (
            <div key={tile.label} className="landing-tile">
              <div className={`landing-tile__value landing-tile__value--${tile.tone}`}>{tile.value}</div>
              <div className="landing-tile__label">{tile.label}</div>
              <div className="landing-tile__weight">{tile.weight}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="landing-work-card__caption">
        <h3>Role-based mock interview</h3>
        <p>Carry the same role into interview practice and review how the answers hold up.</p>
      </div>
    </article>
  );
}
