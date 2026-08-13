import { describe, it, expect } from 'vitest';
import { aggregateKeywords, MIN_RECURRENCE, MIN_UNIQUE_JDS } from './keywordAggregation';
import type { Analysis } from '../types';

function mk(overrides: Partial<Analysis> & { analysisId: string }): Analysis {
  return {
    status: 'completed',
    createdAt: '2026-08-01T00:00:00Z',
    fileName: 'resume.pdf',
    userId: 'u',
    ...overrides,
  } as Analysis;
}

describe('aggregateKeywords', () => {
  it('counts a keyword missing across distinct JDs', () => {
    const result = aggregateKeywords([
      mk({ analysisId: 'a', jobDescription: 'jd one', missingKeywords: ['Terraform'], presentKeywords: ['React'] }),
      mk({ analysisId: 'b', jobDescription: 'jd two', missingKeywords: ['Terraform'], presentKeywords: [] }),
      mk({ analysisId: 'c', jobDescription: 'jd three', missingKeywords: [], presentKeywords: ['Terraform'] }),
    ]);
    expect(result.jdCount).toBe(3);
    expect(result.gaps).toEqual([{ keyword: 'Terraform', missingIn: 2, demandedIn: 3 }]);
  });

  it('drops keywords below the recurrence threshold', () => {
    const result = aggregateKeywords([
      mk({ analysisId: 'a', jobDescription: 'jd one', missingKeywords: ['Kafka'] }),
      mk({ analysisId: 'b', jobDescription: 'jd two', missingKeywords: ['Redis'] }),
    ]);
    expect(MIN_RECURRENCE).toBe(2);
    expect(result.gaps).toEqual([]);
  });

  it('dedups repeat analyses of the same JD, newest (first-seen) wins', () => {
    const jd = 'Senior engineer role at Acme.  Requires Go.';
    const result = aggregateKeywords([
      // Same JD text modulo whitespace/case — one demand, taken from the first row.
      mk({ analysisId: 'new', jobDescription: jd, missingKeywords: ['Go'] }),
      mk({ analysisId: 'old', jobDescription: jd.toUpperCase().replace('  ', ' '), missingKeywords: ['Go', 'Rust'] }),
      mk({ analysisId: 'other', jobDescription: 'different jd', missingKeywords: ['Go'] }),
    ]);
    expect(result.jdCount).toBe(2);
    expect(result.gaps).toEqual([{ keyword: 'Go', missingIn: 2, demandedIn: 2 }]);
  });

  it('falls back to jobTitle for dedup when jobDescription is absent', () => {
    const result = aggregateKeywords([
      mk({ analysisId: 'a', jobTitle: 'SWE @ Acme', missingKeywords: ['Kafka'] }),
      mk({ analysisId: 'b', jobTitle: 'swe @ acme', missingKeywords: ['Kafka'] }),
      mk({ analysisId: 'c', jobTitle: 'SWE @ Other', missingKeywords: ['Kafka'] }),
    ]);
    expect(result.jdCount).toBe(2);
    expect(result.gaps[0]).toEqual({ keyword: 'Kafka', missingIn: 2, demandedIn: 2 });
  });

  it('merges alias variants into one keyword and picks the most common casing', () => {
    const result = aggregateKeywords([
      mk({ analysisId: 'a', jobDescription: 'jd1', missingKeywords: ['Golang'] }),
      mk({ analysisId: 'b', jobDescription: 'jd2', missingKeywords: ['Go'] }),
      mk({ analysisId: 'c', jobDescription: 'jd3', missingKeywords: ['Go'] }),
      mk({ analysisId: 'd', jobDescription: 'jd4', missingKeywords: ['Kubernetes'] }),
      mk({ analysisId: 'e', jobDescription: 'jd5', missingKeywords: ['K8s'] }),
    ]);
    const go = result.gaps.find(g => g.keyword === 'Go');
    expect(go).toEqual({ keyword: 'Go', missingIn: 3, demandedIn: 3 });
    const k8s = result.gaps.find(g => g.keyword === 'Kubernetes');
    expect(k8s).toEqual({ keyword: 'Kubernetes', missingIn: 2, demandedIn: 2 });
  });

  it('ignores non-completed analyses and rows without keyword data', () => {
    const result = aggregateKeywords([
      mk({ analysisId: 'a', status: 'processing', jobDescription: 'jd1', missingKeywords: ['Kafka'] }),
      mk({ analysisId: 'b', status: 'failed', jobDescription: 'jd2', missingKeywords: ['Kafka'] }),
      mk({ analysisId: 'c', jobDescription: 'jd3' }), // completed, no keywords
      mk({ analysisId: 'd', jobDescription: 'jd4', missingKeywords: ['Kafka'] }),
    ]);
    expect(result.jdCount).toBe(1);
    expect(result.gaps).toEqual([]);
  });

  it('present wins over missing inside one analysis, and per-JD keyword lists dedup', () => {
    const result = aggregateKeywords([
      mk({
        analysisId: 'a',
        jobDescription: 'jd1',
        missingKeywords: ['React', 'React'],
        presentKeywords: ['React'],
      }),
      mk({ analysisId: 'b', jobDescription: 'jd2', missingKeywords: ['React'] }),
      mk({ analysisId: 'c', jobDescription: 'jd3', missingKeywords: ['React'] }),
    ]);
    expect(result.gaps).toEqual([{ keyword: 'React', missingIn: 2, demandedIn: 3 }]);
  });

  it('sorts by missingIn, then demandedIn', () => {
    const rows = [
      mk({ analysisId: 'a', jobDescription: 'jd1', missingKeywords: ['Kafka', 'Redis'], presentKeywords: ['Rust'] }),
      mk({ analysisId: 'b', jobDescription: 'jd2', missingKeywords: ['Kafka', 'Redis', 'Rust'] }),
      mk({ analysisId: 'c', jobDescription: 'jd3', missingKeywords: ['Kafka', 'Rust'] }),
    ];
    const result = aggregateKeywords(rows);
    expect(result.gaps.map(g => g.keyword)).toEqual(['Kafka', 'Rust', 'Redis']);
    // Kafka: 3 missing. Rust: 2 missing / 3 demanded. Redis: 2 missing / 2 demanded.
  });

  it('empty input yields an empty aggregation', () => {
    expect(aggregateKeywords([])).toEqual({ jdCount: 0, gaps: [] });
    expect(MIN_UNIQUE_JDS).toBeGreaterThan(0);
  });
});
