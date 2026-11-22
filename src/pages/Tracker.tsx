import { useState, useMemo, useRef, useEffect, useCallback, Fragment } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApplications } from '../hooks/useApplications';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { useFocusTrap } from '../hooks/useFocusTrap';
import type { Application } from '../types/tracker';
import { calculateOutreachScore } from '../types/tracker';
import { ConfirmModal } from '../components/ConfirmModal';
import { KanbanView } from '../components/KanbanView';
import { OutreachQueue } from '../components/OutreachQueue';
import { SignupPromptModal } from '../components/SignupPromptModal';
import { Mascot } from '../components/Mascot';
import { safeHttpUrl } from '../utils/safeUrl';
import { pickTrackerPrefill } from '../utils/trackerPrefill';
import './Tracker.css';

type Filter = 'all' | 'worth' | 'follow_up' | 'awaiting' | 'completed' | 'rejected';
type SortKey = 'dateApplied' | 'matchPercentage' | 'outreachScore';
type SignupPromptContent = {
  title: string;
  body: string;
};

const ITEMS_PER_PAGE = 10;

const STATUS_LABELS: Record<Application['outreachStatus'], string> = {
  not_started: 'Not Started',
  researching: 'Researching',
  drafted: 'Drafted',
  sent: 'Sent',
  followed_up: 'Followed Up',
  replied: 'Replied',
  no_response: 'No Response',
  skipped: 'Skipped',
};

export const APP_STATUS_LABELS: Record<Application['applicationStatus'], string> = {
  not_applied: 'Not Applied',
  applied: 'Applied',
  screening: 'Screening',
  interviewing: 'Interviewing',
  offer: 'Offer',
  rejected: 'Rejected',
};

const TIMELINE_STEPS: Application['outreachStatus'][] = [
  'not_started', 'researching', 'drafted', 'sent', 'followed_up', 'replied',
];

// ── Posting age ────────────────────────────────────────
// `postingAgeWeeks` is a bucket index, not a literal week count — 4 means
// "1+ month", not "4 weeks". Rendering the raw number read as false precision
// ("Posted 0w ago"). This table is the single source for both the modal's
// dropdown and the card label so the two can't drift apart.
// Compact labels for the collapsed disclosure summaries. The <option> text in
// the form stays longer and more descriptive.
const COMPANY_SIZE_LABELS: Record<Application['companySize'], string> = {
  startup: 'Startup',
  midsize: 'Mid-size',
  enterprise: 'Enterprise',
};

const SENIORITY_SHORT_LABELS: Record<NonNullable<Application['seniorityFit']>, string> = {
  entry: 'Entry',
  mid: 'Mid',
  senior: 'Senior',
};

const RESPONSE_TYPE_LABELS: Record<NonNullable<Application['response']>['type'], string> = {
  positive: 'Positive',
  negative: 'Negative',
  referral: 'Referral',
  no_response: 'No Response',
};

const POSTING_AGE_BUCKETS = [
  { value: 0, label: '< 1 week' },
  { value: 1, label: '1-2 weeks' },
  { value: 2, label: '2-4 weeks' },
  { value: 4, label: '1+ month' },
] as const;

// Highest bucket the value reaches, so stored values outside the four options
// (buildSampleData carries a 3) still land in the right one.
function postingAgeLabel(weeks: number): string {
  let label: string = POSTING_AGE_BUCKETS[0].label;
  for (const bucket of POSTING_AGE_BUCKETS) if (weeks >= bucket.value) label = bucket.label;
  return label;
}

// ── "Outreach not needed" ──────────────────────────────
// An application that reached screening on its own never needed cold outreach.
// Showing it as "Not Started" reads as an unfinished task and pressures the user
// into work that has no upside, so this state suppresses the nudge everywhere:
// the badge, the timeline's current step, the Send Outreach action, and queue
// membership. Only applies before any outreach was attempted — someone who was
// already Researching or Drafted may still want to send it (design bundle,
// `notNeeded`). Offer/rejected are terminal and already opt out of all four.
const OUTREACH_MOOT_STAGES: ReadonlySet<Application['applicationStatus']> = new Set([
  'screening', 'interviewing', 'offer',
]);

export function isOutreachNotNeeded(app: Application): boolean {
  return app.outreachStatus === 'not_started' && OUTREACH_MOOT_STAGES.has(app.applicationStatus);
}

// Rejected before any outreach happened — same idea, different reason.
export function isOutreachClosedByRejection(app: Application): boolean {
  return app.outreachStatus === 'not_started' && app.applicationStatus === 'rejected';
}

// Single source of truth for the outreach status text, shared with KanbanView.
export function outreachText(app: Application): string {
  if (isOutreachClosedByRejection(app)) return 'Outreach closed';
  if (isOutreachNotNeeded(app)) return 'Outreach not needed';
  return `Outreach ${STATUS_LABELS[app.outreachStatus].toLowerCase()}`;
}

function getPageFromSearchParams(searchParams: URLSearchParams) {
  const page = Number(searchParams.get('page'));
  return Number.isInteger(page) && page > 0 ? page : 1;
}

// Parse "YYYY-MM-DD" as local date (not UTC) to avoid off-by-one timezone issues
export function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Rejected and Offer close the application out: no outreach reply can change
// the outcome. Both therefore stop generating follow-up reminders and stop
// counting as "Awaiting Response" — matching the OutreachQueue, which already
// excludes them from its membership.
const TERMINAL_STAGES: ReadonlySet<Application['applicationStatus']> = new Set(['rejected', 'offer']);

export function isAwaitingResponse(app: Application): boolean {
  return (app.outreachStatus === 'sent' || app.outreachStatus === 'followed_up')
    && !TERMINAL_STAGES.has(app.applicationStatus);
}

export function getFollowUpDue(app: Application): { label: string; overdue: boolean; daysUntil: number } | null {
  if (!app.outreachDate || app.followUpSent || app.outreachStatus === 'replied' || app.outreachStatus === 'no_response' || app.outreachStatus === 'skipped' || TERMINAL_STAGES.has(app.applicationStatus)) return null;
  const due = app.followUpDate ? parseLocalDate(app.followUpDate) : new Date(parseLocalDate(app.outreachDate).getTime() + 7 * 86400000);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return { label: `Overdue by ${-diff} day${diff === -1 ? '' : 's'}`, overdue: true, daysUntil: diff };
  if (diff === 0) return { label: 'Due today', overdue: false, daysUntil: 0 };
  return { label: `Due in ${diff} day${diff === 1 ? '' : 's'}`, overdue: false, daysUntil: diff };
}

// ── Action-needed detection ─────────────────────────────
// Application pipeline: flag current stage if it's been too long without progress
function getAppStageAction(app: Application, step: Application['applicationStatus'], isCurrent: boolean): string | null {
  if (!isCurrent) return null;
  const stageStart = step === 'applied' ? app.dateApplied : (app.statusChangedAt || app.dateApplied);
  const age = Math.max(0, Math.round((Date.now() - new Date(stageStart).getTime()) / 86400000));
  switch (step) {
    case 'applied':     return age >= 14 ? `No update in ${age}d — follow up?` : null;
    case 'screening':   return age >= 7  ? `Screening for ${age}d — check in?` : null;
    // No 'interviewing' nudge: age tracks time-in-stage, not time-since-last-contact,
    // and active interview loops legitimately run weeks — a "no update" claim here is unreliable.
    default: return null;
  }
}

// Shared by the list/board filter memo and the outreach view: q must already be
// lowercased and trimmed; empty q matches everything.
function matchesSearch(app: Application, q: string): boolean {
  if (!q) return true;
  return app.companyName.toLowerCase().includes(q)
    || app.roleTitle.toLowerCase().includes(q)
    || (app.contact?.name || '').toLowerCase().includes(q);
}

// Outreach pipeline: flag the current step when user should take action
function getOutreachStageAction(app: Application, step: Application['outreachStatus'], isCurrent: boolean, followUp: ReturnType<typeof getFollowUpDue>): string | null {
  if (!isCurrent) return null;
  switch (step) {
    case 'not_started':  return app.outreachWorth ? 'Worth outreach — start now' : null;
    case 'researching':  return 'Finish research & draft message';
    case 'drafted':      return 'Ready to send';
    case 'sent':         return followUp?.overdue ? 'Follow-up overdue' : followUp ? `Follow-up ${followUp.label.toLowerCase()}` : null;
    case 'followed_up':  return !app.followUpSent ? 'Follow-up not sent yet' : null;
    default: return null;
  }
}

// ── Context-aware quick actions ─────────────────────────
interface QuickAction {
  label: string;
  // accent: filled. outline: transparent; an action that moves
  // applicationStatus takes the target stage's colour (STAGE_COLOR).
  variant: 'accent' | 'outline';
  updates: Partial<Application>;
  hint?: string;  // "next step" guidance shown on the primary button
}

// Reject/Reopen, Edit and Delete now live in the card's ··· menu (design
// bundle), so this only produces the inline primary/secondary buttons.
interface QuickActionSet {
  primary: QuickAction | null;
  secondary: QuickAction | null;
}

function getQuickActions(app: Application): QuickActionSet {
  const appStatus = app.applicationStatus;
  const outStatus = app.outreachStatus;
  const today = new Date().toISOString().slice(0, 10);
  const followUpDateVal = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  let primary: QuickAction | null = null;
  let secondary: QuickAction | null = null;

  // Terminal states — no inline actions (the ··· menu still offers Reopen)
  if (appStatus === 'rejected' || appStatus === 'offer') {
    return { primary, secondary };
  }

  // ── Determine primary + secondary based on combined state ──

  // Outreach: not yet sent → primary is Send Outreach (clean single CTA).
  // Skipped when outreach is moot: the application already advanced on its own,
  // so it falls through to the pipeline actions below (Interviewing / Offer).
  if (!isOutreachNotNeeded(app) && (outStatus === 'not_started' || outStatus === 'researching' || outStatus === 'drafted')) {
    primary = {
      label: 'Send Outreach',
      variant: 'accent',
      hint: app.outreachWorth ? 'Worth outreach' : undefined,
      updates: {
        outreachStatus: 'sent',
        outreachDate: app.outreachDate || today,
        followUpDate: app.followUpDate || followUpDateVal,
      },
    };
    // Pipeline jumps go to overflow — not common enough for inline
  }

  // Outreach: sent → primary is Follow Up (especially if due/overdue)
  else if (outStatus === 'sent') {
    primary = {
      label: 'Follow Up',
      variant: 'accent',
      updates: {
        outreachStatus: 'followed_up',
        followUpSent: true,
        followUpDate: app.followUpDate || today,
      },
    };
    secondary = { label: 'Replied', variant: 'outline', updates: { outreachStatus: 'replied' } };
  }

  // Outreach: followed up → primary is Replied
  else if (outStatus === 'followed_up') {
    primary = { label: 'Replied', variant: 'outline', updates: { outreachStatus: 'replied' } };
  }

  // Outreach: replied/no_response/skipped → focus on app pipeline
  else {
    if (appStatus === 'applied' || appStatus === 'screening') {
      primary = { label: 'Interviewing', variant: 'outline', updates: { applicationStatus: 'interviewing' } };
    } else if (appStatus === 'interviewing') {
      primary = { label: 'Offer', variant: 'outline', updates: { applicationStatus: 'offer' } };
    }
  }

  return { primary, secondary };
}

