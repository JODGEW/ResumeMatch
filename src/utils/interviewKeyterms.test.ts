import { describe, expect, it } from 'vitest';
import { splitKeyterms } from './interviewKeyterms';

// Employer names measured in eval/stt-bench: every real garble of these scored
// JW 0.63-0.84 against the true name, below transcriptCorrection's 0.90 gate.
// They must reach the Deepgram prompt and must NOT reach correction targets.
const KEYTERMS = ['Vexley Learning', 'SaaS Peak', 'PostgreSQL', 'Docker', 'AWS'];
const EMPLOYERS = ['Vexley Learning', 'SaaS Peak'];

describe('splitKeyterms — employer terms prompt-only', () => {
  it('sends every keyterm to the Deepgram prompt, employers included', () => {
    const { promptTerms } = splitKeyterms(KEYTERMS, EMPLOYERS);
    expect(promptTerms).toEqual(KEYTERMS);
    expect(promptTerms).toContain('Vexley Learning');
    expect(promptTerms).toContain('SaaS Peak');
  });

  it('excludes employers from correction targets, keeping every other term', () => {
    const { correctionTargets } = splitKeyterms(KEYTERMS, EMPLOYERS);
    expect(correctionTargets).toEqual(['PostgreSQL', 'Docker', 'AWS']);
    expect(correctionTargets).not.toContain('Vexley Learning');
    expect(correctionTargets).not.toContain('SaaS Peak');
  });

  it('matches employers case-insensitively (backend casing may differ)', () => {
    const { correctionTargets } = splitKeyterms(['SaaS Peak', 'Docker'], ['saas peak']);
    expect(correctionTargets).toEqual(['Docker']);
  });
});

describe('splitKeyterms — backward compatibility with a pre-Pass-0 backend', () => {
  it('undefined employerKeyterms leaves correction targets identical to keyterms', () => {
    const { promptTerms, correctionTargets } = splitKeyterms(KEYTERMS, undefined);
    expect(promptTerms).toEqual(KEYTERMS);
    expect(correctionTargets).toEqual(KEYTERMS);
  });

  it('empty employerKeyterms is also a no-op', () => {
    const { correctionTargets } = splitKeyterms(KEYTERMS, []);
    expect(correctionTargets).toEqual(KEYTERMS);
  });

  it('undefined keyterms yields empty arrays without throwing', () => {
    expect(splitKeyterms(undefined, undefined)).toEqual({ promptTerms: [], correctionTargets: [] });
    expect(splitKeyterms(undefined, EMPLOYERS)).toEqual({ promptTerms: [], correctionTargets: [] });
  });

  it('an employer not present in keyterms removes nothing', () => {
    const { correctionTargets } = splitKeyterms(['Docker'], ['Vexley Learning']);
    expect(correctionTargets).toEqual(['Docker']);
  });
});
