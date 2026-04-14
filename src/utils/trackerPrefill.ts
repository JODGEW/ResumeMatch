import type { Analysis } from '../types';

function parseJobTitle(title?: string): { roleTitle?: string; companyName?: string } {
  if (!title) return {};
  const parts = title.split(/\s+(?:@|—|–|-)\s+/);
  return {
    roleTitle: parts[0]?.trim() || undefined,
    companyName: parts.slice(1).join(' - ').trim() || undefined,
  };
}

export function getTrackerPrefill(analysis: Analysis) {
  const parsed = parseJobTitle(analysis.jobTitle);
  const roleTitle = analysis.roleName?.trim() || parsed.roleTitle;
  const companyName = analysis.companyName?.trim() || parsed.companyName;

  return {
    ...(companyName ? { companyName } : {}),
    ...(roleTitle ? { roleTitle } : {}),
    skillMatch: {
      matchedSkills: analysis.presentKeywords || [],
      missingSkills: analysis.missingKeywords || [],
      matchPercentage: analysis.matchScore || 0,
    },
  };
}
