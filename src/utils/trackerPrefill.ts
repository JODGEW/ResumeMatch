import type { Analysis } from '../types';
import type { Application } from '../types/tracker';

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
      matchPercentage: Number(analysis.matchScore) || 0,
    },
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringItems(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

// Whitelist for ?prefill= data: keeps only the fields getTrackerPrefill
// produces, with the right types. A present skillMatch object is always
// returned complete (bad or missing parts fall back to emptyForm defaults)
// so the modal can read every sub-field.
export function pickTrackerPrefill(data: unknown): {
  companyName?: string;
  roleTitle?: string;
  skillMatch?: Application['skillMatch'];
} {
  if (!isPlainObject(data)) return {};
  const { companyName, roleTitle, skillMatch } = data;
  return {
    ...(typeof companyName === 'string' ? { companyName } : {}),
    ...(typeof roleTitle === 'string' ? { roleTitle } : {}),
    ...(isPlainObject(skillMatch)
      ? {
          skillMatch: {
            matchedSkills: stringItems(skillMatch.matchedSkills),
            missingSkills: stringItems(skillMatch.missingSkills),
            matchPercentage:
              typeof skillMatch.matchPercentage === 'number' && Number.isFinite(skillMatch.matchPercentage)
                ? skillMatch.matchPercentage
                : 0,
          },
        }
      : {}),
  };
}
