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
  header: string | null; // null = preamble (contact + optional summary)
  lines: string[];       // non-empty lines of content under this header
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
 * Parse suggestedText into structured sections.
 */
export function parseResume(suggestedText: string): ParsedResume {
  const decoded = decodeText(suggestedText);
  const rawLines = decoded.split('\n');

  // Find the name: first non-empty line
  const name = rawLines.find((l) => l.trim().length > 0)?.trim() || 'Resume';

  // Build sections by scanning for headers
  const sections: ParsedSection[] = [];
  let currentSection: ParsedSection = { header: null, lines: [] };

  let pastName = false;

  for (const rawLine of rawLines) {
    const line = rawLine.trim();

    // Skip empty lines
    if (!line) continue;

    // Skip the name line itself (already captured)
    if (!pastName && line === name) {
      pastName = true;
      continue;
    }
    pastName = true;

    // Check if this line is a section header
    if (isSectionHeader(line)) {
      // Save current section if it has content
      if (currentSection.lines.length > 0 || currentSection.header !== null) {
        sections.push(currentSection);
      }
      // Start new section
      currentSection = { header: line, lines: [] };
      continue;
    }

    // Regular content line — add to current section
    currentSection.lines.push(line);
  }

  // Don't forget the last section
  if (currentSection.lines.length > 0 || currentSection.header !== null) {
    sections.push(currentSection);
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