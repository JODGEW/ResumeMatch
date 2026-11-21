import { CircleCheckIcon, CircleXIcon, LockIcon, MicIcon, TabHistoryIcon, TabInterviewsIcon, TabTrackerIcon, TabUploadIcon } from './icons';
import { LogoMark } from '../../components/LogoMark';
import { KeywordPill } from './KeywordPill';
import { MATCHED_KEYWORDS, MISSING_KEYWORDS } from './keywordData';

/* Mirrors Analysis Detail (Results.tsx) inside the app shell from Layout.tsx.
   Hand-built at thumbnail scale, so it does not update itself — see the mock
   table in CLAUDE.md before changing either page.

   Deliberately left out: the back link, the collapsed Job Description row, and
   the "On this page" rail. The rail only repeats counts already on screen and
   links to sections the preview never shows, so at thumbnail scale it would
   need invented numbers and would squeeze the score card. The mock shows the
   single-column layout Results renders at 1024px and below. */

// Colours follow utils/scoreBands.ts, as getScoreColor() does on the real
// bars: 67 is mid (61-75), 60 is low (41-60), 35 and 25 are poor (<=40).
const BREAKDOWN = [
  { label: 'Technical Skills', score: 67, tier: 'mid' },
  { label: 'Tools', score: 35, tier: 'poor' },
  { label: 'Soft Skills', score: 60, tier: 'low' },
  { label: 'Experience', score: 25, tier: 'poor' },
] as const;

/* Dashboard is deliberately absent: it is owner-only in Layout.tsx. */
const TABS = [
  { label: 'Upload', icon: <TabUploadIcon /> },
  { label: 'History', icon: <TabHistoryIcon />, active: true },
  { label: 'Interviews', icon: <TabInterviewsIcon /> },
  { label: 'Tracker', icon: <TabTrackerIcon /> },
];

export function ProductPreview() {
  return (
    <div className="landing-preview" aria-label="Product preview: analysis results" role="img">
      <div className="landing-preview__chrome">
        <div className="landing-preview__dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="landing-preview__url">
          <LockIcon />
          resumematchapp.com/results/a3f91c
        </div>
        <div className="landing-preview__chrome-pad" aria-hidden="true" />
      </div>

      <div className="landing-preview__shell">
        <span className="landing-preview__brand">
          <LogoMark />
          ResumeMatch
        </span>
        <div className="landing-preview__tabs">
          {TABS.map((tab) => (
            <span
              key={tab.label}
              className={`landing-preview__tab${tab.active ? ' is-active' : ''}`}
            >
              {tab.icon}
              {tab.label}
            </span>
          ))}
        </div>
        <span className="landing-preview__user">casey.morgan@example.com</span>
      </div>

      <div className="landing-preview__body">
        <div className="landing-preview__head">
          <div className="landing-preview__head-top">
            <div>
              <div className="landing-preview__role">
                Full-Stack Software Development Engineer @ Bramble Commerce
              </div>
              <div className="landing-preview__meta">
                <span className="landing-preview__file">casey_morgan_resume.pdf</span>
                <span className="landing-preview__sep">·</span>
                <span className="landing-preview__analyzed">Analyzed Jul 12, 2026</span>
              </div>
            </div>
            <span className="landing-btn landing-btn--primary landing-btn--sm landing-preview__new">
              <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
              </svg>
              New analysis
            </span>
          </div>
          <div className="landing-preview__actions">
            <span className="landing-btn landing-btn--primary landing-btn--sm">
              <MicIcon />
              Start Interview
            </span>
            <span className="landing-btn landing-btn--secondary landing-btn--sm">
              <svg width="11" height="11" viewBox="0 0 14 14" aria-hidden="true">
                <path d="M2 10v2h10v-2M7 2v7M4 6l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </svg>
              View Resume
            </span>
            <span className="landing-btn landing-btn--outline landing-btn--sm">Add to Tracker</span>
          </div>
        </div>

        <div className="landing-scorecard">
          <div className="landing-scorecard__ring">
            <svg width="128" height="128" viewBox="0 0 140 140">
              <circle cx="70" cy="70" r="60" fill="none" className="lp-stroke-track" strokeWidth="10" />
              <circle
                cx="70"
                cy="70"
                r="60"
                fill="none"
                className="lp-stroke-score-mid"
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray="229.9 147.1"
                transform="rotate(-90 70 70)"
              />
              <text x="70" y="70" textAnchor="middle" className="landing-ring-value">
                61<tspan className="landing-ring-percent">%</tspan>
              </text>
              <text x="70" y="90" textAnchor="middle" className="landing-ring-label">
                Moderate Match
              </text>
            </svg>
          </div>
          <div className="landing-scorecard__detail">
            <div className="landing-scorecard__heading">Score Breakdown</div>
            <p className="landing-scorecard__summary">
              Strong full-stack fundamentals in TypeScript, React, and Node.js, but missing the
              AWS-specific stack (Lambda, DynamoDB, API Gateway) and testing tools (Jest, Cypress)
              this role requires.
            </p>
            <div className="landing-scorecard__matched">Matched 20 of 33 required keywords</div>
            <div className="landing-breakdown">
              {BREAKDOWN.map((row) => (
                <div key={row.label}>
                  <div className="landing-breakdown__labels">
                    <span className="landing-breakdown__name">{row.label}</span>
                    <span className="landing-breakdown__score" style={{ color: `var(--score-${row.tier})` }}>
                      {row.score}
                      <span className="landing-breakdown__denom">/100</span>
                    </span>
                  </div>
                  <div className="landing-bar">
                    <div
                      className="landing-bar__fill"
                      style={{ width: `${row.score}%`, background: `var(--score-${row.tier})` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* SCORE_ACTIONS.mid in Results.tsx: 61 is the Moderate band. */}
          <div className="landing-scorecard__advice">
            <span className="landing-scorecard__advice-label">What to do</span>
            <p className="landing-scorecard__advice-action">
              Tailor your resume before applying. Focus on the highest-priority missing keywords.
            </p>
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
            <p className="landing-kwcard__note">
              These are real gaps, not phrasing differences — see the priorities and suggestions
              below to close them.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
