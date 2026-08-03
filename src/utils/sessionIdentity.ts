/**
 * Role / company for an interview session, resolved from the two sources that
 * can supply them.
 *
 * The backend splits jobTitle ("Role @ Company") into roleName + companyName —
 * `interviewStart` stores the pair, and `interviewGetSession` /
 * `interviewListSessions` derive it from jobTitle for rows written before that.
 * It splits on " @ " only, and on the LAST one.
 *
 * `parseJobTitle` below is the older client-side split, kept because it is the
 * only thing that answers when the backend supplies nothing: the summary
 * endpoint returned '' for both fields for every session until 2026-08-02, and
 * this code has to keep working against a backend that has not been updated
 * yet. It is deliberately more lenient — em dash, en dash and hyphen count as
 * separators, and it splits on the FIRST one.
 */

export interface SessionIdentitySource {
  roleName?: string | null;
  companyName?: string | null;
  jobTitle?: string | null;
}

export interface SessionIdentity {
  role: string;
  company: string;
}

/**
 * Legacy client-side split, carried over from InterviewHistory unchanged. It is
 * lenient about the separator, so it can turn a role that merely contains a
 * hyphen into a bogus role/company pair — which is why it is a last resort, not
 * the primary source.
 *
 * The separator set is exactly `@`, em dash and hyphen. An EN dash (–) is
 * deliberately absent: adding one regresses a real title,
 * "Associate Software Engineer – .NET @ TechBlocks", from
 * role="Associate Software Engineer – .NET" / company="TechBlocks" to
 * role="Associate Software Engineer" / company=".NET - TechBlocks".
 * (trackerPrefill.ts has a near-identical parser that DOES include the en dash;
 * it is a separate consumer reading Analysis, and is not this function.)
 */
export function parseJobTitle(title?: string | null): SessionIdentity {
  if (!title) return { role: '', company: '' };

  const parts = title.split(/\s+(?:@|—|-)\s+/);
  return {
    role: parts[0]?.trim() ?? '',
    company: parts.slice(1).join(' - ').trim(),
  };
}

/**
 * The two sources are never mixed.
 *
 * Taking the role from the backend but letting the local parse fill in a
 * missing company double-prints the company on any title the backend declines
 * to split. For "Data Analyst - Acme" the backend returns the whole string as
 * the role — it only splits on " @ " — and the local parse would then add
 * "Acme" again as the company, so the card reads
 * "Data Analyst - Acme · Acme".
 *
 * So: if the backend produced a role, its pair is used whole, an empty company
 * included. The local parse only runs when the backend gave us nothing.
 */
export function resolveSessionIdentity(session: SessionIdentitySource): SessionIdentity {
  const roleName = session.roleName?.trim() ?? '';
  const companyName = session.companyName?.trim() ?? '';

  if (roleName) return { role: roleName, company: companyName };

  const parsed = parseJobTitle(session.jobTitle);
  return { role: parsed.role, company: companyName || parsed.company };
}
