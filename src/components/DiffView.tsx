import { useMemo } from 'react';
import type { Change } from 'diff';
import { diffResumeParts } from '../utils/resumeDiff';
import './DiffView.css';

interface Props {
  original: string;
  suggested: string;
}

type Run = { part: Change; id: string | null };

/**
 * Numbers the diff runs the Changes summary links to. An inserted run counts
 * only when it is non-whitespace — the same rule countSafeEdits uses — so the
 * summary can never list a different number of insertions than the caption.
 * Removed runs follow the same rule. DiffView and DiffChangesSummary both read
 * ids from here, so every link has its mark.
 */
function numberRuns(parts: Change[]): Run[] {
  let added = 0;
  let removed = 0;
  return parts.map((part) => {
    const counted = (part.added || part.removed) && part.value.trim().length > 0;
    if (!counted) return { part, id: null };
    return { part, id: part.added ? `diff-add-${++added}` : `diff-del-${++removed}` };
  });
}

function useRuns(original: string, suggested: string) {
  return useMemo(() => numberRuns(diffResumeParts(original, suggested)), [original, suggested]);
}

/** Every counted inserted and removed run, in document order, each linking to its mark. */
export function DiffChangesSummary({ original, suggested }: Props) {
  const runs = useRuns(original, suggested).filter((run) => run.id);
  if (runs.length === 0) return null;

  return (
    <div className="diff-changes">
      <span className="diff-changes__label">Changes</span>
      <ul className="diff-changes__list">
        {runs.map(({ part, id }) => {
          const text = part.value.trim();
          return (
            <li key={id}>
              <a
                href={`#${id}`}
                className={`diff-changes__link diff-changes__link--${part.added ? 'added' : 'removed'}`}
                aria-label={`${part.added ? 'Added' : 'Removed'}: ${text}`}
                title={text}
              >
                {text}
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function DiffView({ original, suggested }: Props) {
  const runs = useRuns(original, suggested);

  return (
    <div className="diff-view card">
      <div className="diff-view__header">
        <h3>Resume Diff</h3>
        <div className="diff-view__legend">
          <span className="diff-view__legend-item diff-view__legend-item--original">
            Original
          </span>
          <span className="diff-view__legend-item diff-view__legend-item--added">
            Suggested additions
          </span>
          <span className="diff-view__legend-item diff-view__legend-item--removed">
            Removed
          </span>
        </div>
      </div>

      <div className="diff-view__body">
        <pre className="diff-view__content">
          {runs.map(({ part, id }, i) => {
            if (part.added) {
              return (
                <mark key={i} id={id ?? undefined} className="diff-view__added">
                  {part.value}
                </mark>
              );
            }
            if (part.removed) {
              return (
                <del key={i} id={id ?? undefined} className="diff-view__removed">
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