// ── Presentation helpers (design bundle) ───────────────
// calculateOutreachScore returns reasons as "<label>: +<n>". Split for the
// bundle's label + points chip. Purely presentational — scoring is untouched.
export function splitReason(reason: string): { label: string; pts: string } {
  const i = reason.lastIndexOf(': +');
  if (i === -1) return { label: reason, pts: '' };
  return { label: reason.slice(0, i), pts: reason.slice(i + 2) };
}

// Stage palette (direction A): one colour per application stage, shared by the
// list status line, board column headers and stage-moving quick actions.
export const STAGE_COLOR: Record<Application['applicationStatus'], string> = {
  not_applied: 'var(--text-muted)',
  applied: 'var(--accent-hover)',
  screening: 'var(--warning)',
  interviewing: 'var(--info)',
  offer: 'var(--success)',
  rejected: 'var(--danger)',
};

// Colour of the *current* step in the application pipeline (bundle STAGE_DOT).
const STAGE_COLOR_CLASS: Record<Application['applicationStatus'], string> = {
  not_applied: 'tracker-step--c-muted',
  applied: 'tracker-step--c-brand',
  screening: 'tracker-step--c-warn',
  interviewing: 'tracker-step--c-info',
  offer: 'tracker-step--c-success',
  rejected: 'tracker-step--c-danger',
};

// Bundle caps the skill lists and shows a "+N more" counter.
const MATCHED_SKILLS_SHOWN = 8;
const MISSING_SKILLS_SHOWN = 5;

function formatDate(iso: string) {
  return parseLocalDate(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Tag Input ──────────────────────────────────────────
function TagInput({ tags, onChange, placeholder, inputId }: { tags: string[]; onChange: (t: string[]) => void; placeholder?: string; inputId?: string }) {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.key === 'Enter' || e.key === ',') && input.trim()) {
      e.preventDefault();
      if (!tags.includes(input.trim())) onChange([...tags, input.trim()]);
      setInput('');
    } else if (e.key === 'Backspace' && !input && tags.length) {
      onChange(tags.slice(0, -1));
    }
  }

  return (
    <div className="tracker-tags" onClick={() => inputRef.current?.focus()}>
      {tags.map(t => (
        <span key={t} className="tracker-tag">
          {t}
          <button type="button" className="tracker-tag__remove" onClick={e => { e.stopPropagation(); onChange(tags.filter(x => x !== t)); }}>&times;</button>
        </span>
      ))}
      <input
        ref={inputRef}
        id={inputId}
        className="tracker-tags__input"
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={tags.length ? '' : placeholder}
      />
    </div>
  );
}

// ── Modal disclosure row ───────────────────────────────
function ModalDisclosure({ label, summary, open, onToggle, children }: {
  label: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="tracker-modal__disc">
      <button type="button" className="tracker-modal__disclosure" aria-expanded={open} onClick={onToggle}>
        <span className="tracker-modal__disclosure-label">{label}</span>
        <span className="tracker-modal__disclosure-summary">{summary}</span>
        <svg className={`tracker-modal__disclosure-chevron${open ? ' tracker-modal__disclosure-chevron--open' : ''}`} width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && <div className="tracker-modal__disc-body">{children}</div>}
    </div>
  );
}

// Same test the save path uses to drop an empty response.
function hasResponseData(r: Application['response']): boolean {
  return !!r && !!(r.date || r.type || r.notes || r.nextStep);
}

// ── Empty form state ───────────────────────────────────
function emptyForm(): Omit<Application, 'id' | 'createdAt' | 'updatedAt' | 'outreachWorth'> {
  return {
    companyName: '',
    roleTitle: '',
    jobPostingUrl: '',
    dateApplied: new Date().toISOString().split('T')[0],
    resumeVersion: 'fullstack',
    applicationStatus: 'applied',
    statusChangedAt: new Date().toISOString(),
    skillMatch: { matchedSkills: [], missingSkills: [], matchPercentage: 0 },
    companySize: 'startup',
    postingAgeWeeks: undefined,
    seniorityFit: undefined,
    contact: undefined,
    outreachStatus: 'not_started',
    outreachDate: undefined,
    followUpDate: undefined,
    followUpSent: false,
    response: undefined,
    notes: '',
  };
}

