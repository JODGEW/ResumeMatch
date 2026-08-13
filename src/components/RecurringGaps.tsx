import { useMemo, useState } from 'react';
import type { Analysis } from '../types';
import { aggregateKeywords, MIN_UNIQUE_JDS } from '../utils/keywordAggregation';
import './RecurringGaps.css';

const MAX_CHIPS = 12;

interface Props {
  analyses: Analysis[];
}

// Cross-JD view for History: which requirements keep showing up across the
// user's analyzed jobs while staying missing from the resume. Renders nothing
// until there are enough unique JDs for the counts to mean something.
export function RecurringGaps({ analyses }: Props) {
  const { jdCount, gaps } = useMemo(() => aggregateKeywords(analyses), [analyses]);
  const [expanded, setExpanded] = useState(false);

  if (jdCount < MIN_UNIQUE_JDS || gaps.length === 0) return null;

  const shown = expanded ? gaps : gaps.slice(0, MAX_CHIPS);
  const hidden = gaps.length - shown.length;

  return (
    <div className="card recurring-gaps animate-in">
      <div className="recurring-gaps__header">
        <h3>
          {/* Same glyph as the Results page's Missing Keywords header — this
              panel is those keywords aggregated, so it shares the icon. */}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6" stroke="var(--danger)" strokeWidth="1.5" />
            <path d="M6 6l4 4M10 6l-4 4" stroke="var(--danger)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          Recurring gaps
        </h3>
        <span className="recurring-gaps__meta">
          {jdCount} unique job descriptions
        </span>
      </div>
      <p className="recurring-gaps__intro">
        Requirements that keep appearing across the jobs you analyze and stay
        missing from your resume
      </p>
      <div className="recurring-gaps__chips">
        {shown.map(g => (
          <span
            key={g.keyword}
            className="recurring-gaps__chip"
            title={`Missing in ${g.missingIn} of ${jdCount} job descriptions (${g.demandedIn} ask for it)`}
          >
            {g.keyword}
            <span className="recurring-gaps__count">
              {g.missingIn}/{jdCount}
            </span>
          </span>
        ))}
        {(hidden > 0 || expanded) && (
          <button
            type="button"
            className="recurring-gaps__chip recurring-gaps__chip--more"
            onClick={() => setExpanded(v => !v)}
            aria-expanded={expanded}
          >
            {expanded ? 'Show less' : `+${hidden} more`}
          </button>
        )}
      </div>
    </div>
  );
}
