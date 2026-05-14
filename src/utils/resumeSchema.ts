// TODO(schema-refactor): wired up in Phase 1
/**
 * Typed Resume schema — single source of truth.
 *
 * Pass 0 (Lambda) populates this from Textract output. Pass 3 emits typed
 * edits that target node IDs. Renderers (DOCX, react-pdf) consume the
 * optimizedSchema. Schema-versioned: bump SchemaVersion on breaking changes.
 *
 * IDs are 26-char ULIDs assigned at Pass 0. They are opaque references —
 * compare entities by content, not by ID.
 */

export type SchemaVersion = 1;

export type Ulid = string;

export type ExtractionStatus = 'ok' | 'partial' | 'failed';

export interface Resume {
  schemaVersion: SchemaVersion;
  extractionStatus: ExtractionStatus;
  extractionNotes?: string[];
  name: string;
  contact: ContactInfo;
  summary?: string;
  sections: ResumeSection[];
}

export interface ContactInfo {
  email?: string;
  phone?: string;
  location?: string;
  links: ContactLink[];
}

export interface ContactLink {
  label: string;
  url: string;
}

export interface Bullet {
  id: Ulid;
  text: string;
}

export type ResumeSection =
  | WorkSection
  | ProjectsSection
  | SkillsSection
  | EducationSection
  | CertificationsSection
  | GenericSection;

export interface WorkSection {
  kind: 'work';
  id: Ulid;
  title: string;
  entries: WorkEntry[];
}

export interface WorkEntry {
  id: Ulid;
  title: string;
  company: string;
  companyContext?: string;
  location?: string;
  startDate: string;
  endDate: string;
  bullets: Bullet[];
}

export interface ProjectsSection {
  kind: 'projects';
  id: Ulid;
  title: string;
  entries: ProjectEntry[];
}

export interface ProjectEntry {
  id: Ulid;
  name: string;
  tech?: string[];
  startDate?: string;
  endDate?: string;
  bullets: Bullet[];
}

export interface SkillsSection {
  kind: 'skills';
  id: Ulid;
  title: string;
  categories: SkillCategory[];
}

export interface SkillCategory {
  id: Ulid;
  label: string;
  items: string[];
}

export interface EducationSection {
  kind: 'education';
  id: Ulid;
  title: string;
  entries: EducationEntry[];
}

export interface EducationEntry {
  id: Ulid;
  school: string;
  degree: string;
  graduationDate?: string;
  details?: Bullet[];
}

export interface CertificationsSection {
  kind: 'certifications';
  id: Ulid;
  title: string;
  entries: CertEntry[];
}

export interface CertEntry {
  id: Ulid;
  name: string;
  issuer?: string;
  issuedDate?: string;
}

export interface GenericSection {
  kind: 'generic';
  id: Ulid;
  title: string;
  bullets: Bullet[];
}

export function isExtractionUsable(resume: Resume): boolean {
  return resume.extractionStatus === 'ok' && resume.sections.length > 0;
}
