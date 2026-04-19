import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseResume, sanitizeFilename } from './resumeParser';

const CASES_DIR = join(__dirname, '../../eval/cases');

function loadRealResumes(): { id: string; text: string; firstLine: string }[] {
  return readdirSync(CASES_DIR)
    .filter((d) => d.startsWith('case_'))
    .sort()
    .map((id) => {
      const text = readFileSync(join(CASES_DIR, id, 'resume.txt'), 'utf-8');
      const firstLine = text.split('\n')[0].trim();
      return { id, text, firstLine };
    });
}

// Pattern B: collapse content lines within each section to one paragraph,
// keeping the name and header lines on their own line. Mirrors Textract
// output where a job entry is run together but the visual blocks for name
// and section headers remain distinct.
function toParagraphBlob(text: string): string {
  const HEADER_RE = /^(?:[A-Z][A-Z\s&,/]{2,}|Work Experiences?|Experience|Projects|Technical Skills|Technical Projects|Educations?|Skills|Core Competencies|Soft Skills|Professional Attributes|Certifications|Summary|Professional Summary)$/;
  const lines = text.split('\n');
  const out: string[] = [];
  let buf: string[] = [];
  let seenFirst = false;
  const flush = () => {
    if (buf.length) {
      out.push(buf.join(' ').replace(/\s+/g, ' ').trim());
      buf = [];
    }
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    if (!seenFirst) {
      // Preserve the name on its own line.
      out.push(line);
      seenFirst = true;
      continue;
    }
    if (HEADER_RE.test(line)) {
      flush();
      out.push(line);
      continue;
    }
    buf.push(line);
  }
  flush();
  return out.join('\n');
}

