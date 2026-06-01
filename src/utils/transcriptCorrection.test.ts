import { describe, it, expect, beforeEach, vi } from 'vitest';
import { correctTranscript, applyNonsenseAliases, type TranscriptWord } from './transcriptCorrection';

// Keep test output clean — the module logs every correction via console.info.
beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

const w = (word: string, confidence: number): TranscriptWord => ({ word, confidence });
const words = (...pairs: Array<[string, number]>): TranscriptWord[] =>
  pairs.map(([word, c]) => w(word, c));

describe('correctTranscript — the invariant: never corrupt a real word', () => {
  it('leaves a clearly-said common word at normal confidence untouched ("of course")', () => {
    // High confidence fails the < 0.60 gate, so nothing is eligible.
    const out = correctTranscript(words(['of', 0.99], ['course', 0.95]), ['CORS', 'Coursera']);
    expect(out).toBe('of course');
  });

  it('"of course" never becomes "of CORS" — CORS is <6 chars so it is never a target', () => {
    const out = correctTranscript(words(['of', 0.3], ['course', 0.3]), ['CORS']);
    expect(out).toBe('of course');
  });

  it('short canonical targets (REST/S3/AI) are inert via the >=6 length floor', () => {
    const out = correctTranscript(words(['rest', 0.2]), ['REST', 'S3', 'AI']);
    expect(out).toBe('rest');
  });

  it('does not touch a correctly-said technical term', () => {
    const out = correctTranscript(words(['kubernetes', 0.95]), []);
    expect(out).toBe('kubernetes');
  });
});

describe('correctTranscript — real-interview false positives that must now be no-ops', () => {
  it('"at" (0.238) is not rewritten to OAuth (OAuth excluded by the >=6 floor)', () => {
    const out = correctTranscript(words(['at', 0.238]), ['OAuth']);
    expect(out).toBe('at');
  });

  it('"It" (0.081) is not rewritten to OAuth — meaning must be preserved', () => {
    const out = correctTranscript(
      words(['It', 0.081], ["is", 0.9], ['a', 0.9], ['product', 0.9]),
      ['OAuth'],
    );
    expect(out).toBe('It is a product');
  });

  it('"reaches to" (0.525) is not rewritten to ReAct (ReAct excluded by the >=6 floor)', () => {
    const out = correctTranscript(words(['reaches', 0.525], ['to', 0.525]), ['ReAct']);
    expect(out).toBe('reaches to');
  });

  it('metaphone equality alone no longer triggers ("coober netties" stays, JW 0.81 < 0.90)', () => {
    // Kubernetes is a 6+ char target, but JW is the sole trigger now and the
    // mis-hearing only scores 0.805, so nothing fires.
    const out = correctTranscript(words(['coober', 0.3], ['netties', 0.3]), []);
    expect(out).toBe('coober netties');
  });
});

describe('correctTranscript — common-word guard (no confidence override)', () => {
  it('blocks a single common word at moderate confidence (0.50)', () => {
    const out = correctTranscript(words(['course', 0.5]), ['Coursera']);
    expect(out).toBe('course');
  });

  it('still blocks a single common word at very low confidence (the <0.40 override is gone)', () => {
    const out = correctTranscript(words(['course', 0.1]), ['Coursera']);
    expect(out).toBe('course');
  });
});

describe('correctTranscript — Layer 1 still recovers genuine garbles', () => {
  it('recovers the correct catch "resume chart" (~0.205) -> "ResumeMatch" (JW 0.924)', () => {
    const out = correctTranscript(words(['resume', 0.205], ['chart', 0.205]), ['ResumeMatch']);
    expect(out).toBe('ResumeMatch');
  });

  it('recovers a multi-token term from the universal supplement ("post gres")', () => {
    const out = correctTranscript(words(['post', 0.35], ['gres', 0.35]), []);
    expect(out).toBe('PostgreSQL');
  });

  it('honors session keyterms passed in as canonical targets ("data brix" -> Databricks)', () => {
    const out = correctTranscript(words(['data', 0.3], ['brix', 0.3]), ['Databricks']);
    expect(out).toBe('Databricks');
  });

  it('logs each correction with the auditing fields (via jaro-winkler)', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    correctTranscript(words(['post', 0.35], ['gres', 0.35]), []);
    expect(spy).toHaveBeenCalledWith(
      '[transcriptCorrection] layer1 replace',
      expect.objectContaining({ matched: 'PostgreSQL', via: 'jaro-winkler', layer: 1 }),
    );
  });
});

describe('correctTranscript — Layer 2 nonsense aliases', () => {
  it('rewrites "wrestle match" mid-sentence at normal confidence', () => {
    const out = correctTranscript(
      words(['we', 0.95], ['built', 0.95], ['wrestle', 0.95], ['match', 0.95], ['for', 0.95], ['resumes', 0.95]),
      [],
    );
    expect(out).toBe('we built ResumeMatch for resumes');
  });
});

describe('applyNonsenseAliases — streaming-fallback path (no per-word confidence)', () => {
  it.each([
    ['WrestleMania', 'ResumeMatch'],
    ['wrestle mania', 'ResumeMatch'],
    ['wrestle match', 'ResumeMatch'],
    ['Wrestle  Match', 'ResumeMatch'],
  ])('maps %s -> %s', (input, expected) => {
    expect(applyNonsenseAliases(input)).toBe(expected);
  });

  it('is idempotent on already-corrected text', () => {
    expect(applyNonsenseAliases('ResumeMatch')).toBe('ResumeMatch');
  });

  it('leaves unrelated text alone', () => {
    expect(applyNonsenseAliases('I deployed to Kubernetes today.')).toBe('I deployed to Kubernetes today.');
  });
});

describe('correctTranscript — robustness with absent data', () => {
  it('returns empty string for no words without throwing', () => {
    expect(correctTranscript([], ['Kubernetes'])).toBe('');
  });

  it('does not throw when confidences are missing/zero', () => {
    expect(() => correctTranscript(words(['hello', 0], ['world', 0]), [])).not.toThrow();
  });
});
