/**
 * docxGenerator.ts
 *
 * Generates a clean, minimal DOCX from parsed resume data.
 * Option B approach: don't try to reconstruct exact resume layout.
 * Just produce a well-formatted text document the user can paste
 * into their own template.
 *
 * Dependencies: docx, file-saver
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  BorderStyle,
  convertInchesToTwip,
} from 'docx';
import { saveAs } from 'file-saver';
import { ParsedResume, sanitizeFilename } from './resumeParser';

// Date pattern: "Month YYYY", "Mon YYYY", or "YYYY - YYYY" / "YYYY - Present"
const DATE_RE = /\b(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|jun(e)?|jul(y)?|aug(ust)?|sep(tember)?|oct(ober)?|nov(ember)?|dec(ember)?)\s+\d{4}\b|\b\d{4}\s*[-–—]\s*(present|\d{4})\b/i;

// Sections where job/project metadata clusters appear
const METADATA_SECTIONS = [
  'work experience', 'work experiences', 'experience',
  'projects', 'technical projects',
  'education', 'educations',
];

const METADATA_LINE_MAX_LENGTH = 80;

/**
 * Identify which lines in a section should be rendered bold (job metadata).
 * Strategy: find date lines, walk backward marking short non-bullet lines.
 */
function getMetadataBoldIndices(lines: string[], sectionHeader: string | null): Set<number> {
  const bold = new Set<number>();
  if (!sectionHeader) return bold;

  const headerNorm = sectionHeader.toLowerCase().trim();
  if (!METADATA_SECTIONS.some(s => headerNorm.includes(s))) return bold;

  // Pass 1: find date line indices
  const dateIndices: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (DATE_RE.test(lines[i])) {
      dateIndices.push(i);
    }
  }

  // Pass 2: for each date line, walk backward marking short non-bullet metadata
  for (const di of dateIndices) {
    bold.add(di);
    for (let j = di - 1; j >= 0; j--) {
      const line = lines[j];
      const isBullet = line.startsWith('•') || line.startsWith('-') || line.startsWith('–');
      if (isBullet || line.length > METADATA_LINE_MAX_LENGTH) break;
      // Stop if we hit another date line (belongs to previous entry)
      if (bold.has(j)) break;
      bold.add(j);
    }
  }

  return bold;
}

/**
 * Build a DOCX Document from parsed resume data.
 */
function buildDocument(parsed: ParsedResume): Document {
  const children: Paragraph[] = [];

  // ── Name heading ──
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: parsed.name,
          bold: true,
          size: 28, // 14pt
          font: 'Calibri',
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
    })
  );

  // ── Sections ──
  for (const section of parsed.sections) {
    // Contact/preamble block: 9pt, centered, muted gray
    if (section.isContact && !section.header) {
      for (const line of section.lines) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: line,
                size: 18, // 9pt
                font: 'Calibri',
                color: '666666',
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { before: 20, after: 20 },
          })
        );
      }
      continue;
    }

    // Section header (if present)
    if (section.header) {
      // Thin divider line before each section
      children.push(
        new Paragraph({
          spacing: { before: 240, after: 0 },
          border: {
            bottom: {
              style: BorderStyle.SINGLE,
              size: 1,
              color: 'AAAAAA',
              space: 4,
            },
          },
        })
      );

      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: section.header,
              bold: true,
              size: 22, // 11pt
              font: 'Calibri',
              allCaps: true,
            }),
          ],
          spacing: { before: 40, after: 120 },
        })
      );
    }

    // Content lines — with metadata bolding for experience/project/education sections
    const boldIndices = getMetadataBoldIndices(section.lines, section.header);
    const breaks = section.entryBreakBefore;

    for (let i = 0; i < section.lines.length; i++) {
      const line = section.lines[i];
      const isBullet = line.startsWith('•') || line.startsWith('-') || line.startsWith('–');
      const cleanLine = isBullet ? line.replace(/^[•\-–]\s*/, '') : line;
      const isBold = boldIndices.has(i);
      const entryBreak = i > 0 && breaks[i] === true;

      if (isBullet) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: cleanLine,
                size: 20, // 10pt
                font: 'Calibri',
              }),
            ],
            numbering: { reference: 'default-bullet', level: 0 },
            spacing: { before: entryBreak ? 200 : 40, after: 40 },
          })
        );
      } else {
        const baseBefore = isBold && i > 0 && !boldIndices.has(i - 1) ? 160 : 20;
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: line,
                bold: isBold,
                size: 20, // 10pt
                font: 'Calibri',
              }),
            ],
            spacing: { before: entryBreak ? Math.max(baseBefore, 200) : baseBefore, after: 20 },
          })
        );
      }
    }
  }

  // ── Assemble document ──
  return new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(0.6),
              bottom: convertInchesToTwip(0.6),
              left: convertInchesToTwip(0.7),
              right: convertInchesToTwip(0.7),
            },
          },
        },
        children,
      },
    ],
    numbering: {
      config: [
        {
          reference: 'default-bullet',
          levels: [
            {
              level: 0,
              format: 'bullet',
              text: '\u2022',
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: {
                  indent: {
                    left: convertInchesToTwip(0.25),
                    hanging: convertInchesToTwip(0.15),
                  },
                },
              },
            },
          ],
        },
      ],
    },
  });
}

/**
 * Generate and download the DOCX file.
 */
export async function downloadOptimizedResume(
  parsed: ParsedResume
): Promise<void> {
  const doc = buildDocument(parsed);
  const blob = await Packer.toBlob(doc);
  const filename = `${sanitizeFilename(parsed.name)}.docx`;
  saveAs(blob, filename);
}