// Pattern C: flatten every newline into a single space. The parser must
// recover by injecting breaks before known headers (unflattenBlob).
function toFlatBlob(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

const REAL = loadRealResumes();

describe('parseResume — invariants across all real resumes', () => {
  describe.each(REAL)('$id', ({ text, firstLine }) => {
    it('Pattern A (newline-separated): extracts name and sections', () => {
      const result = parseResume(text);
      expect(result.name).toBe(firstLine);
      expect(result.sections.length).toBeGreaterThanOrEqual(3);
      const headers = result.sections.map((s) => s.header).filter(Boolean) as string[];
      expect(headers.length).toBeGreaterThanOrEqual(2);
      const preamble = result.sections.find((s) => s.header === null);
      expect(preamble?.isContact).toBe(true);
    });

    it('Pattern B (paragraph blob): still extracts name and section headers', () => {
      const blob = toParagraphBlob(text);
      const result = parseResume(blob);
      expect(result.name).toBe(firstLine);
      const headers = result.sections.map((s) => s.header).filter(Boolean) as string[];
      expect(headers.length).toBeGreaterThanOrEqual(2);
    });

    it('Pattern C (flat blob): unflattenBlob recovers headers', () => {
      const blob = toFlatBlob(text);
      const result = parseResume(blob);
      expect(result.name.length).toBeGreaterThan(0);
      expect(result.name).not.toBe('Resume');
      const headers = result.sections.map((s) => s.header).filter(Boolean) as string[];
      // At minimum we expect Work Experience/Skills/Education to be recovered.
      expect(headers.length).toBeGreaterThanOrEqual(2);
    });
  });
});

describe('parseResume — locked structure for case_01', () => {
  const case01 = REAL.find((r) => r.id === 'case_01')!;

  it('snapshot: Pattern A structure', () => {
    const r = parseResume(case01.text);
    const summary = {
      name: r.name,
      sectionCount: r.sections.length,
      headers: r.sections.map((s) => s.header),
      preambleIsContact: r.sections.find((s) => s.header === null)?.isContact ?? false,
    };
    expect(summary).toMatchInlineSnapshot(`
      {
        "headers": [
          null,
          "Summary",
          "Work Experience",
          "Projects",
          "Skills",
          "Education",
        ],
        "name": "Wenhao He",
        "preambleIsContact": true,
        "sectionCount": 6,
      }
    `);
  });

  it('escaped \\n input is decoded', () => {
    const escaped = case01.text.replace(/\n/g, '\\n');
    const r = parseResume(escaped);
    expect(r.name).toBe('Wenhao He');
    expect(r.sections.length).toBeGreaterThanOrEqual(3);
  });

  it('quoted (DynamoDB CSV) wrapping is stripped', () => {
    const wrapped = `"${case01.text.replace(/\n/g, '\\n')}"`;
    const r = parseResume(wrapped);
    expect(r.name).toBe('Wenhao He');
  });
});

describe('parseResume — bullet reassembly and entry breaks', () => {
  it('joins a hard-wrapped bullet that breaks mid-sentence on an uppercase proper noun', () => {
    const input = [
      'Jane Doe',
      'Software Engineer',
      'jane@example.com',
      '',
      'Projects',
      '',
      'RAG Retrieval Agent (Claude Haiku, LangGraph, Chroma)',
      'Built a RAG-based retrieval agent on Claude Haiku using the ReAct pattern with LangGraph, dynamically routing queries between',
      'Chroma and Tavily with local-first retrieval for finance and compliance queries.',
      'Implemented thread-safe Chroma ingestion with singleton coordination, producing source-attributed answers in',
      'under 4 seconds with stable query consistency under concurrent access.',
    ].join('\n');

    const r = parseResume(input);
    const projects = r.sections.find((s) => s.header === 'Projects')!;

    // Two bullets — not four — after soft-wrap reassembly.
    const bullets = projects.lines.filter((l) => /^(Built|Implemented)/.test(l));
    expect(bullets).toHaveLength(2);
    expect(bullets[0]).toContain('routing queries between Chroma and Tavily');
    expect(bullets[0]).toMatch(/\.$/);
    expect(bullets[1]).toContain('answers in under 4 seconds');
    expect(bullets[1]).toMatch(/\.$/);
  });

  it('does NOT merge a short metadata line into the previous bullet', () => {
    const input = [
      'Jane Doe',
      'jane@example.com',
      '',
      'Work Experience',
      '',
      'Software Engineer — AppTrail | Jan 2023 - Present',
      'Shipped a thing that did other things and improved the metric by a lot.',
      'Tech Lead — OtherCo | Jun 2020 - Dec 2022',
    ].join('\n');

    const r = parseResume(input);
    const exp = r.sections.find((s) => s.header === 'Work Experience')!;
    // Metadata lines stay intact; bullet is its own line.
    expect(exp.lines).toContain('Software Engineer — AppTrail | Jan 2023 - Present');
    expect(exp.lines).toContain('Tech Lead — OtherCo | Jun 2020 - Dec 2022');
    expect(exp.lines.some((l) => l.startsWith('Shipped a thing'))).toBe(true);
  });

  it('records entryBreakBefore=true when a blank line precedes a new project title', () => {
    const input = [
      'Jane Doe',
      'jane@example.com',
      '',
      'Projects',
      '',
      'RAG Retrieval Agent (Claude Haiku, LangGraph, Chroma)',
      'Built a retrieval agent.',
      'Implemented thread-safe ingestion.',
      '',
      'Order Processing System (Spring Boot, Kafka, Docker)',
      'Designed an event-driven pipeline.',
    ].join('\n');

    const r = parseResume(input);
    const projects = r.sections.find((s) => s.header === 'Projects')!;

    const titleIdx = projects.lines.findIndex((l) => l.startsWith('Order Processing System'));
    expect(titleIdx).toBeGreaterThan(0);
    expect(projects.entryBreakBefore[titleIdx]).toBe(true);

    // A bullet immediately following another bullet — no blank line, no break.
    const bulletIdx = projects.lines.findIndex((l) => l.startsWith('Implemented thread-safe'));
    expect(projects.entryBreakBefore[bulletIdx]).toBe(false);
  });

  it('merges mid-noun-phrase soft wrap where next line starts lowercase', () => {
    // Real-world pathology: "…using strict TypeScript\ncontract validation…"
    // The wrap point is mid-noun-phrase, so the weak-connector heuristic
    // alone would miss it. The lowercase-start-next signal catches it.
    const input = [
      'Jane Doe',
      'jane@example.com',
      '',
      'Work Experience',
      '',
      'Full-Stack Software Engineer — Clipp Inc | Sep 2024 - Jun 2025',
      'Built a modular Jest test framework spanning Payments, Purchase Orders, and Returns, using strict TypeScript',
      'contract validation to catch cross-service data mismatches before release.',
      'Full-Stack Software Engineer — CAN International Corp | Apr 2024 - Sep 2024',
      'Built and launched a React Native mobile application from the ground up.',
    ].join('\n');

    const r = parseResume(input);
    const exp = r.sections.find((s) => s.header === 'Work Experience')!;
    const merged = exp.lines.find((l) => l.startsWith('Built a modular Jest'));
    expect(merged).toBeDefined();
    expect(merged).toContain('strict TypeScript contract validation to catch');
    expect(merged).toMatch(/before release\.$/);
    // Orphan tail is no longer a standalone line — nothing for the
    // metadata bolder to sweep up.
    expect(exp.lines).not.toContain('contract validation to catch cross-service data mismatches before release.');
  });

  it('does NOT merge a short contact-like line into the previous short line', () => {
    // Guard: lowercase-start rule must NOT glue email/URL lines into a
    // short title line in the preamble.
    const input = [
      'Jane Doe',
      'Software Engineer',
      'jane@example.com',
      'github.com/janedoe',
      '',
      'Summary',
      'Blah',
    ].join('\n');

    const r = parseResume(input);
    const preamble = r.sections.find((s) => s.header === null)!;
    expect(preamble.lines).toContain('Software Engineer');
    expect(preamble.lines).toContain('jane@example.com');
    expect(preamble.lines).toContain('github.com/janedoe');
  });

  it('does NOT merge two separate bullets that both lack trailing periods', () => {
    // Pathology: LLM-optimized bullets often omit trailing periods. Each
    // bullet is a complete thought; we must NOT glue them together just
    // because punctuation is missing.
    const input = [
      'Jane Doe',
      'jane@example.com',
      '',
      'Work Experience',
      '',
      'Tax Associate — Crowe LLP | Jan 2024 - Apr 2025',
      'Prepared 120+ federal and state tax returns using ONESOURCE and GoSystem RS, including book-to-tax reconciliations and extension filings',
      'Assisted in preparing ASC 740 income tax provisions, including current and deferred tax calculations and supporting workpapers',
      'Managed fixed assets using Sage, including additions, disposals, and depreciation rollforward workpapers',
    ].join('\n');

    const r = parseResume(input);
    const exp = r.sections.find((s) => s.header === 'Work Experience')!;
    const bullets = exp.lines.filter((l) => /^(Prepared|Assisted|Managed)/.test(l));
    expect(bullets).toHaveLength(3);
  });

  it('does NOT merge the next job-entry header into the previous bullet', () => {
    // Pathology: back-to-back jobs at the same company. If the previous
    // bullet lacks punctuation and the next line is a new company header,
    // the parser must NOT fuse them.
    const input = [
      'Jane Doe',
      'jane@example.com',
      '',
      'Work Experience',
      '',
      'Tax Associate — Crowe LLP | Jan 2024 - Apr 2025',
      'Performed tax research using Bloomberg Tax and RIA Checkpoint on complex issues such as NOLs and depreciation methods',
      'Crowe LLP — New York, NY',
      'Jan 2023 - Apr 2023',
      'Tax Services Intern — Federal Tax Consultant Services',
      'Researched federal tax regulations and assisted in preparing technical documentation for R&D credit claims',
    ].join('\n');

    const r = parseResume(input);
    const exp = r.sections.find((s) => s.header === 'Work Experience')!;
    expect(exp.lines).toContain('Crowe LLP — New York, NY');
    expect(exp.lines).toContain('Jan 2023 - Apr 2023');
    expect(exp.lines).toContain('Tax Services Intern — Federal Tax Consultant Services');
    const researchBullet = exp.lines.find((l) => l.startsWith('Performed tax research'));
    expect(researchBullet).toBeDefined();
    expect(researchBullet).not.toContain('Crowe LLP');
  });

  it('entryBreakBefore + continuation join handled together (full pathology)', () => {
    const input = [
      'Jane Doe',
      'jane@example.com',
      '',
      'Projects',
      '',
      'RAG Retrieval Agent (Claude Haiku, LangGraph, Chroma)',
      'Built a RAG-based retrieval agent on Claude Haiku using the ReAct pattern with LangGraph, dynamically routing queries between',
      'Chroma and Tavily with local-first retrieval for finance and compliance queries.',
      'Implemented thread-safe Chroma ingestion with singleton coordination, producing source-attributed answers in',
      'under 4 seconds with stable query consistency under concurrent access.',
      '',
      'Order Processing System (Spring Boot, Kafka, Docker)',
      'Designed an event-driven pipeline.',
    ].join('\n');

    const r = parseResume(input);
    const projects = r.sections.find((s) => s.header === 'Projects')!;

    // Expect: 2 project titles + 2 bullets + 1 bullet = 5 lines total.
    expect(projects.lines).toHaveLength(5);

    const [title1, bullet1, bullet2, title2, bullet3] = projects.lines;
    expect(title1).toMatch(/^RAG Retrieval Agent/);
    expect(bullet1).toContain('Chroma and Tavily');
    expect(bullet2).toContain('under 4 seconds');
    expect(title2).toMatch(/^Order Processing System/);
    expect(bullet3).toContain('event-driven pipeline');

    // Blank lines in source: before title1 (after header) and before title2.
    // docxGenerator ignores index 0, so only title2's break drives extra spacing.
    expect(projects.entryBreakBefore).toEqual([true, false, false, true, false]);
  });
});

describe('sanitizeFilename', () => {
  it.each([
    ['Wenhao He', 'Wenhao_He_Optimized'],
    ['Mary-Jane O’Brien', 'Mary-Jane_OBrien_Optimized'],
    ['  spaced  out  ', 'spaced_out_Optimized'],
    ['', 'Resume_Optimized'],
    ['!!!', 'Resume_Optimized'],
  ])('%s -> %s', (input, expected) => {
    expect(sanitizeFilename(input)).toBe(expected);
  });
});
