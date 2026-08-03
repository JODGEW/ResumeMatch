import { describe, expect, it } from 'vitest';
import { parseJobTitle, resolveSessionIdentity } from './sessionIdentity';

// The backend splits jobTitle on " @ " only, and on the last one. These are the
// same cases pinned on the Python side by the backend repo's
// tests/test_interview_role_company.py — the two must not drift.
describe('resolveSessionIdentity — backend pair', () => {
  it('uses the backend role and company as given', () => {
    expect(resolveSessionIdentity({
      roleName: 'Software Engineer, Applied AI',
      companyName: 'Mercor',
      jobTitle: 'Software Engineer, Applied AI @ Mercor',
    })).toEqual({ role: 'Software Engineer, Applied AI', company: 'Mercor' });
  });

  it('keeps an explicit backend value that jobTitle never carried', () => {
    expect(resolveSessionIdentity({
      roleName: 'Member of Technical Staff',
      companyName: 'Mercor AI',
      jobTitle: 'Software Engineer, Applied AI @ Mercor',
    })).toEqual({ role: 'Member of Technical Staff', company: 'Mercor AI' });
  });

  // The regression this file exists for. The backend only splits on " @ ", so a
  // hyphenated title comes back whole with no company; re-deriving the company
  // locally would render "Data Analyst - Acme · Acme".
  it('does not re-derive a company when the backend split produced none', () => {
    expect(resolveSessionIdentity({
      roleName: 'Data Analyst - Acme',
      companyName: '',
      jobTitle: 'Data Analyst - Acme',
    })).toEqual({ role: 'Data Analyst - Acme', company: '' });
  });

  it('leaves the company empty for a role-only title', () => {
    expect(resolveSessionIdentity({
      roleName: 'Software Engineer',
      jobTitle: 'Software Engineer',
    })).toEqual({ role: 'Software Engineer', company: '' });
  });

  it('treats a whitespace-only backend role as absent', () => {
    expect(resolveSessionIdentity({
      roleName: '   ',
      jobTitle: 'Software Engineer, Applied AI @ Mercor',
    })).toEqual({ role: 'Software Engineer, Applied AI', company: 'Mercor' });
  });
});

// Every session row returned '' for both fields until the 2026-08-02 Lambda
// change, and the frontend ships independently of it — so this path has to keep
// working against a backend that has not been updated yet.
describe('resolveSessionIdentity — fallback for a backend that sends nothing', () => {
  it("splits jobTitle when both fields are ''", () => {
    expect(resolveSessionIdentity({
      roleName: '',
      companyName: '',
      jobTitle: 'Software Engineer, Applied AI @ Mercor',
    })).toEqual({ role: 'Software Engineer, Applied AI', company: 'Mercor' });
  });

  it('splits jobTitle when the fields are absent entirely', () => {
    expect(resolveSessionIdentity({ jobTitle: 'Data Scientist @ Northwind' }))
      .toEqual({ role: 'Data Scientist', company: 'Northwind' });
  });

  it('still accepts the dash separators the backend ignores', () => {
    expect(resolveSessionIdentity({ jobTitle: 'Data Analyst — Acme' }))
      .toEqual({ role: 'Data Analyst', company: 'Acme' });
    expect(resolveSessionIdentity({ jobTitle: 'Data Analyst - Acme' }))
      .toEqual({ role: 'Data Analyst', company: 'Acme' });
  });

  // Real title from production. An EN dash is NOT a separator here — adding one
  // to the character class splits this into
  // role="Associate Software Engineer" / company=".NET - TechBlocks".
  it('does not treat an en dash as a separator', () => {
    expect(resolveSessionIdentity({ jobTitle: 'Associate Software Engineer – .NET @ TechBlocks' }))
      .toEqual({ role: 'Associate Software Engineer – .NET', company: 'TechBlocks' });
  });

  it('returns nothing for a session with no job attached', () => {
    expect(resolveSessionIdentity({})).toEqual({ role: '', company: '' });
    expect(resolveSessionIdentity({ jobTitle: '' })).toEqual({ role: '', company: '' });
  });

  it('keeps a lone backend company rather than dropping it', () => {
    expect(resolveSessionIdentity({ companyName: 'Mercor', jobTitle: 'Software Engineer' }))
      .toEqual({ role: 'Software Engineer', company: 'Mercor' });
  });
});

describe('parseJobTitle — legacy client split', () => {
  it('splits on the FIRST separator, unlike the backend', () => {
    // The backend returns ('Support @ Scale Lead', 'Vantiq') for this title.
    // The divergence is only reachable when the backend sent nothing at all.
    expect(parseJobTitle('Support @ Scale Lead @ Vantiq'))
      .toEqual({ role: 'Support', company: 'Scale Lead - Vantiq' });
  });

  it('requires whitespace around the separator', () => {
    expect(parseJobTitle('Engineer@Home')).toEqual({ role: 'Engineer@Home', company: '' });
  });

  it('handles a missing title', () => {
    expect(parseJobTitle(undefined)).toEqual({ role: '', company: '' });
    expect(parseJobTitle(null)).toEqual({ role: '', company: '' });
  });
});