// ── Add/Edit Modal ─────────────────────────────────────
function ApplicationModal({
  initial, onSave, onClose, isEdit, suspended = false
}: {
  initial: ReturnType<typeof emptyForm> & { id?: string };
  onSave: (data: ReturnType<typeof emptyForm>) => void;
  onClose: () => void;
  isEdit: boolean;
  // True while the page stacks its duplicate-entry ConfirmModal on top.
  suspended?: boolean;
}) {
  const [form, setForm] = useState(initial);
  const [showDiscard, setShowDiscard] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useBodyScrollLock();
  // The discard-changes ConfirmModal (and the page's duplicate confirm) stack
  // their own trap on top; go inert while one is open so both traps don't
  // fight over Tab and Escape.
  useFocusTrap(panelRef, attemptClose, !showDiscard && !suspended);
  // Every block below Job info is optional, so each collapses behind its own
  // disclosure. A block opens by default when the record (or an analysis
  // prefill) already carries data in it, so editing never hides existing values.
  const [showContact, setShowContact] = useState(() =>
    !!initial.contact?.name || !!initial.contact?.email || !!initial.contact?.role
  );
  const [showOutreach, setShowOutreach] = useState(() =>
    initial.outreachStatus !== 'not_started'
    || !!initial.outreachDate || !!initial.followUpDate || !!initial.followUpSent
  );
  const [showResponse, setShowResponse] = useState(() => hasResponseData(initial.response));
  const [showMatch, setShowMatch] = useState(() =>
    initial.skillMatch.matchedSkills.length > 0
    || initial.skillMatch.missingSkills.length > 0
    || Number(initial.skillMatch.matchPercentage) > 0
  );
  const [showContext, setShowContext] = useState(() =>
    initial.companySize !== 'startup'
    || initial.postingAgeWeeks != null
    || initial.seniorityFit != null
  );
  const isDirty = JSON.stringify(form) !== JSON.stringify(initial);

  // Collapsed rows summarise what's inside so values stay visible without
  // expanding. Compact forms of the <option> text, which stays descriptive.
  const matchSummary = (() => {
    const skills = form.skillMatch.matchedSkills.length + form.skillMatch.missingSkills.length;
    const pct = Number(form.skillMatch.matchPercentage) || 0;
    const parts: string[] = [];
    if (skills) parts.push(`${skills} skill${skills === 1 ? '' : 's'}`);
    if (pct) parts.push(`${pct}%`);
    return parts.length ? parts.join(' · ') : 'optional';
  })();

  const contextSummary = [
    COMPANY_SIZE_LABELS[form.companySize],
    form.postingAgeWeeks != null ? postingAgeLabel(form.postingAgeWeeks) : null,
    form.seniorityFit ? SENIORITY_SHORT_LABELS[form.seniorityFit] : null,
  ].filter(Boolean).join(' · ');

  const contactSummary = [form.contact?.name, form.contact?.role].filter(Boolean).join(' · ') || 'optional';

  const outreachSummary = STATUS_LABELS[form.outreachStatus]
    + (form.outreachDate ? ` ${formatDate(form.outreachDate)}` : '')
    + (form.followUpDate && getFollowUpDue(form as Application) ? ` · follow-up due ${formatDate(form.followUpDate)}` : '');

  const responseSummary = form.response && hasResponseData(form.response)
    ? RESPONSE_TYPE_LABELS[form.response.type] + (form.response.date ? ` · ${formatDate(form.response.date)}` : '')
    : 'optional';

  const skillCount = form.skillMatch.matchedSkills.length + form.skillMatch.missingSkills.length;
  const matchPctPlaceholder = skillCount
    ? `${Math.round((form.skillMatch.matchedSkills.length / skillCount) * 100)} from skills`
    : 'Auto from skills';

  function set<K extends keyof typeof form>(key: K, val: (typeof form)[K]) {
    setForm(prev => ({ ...prev, [key]: val }));
    setFormError(null);
  }

  const overlayMouseDownRef = useRef(false);

  // Intentional dismiss (backdrop click, X, or Cancel): confirm only if there are unsaved edits.
  function attemptClose() {
    if (!isDirty) { onClose(); return; }
    setShowDiscard(true);
  }

  // Record whether the press *started* on the backdrop. A text selection that begins inside
  // the form and is released over the backdrop also dispatches a click on the overlay (the
  // click target is the nearest common ancestor of mousedown/mouseup) — that must NOT dismiss.
  function handleOverlayMouseDown(e: React.MouseEvent) {
    overlayMouseDownRef.current = e.target === e.currentTarget;
  }

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget && overlayMouseDownRef.current) attemptClose();
    overlayMouseDownRef.current = false;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const missing: string[] = [];
    if (!form.companyName.trim()) missing.push('Company name');
    if (!form.roleTitle.trim()) missing.push('Role title');
    if (!form.dateApplied) missing.push('Date applied');
    if (missing.length) {
      setFormError(`Please fill in: ${missing.join(', ')}`);
      return;
    }
    setFormError(null);

    const data = { ...form };

    // Match % may arrive as a string/NaN (e.g. prefill from an analysis); coerce to a valid 0–100 number
    const mp = Number(data.skillMatch.matchPercentage);
    data.skillMatch = {
      ...data.skillMatch,
      matchPercentage: Number.isFinite(mp) ? Math.min(100, Math.max(0, mp)) : 0,
    };

    // Clear empty contact/response
    if (data.contact && !data.contact.name && !data.contact.email) data.contact = undefined;
    if (data.response && !data.response.date && !data.response.type && !data.response.notes && !data.response.nextStep) data.response = undefined;

    // Auto-calc match percentage if skills provided and percentage is 0
    if (data.skillMatch.matchPercentage === 0 && data.skillMatch.matchedSkills.length > 0) {
      const total = data.skillMatch.matchedSkills.length + data.skillMatch.missingSkills.length;
      data.skillMatch.matchPercentage = Math.round((data.skillMatch.matchedSkills.length / total) * 100);
    }

    onSave(data);
  }

  return (
    <div
      className="tracker-modal-overlay"
      onMouseDown={handleOverlayMouseDown}
      onClick={handleOverlayClick}
    >
      <div
        ref={panelRef}
        className="tracker-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tracker-modal-title"
        onClick={e => e.stopPropagation()}
      >
        <div className="tracker-modal__header">
          <div>
            <h2 id="tracker-modal-title">{isEdit ? 'Edit Application' : 'Add Application'}</h2>
            <p className="tracker-modal__subtitle">Company, role and date are all you need to start.</p>
          </div>
          <button type="button" className="tracker-modal__close" onClick={attemptClose}>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <form className="tracker-modal__form" onSubmit={handleSubmit}>
          <div className="tracker-modal__body">
          {/* Job Info */}
          <div className="tracker-modal__section">
            <div className="tracker-modal__section-title">Job info</div>
            <div className="tracker-modal__grid">
              <div className="tracker-modal__field">
                <label className="tracker-modal__label" htmlFor="tm-company">Company name <span className="tracker-modal__req">*</span></label>
                <input id="tm-company" className="tracker-modal__input" placeholder="e.g. Linear" value={form.companyName} onChange={e => set('companyName', e.target.value)} />
              </div>
              <div className="tracker-modal__field">
                <label className="tracker-modal__label" htmlFor="tm-role">Role title <span className="tracker-modal__req">*</span></label>
                <input id="tm-role" className="tracker-modal__input" placeholder="e.g. Software Engineer" value={form.roleTitle} onChange={e => set('roleTitle', e.target.value)} />
              </div>
              <div className="tracker-modal__field">
                <label className="tracker-modal__label" htmlFor="tm-date-applied">Date applied <span className="tracker-modal__req">*</span></label>
                <input id="tm-date-applied" className="tracker-modal__input" type="date" value={form.dateApplied} onChange={e => set('dateApplied', e.target.value)} />
              </div>
              <div className="tracker-modal__field">
                <label className="tracker-modal__label" htmlFor="tm-app-status">Application status</label>
                <select id="tm-app-status" className="tracker-modal__select" value={form.applicationStatus} onChange={e => { set('applicationStatus', e.target.value as Application['applicationStatus']); set('statusChangedAt', new Date().toISOString()); }}>
                  {Object.entries(APP_STATUS_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              <div className="tracker-modal__field">
                <label className="tracker-modal__label" htmlFor="tm-resume-version">Resume version</label>
                <select id="tm-resume-version" className="tracker-modal__select" value={form.resumeVersion} onChange={e => set('resumeVersion', e.target.value as Application['resumeVersion'])}>
                  <option value="fullstack">Full-Stack</option>
                  <option value="frontend">Frontend</option>
                  <option value="cloud_devops">Cloud/DevOps</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div className="tracker-modal__field tracker-modal__field--full">
                <label className="tracker-modal__label" htmlFor="tm-job-url">Job posting URL</label>
                <input id="tm-job-url" className="tracker-modal__input" value={form.jobPostingUrl || ''} onChange={e => set('jobPostingUrl', e.target.value)} placeholder="https://..." />
              </div>
            </div>
          </div>

          <ModalDisclosure label="Match assessment" summary={matchSummary} open={showMatch} onToggle={() => setShowMatch(v => !v)}>
            <div className="tracker-modal__grid">
              <div className="tracker-modal__field tracker-modal__field--full">
                <label className="tracker-modal__label" htmlFor="tm-matched-skills">Matched skills</label>
                <TagInput inputId="tm-matched-skills" tags={form.skillMatch.matchedSkills} onChange={t => set('skillMatch', { ...form.skillMatch, matchedSkills: t })} placeholder="Type skill and press Enter" />
              </div>
              <div className="tracker-modal__field tracker-modal__field--full">
                <label className="tracker-modal__label" htmlFor="tm-missing-skills">Missing skills</label>
                <TagInput inputId="tm-missing-skills" tags={form.skillMatch.missingSkills} onChange={t => set('skillMatch', { ...form.skillMatch, missingSkills: t })} placeholder="Type skill and press Enter" />
              </div>
              <div className="tracker-modal__field">
                <label className="tracker-modal__label" htmlFor="tm-match-pct">Match %</label>
                {/* 0 is stored for "use the skill ratio", so it shows as empty. */}
                <input id="tm-match-pct" className="tracker-modal__input" type="number" min="0" max="100" aria-describedby="tm-match-pct-hint" placeholder={matchPctPlaceholder} value={Number(form.skillMatch.matchPercentage) === 0 ? '' : form.skillMatch.matchPercentage} onChange={e => {
                  const n = Number(e.target.value);
                  set('skillMatch', { ...form.skillMatch, matchPercentage: Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0 });
                }} />
                <span id="tm-match-pct-hint" className="tracker-modal__hint">Leave empty to use the skill ratio.</span>
              </div>
            </div>
          </ModalDisclosure>

          <ModalDisclosure label="Company context" summary={contextSummary} open={showContext} onToggle={() => setShowContext(v => !v)}>
            <div className="tracker-modal__grid">
              <div className="tracker-modal__field">
                <label className="tracker-modal__label" htmlFor="tm-company-size">Company size</label>
                <select id="tm-company-size" className="tracker-modal__select" value={form.companySize} onChange={e => set('companySize', e.target.value as Application['companySize'])}>
                  {Object.entries(COMPANY_SIZE_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              <div className="tracker-modal__field">
                <label className="tracker-modal__label" htmlFor="tm-posting-age">Posting age</label>
                <select id="tm-posting-age" className="tracker-modal__select" value={form.postingAgeWeeks ?? ''} onChange={e => set('postingAgeWeeks', e.target.value !== '' ? Number(e.target.value) : undefined)}>
                  <option value="">Unknown</option>
                  {POSTING_AGE_BUCKETS.map(bucket => (
                    <option key={bucket.value} value={bucket.value}>{bucket.label}</option>
                  ))}
                </select>
              </div>
              <div className="tracker-modal__field">
                <label className="tracker-modal__label" htmlFor="tm-seniority">Seniority fit</label>
                <select id="tm-seniority" className="tracker-modal__select" value={form.seniorityFit ?? ''} onChange={e => set('seniorityFit', e.target.value ? e.target.value as Application['seniorityFit'] : undefined)}>
                  <option value="">Unknown</option>
                  <option value="entry">Entry/Junior (0-2 yrs)</option>
                  <option value="mid">Mid (2-4 yrs)</option>
                  <option value="senior">Senior (5+ yrs)</option>
                </select>
              </div>
            </div>
          </ModalDisclosure>

          <ModalDisclosure label="Contact" summary={contactSummary} open={showContact} onToggle={() => setShowContact(v => !v)}>
            <div className="tracker-modal__grid">
              <div className="tracker-modal__field">
                <label className="tracker-modal__label" htmlFor="tm-contact-name">Contact name</label>
                <input id="tm-contact-name" className="tracker-modal__input" value={form.contact?.name || ''} onChange={e => set('contact', { name: e.target.value, role: form.contact?.role || '', source: form.contact?.source || '', email: form.contact?.email, linkedinUrl: form.contact?.linkedinUrl })} />
              </div>
              <div className="tracker-modal__field">
                <label className="tracker-modal__label" htmlFor="tm-contact-role">Contact role</label>
                <input id="tm-contact-role" className="tracker-modal__input" value={form.contact?.role || ''} onChange={e => set('contact', { ...form.contact!, role: e.target.value })} />
              </div>
              <div className="tracker-modal__field">
                <label className="tracker-modal__label" htmlFor="tm-contact-email">Email</label>
                <input id="tm-contact-email" className="tracker-modal__input" type="email" placeholder="name@company.com" value={form.contact?.email || ''} onChange={e => set('contact', { ...form.contact!, email: e.target.value || undefined })} />
              </div>
              <div className="tracker-modal__field">
                <label className="tracker-modal__label" htmlFor="tm-contact-linkedin">LinkedIn URL</label>
                <input id="tm-contact-linkedin" className="tracker-modal__input" value={form.contact?.linkedinUrl || ''} onChange={e => set('contact', { ...form.contact!, linkedinUrl: e.target.value || undefined })} placeholder="https://linkedin.com/in/..." />
              </div>
              <div className="tracker-modal__field">
                <label className="tracker-modal__label" htmlFor="tm-contact-source">Source</label>
                <input id="tm-contact-source" className="tracker-modal__input" value={form.contact?.source || ''} onChange={e => set('contact', { ...form.contact!, source: e.target.value })} placeholder="e.g. Hunter.io, LinkedIn" />
              </div>
            </div>
          </ModalDisclosure>

          <ModalDisclosure label="Outreach" summary={outreachSummary} open={showOutreach} onToggle={() => setShowOutreach(v => !v)}>
            <div className="tracker-modal__grid">
              <div className="tracker-modal__field">
                <label className="tracker-modal__label" htmlFor="tm-outreach-status">Outreach status</label>
                <select id="tm-outreach-status" className="tracker-modal__select" value={form.outreachStatus} onChange={e => {
                  const newStatus = e.target.value as Application['outreachStatus'];
                  set('outreachStatus', newStatus);
                  // Auto-fill follow-up date when status changes to "sent" and outreach date exists
                  if (newStatus === 'sent' && form.outreachDate) {
                    const outreach = parseLocalDate(form.outreachDate);
                    outreach.setDate(outreach.getDate() + 7);
                    const y = outreach.getFullYear(), m = String(outreach.getMonth() + 1).padStart(2, '0'), d = String(outreach.getDate()).padStart(2, '0');
                    set('followUpDate', `${y}-${m}-${d}`);
                  }
                }}>
                  {Object.entries(STATUS_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              <div className="tracker-modal__field">
                <label className="tracker-modal__label" htmlFor="tm-outreach-date">Outreach date</label>
                <input id="tm-outreach-date" className="tracker-modal__input" type="date" value={form.outreachDate || ''} onChange={e => {
                  const val = e.target.value || undefined;
                  set('outreachDate', val);
                  // Auto-fill follow-up date when outreach date is entered and status is "sent"
                  if (val && form.outreachStatus === 'sent') {
                    const outreach = parseLocalDate(val);
                    outreach.setDate(outreach.getDate() + 7);
                    const y = outreach.getFullYear(), m = String(outreach.getMonth() + 1).padStart(2, '0'), d = String(outreach.getDate()).padStart(2, '0');
                    set('followUpDate', `${y}-${m}-${d}`);
                  }
                }} />
              </div>
              <div className="tracker-modal__field">
                <label className="tracker-modal__label" htmlFor="tm-followup-date">Follow-up due date</label>
                <input id="tm-followup-date" className="tracker-modal__input" type="date" value={form.followUpDate || ''} onChange={e => set('followUpDate', e.target.value || undefined)} />
              </div>
              <div className="tracker-modal__field tracker-modal__field--checkbox">
                <label className="tracker-modal__checkbox-label">
                  <input className="tracker-check" type="checkbox" checked={form.followUpSent} onChange={e => set('followUpSent', e.target.checked)} />
                  Follow-up sent
                </label>
              </div>
            </div>
          </ModalDisclosure>

          <ModalDisclosure label="Response" summary={responseSummary} open={showResponse} onToggle={() => setShowResponse(v => !v)}>
            <div className="tracker-modal__grid">
              <div className="tracker-modal__field">
                <label className="tracker-modal__label" htmlFor="tm-response-date">Response date</label>
                <input id="tm-response-date" className="tracker-modal__input" type="date" value={form.response?.date || ''} onChange={e => set('response', { date: e.target.value, type: form.response?.type || 'positive', notes: form.response?.notes || '', nextStep: form.response?.nextStep || '' })} />
              </div>
              <div className="tracker-modal__field">
                <label className="tracker-modal__label" htmlFor="tm-response-type">Response type</label>
                <select id="tm-response-type" className="tracker-modal__select" value={form.response?.type || 'positive'} onChange={e => set('response', { date: form.response?.date || '', type: e.target.value as 'positive' | 'negative' | 'referral' | 'no_response', notes: form.response?.notes || '', nextStep: form.response?.nextStep || '' })}>
                  <option value="positive">Positive</option>
                  <option value="negative">Negative</option>
                  <option value="referral">Referral</option>
                  <option value="no_response">No Response</option>
                </select>
              </div>
              <div className="tracker-modal__field tracker-modal__field--full">
                <label className="tracker-modal__label" htmlFor="tm-response-notes">Reply notes</label>
                <textarea id="tm-response-notes" className="tracker-modal__textarea" value={form.response?.notes || ''} onChange={e => set('response', { date: form.response?.date || '', type: form.response?.type || 'positive', notes: e.target.value, nextStep: form.response?.nextStep || '' })} placeholder="What did they say? Next steps..." />
              </div>
              <div className="tracker-modal__field tracker-modal__field--full">
                <label className="tracker-modal__label" htmlFor="tm-next-step">Next step</label>
                <input id="tm-next-step" className="tracker-modal__input" value={form.response?.nextStep || ''} onChange={e => set('response', { date: form.response?.date || '', type: form.response?.type || 'positive', notes: form.response?.notes || '', nextStep: e.target.value })} placeholder="e.g. Schedule interview, send portfolio" />
              </div>
            </div>
          </ModalDisclosure>

          <div className="tracker-modal__notes">
            <label className="tracker-modal__label" htmlFor="tm-notes">Notes</label>
            <textarea id="tm-notes" className="tracker-modal__textarea" value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Personal notes about this application..." />
          </div>

          {formError && <div className="tracker-modal__error" role="alert">{formError}</div>}
          </div>

          <div className="tracker-modal__footer">
            <button type="button" className="tracker-btn tracker-btn--muted tracker-btn--form" onClick={attemptClose}>Cancel</button>
            <button type="submit" className="tracker-btn tracker-btn--brand tracker-btn--form">{isEdit ? 'Save Changes' : 'Add Application'}</button>
          </div>
        </form>
      </div>

      {showDiscard && (
        <ConfirmModal
          title="Discard changes?"
          body="You have unsaved changes to this application."
          confirmLabel="Discard"
          variant="warning"
          onConfirm={onClose}
          onCancel={() => setShowDiscard(false)}
        />
      )}
    </div>
  );
}

// ── Quick Action Buttons ────────────────────────────────
function QuickActionButtons({ primary, secondary, isRejected, onAction, onEdit, onDelete, onToggleReject }: {
  primary: QuickAction | null;
  secondary: QuickAction | null;
  isRejected: boolean;
  onAction: (updates: Partial<Application>, label: string) => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleReject: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  function run(fn: () => void) {
    setMenuOpen(false);
    fn();
  }

  return (
    <span className="tracker-card__quick-actions" onClick={e => e.stopPropagation()}>
      {primary && (
        <button
          className={`tracker-quick-btn tracker-quick-btn--${primary.variant}`}
          style={primary.updates.applicationStatus !== undefined
            ? { color: STAGE_COLOR[primary.updates.applicationStatus], borderColor: STAGE_COLOR[primary.updates.applicationStatus] }
            : undefined}
          onClick={() => onAction(primary.updates, primary.label)}
          title={primary.hint || primary.label}
        >
          {/* The bundle's advance arrow, on actions that actually move the
              pipeline. Keyed off the payload rather than the label, so it stays
              right if the action set changes — outreach actions (Send Outreach,
              Follow Up, Replied) write outreachStatus and get no arrow. */}
          {primary.updates.applicationStatus !== undefined && (
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path d="M3 8h9M8.5 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          {primary.label}
          {primary.hint && <span className="tracker-quick-btn__hint">{primary.hint}</span>}
        </button>
      )}
      {secondary && (
        <button
          className={`tracker-quick-btn tracker-quick-btn--${secondary.variant}`}
          onClick={() => onAction(secondary.updates, secondary.label)}
          title={secondary.label}
        >
          {secondary.label}
        </button>
      )}
      <div className="tracker-quick-overflow">
        <button
          className="tracker-quick-btn tracker-quick-btn--more"
          onClick={() => setMenuOpen(!menuOpen)}
          title="More actions"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <svg width="16" height="16" viewBox="0 0 16 16">
            <circle cx="3.5" cy="8" r="1.3" fill="currentColor" />
            <circle cx="8" cy="8" r="1.3" fill="currentColor" />
            <circle cx="12.5" cy="8" r="1.3" fill="currentColor" />
          </svg>
        </button>
        {menuOpen && (
          <>
            {/* Full-bleed backdrop closes the menu on any outside click. It sits
                inside the stopPropagation wrapper above, so the click never
                reaches the card row's expand toggle. */}
            <div className="tracker-quick-overflow__backdrop" onClick={() => setMenuOpen(false)} />
            <div className="tracker-quick-overflow__menu" role="menu">
              <button className="tracker-quick-overflow__item" role="menuitem" onClick={() => run(onEdit)}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M11 2l3 3-8 8H3v-3l8-8Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                </svg>
                Edit application
              </button>
              <button
                className={`tracker-quick-overflow__item tracker-quick-overflow__item--reject${isRejected ? '' : ' tracker-quick-overflow__item--danger'}`}
                role="menuitem"
                onClick={() => run(onToggleReject)}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                {isRejected ? 'Reopen application' : 'Mark as rejected'}
              </button>
              <div className="tracker-quick-overflow__sep" />
              <button className="tracker-quick-overflow__item tracker-quick-overflow__item--danger" role="menuitem" onClick={() => run(onDelete)}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M3 4h10M6 4V2.5h4V4M5 4l.5 9h5L11 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Delete
              </button>
            </div>
          </>
        )}
      </div>
    </span>
  );
}
// ── Detail View (inline expand) ────────────────────────
function DetailView({ app, isReadOnly, onEdit, onDelete, onUpdate }: { app: Application; isReadOnly: boolean; onEdit: () => void; onDelete: () => void; onUpdate: (id: string, updates: Partial<Application>) => void }) {
  const scoring = calculateOutreachScore(app);
  const followUp = getFollowUpDue(app);

  // -1 leaves every timeline step neutral: nothing is "current", so the stepper
  // stops presenting Not Started as a stage the user is stuck in. Applies to
  // both closed-out reasons — the bundle only blanks it for notNeeded, but a
  // rejected application showing a live "Not Started" step has the same problem.
  const notNeeded = isOutreachNotNeeded(app);
  const closedByRejection = isOutreachClosedByRejection(app);
  const statusIndex = notNeeded || closedByRejection ? -1 : TIMELINE_STEPS.indexOf(app.outreachStatus);
  const appSteps = ['not_applied', 'applied', 'screening', 'interviewing', 'offer'] as const;
  const currentIdx = appSteps.indexOf(app.applicationStatus as typeof appSteps[number]);
  const isRejected = app.applicationStatus === 'rejected';

  const matchedShown = app.skillMatch.matchedSkills.slice(0, MATCHED_SKILLS_SHOWN);
  const matchedMore = app.skillMatch.matchedSkills.length - matchedShown.length;
  const missingShown = app.skillMatch.missingSkills.slice(0, MISSING_SKILLS_SHOWN);
  const missingMore = app.skillMatch.missingSkills.length - missingShown.length;

  // Each stepper's nudge for its current step, shown as a line under the bar.
  // The overdue follow-up note is the outreach timeline's nudge on Sent.
  const pipelineHint = isRejected ? null : getAppStageAction(app, app.applicationStatus, true);
  const timelineHint = statusIndex >= 0 ? getOutreachStageAction(app, TIMELINE_STEPS[statusIndex], true, followUp) : null;
  const timelineHintOverdue = TIMELINE_STEPS[statusIndex] === 'sent' && !!followUp?.overdue;
  const safeJobPostingUrl = safeHttpUrl(app.jobPostingUrl);
  const safeContactLinkedinUrl = safeHttpUrl(app.contact?.linkedinUrl);


  return (
    <div className="tracker-detail">
      {/* ── Left column ── */}
      <div className="tracker-detail__col">
        {app.jobPostingUrl && (
          <div>
            <div className="tracker-detail__section-title">Job posting</div>
            {safeJobPostingUrl ? (
              <a
                href={safeJobPostingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="tracker-detail__job-url"
              >
                {app.jobPostingUrl}
              </a>
            ) : (
              <span className="tracker-detail__job-url tracker-detail__job-url--plain">{app.jobPostingUrl}</span>
            )}
          </div>
        )}

        <div>
          <div className="tracker-detail__section-title">Details</div>
          <div className="tracker-detail__details-row">
            <div>
              <div className="tracker-detail__detail-label">Resume</div>
              <div className="tracker-detail__detail-value">
                {app.resumeVersion === 'fullstack' ? 'Full-Stack' : app.resumeVersion === 'frontend' ? 'Frontend' : app.resumeVersion === 'cloud_devops' ? 'Cloud/DevOps' : 'Custom'}
              </div>
            </div>
            {app.seniorityFit && (
              <div>
                <div className="tracker-detail__detail-label">Seniority</div>
                <div className="tracker-detail__detail-value">
                  {app.seniorityFit === 'entry' ? 'Entry/Junior' : app.seniorityFit === 'mid' ? 'Mid-level' : 'Senior'}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Score breakdown — reasons come straight from calculateOutreachScore and
            are split into a label column and a points column. */}
        <div>
          <div className="tracker-detail__score-head">
            <span className="tracker-detail__section-title">Outreach score</span>
            <span className="tracker-detail__score-total">{scoring.score}/100</span>
          </div>
          <div className="tracker-detail__reasons">
            {scoring.reasons.map((r, i) => {
              const { label, pts } = splitReason(r);
              return (
                <Fragment key={i}>
                  <span>{label}</span>
                  <span className={`tracker-detail__reason-pts${pts === '+0' ? ' tracker-detail__reason-pts--zero' : ''}`}>{pts}</span>
                </Fragment>
              );
            })}
          </div>
        </div>

        {(matchedShown.length > 0 || missingShown.length > 0) && (
          <div>
            <div className="tracker-detail__section-title">Skills</div>
            <div className="tracker-detail__skills">
              {matchedShown.length > 0 && (
                <div>
                  <span className="tracker-detail__skills-label tracker-detail__skills-label--matched">Matched:</span>{' '}
                  {matchedShown.join(', ')}{matchedMore > 0 && `, +${matchedMore} more`}
                </div>
              )}
              {missingShown.length > 0 && (
                <div>
                  <span className="tracker-detail__skills-label tracker-detail__skills-label--missing">Missing:</span>{' '}
                  {missingShown.join(', ')}{missingMore > 0 && `, +${missingMore} more`}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Right column ── */}
      <div className="tracker-detail__col">
        {/* Application Status */}
        <div>
          <div className="tracker-detail__section-title">Application pipeline</div>
          <div className="tracker-detail__timeline">
            {appSteps.map((step, i) => {
              const isCurrent = !isRejected && step === app.applicationStatus;
              const isPast = !isRejected && i < currentIdx;
              const stageStart = app.applicationStatus === 'applied' ? app.dateApplied : (app.statusChangedAt || app.dateApplied);
              const stageAge = isCurrent ? Math.max(0, Math.round((Date.now() - new Date(stageStart).getTime()) / 86400000)) : null;
              const action = getAppStageAction(app, step, isCurrent);
              const canClick = !isReadOnly && !isCurrent && !isRejected;
              return (
                <Fragment key={step}>
                  {i > 0 && <span className="tracker-detail__timeline-arrow">&rarr;</span>}
                  <span
                    className={`tracker-detail__timeline-step ${isPast ? 'tracker-detail__timeline-step--active' : ''} ${isCurrent ? `tracker-detail__timeline-step--current ${STAGE_COLOR_CLASS[step]}` : ''} ${canClick ? 'tracker-detail__timeline-step--clickable' : ''}`}
                    title={action || (canClick ? `Set status to ${APP_STATUS_LABELS[step]}` : undefined)}
                    onClick={canClick ? () => onUpdate(app.id, { applicationStatus: step }) : undefined}
                    role={canClick ? 'button' : undefined}
                  >
                    {APP_STATUS_LABELS[step]}{stageAge !== null && <span className="tracker-detail__stage-age">&nbsp;({stageAge}d)</span>}
                  </span>
                </Fragment>
              );
            })}
            {isRejected && (
              <>
                <span className="tracker-detail__timeline-arrow">&rarr;</span>
                <span className="tracker-detail__timeline-step tracker-detail__timeline-step--rejected">
                  Rejected
                </span>
              </>
            )}
          </div>
          {pipelineHint && <p className="tracker-detail__step-hint">{pipelineHint}</p>}
        </div>

        {/* Timeline */}
        <div>
          <div className="tracker-detail__section-title">Outreach timeline</div>
          <div className="tracker-detail__timeline">
            {TIMELINE_STEPS.map((step, i) => {
              const isCurrent = i === statusIndex;
              const isPast = i < statusIndex;
              const outreachAction = getOutreachStageAction(app, step, isCurrent, followUp);
              // Compare against the real status, not the display index — when
              // outreach is moot nothing renders as current, but the step the
              // application is actually on still shouldn't be a no-op click.
              const canClick = !isReadOnly && step !== app.outreachStatus;
              function handleOutreachClick() {
                const updates: Partial<Application> = { outreachStatus: step };
                const stepIdx = TIMELINE_STEPS.indexOf(step);
                const sentIdx = TIMELINE_STEPS.indexOf('sent');

                if (step === 'sent') {
                  // A: Only auto-fill dates if not already set
                  if (!app.outreachDate) updates.outreachDate = new Date().toISOString().slice(0, 10);
                  if (!app.followUpDate) updates.followUpDate = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
                  // B: Reset followUpSent when going back to sent
                  updates.followUpSent = false;
                } else if (step === 'followed_up') {
                  updates.followUpSent = true;
                  if (!app.followUpDate) updates.followUpDate = new Date().toISOString().slice(0, 10);
                } else if (stepIdx < sentIdx) {
                  // C: Going backward before sent — clear timeline fields, keep contact
                  updates.outreachDate = '';
                  updates.followUpDate = '';
                  updates.followUpSent = false;
                }
                onUpdate(app.id, updates);
              }
              return (
                <Fragment key={step}>
                  {i > 0 && <span className="tracker-detail__timeline-arrow">&rarr;</span>}
                  <span
                    className={`tracker-detail__timeline-step ${isPast ? 'tracker-detail__timeline-step--active' : ''} ${isCurrent ? 'tracker-detail__timeline-step--current tracker-step--c-brand' : ''} ${canClick ? 'tracker-detail__timeline-step--clickable' : ''}`}
                    title={outreachAction || (canClick ? `Set to ${STATUS_LABELS[step]}` : undefined)}
                    onClick={canClick ? handleOutreachClick : undefined}
                    role={canClick ? 'button' : undefined}
                  >
                    {STATUS_LABELS[step]}
                    {step === 'drafted' && i <= statusIndex && app.outreachDate ? ` ${formatDate(app.outreachDate)}`
                      : step === 'sent' && i <= statusIndex && app.outreachDate ? ` ${formatDate(app.outreachDate)}`
                      : step === 'followed_up' && i <= statusIndex && app.followUpDate ? ` ${formatDate(app.followUpDate)}`
                      : ''}
                  </span>
                </Fragment>
              );
            })}
          </div>
          {timelineHint && (
            <p className={`tracker-detail__step-hint${timelineHintOverdue ? ' tracker-detail__step-hint--overdue' : ''}`}>{timelineHint}</p>
          )}
          {(notNeeded || closedByRejection) && (
            <p className="tracker-detail__note">
              {closedByRejection
                ? 'Application was rejected — outreach closed.'
                : `You reached ${APP_STATUS_LABELS[app.applicationStatus].toLowerCase()} before outreach — no longer needed.`}
            </p>
          )}
        </div>

        {/* Contact */}
        {app.contact && (
          <div>
            <div className="tracker-detail__section-title">Contact</div>
            <div className="tracker-detail__contact">
              <div className="tracker-dotlist">
                {app.contact.name && <span className="tracker-detail__contact-name">{app.contact.name}</span>}
                {app.contact.role && <span>{app.contact.role}</span>}
                {app.contact.source && <span>via {app.contact.source}</span>}
              </div>
              {(app.contact.email || safeContactLinkedinUrl) && (
                <div className="tracker-detail__contact-links">
                  {app.contact.email && (
                    <a className="tracker-detail__contact-link" href={`mailto:${app.contact.email}`}>
                      {app.contact.email}
                    </a>
                  )}
                  {safeContactLinkedinUrl && (
                    <a className="tracker-detail__contact-link" href={safeContactLinkedinUrl} target="_blank" rel="noopener noreferrer">
                      LinkedIn
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Response */}
        {app.response && (
          <div>
            <div className="tracker-detail__section-title">Response</div>
            <div className="tracker-detail__response">
              <div className="tracker-detail__response-type">
                {app.response.type === 'no_response' ? 'No Response' : app.response.type} &middot; {formatDate(app.response.date)}
              </div>
              <div className="tracker-detail__response-notes">{app.response.notes}</div>
              {app.response.nextStep && (
                <div className="tracker-detail__response-next">{app.response.nextStep}</div>
              )}
            </div>
          </div>
        )}

        {/* Notes */}
        {app.notes && (
          <div>
            <div className="tracker-detail__section-title">Notes</div>
            <div className="tracker-detail__notes">{app.notes}</div>
          </div>
        )}

        {/* Actions */}
        {!isReadOnly && (
          <div className="tracker-detail__actions">
            <button className="tracker-btn tracker-btn--ghost" onClick={onEdit}>Edit</button>
            <button className="tracker-btn tracker-btn--danger" onClick={onDelete}>Delete</button>
          </div>
        )}
      </div>
    </div>
  );
}


// ── CSV Export ──────────────────────────────────────────
function exportToCsv(apps: Application[], filename: string) {
  const headers = [
    'Company', 'Role', 'Date Applied', 'Application Status', 'Match %',
    'Outreach Score', 'Worth Outreach', 'Outreach Status', 'Outreach Date',
    'Follow-up Date', 'Follow-up Sent', 'Contact Name', 'Contact Role',
    'Contact Email', 'Response Type', 'Response Date', 'Resume Version',
    'Company Size', 'Job Posting URL', 'Notes',
  ];

  const rows = apps.map(app => {
    const scoring = calculateOutreachScore(app);
    return [
      app.companyName,
      app.roleTitle,
      app.dateApplied,
      APP_STATUS_LABELS[app.applicationStatus],
      app.skillMatch.matchPercentage,
      scoring.score,
      scoring.worth ? 'Yes' : 'No',
      STATUS_LABELS[app.outreachStatus],
      app.outreachDate || '',
      app.followUpDate || '',
      app.followUpSent ? 'Yes' : 'No',
      app.contact?.name || '',
      app.contact?.role || '',
      app.contact?.email || '',
      app.response?.type || '',
      app.response?.date || '',
      app.resumeVersion,
      app.companySize,
      app.jobPostingUrl || '',
      app.notes,
    ];
  });

  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Bulk Delete Body (progressive disclosure) ──────────
const PREVIEW_COUNT = 3;

function BulkDeleteBody({ apps }: { apps: Application[] }) {
  const [expanded, setExpanded] = useState(false);
  const count = apps.length;

  if (count <= PREVIEW_COUNT) {
    return (
      <>
        This will permanently delete:
        <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.25rem', fontSize: '0.8125rem', lineHeight: 1.6 }}>
          {apps.map(a => (
            <li key={a.id}><strong>{a.roleTitle}</strong> @ {a.companyName}</li>
          ))}
        </ul>
      </>
    );
  }

  const preview = apps.slice(0, PREVIEW_COUNT);
  const remaining = count - PREVIEW_COUNT;

  return (
    <>
      This will permanently delete {count} selected applications.
      <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.25rem', fontSize: '0.8125rem', lineHeight: 1.6 }}>
        {preview.map(a => (
          <li key={a.id}><strong>{a.roleTitle}</strong> @ {a.companyName}</li>
        ))}
      </ul>
      {!expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          style={{
            background: 'none', border: 'none', padding: '0.25rem 0', marginTop: '0.125rem',
            fontSize: '0.75rem', color: 'var(--accent)', cursor: 'pointer', fontWeight: 500,
          }}
        >
          +{remaining} more — show all ▼
        </button>
      ) : (
        <>
          <ul style={{ margin: '0', paddingLeft: '1.25rem', fontSize: '0.8125rem', lineHeight: 1.6 }}>
            {apps.slice(PREVIEW_COUNT).map(a => (
              <li key={a.id}><strong>{a.roleTitle}</strong> @ {a.companyName}</li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setExpanded(false)}
            style={{
              background: 'none', border: 'none', padding: '0.25rem 0', marginTop: '0.125rem',
              fontSize: '0.75rem', color: 'var(--accent)', cursor: 'pointer', fontWeight: 500,
            }}
          >
            show less ▲
          </button>
        </>
      )}
    </>
  );
}

// ── Main Tracker Page ──────────────────────────────────
export function Tracker() {
  const { applications, isReadOnly, isLoading, error, addApplication, updateApplication, deleteApplication } = useApplications();
  const [view, setView] = useState<'list' | 'board' | 'outreach'>(() => {
    const saved = localStorage.getItem('tracker_view');
    if (saved === 'board') return 'board';
    if (saved === 'outreach') return 'outreach';
    return 'list';
  });
  const handleSetView = (v: 'list' | 'board' | 'outreach') => {
    setView(v);
    localStorage.setItem('tracker_view', v);
  };
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<SortKey>('dateApplied');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [modalState, setModalState] = useState<{ open: boolean; editId?: string }>({ open: false });
  const [bannerExpanded, setBannerExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ open: boolean; appId: string; appTitle: string; appCompany: string }>({ open: false, appId: '', appTitle: '', appCompany: '' });
  const [searchParams, setSearchParams] = useSearchParams();
  const currentPage = getPageFromSearchParams(searchParams);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [toast, setToast] = useState<{ message: string; key: number } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const [flashId, setFlashId] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout>>();
  const [signupPrompt, setSignupPrompt] = useState<SignupPromptContent | null>(null);
  const [pendingDuplicate, setPendingDuplicate] = useState<{ data: ReturnType<typeof emptyForm>; message: string } | null>(null);

  const goToPage = useCallback((page: number, options?: { replace?: boolean }) => {
    const nextPage = Math.max(1, page);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (nextPage === 1) {
        next.delete('page');
      } else {
        next.set('page', String(nextPage));
      }
      return next;
    }, options);
  }, [setSearchParams]);

  function showToast(message: string) {
    clearTimeout(toastTimer.current);
    setToast({ message, key: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }

  function flashCard(id: string) {
    clearTimeout(flashTimer.current);
    setFlashId(id);
    flashTimer.current = setTimeout(() => setFlashId(null), 600);
  }

  function handleFilterChange(nextFilter: Filter) {
    setFilter(nextFilter);
    setSelectedIds(new Set());
    goToPage(1, { replace: true });
  }

  function handleSearchChange(nextSearch: string) {
    setSearch(nextSearch);
    setSelectedIds(new Set());
    goToPage(1, { replace: true });
  }

  // Handle prefill from History page
  useEffect(() => {
    const prefill = searchParams.get('prefill');
    if (prefill && !isReadOnly) {
      const clearPrefill = () => {
        setSearchParams(prev => {
          const next = new URLSearchParams(prev);
          next.delete('prefill');
          return next;
        }, { replace: true });
      };

      try {
        const data = JSON.parse(decodeURIComponent(prefill));
        setModalState({ open: true });
        clearPrefill();
        // We'll pass the prefill data through the modal's initial state
        setPrefillData(pickTrackerPrefill(data));
      } catch {
        clearPrefill();
      }
    }
  }, [isReadOnly, searchParams, setSearchParams]);

  const [prefillData, setPrefillData] = useState<Partial<ReturnType<typeof emptyForm>> | null>(null);

  // Filter-row summary: the Sent count and the reply rate (replied / sent),
  // the same values the former Sent and Replied stat tiles showed.
  const stats = useMemo(() => {
    const sent = applications.filter(a => ['sent', 'followed_up'].includes(a.outreachStatus)).length;
    const replied = applications.filter(a => a.outreachStatus === 'replied').length;
    return { sent, replyRate: sent ? Math.round((replied / sent) * 100) : 0 };
  }, [applications]);

  // Chip counts — each uses the same predicate as the filter it labels (see the
  // `filtered` memo below). Counted over the full set, not the search results.
  const filterCounts = useMemo(() => {
    const count = (fn: (a: Application) => boolean) => applications.filter(fn).length;
    return {
      all: applications.length,
      worth: count(a => calculateOutreachScore(a).worth),
      follow_up: count(a => getFollowUpDue(a) !== null),
      awaiting: count(isAwaitingResponse),
      completed: count(a => a.outreachStatus === 'replied' || a.outreachStatus === 'no_response' || a.outreachStatus === 'skipped'),
      rejected: count(a => a.applicationStatus === 'rejected'),
    } as Record<Filter, number>;
  }, [applications]);

  // Follow-up reminders
  const followUps = useMemo(() => {
    return applications
      .map(app => ({ app, due: getFollowUpDue(app) }))
      .filter((x): x is { app: Application; due: NonNullable<ReturnType<typeof getFollowUpDue>> } => x.due !== null)
      .sort((a, b) => a.due.daysUntil - b.due.daysUntil);
  }, [applications]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [currentPage]);

  // Filter
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return applications.filter(app => {
      if (!matchesSearch(app, q)) return false;
      if (filter === 'worth') return calculateOutreachScore(app).worth;
      if (filter === 'follow_up') return getFollowUpDue(app) !== null;
      if (filter === 'awaiting') return isAwaitingResponse(app);
      if (filter === 'completed') return app.outreachStatus === 'replied' || app.outreachStatus === 'no_response' || app.outreachStatus === 'skipped';
      if (filter === 'rejected') return app.applicationStatus === 'rejected';
      return true;
    });
  }, [applications, filter, search]);

  // Outreach view: the search box applies, but not the filter tabs or sort —
  // those controls are hidden there and the queue owns its own membership and
  // ranking (see OutreachQueue).
  const outreachApps = useMemo(() => {
    const q = search.toLowerCase().trim();
    return q ? applications.filter(app => matchesSearch(app, q)) : applications;
  }, [applications, search]);

  // Sort
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sort === 'dateApplied') return new Date(b.dateApplied).getTime() - new Date(a.dateApplied).getTime();
      if (sort === 'matchPercentage') return b.skillMatch.matchPercentage - a.skillMatch.matchPercentage;
      return calculateOutreachScore(b).score - calculateOutreachScore(a).score;
    });
  }, [filtered, sort]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sorted.length / ITEMS_PER_PAGE));
  const pageInView = Math.min(currentPage, totalPages);
  const paginatedItems = sorted.slice((pageInView - 1) * ITEMS_PER_PAGE, pageInView * ITEMS_PER_PAGE);

  useEffect(() => {
    if (isLoading) return;
    if (currentPage > totalPages) {
      goToPage(totalPages, { replace: true });
    }
  }, [currentPage, goToPage, isLoading, totalPages]);

  function handleSave(data: ReturnType<typeof emptyForm>) {
    if (modalState.editId) {
      // Optimistic update — close modal immediately, API call runs in background
      updateApplication(modalState.editId, data);
    } else {
      // Duplicate detection: check by company name + role title
      const duplicate = applications.find(
        a => a.companyName.toLowerCase().trim() === data.companyName.toLowerCase().trim()
          && a.roleTitle.toLowerCase().trim() === data.roleTitle.toLowerCase().trim()
      );
      if (duplicate) {
        // Ask on top of the Add modal, which stays mounted: Cancel returns to
        // the form untouched, Add anyway finishes the save.
        setPendingDuplicate({
          data,
          message: `You already have an application for "${duplicate.roleTitle}" at "${duplicate.companyName}" (applied ${formatDate(duplicate.dateApplied)}). Add anyway?`,
        });
        return;
      }
      addApplication(data);
    }
    setModalState({ open: false });
    setPrefillData(null);
  }

  function getModalInitial(): ReturnType<typeof emptyForm> & { id?: string } {
    if (modalState.editId) {
      const app = applications.find(a => a.id === modalState.editId);
      if (app) {
        const { id, createdAt, updatedAt, outreachWorth, ...rest } = app;
        void createdAt;
        void updatedAt;
        void outreachWorth;
        return { ...rest, id };
      }
    }
    if (prefillData) {
      return { ...emptyForm(), ...prefillData };
    }
    return emptyForm();
  }

  // Bulk selection helpers
  const allPageIds = paginatedItems.map(a => a.id);
  const allPageSelected = allPageIds.length > 0 && allPageIds.every(id => selectedIds.has(id));
  const someSelected = selectedIds.size > 0;
  const selectedOnPage = allPageIds.filter(id => selectedIds.has(id)).length;
  const selectedOnOtherPages = selectedIds.size - selectedOnPage;
  const isMultiPage = selectedOnOtherPages > 0;

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allPageSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        allPageIds.forEach(id => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        allPageIds.forEach(id => next.add(id));
        return next;
      });
    }
  }

  function handleBulkDelete() {
    selectedIds.forEach(id => deleteApplication(id));
    setSelectedIds(new Set());
    setExpandedId(null);
    setConfirmBulkDelete(false);
  }

  function handleExportSelected() {
    const apps = applications.filter(a => selectedIds.has(a.id));
    exportToCsv(apps, `applications-selected-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  function handleExportAll() {
    exportToCsv(sorted, `applications-${filter}-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'worth', label: 'Worth Outreach' },
    { key: 'follow_up', label: 'Needs Follow-up' },
    { key: 'awaiting', label: 'Awaiting Response' },
    { key: 'completed', label: 'Completed' },
    { key: 'rejected', label: 'Rejected' },
  ];

  return (
    <div className="page-container tracker-page">
      <div className="tracker-header animate-in">
          <div>
            <h1>Outreach Tracker</h1>
            <p>Track applications and manage cold outreach</p>
          </div>
          <button
            className="tracker-btn tracker-btn--brand tracker-btn--md"
            title={isReadOnly ? 'Sign up for full access' : undefined}
            onClick={() => {
              if (isReadOnly) {
                setSignupPrompt({
                  title: 'Add an Application',
                  body: 'Create a free account to save applications, track progress, and manage your outreach workflow.',
                });
                return;
              }
              setPrefillData(null);
              setModalState({ open: true });
            }}
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
            Add Application
          </button>
      </div>

      {signupPrompt && (
        <SignupPromptModal
          onClose={() => setSignupPrompt(null)}
          title={signupPrompt.title}
          body={signupPrompt.body}
        />
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="tracker-demo-banner animate-in" style={{ animationDelay: '0.05s' }}>
          Loading applications…
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="tracker-demo-banner tracker-demo-banner--error animate-in" style={{ animationDelay: '0.05s' }}>
          {error}
        </div>
      )}

      {/* Follow-up reminders */}
      {followUps.length > 0 && (
        <section className="tracker-banner animate-in" style={{ animationDelay: '0.08s' }} aria-label="Follow-up reminders">
          <span className="tracker-banner__title">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
              <path d="M8 4.5V8.5L10.5 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            Follow-up reminders
          </span>
          {followUps.filter(({ due }) => due.overdue || due.daysUntil === 0).map(({ app, due }) => (
            <span key={app.id} className="tracker-banner__entry">
              <span className="tracker-banner__item tracker-dotlist">
                <span>{app.companyName} ({app.contact?.name || 'No contact'})</span>
                <span className={due.overdue ? 'tracker-banner__due--overdue' : 'tracker-banner__due--today'}>{due.label}</span>
              </span>
              {!isReadOnly && (
                <span className="tracker-banner__actions">
                  <button className="tracker-banner__action" title="Mark follow-up sent" onClick={() => { const t = new Date(); const fd = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`; updateApplication(app.id, { followUpSent: true, outreachStatus: 'followed_up', followUpDate: fd }); }}>Sent</button>
                  <button className="tracker-banner__action" title="Skip follow-up" onClick={() => updateApplication(app.id, { outreachStatus: 'skipped' })}>Skip</button>
                </span>
              )}
            </span>
          ))}
          {followUps.some(({ due }) => !due.overdue && due.daysUntil > 0) && (
            <>
              {followUps.some(({ due }) => due.overdue || due.daysUntil === 0) && <hr className="tracker-banner__divider" />}
              <div className="tracker-banner__list">
                {(bannerExpanded ? followUps : followUps.slice(0, 5)).filter(({ due }) => !due.overdue && due.daysUntil > 0).map(({ app, due }) => (
                  <span key={app.id} className="tracker-banner__item tracker-dotlist">
                    <span>{app.companyName} ({app.contact?.name || 'No contact'})</span>
                    <span>{due.label}</span>
                  </span>
                ))}
              </div>
              {followUps.filter(({ due }) => !due.overdue && due.daysUntil > 0).length > 5 && (
                <button className="tracker-banner__overflow" onClick={() => setBannerExpanded(!bannerExpanded)}>
                  {bannerExpanded ? 'Show less' : `+${followUps.filter(({ due }) => !due.overdue && due.daysUntil > 0).length - 5} more`}
                </button>
              )}
            </>
          )}
        </section>
      )}

      {/* Filter tabs, sort, and CSV govern the list/board dataset. The outreach
          queue deliberately ignores them (it owns its membership and ranking),
          so they are hidden there instead of rendering as dead controls. The
          sent / reply-rate summary covers every application and stays. */}
      <div className="tracker-filterbar animate-in" style={{ animationDelay: '0.12s' }}>
        {view !== 'outreach' && (
          <div className="tracker-filters">
            {filters.map(f => (
              <button
                key={f.key}
                className={`tracker-filter ${filter === f.key ? 'tracker-filter--active' : ''}`}
                onClick={() => handleFilterChange(f.key)}
              >
                {f.label}
                <span className="tracker-filter__count">{filterCounts[f.key]}</span>
              </button>
            ))}
          </div>
        )}
        <span className="tracker-rate">
          <b>{stats.sent}</b> sent · <b>{stats.replyRate}%</b> reply rate
        </span>
      </div>

      {/* Controls */}
      <div className="tracker-controls animate-in" style={{ animationDelay: '0.14s' }}>
          <div className="tracker-view-toggle">
            <button
              className={`tracker-view-toggle__btn${view === 'list' ? ' tracker-view-toggle__btn--active' : ''}`}
              onClick={() => handleSetView('list')}
              title="List view"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 3.5h10M2 7h10M2 10.5h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
              List
            </button>
            <button
              className={`tracker-view-toggle__btn${view === 'board' ? ' tracker-view-toggle__btn--active' : ''}`}
              onClick={() => handleSetView('board')}
              title="Board view"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <rect x="1.5" y="2" width="3" height="10" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
                <rect x="5.5" y="2" width="3" height="7" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
                <rect x="9.5" y="2" width="3" height="5" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
              </svg>
              Board
            </button>
            <button
              className={`tracker-view-toggle__btn${view === 'outreach' ? ' tracker-view-toggle__btn--active' : ''}`}
              onClick={() => handleSetView('outreach')}
              title="Outreach view"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <rect x="1.5" y="3" width="11" height="8" rx="1" stroke="currentColor" strokeWidth="1.2" />
                <path d="M2 4l5 3.5L12 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Outreach
            </button>
          </div>
          <div className="tracker-search-wrap">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.4" />
              <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <input
              className="tracker-search"
              type="text"
              placeholder="Search company or role..."
              value={search}
              onChange={e => handleSearchChange(e.target.value)}
            />
          </div>
          {view !== 'outreach' && (
            <div className="tracker-controls__right">
              <select className="tracker-sort" aria-label="Sort applications" value={sort} onChange={e => setSort(e.target.value as SortKey)}>
                <option value="dateApplied">Date Applied</option>
                <option value="matchPercentage">Match Score</option>
                <option value="outreachScore">Worth Score</option>
              </select>
              {sorted.length > 0 && (
                <button className="tracker-export-btn" onClick={handleExportAll} title={`Export ${sorted.length} ${filter === 'all' ? '' : filter + ' '}applications as CSV`}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M8 2v8M5 7l3 3 3-3M3 13h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  CSV
                </button>
              )}
            </div>
          )}
      </div>

      {/* Bulk action bar */}
      {someSelected && (
        <div className="tracker-bulk-bar animate-in">
          <label className="tracker-bulk-bar__select-all">
            <input className="tracker-check" type="checkbox" checked={allPageSelected} onChange={toggleSelectAll} />
            {allPageSelected ? 'Deselect page' : 'Select page'}
          </label>
          <span className="tracker-bulk-bar__sep">·</span>
          <div className="tracker-bulk-bar__info">
            <span className="tracker-bulk-bar__count">
              {selectedIds.size} selected{isMultiPage ? ' across pages' : ''}
            </span>
            {isMultiPage && (
              <span className="tracker-bulk-bar__breakdown">
                {selectedOnPage} on this page · +{selectedOnOtherPages} from other pages
              </span>
            )}
            <button className="tracker-bulk-bar__clear" onClick={() => setSelectedIds(new Set())}>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              Clear
            </button>
          </div>
          <div className="tracker-bulk-bar__actions">
            <button className="tracker-bulk-bar__export" onClick={handleExportSelected}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 9v2.5a1 1 0 001 1h8a1 1 0 001-1V9M4.5 6L7 8.5 9.5 6M7 2v6.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Export CSV
            </button>
            {!isReadOnly && (
              <button className="tracker-bulk-bar__delete" onClick={() => setConfirmBulkDelete(true)}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2.5 4h9M5 4V2.5h4V4M3.5 4v7.5a1 1 0 001 1h5a1 1 0 001-1V4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Delete ({selectedIds.size})
              </button>
            )}
          </div>
        </div>
      )}

      {/* Application List / Board / Outreach */}
      {view === 'outreach' ? (
        <OutreachQueue
          applications={outreachApps}
          isSearching={search.trim().length > 0}
          isReadOnly={isReadOnly}
          updateApplication={updateApplication}
          onEdit={(id) => setModalState({ open: true, editId: id })}
        />
      ) : sorted.length === 0 ? (
        <div className="tracker-empty animate-in">
          {/* Mascot only for a truly empty tracker. A filter with no matches is a
              search miss, not first use — keep the plain icon so it reads as a
              prompt to change the filter. */}
          {filter === 'all' ? (
            <div className="tracker-empty__graphic tracker-empty__graphic--mascot" aria-hidden="true">
              <Mascot state="idle" size={96} />
            </div>
          ) : (
            <svg className="tracker-empty__graphic" width="64" height="64" viewBox="0 0 64 64" fill="none" aria-hidden="true">
              <rect x="12" y="8" width="40" height="48" rx="6" stroke="var(--border-light)" strokeWidth="2" />
              <path d="M22 22h20M22 30h14M22 38h17" stroke="var(--border-light)" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          )}
          <h2>{filter === 'all' ? 'No applications yet' : 'No matching applications'}</h2>
          <p className="text-secondary">
            {filter === 'all' ? 'Add your first application to get started' : 'Try a different filter'}
          </p>
        </div>
      ) : view === 'board' ? (
        <KanbanView
          applications={sorted}
          isReadOnly={isReadOnly}
          onUpdateStatus={(id, status) => {
            updateApplication(id, { applicationStatus: status });
            showToast(`Moved to ${APP_STATUS_LABELS[status]}`);
            flashCard(id);
          }}
          onCardClick={(id) => setModalState({ open: true, editId: id })}
        />
      ) : (
        <>
          <div className="tracker-list">
            {paginatedItems.map(app => {
              const scoring = calculateOutreachScore(app);
              const followUp = getFollowUpDue(app);
              const isExpanded = expandedId === app.id;
              const safeJobPostingUrl = safeHttpUrl(app.jobPostingUrl);

              return (
                <div
                  key={app.id}
                  className={`tracker-card animate-in${flashId === app.id ? ' tracker-card--flash' : ''}`}
                >
                  <div
                    className="tracker-card__row"
                    role="button"
                    tabIndex={0}
                    aria-expanded={isExpanded}
                    onClick={() => setExpandedId(isExpanded ? null : app.id)}
                    onKeyDown={e => {
                      // Only toggle for keys pressed on the row itself — the
                      // checkbox, links and quick actions inside handle their own.
                      if (e.target !== e.currentTarget) return;
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setExpandedId(isExpanded ? null : app.id);
                      }
                    }}
                  >
                    <label className="tracker-card__checkbox" onClick={e => e.stopPropagation()}>
                      <input className="tracker-check" type="checkbox" title="Select for export" checked={selectedIds.has(app.id)} onChange={() => toggleSelect(app.id)} />
                    </label>
                    <div className="tracker-card__main">
                      <div className="tracker-card__title">
                        <span className="tracker-card__company">{app.companyName}</span>
                        {safeJobPostingUrl && (
                          <a className="tracker-card__link" href={safeJobPostingUrl} target="_blank" rel="noopener noreferrer" title="Open job posting" onClick={e => e.stopPropagation()}>
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                              <path d="M4.5 2H2.5C1.95 2 1.5 2.45 1.5 3v6.5c0 .55.45 1 1 1H9c.55 0 1-.45 1-1V7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                              <path d="M7 1.5h3.5V5M6 6l4.5-4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </a>
                        )}
                        <span className="tracker-card__role">{app.roleTitle}</span>
                      </div>
                      <div className="tracker-card__meta tracker-dotlist">
                        <span className="tracker-card__meta-size">{app.companySize}</span>
                        <span>Applied {formatDate(app.dateApplied)}</span>
                        {/* Relative to the applied date shown alongside, not to
                            now — the value is frozen when the record is created
                            and never re-derived. */}
                        {app.postingAgeWeeks != null && <span>Posted {postingAgeLabel(app.postingAgeWeeks)} earlier</span>}
                      </div>
                      {app.contact && (
                        <div className="tracker-card__meta tracker-dotlist">
                          <span>{app.contact.name}{app.contact.role && `, ${app.contact.role}`}</span>
                          {app.contact.email && <span>{app.contact.email}</span>}
                        </div>
                      )}
                    </div>
                    <div className="tracker-card__status">
                      <div className="tracker-dotlist">
                        <span className="tracker-card__score">
                          <b>{app.skillMatch.matchPercentage}% match</b>
                        </span>
                        <span>
                          <b className="tracker-card__score">{scoring.score}/100</b>
                          {' '}{scoring.worth ? 'Worth outreach' : 'Low priority'}
                        </span>
                      </div>
                      <div className="tracker-dotlist">
                        <span className="tracker-card__stage" style={{ color: STAGE_COLOR[app.applicationStatus] }}>
                          <i className="tracker-card__stage-dot" aria-hidden="true" />
                          {APP_STATUS_LABELS[app.applicationStatus]}
                        </span>
                        <span>{outreachText(app)}</span>
                      </div>
                      {app.response && (
                        <span>Reply: {app.response.type === 'no_response' ? 'no response' : app.response.type}</span>
                      )}
                      {followUp && (
                        <span className={followUp.overdue ? 'tracker-card__overdue' : undefined}>
                          Follow-up {followUp.label.toLowerCase()}
                        </span>
                      )}
                    </div>
                    <div className="tracker-card__actions">
                      {!isReadOnly && (() => {
                        const { primary, secondary } = getQuickActions(app);
                        const isRejected = app.applicationStatus === 'rejected';
                        return (
                          <QuickActionButtons
                            primary={primary}
                            secondary={secondary}
                            isRejected={isRejected}
                            onAction={(updates, label) => {
                              updateApplication(app.id, updates);
                              showToast(`${app.companyName}: ${label}`);
                              flashCard(app.id);
                            }}
                            onEdit={() => setModalState({ open: true, editId: app.id })}
                            onDelete={() => setConfirmDelete({ open: true, appId: app.id, appTitle: app.roleTitle, appCompany: app.companyName })}
                            onToggleReject={() => {
                              // No stage history to restore, so reopening lands on
                              // Applied; the pipeline stepper corrects it in one click.
                              const next = isRejected ? 'applied' : 'rejected';
                              updateApplication(app.id, { applicationStatus: next });
                              showToast(`${app.companyName}: ${isRejected ? 'Reopened' : 'Marked as rejected'}`);
                              flashCard(app.id);
                            }}
                          />
                        );
                      })()}
                      <button
                        className="tracker-btn tracker-btn--icon"
                        title="Show details"
                        onClick={e => { e.stopPropagation(); setExpandedId(isExpanded ? null : app.id); }}
                      >
                        <span className={`tracker-card__chevron${isExpanded ? ' tracker-card__chevron--open' : ''}`}>
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </span>
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <DetailView
                      app={app}
                      isReadOnly={isReadOnly}
                      onEdit={() => setModalState({ open: true, editId: app.id })}
                      onDelete={() => setConfirmDelete({ open: true, appId: app.id, appTitle: app.roleTitle, appCompany: app.companyName })}
                      onUpdate={(id, updates) => updateApplication(id, updates)}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="pagination">
              <button
                className="pagination__btn"
                disabled={pageInView === 1}
                onClick={() => goToPage(pageInView - 1)}
              >
                Previous
              </button>
              <div className="pagination__pages">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                  <button
                    key={page}
                    className={`pagination__page ${page === pageInView ? 'pagination__page--active' : ''}`}
                    onClick={() => goToPage(page)}
                  >
                    {page}
                  </button>
                ))}
              </div>
              <button
                className="pagination__btn"
                disabled={pageInView === totalPages}
                onClick={() => goToPage(pageInView + 1)}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {/* Modal */}
      {modalState.open && (
        <ApplicationModal
          initial={getModalInitial()}
          isEdit={!!modalState.editId}
          onSave={handleSave}
          onClose={() => { setModalState({ open: false }); setPrefillData(null); }}
          suspended={pendingDuplicate !== null}
        />
      )}

      {pendingDuplicate && (
        <ConfirmModal
          title="Duplicate application?"
          body={pendingDuplicate.message}
          confirmLabel="Add anyway"
          variant="warning"
          onConfirm={() => {
            addApplication(pendingDuplicate.data);
            setPendingDuplicate(null);
            setModalState({ open: false });
            setPrefillData(null);
          }}
          onCancel={() => setPendingDuplicate(null)}
        />
      )}

      {confirmDelete.open && (
        <ConfirmModal
          title="Delete application?"
          body={<>This will permanently delete<br /><strong>{confirmDelete.appTitle} @ {confirmDelete.appCompany}</strong></>}
          warning="This action cannot be undone."
          confirmLabel="Delete"
          variant="destructive"
          onConfirm={() => { deleteApplication(confirmDelete.appId); setExpandedId(null); setConfirmDelete({ open: false, appId: '', appTitle: '', appCompany: '' }); }}
          onCancel={() => setConfirmDelete({ open: false, appId: '', appTitle: '', appCompany: '' })}
        />
      )}

      {confirmBulkDelete && (() => {
        const selectedApps = applications.filter(a => selectedIds.has(a.id));
        const count = selectedApps.length;
        const acrossPages = selectedOnOtherPages > 0;
        return (
          <ConfirmModal
            title={`Delete ${count} application${count === 1 ? '' : 's'}${acrossPages ? ' (across multiple pages)' : ''}?`}
            body={<BulkDeleteBody apps={selectedApps} />}
            warning={acrossPages
              ? <><strong>This includes selections from other pages.</strong><br />This action cannot be undone.</>
              : "This action cannot be undone."}
            confirmLabel={`Delete ${count}`}
            variant="destructive"
            onConfirm={handleBulkDelete}
            onCancel={() => setConfirmBulkDelete(false)}
          />
        );
      })()}

      {/* Toast */}
      {toast && (
        <div key={toast.key} className="tracker-toast animate-toast">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" />
            <path d="M4.5 7l2 2 3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {toast.message}
        </div>
      )}
    </div>
  );
}
