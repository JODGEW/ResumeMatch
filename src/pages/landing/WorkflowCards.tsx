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

// Mirrors InterviewResults: scoreColor() is >=80 high, >=60 good, else mid,
// and each tile is labelled "weight N%".
const SCORE_TILES = [
  { value: '78%', tone: 'good', label: 'Communication Structure', weight: 'weight 20%' },
  { value: '75%', tone: 'good', label: 'STAR Framework Usage', weight: 'weight 25%' },
  { value: '80%', tone: 'high', label: 'Specificity & Metrics', weight: 'weight 25%' },
  { value: '74%', tone: 'good', label: 'Role Relevance', weight: 'weight 20%' },
  { value: '82%', tone: 'high', label: 'Self-Awareness', weight: 'weight 10%' },
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
          <div className="landing-session__meta-line">
            <span className="landing-session__file">casey_morgan_resume.pdf</span>
            <span className="landing-session__dot">·</span>
            <span className="landing-session__stamp">Jul 12, 2026 · 6:12 PM</span>
            <span className="landing-session__dot">·</span>
            <span className="landing-session__type">Behavioral</span>
            <span className="landing-session__stamp">10 questions</span>
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
          </div>
        </div>
        <div className="landing-session__context">
          <div className="landing-session__context-title">Analysis &amp; Context</div>
          <div className="landing-chip-row">
            <span className="landing-chip-btn">
              <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M4 2h6l3 3v9H4V2Z" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinejoin="round" />
                <path d="M10 2v3h3" stroke="currentColor" strokeWidth="1.3" fill="none" />
              </svg>
              View full analysis
              <svg width="9" height="9" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M5 11L11 5M6 5h5v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </svg>
            </span>
            <span className="landing-chip-btn">
              Job description
              <svg width="9" height="9" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </svg>
            </span>
          </div>
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
                className="lp-stroke-score-good"
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray="125.8 37.6"
                transform="rotate(-90 32 32)"
              />
              <text x="32" y="37" textAnchor="middle" className="landing-overall__ring-value">
                77%
              </text>
            </svg>
            <div>
              <div className="landing-overall__grade">Good</div>
              <div className="landing-overall__note">77% overall across 5 scoring categories</div>
            </div>
          </div>
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
