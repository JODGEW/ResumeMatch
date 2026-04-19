/**
 * resumeParser.ts
 *
 * Loose parser for suggestedText output from Pass 3.
 * Handles the 3 structural patterns found in Phase 0 audit:
 *   1. Newline-separated (each sentence on its own line)
 *   2. Paragraph blob (sentences run together per job entry)
 *   3. Flat blob (zero newlines — Textract lost all structure)
 *
 * Strategy: Don't try to distinguish job title vs company vs date.
 * Just identify the name, section headers, and group content between them.
 */

export interface ParsedSection {
  header: string | null;          // null = preamble (contact + optional summary)
  lines: string[];                // content lines after soft-wrap reassembly
  entryBreakBefore: boolean[];    // parallel to lines: true when a blank line
                                  // preceded this line in the source (i.e. a
                                  // new project/job entry starts here)
  isContact?: boolean;            // true for preamble lines detected as contact info
}

export interface ParsedResume {
  name: string;
  sections: ParsedSection[];
}

// ALL-CAPS headers we expect (from audit: 11/13 use this pattern)
const KNOWN_HEADERS = [
  'WORK EXPERIENCE',
  'WORK EXPERIENCES',
  'PROJECTS',
  'TECHNICAL SKILLS',
  'EDUCATION',
  'EDUCATIONS',
  'CORE COMPETENCIES',
  'SOFT SKILLS',
  'PROFESSIONAL ATTRIBUTES',
  'CERTIFICATIONS',
  'SKILLS',
  'SUMMARY',
  'PROFESSIONAL SUMMARY',
  'LANGUAGES',
  'AWARDS',
  'PUBLICATIONS',
  'VOLUNTEER',
  'INTERESTS',
];

// Contact pattern: emails, URLs, phone numbers, pipe-separated info
const CONTACT_RE = /(@|linkedin\.com|github\.com|\(\d{3}\)|\d{3}[-.]?\d{3}[-.]?\d{4}|[\w.]+@[\w.]+\.[\w]+)/i;

// Regex: line is ALL CAPS, 3+ chars, only letters/spaces/&/,
const ALL_CAPS_RE = /^[A-Z][A-Z\s&,/]+$/;

// Title Case headers (audit: 2/13 used this pattern)
const TITLE_CASE_HEADERS = [
  'Work Experience',
  'Work Experiences',
  'Experience',
  'Projects',
  'Technical Skills',
  'Technical Projects',
  'Education',
  'Educations',
  'Skills',
  'Core Competencies',
  'Soft Skills',
  'Professional Attributes',
  'Certifications',
  'Summary',
  'Professional Summary',
];

/**
 * Returns true if a line looks like a section header.
 */
function isSectionHeader(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 3) return false;

  // Check exact known headers (case-insensitive)
  if (KNOWN_HEADERS.includes(trimmed.toUpperCase())) return true;

  // Check ALL CAPS pattern (at least 3 chars, no lowercase)
  if (ALL_CAPS_RE.test(trimmed) && trimmed.length >= 5) return true;

  // Check Title Case known headers
  if (TITLE_CASE_HEADERS.includes(trimmed)) return true;

  return false;
}

/**
 * Handle the flat blob edge case (sample 12 pattern):
 * Zero newlines — try to inject breaks before known header words.
 *
 * Uses case-insensitive matching because flat blobs may have
 * Title Case headers (e.g. "Educations", "Work Experiences").
 */
