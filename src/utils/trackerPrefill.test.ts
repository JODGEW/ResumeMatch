import { describe, it, expect } from 'vitest';
import { pickTrackerPrefill } from './trackerPrefill';

const valid = {
  companyName: 'Example Corp',
  roleTitle: 'Frontend Engineer',
  skillMatch: {
    matchedSkills: ['React', 'TypeScript'],
    missingSkills: ['GraphQL'],
    matchPercentage: 67,
  },
};

describe('pickTrackerPrefill', () => {
  it('keeps valid input unchanged', () => {
    expect(pickTrackerPrefill(valid)).toEqual(valid);
  });

  it('drops fields getTrackerPrefill never produces', () => {
    const input = {
      ...valid,
      jobPostingUrl: 'javascript:alert(1)',
      contact: { name: 'Pat Example', linkedinUrl: 'javascript:alert(1)' },
      notes: 'injected',
      skillMatch: { ...valid.skillMatch, extra: 'x' },
    };
    expect(pickTrackerPrefill(input)).toEqual(valid);
  });

  it('drops fields with the wrong type', () => {
    expect(pickTrackerPrefill({
      companyName: 42,
      roleTitle: { text: 'x' },
      skillMatch: {
        matchedSkills: ['React', 7, null, 'CSS'],
        missingSkills: 'GraphQL',
        matchPercentage: Infinity,
      },
    })).toEqual({
      skillMatch: { matchedSkills: ['React', 'CSS'], missingSkills: [], matchPercentage: 0 },
    });
    expect(pickTrackerPrefill({ ...valid, skillMatch: ['React'] })).toEqual({
      companyName: valid.companyName,
      roleTitle: valid.roleTitle,
    });
    expect(pickTrackerPrefill({ skillMatch: { ...valid.skillMatch, matchPercentage: '67' } }).skillMatch?.matchPercentage).toBe(0);
    expect(pickTrackerPrefill({ skillMatch: { ...valid.skillMatch, matchPercentage: NaN } }).skillMatch?.matchPercentage).toBe(0);
  });

  it('completes a skillMatch that has only some valid sub-fields', () => {
    expect(pickTrackerPrefill({ skillMatch: { matchedSkills: ['React'] } })).toEqual({
      skillMatch: { matchedSkills: ['React'], missingSkills: [], matchPercentage: 0 },
    });
  });

  it('completes an empty skillMatch object', () => {
    expect(pickTrackerPrefill({ skillMatch: {} })).toEqual({
      skillMatch: { matchedSkills: [], missingSkills: [], matchPercentage: 0 },
    });
  });

  it('returns an empty object for non-object input', () => {
    expect(pickTrackerPrefill(null)).toEqual({});
    expect(pickTrackerPrefill([valid])).toEqual({});
    expect(pickTrackerPrefill('{"companyName":"Example Corp"}')).toEqual({});
  });
});
