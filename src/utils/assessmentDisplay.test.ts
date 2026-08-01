import { describe, expect, it } from 'vitest';
import { getAssessmentDisplayState } from './assessmentDisplay';

describe('getAssessmentDisplayState', () => {
  it('treats upgradeRequired: true with redacted categories as a paywall, not an incomplete assessment', () => {
    expect(
      getAssessmentDisplayState({ upgradeRequired: true, categories: [] }),
    ).toBe('paywalled');
  });

  it('lets the paywall take precedence even if the backend sends categories alongside upgradeRequired', () => {
    expect(
      getAssessmentDisplayState({ upgradeRequired: true, categories: [{}, {}] }),
    ).toBe('paywalled');
  });

  it('reports a genuine no-category-scores state when nothing was redacted', () => {
    expect(getAssessmentDisplayState({ categories: [] })).toBe('no-category-scores');
    expect(
      getAssessmentDisplayState({ upgradeRequired: false, categories: [] }),
    ).toBe('no-category-scores');
  });

  it('reports complete when category scores are present and no paywall applies', () => {
    expect(getAssessmentDisplayState({ categories: [{}] })).toBe('complete');
    expect(
      getAssessmentDisplayState({ upgradeRequired: false, categories: [{}, {}, {}] }),
    ).toBe('complete');
  });
});