function unflattenBlob(text: string): string {
  let result = text;

  // Build a combined list of all header variants (ALL CAPS + Title Case)
  const allHeaders = [...new Set([...KNOWN_HEADERS, ...TITLE_CASE_HEADERS])];

  // Sort longest-first so "Work Experiences" matches before "Work Experience"
  allHeaders.sort((a, b) => b.length - a.length);

  for (const header of allHeaders) {
    // Case-insensitive match preceded by a space, followed by a space
    const escaped = header.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\s(${escaped})(?=\\s)`, 'gi');
    result = result.replace(re, (_match, captured) => `\n${captured}\n`);
  }

  // Also try to split the name from the start:
  // Pattern: "Name Email: ... " or "Name email@..." at the very beginning
  const nameEmailMatch = result.match(
    /^([A-Z][a-z]+(?:\s[A-Z][a-z]+)+)\s+(?:Email:|[a-zA-Z0-9._%+-]+@)/
  );
  if (nameEmailMatch) {
    const name = nameEmailMatch[1];
    result = name + '\n' + result.slice(name.length);
  }

  return result;
}

/**
 * Decode the suggestedText string:
 * - Replace literal \n with actual newlines
 * - Handle the flat blob edge case
 */
function decodeText(raw: string): string {
  // Strip wrapping quotes if present (DynamoDB CSV export artifact)
  let text = raw.trim();
  if (text.startsWith('"') && text.endsWith('"')) {
    text = text.slice(1, -1);
  }

  // Replace escaped newlines with real ones
  text = text.replace(/\\n/g, '\n');

  // If after decoding we still have very few lines, it's a flat blob
  const lineCount = text.split('\n').filter((l) => l.trim()).length;
  if (lineCount <= 2 && text.length > 500) {
    text = unflattenBlob(text);
  }

  return text;
}

/**
 * Words that almost never end a real bullet — if a line ends with one of
 * these, the sentence is still mid-flight and the next physical line is a
 * hard-wrap continuation. Using this whitelist (instead of "no terminal
 * punctuation") avoids false joins between separate bullets that the LLM
 * wrote without trailing periods.
 */
const WEAK_ENDING_WORDS = new Set([
  // prepositions
  'in', 'on', 'at', 'by', 'for', 'with', 'from', 'to', 'into', 'onto', 'upon',
  'about', 'between', 'among', 'through', 'across', 'against', 'before',
  'after', 'during', 'until', 'throughout', 'within', 'without', 'over',
  'under', 'along', 'around', 'beside', 'of', 'off', 'near',
  // articles
  'a', 'an', 'the',
  // conjunctions
  'and', 'or', 'but', 'nor', 'so', 'yet',
  // relative pronouns / subordinators
  'that', 'which', 'who', 'whom', 'whose', 'where', 'when', 'while', 'as',
  // common auxiliaries / linking verbs
  'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had',
  'do', 'does', 'did',
  'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'shall',
]);

/**
 * Soft-wrap continuation: the previous physical line is mid-sentence and
 * the current line is its hard-wrap continuation. Two independent signals:
 *   1. prev ends with a weak connector word (between / the / was / …)
 *   2. next starts with a lowercase letter — legitimate bullets and
 *      titles always start uppercase, so a lowercase-start next line is
 *      almost always a mid-noun-phrase wrap (e.g. "…strict TypeScript" +
 *      "contract validation…"). Gated on prev.length >= 60 to avoid
 *      gluing short contact/metadata lines into an email or URL.
 */
function isSoftWrapContinuation(prev: string, next: string): boolean {
  if (!prev || !next) return false;
  if (isSectionHeader(next)) return false;
  if (/^[•\-–*]/.test(next)) return false;           // next is a new bullet
  if (/[.!?)"\]]\s*$/.test(prev)) return false;      // prev ends a sentence

  const firstChar = next[0];
  if (firstChar >= 'a' && firstChar <= 'z' && prev.length >= 60) {
    return true;
  }

  const match = prev.match(/([A-Za-z]+)[,:;]?\s*$/);
  if (!match) return false;
  return WEAK_ENDING_WORDS.has(match[1].toLowerCase());
}

function makeSection(header: string | null): ParsedSection {
  return { header, lines: [], entryBreakBefore: [] };
}

function pushLine(section: ParsedSection, line: string, breakBefore: boolean): void {
  section.lines.push(line);
  section.entryBreakBefore.push(breakBefore);
}

/**
 * Parse suggestedText into structured sections.
 */
export function parseResume(suggestedText: string): ParsedResume {
  const decoded = decodeText(suggestedText);
  const rawLines = decoded.split('\n');

  // Find the name: first non-empty line
  const name = rawLines.find((l) => l.trim().length > 0)?.trim() || 'Resume';

  const sections: ParsedSection[] = [];
  let currentSection = makeSection(null);
  let pastName = false;
  let blankPending = false;

  for (const rawLine of rawLines) {
    const line = rawLine.trim();

    if (!line) {
      blankPending = true;
      continue;
    }

    if (!pastName && line === name) {
      pastName = true;
      blankPending = false;
      continue;
    }
    pastName = true;

    if (isSectionHeader(line)) {
      if (currentSection.lines.length > 0 || currentSection.header !== null) {
        sections.push(currentSection);
      }
      currentSection = makeSection(line);
      blankPending = false;
      continue;
    }

    const prev = currentSection.lines[currentSection.lines.length - 1];
    if (!blankPending && prev && isSoftWrapContinuation(prev, line)) {
      // Merge hard-wrapped continuation into the previous bullet.
      currentSection.lines[currentSection.lines.length - 1] = `${prev} ${line}`;
      continue;
    }

    pushLine(currentSection, line, blankPending);
    blankPending = false;
  }

  if (currentSection.lines.length > 0 || currentSection.header !== null) {
    sections.push(currentSection);
  }

  for (const section of sections) {
    if (section.header === null && section.lines.length > 0) {
      section.isContact = section.lines.some((line) => CONTACT_RE.test(line));
    }
  }

  return { name, sections };
}

/**
 * Sanitize a filename from the resume name.
 * "Wenhao He" → "Wenhao_He_Optimized"
 */
export function sanitizeFilename(name: string): string {
  const clean = name
    .replace(/[^a-zA-Z0-9\s-]/g, '') // strip special chars
    .trim()
    .replace(/\s+/g, '_');            // spaces → underscores
  return `${clean || 'Resume'}_Optimized`;
}