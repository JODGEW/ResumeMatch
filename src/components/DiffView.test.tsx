import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DiffChangesSummary, DiffView } from './DiffView';
import { countSafeEdits } from '../utils/resumeDiff';

const ORIGINAL = 'Built REST APIs in Node.\nLed a team of four engineers.\nWrote unit tests.';
const SUGGESTED = 'Built REST APIs in Node.js and Express.\nLed a team of five engineers.\nWrote unit and integration tests.';

function ids(html: string, prefix: string) {
  return [...html.matchAll(new RegExp(`id="(${prefix}-\\d+)"`, 'g'))].map((m) => m[1]);
}

function hrefs(html: string) {
  return [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
}

describe('DiffChangesSummary', () => {
  it('lists one link per counted insertion, matching countSafeEdits', () => {
    const summary = renderToStaticMarkup(<DiffChangesSummary original={ORIGINAL} suggested={SUGGESTED} />);
    const added = hrefs(summary).filter((h) => h.startsWith('diff-add-'));
    expect(added.length).toBe(countSafeEdits(ORIGINAL, SUGGESTED));
    expect(added.length).toBeGreaterThan(0);
  });

  it('links every run to a mark or del rendered by DiffView, in document order', () => {
    const summary = renderToStaticMarkup(<DiffChangesSummary original={ORIGINAL} suggested={SUGGESTED} />);
    const diff = renderToStaticMarkup(<DiffView original={ORIGINAL} suggested={SUGGESTED} />);
    const targets = [...diff.matchAll(/id="(diff-(?:add|del)-\d+)"/g)].map((m) => m[1]);
    expect(hrefs(summary)).toEqual(targets);
    expect(ids(diff, 'diff-add')).toEqual(ids(diff, 'diff-add').map((_, i) => `diff-add-${i + 1}`));
    expect(ids(diff, 'diff-del')).toEqual(ids(diff, 'diff-del').map((_, i) => `diff-del-${i + 1}`));
  });

  it('puts the add ids on mark elements and the del ids on del elements', () => {
    const diff = renderToStaticMarkup(<DiffView original={ORIGINAL} suggested={SUGGESTED} />);
    expect(diff).toMatch(/<mark id="diff-add-1"/);
    expect(diff).toMatch(/<del id="diff-del-1"/);
  });

  it('renders nothing when the texts are identical', () => {
    expect(renderToStaticMarkup(<DiffChangesSummary original={ORIGINAL} suggested={ORIGINAL} />)).toBe('');
  });
});
