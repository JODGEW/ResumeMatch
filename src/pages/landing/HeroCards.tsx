import { CircleXIcon } from './icons';
import { KeywordPill } from './KeywordPill';
import { MISSING_KEYWORDS } from './keywordData';

export function HeroCards() {
  return (
    <div className="landing-hero__cards" aria-hidden="true">
      <div className="landing-float-card">
        <div className="landing-card-head">
          <CircleXIcon />
          <span className="landing-card-head__title">Missing Keywords</span>
          <span className="landing-count landing-count--danger">13</span>
        </div>
        <div className="landing-pill-row">
          {MISSING_KEYWORDS.slice(0, 7).map((keyword) => (
            <KeywordPill key={keyword} tone="danger">
              {keyword}
            </KeywordPill>
          ))}
        </div>
      </div>

      <div className="landing-float-card landing-float-card--score">
        <svg width="96" height="96" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="52" fill="none" className="lp-stroke-track" strokeWidth="9" />
          <circle
            cx="60"
            cy="60"
            r="52"
            fill="none"
            className="lp-stroke-warn"
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray="199.3 127.4"
            transform="rotate(-90 60 60)"
          />
        </svg>
        <div>
          <div className="landing-float-score__value">
            61<span>%</span>
          </div>
          <div className="landing-float-score__label">Moderate Match</div>
        </div>
      </div>
    </div>
  );
}
