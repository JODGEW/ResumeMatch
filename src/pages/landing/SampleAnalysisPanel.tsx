import { ChevronRightIcon, CircleCheckIcon, CircleXIcon, DownloadIcon, MicIcon } from './icons';
import { KeywordPill } from './KeywordPill';
import { MATCHED_KEYWORDS, MISSING_KEYWORDS } from './keywordData';

const BREAKDOWN = [
  { label: 'Technical Skills', score: 67, tone: 'brand' },
  { label: 'Tools', score: 35, tone: 'danger' },
  { label: 'Soft Skills', score: 60, tone: 'brand' },
  { label: 'Experience', score: 25, tone: 'danger' },
] as const;

export function SampleAnalysisPanel() {
  return (
    <div className="landing-panel">
      <div className="landing-panel__head">
        <div>
          <h2 className="landing-panel__title">Full-Stack Software Development Engineer @ Bramble Commerce</h2>
          <div className="landing-panel__file">casey_morgan_resume.pdf</div>
        </div>
        <span className="landing-btn landing-btn--primary landing-btn--sm">
          <span className="landing-btn__plus">+</span>New analysis
        </span>
      </div>

      <div className="landing-panel__actions">
        <div className="landing-btn-row">
          <span className="landing-btn landing-btn--primary landing-btn--sm">
            <MicIcon />
            Start Interview
          </span>
          <span className="landing-btn landing-btn--ghost landing-btn--sm">
            <DownloadIcon />
            View Resume
          </span>
          <span className="landing-btn landing-btn--ghost landing-btn--sm">Add to Tracker</span>
        </div>
        <div className="landing-panel__lastlink">
          <span>View last interview</span>
        </div>
      </div>

      <div className="landing-panel__jd">
        <ChevronRightIcon />
        Job Description
      </div>

      <div className="landing-callout">
        <span className="landing-callout__icon">i</span>
        <div className="landing-callout__body">
          <div className="landing-callout__title">
            Candidate has 1.5 years of experience, which is below the required minimum of 2.0 years.
          </div>
          <div className="landing-callout__advice">
            Consider highlighting relevant experience more clearly or targeting roles aligned with current experience
            level.
          </div>
          <div className="landing-callout__meta">
            Required: 2+ years · Explicitly stated on resume: 1.6 · Calculated from dates: 1.5 years
          </div>
        </div>
      </div>

      <div className="landing-scorecard">
        <div className="landing-scorecard__ring">
          <svg width="140" height="140" viewBox="0 0 140 140">
            <circle cx="70" cy="70" r="60" fill="none" className="lp-stroke-track" strokeWidth="10" />
            <circle
              cx="70"
              cy="70"
              r="60"
              fill="none"
              className="lp-stroke-warn"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray="229.9 147.1"
              transform="rotate(-90 70 70)"
            />
            <text x="70" y="68" textAnchor="middle" className="landing-ring-value">
              61%
            </text>
            <text x="70" y="88" textAnchor="middle" className="landing-ring-label">
              Moderate Match
            </text>
          </svg>
        </div>
        <div className="landing-scorecard__detail">
          <div className="landing-scorecard__heading">Score Breakdown</div>
          <p className="landing-scorecard__summary">
            Candidate has strong full-stack fundamentals in TypeScript, React, and Node.js with serverless and
            microservices experience, but lacks critical AWS-specific skills (Lambda, DynamoDB, API Gateway) and
            testing tools (Jest, Cypress) required for this role, plus only 1.5 years of experience versus the 2+ year
            requirement.
          </p>
          <div className="landing-scorecard__matched">Matched 20 of 33 required keywords</div>
          <div className="landing-breakdown">
            {BREAKDOWN.map((row) => (
              <div key={row.label}>
                <div className="landing-breakdown__labels">
                  <span className="landing-breakdown__name">{row.label}</span>
                  <span className="landing-breakdown__score">{row.score}/100</span>
                </div>
                <div className="landing-bar">
                  <div
                    className={`landing-bar__fill landing-bar__fill--${row.tone}`}
                    style={{ width: `${row.score}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="landing-keywords">
        <div className="landing-kwcard">
          <div className="landing-card-head">
            <CircleCheckIcon />
            <span className="landing-card-head__title">Matched Keywords</span>
            <span className="landing-count landing-count--success">20</span>
          </div>
          <div className="landing-pill-row">
            {MATCHED_KEYWORDS.map((keyword) => (
              <KeywordPill key={keyword} tone="success">
                {keyword}
              </KeywordPill>
            ))}
          </div>
        </div>
        <div className="landing-kwcard landing-kwcard--missing">
          <div className="landing-card-head">
            <CircleXIcon />
            <span className="landing-card-head__title">Missing Keywords</span>
            <span className="landing-count landing-count--danger">13</span>
          </div>
          <div className="landing-pill-row">
            {MISSING_KEYWORDS.map((keyword) => (
              <KeywordPill key={keyword} tone="danger">
                {keyword}
              </KeywordPill>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
