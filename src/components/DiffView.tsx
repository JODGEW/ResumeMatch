import { useMemo } from 'react';
import { diffWords } from 'diff';
import './DiffView.css';

interface Props {
  original: string;
  suggested: string;
}

export function DiffView({ original, suggested }: Props) {
  const parts = useMemo(() => diffWords(original, suggested), [original, suggested]);

  return (
    <div className="diff-view card">
      <div className="diff-view__header">
        <h3>Resume Diff</h3>
        <div className="diff-view__legend">
          <span className="diff-view__legend-item diff-view__legend-item--original">
            Original text
          </span>
          <span className="diff-view__legend-item diff-view__legend-item--added">
            Suggested additions
          </span>
          <span className="diff-view__legend-item diff-view__legend-item--removed">
            Removed text
          </span>
        </div>
      </div>

      <div className="diff-view__body">
        <pre className="diff-view__content">
          {parts.map((part, i) => {
            if (part.added) {
              return (
                <mark key={i} className="diff-view__added">
                  {part.value}
                </mark>
              );
            }
            if (part.removed) {
              return (
                <del key={i} className="diff-view__removed">
                  {part.value}
                </del>
              );
            }
            return <span key={i}>{part.value}</span>;
          })}
        </pre>
      </div>
    </div>
  );
}
