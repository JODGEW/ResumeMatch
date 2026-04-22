import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApplications } from '../hooks/useApplications';
import type { Application } from '../types/tracker';
import { calculateOutreachScore } from '../types/tracker';
import { ConfirmModal } from '../components/ConfirmModal';
import { KanbanView } from '../components/KanbanView';
import { SignupPromptModal } from '../components/SignupPromptModal';
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

const APP_STATUS_LABELS: Record<Application['applicationStatus'], string> = {
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

function getPageFromSearchParams(searchParams: URLSearchParams) {
  const page = Number(searchParams.get('page'));
  return Number.isInteger(page) && page > 0 ? page : 1;
}

// Parse "YYYY-MM-DD" as local date (not UTC) to avoid off-by-one timezone issues
function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function getFollowUpDue(app: Application): { label: string; overdue: boolean; daysUntil: number } | null {
  if (!app.outreachDate || app.followUpSent || app.outreachStatus === 'replied' || app.outreachStatus === 'no_response' || app.outreachStatus === 'skipped' || app.applicationStatus === 'rejected') return null;
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
    case 'interviewing': return age >= 10 ? `No update in ${age}d — follow up?` : null;
    default: return null;
  }
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
  variant: 'accent' | 'success' | 'danger' | 'warning';
  updates: Partial<Application>;
  hint?: string;  // "next step" guidance shown on the primary button
}

interface QuickActionSet {
  primary: QuickAction | null;
  secondary: QuickAction | null;
  overflow: QuickAction[];
}

function getQuickActions(app: Application): QuickActionSet {
  const appStatus = app.applicationStatus;
  const outStatus = app.outreachStatus;
  const today = new Date().toISOString().slice(0, 10);
  const followUpDateVal = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const followUp = getFollowUpDue(app);

  let primary: QuickAction | null = null;
  let secondary: QuickAction | null = null;
  const overflow: QuickAction[] = [];

  // Terminal states — no actions
  if (appStatus === 'rejected' || appStatus === 'offer') {
    return { primary, secondary, overflow };
  }

  // ── Determine primary + secondary based on combined state ──

  // Outreach: not yet sent → primary is Send Outreach (clean single CTA)
  if (outStatus === 'not_started' || outStatus === 'researching' || outStatus === 'drafted') {
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
      variant: followUp?.overdue ? 'danger' : 'warning',
      updates: {
        outreachStatus: 'followed_up',
        followUpSent: true,
        followUpDate: app.followUpDate || today,
      },
    };
    secondary = { label: 'Replied', variant: 'success', updates: { outreachStatus: 'replied' } };
  }

  // Outreach: followed up → primary is Replied
  else if (outStatus === 'followed_up') {
    primary = { label: 'Replied', variant: 'success', updates: { outreachStatus: 'replied' } };
  }

  // Outreach: replied/no_response/skipped → focus on app pipeline
  else {
    if (appStatus === 'applied' || appStatus === 'screening') {
      primary = { label: 'Interviewing', variant: 'accent', updates: { applicationStatus: 'interviewing' } };
    } else if (appStatus === 'interviewing') {
      primary = { label: 'Offer', variant: 'success', updates: { applicationStatus: 'offer' } };
    }
  }

  // Reject always goes to overflow (destructive, less common)
  overflow.push({
    label: 'Reject',
    variant: 'danger',
    updates: { applicationStatus: 'rejected' },
  });

  return { primary, secondary, overflow };
}

function getScoreColor(score: number) {
  if (score >= 86) return 'var(--score-high)';
  if (score >= 76) return 'var(--score-good)';
  if (score >= 61) return 'var(--score-mid)';
  if (score >= 41) return 'var(--score-low)';
  return 'var(--score-poor)';
}

function getScoreBackground(score: number) {
  if (score >= 86) return 'var(--score-high-dim)';
  if (score >= 76) return 'var(--score-good-dim)';
  if (score >= 61) return 'var(--score-mid-dim)';
  if (score >= 41) return 'var(--score-low-dim)';
  return 'var(--score-poor-dim)';
}

function formatDate(iso: string) {
  return parseLocalDate(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Tag Input ──────────────────────────────────────────
function TagInput({ tags, onChange, placeholder }: { tags: string[]; onChange: (t: string[]) => void; placeholder?: string }) {
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
        className="tracker-tags__input"
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={tags.length ? '' : placeholder}
      />
    </div>
  );
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
  initial, onSave, onClose, isEdit
}: {
  initial: ReturnType<typeof emptyForm> & { id?: string };
  onSave: (data: ReturnType<typeof emptyForm>) => void;
  onClose: () => void;
  isEdit: boolean;
}) {
  const [form, setForm] = useState(initial);
  const [showDiscard, setShowDiscard] = useState(false);
  const isDirty = JSON.stringify(form) !== JSON.stringify(initial);

  function set<K extends keyof typeof form>(key: K, val: (typeof form)[K]) {
    setForm(prev => ({ ...prev, [key]: val }));
  }

  function handleOverlayClick() {
    if (!isDirty) { onClose(); return; }
    setShowDiscard(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.companyName.trim() || !form.roleTitle.trim()) return;

    const data = { ...form };

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
    <div className="tracker-modal-overlay" onClick={handleOverlayClick}>
      <div className="tracker-modal" onClick={e => e.stopPropagation()}>
        <div className="tracker-modal__header">
          <h2>{isEdit ? 'Edit Application' : 'Add Application'}</h2>
          <button className="tracker-modal__close" onClick={handleOverlayClick}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Job Info */}
          <div className="tracker-modal__section">
            <div className="tracker-modal__section-title">Job Info</div>
            <div className="tracker-modal__row">
              <div className="tracker-modal__field">
                <label className="tracker-modal__label">Company Name *</label>
                <input className="tracker-modal__input" value={form.companyName} onChange={e => set('companyName', e.target.value)} required />
              </div>
              <div className="tracker-modal__field">
                <label className="tracker-modal__label">Role Title *</label>
                <input className="tracker-modal__input" value={form.roleTitle} onChange={e => set('roleTitle', e.target.value)} required />
              </div>
            </div>
            <div className="tracker-modal__row">
              <div className="tracker-modal__field">
                <label className="tracker-modal__label">Job Posting URL</label>
                <input className="tracker-modal__input" value={form.jobPostingUrl || ''} onChange={e => set('jobPostingUrl', e.target.value)} placeholder="https://..." />
              </div>
              <div className="tracker-modal__field">
                <label className="tracker-modal__label">Date Applied</label>
                <input className="tracker-modal__input" type="date" value={form.dateApplied} onChange={e => set('dateApplied', e.target.value)} />
              </div>
            </div>
            <div className="tracker-modal__row">
              <div className="tracker-modal__field">
                <label className="tracker-modal__label">Resume Version</label>
                <select className="tracker-modal__select" value={form.resumeVersion} onChange={e => set('resumeVersion', e.target.value as Application['resumeVersion'])}>
                  <option value="fullstack">Full-Stack</option>
                  <option value="frontend">Frontend</option>
                  <option value="cloud_devops">Cloud/DevOps</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div className="tracker-modal__field">
                <label className="tracker-modal__label">Application Status</label>
                <select className="tracker-modal__select" value={form.applicationStatus} onChange={e => { set('applicationStatus', e.target.value as Application['applicationStatus']); set('statusChangedAt', new Date().toISOString()); }}>
                  {Object.entries(APP_STATUS_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Match Assessment */}
          <div className="tracker-modal__section">
            <div className="tracker-modal__section-title">Match Assessment</div>
            <div className="tracker-modal__field">
              <label className="tracker-modal__label">Matched Skills</label>
              <TagInput tags={form.skillMatch.matchedSkills} onChange={t => set('skillMatch', { ...form.skillMatch, matchedSkills: t })} placeholder="Type skill and press Enter" />
            </div>
            <div className="tracker-modal__field">
              <label className="tracker-modal__label">Missing Skills</label>
              <TagInput tags={form.skillMatch.missingSkills} onChange={t => set('skillMatch', { ...form.skillMatch, missingSkills: t })} placeholder="Type skill and press Enter" />
            </div>
            <div className="tracker-modal__row">
              <div className="tracker-modal__field">
                <label className="tracker-modal__label">Match % (auto-calculated if 0)</label>
                <input className="tracker-modal__input" type="number" min="0" max="100" value={form.skillMatch.matchPercentage} onChange={e => set('skillMatch', { ...form.skillMatch, matchPercentage: Number(e.target.value) })} />
              </div>
            </div>
          </div>

          {/* Company Context */}
          <div className="tracker-modal__section">
            <div className="tracker-modal__section-title">Company Context</div>
            <div className="tracker-modal__row">
              <div className="tracker-modal__field">
                <label className="tracker-modal__label">Company Size</label>
                <select className="tracker-modal__select" value={form.companySize} onChange={e => set('companySize', e.target.value as Application['companySize'])}>
                  <option value="startup">Startup</option>
                  <option value="midsize">Mid-size</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>
              <div className="tracker-modal__field">
                <label className="tracker-modal__label">Posting Age</label>
                <select className="tracker-modal__select" value={form.postingAgeWeeks ?? ''} onChange={e => set('postingAgeWeeks', e.target.value !== '' ? Number(e.target.value) : undefined)}>
                  <option value="">Unknown</option>
                  <option value="0">&lt; 1 week</option>
                  <option value="1">1-2 weeks</option>
                  <option value="2">2-4 weeks</option>
                  <option value="4">1+ month</option>
                </select>
              </div>
              <div className="tracker-modal__field">
                <label className="tracker-modal__label">Seniority Fit</label>
                <select className="tracker-modal__select" value={form.seniorityFit ?? ''} onChange={e => set('seniorityFit', e.target.value ? e.target.value as Application['seniorityFit'] : undefined)}>
                  <option value="">Unknown</option>
                  <option value="entry">Entry/Junior (0-2 yrs)</option>
                  <option value="mid">Mid (2-4 yrs)</option>
                  <option value="senior">Senior (5+ yrs)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Contact Info */}
          <div className="tracker-modal__section">
            <div className="tracker-modal__section-title">Contact Info</div>
            <div className="tracker-modal__row">
              <div className="tracker-modal__field">
                <label className="tracker-modal__label">Contact Name</label>
                <input className="tracker-modal__input" value={form.contact?.name || ''} onChange={e => set('contact', { name: e.target.value, role: form.contact?.role || '', source: form.contact?.source || '', email: form.contact?.email, linkedinUrl: form.contact?.linkedinUrl })} />
              </div>
              <div className="tracker-modal__field">
                <label className="tracker-modal__label">Contact Role</label>
                <input className="tracker-modal__input" value={form.contact?.role || ''} onChange={e => set('contact', { ...form.contact!, role: e.target.value })} />
              </div>
            </div>
            <div className="tracker-modal__row">
              <div className="tracker-modal__field">
                <label className="tracker-modal__label">Email</label>
                <input className="tracker-modal__input" type="email" value={form.contact?.email || ''} onChange={e => set('contact', { ...form.contact!, email: e.target.value || undefined })} />
              </div>
              <div className="tracker-modal__field">
                <label className="tracker-modal__label">LinkedIn URL</label>
                <input className="tracker-modal__input" value={form.contact?.linkedinUrl || ''} onChange={e => set('contact', { ...form.contact!, linkedinUrl: e.target.value || undefined })} placeholder="https://linkedin.com/in/..." />
              </div>
            </div>
            <div className="tracker-modal__row">
              <div className="tracker-modal__field">
                <label className="tracker-modal__label">Source</label>
                <input className="tracker-modal__input" value={form.contact?.source || ''} onChange={e => set('contact', { ...form.contact!, source: e.target.value })} placeholder="e.g. Hunter.io, LinkedIn" />
              </div>
            </div>
          </div>

          {/* Outreach Status */}
          <div className="tracker-modal__section">
            <div className="tracker-modal__section-title">Outreach Status</div>
            <div className="tracker-modal__row">
              <div className="tracker-modal__field">
                <label className="tracker-modal__label">Status</label>
                <select className="tracker-modal__select" value={form.outreachStatus} onChange={e => {
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
                <label className="tracker-modal__label">Outreach Date</label>
                <input className="tracker-modal__input" type="date" value={form.outreachDate || ''} onChange={e => {
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
            </div>
            <div className="tracker-modal__row">
              <div className="tracker-modal__field">
                <label className="tracker-modal__label">Follow-up Due Date</label>
                <input className="tracker-modal__input" type="date" value={form.followUpDate || ''} onChange={e => set('followUpDate', e.target.value || undefined)} />
              </div>
              <div className="tracker-modal__field tracker-modal__field--checkbox">
                <label className="tracker-modal__checkbox-label">
                  <input type="checkbox" checked={form.followUpSent} onChange={e => set('followUpSent', e.target.checked)} />
                  Follow-up Sent
                </label>
              </div>
            </div>
          </div>

          {/* Response Tracking */}
          <div className="tracker-modal__section">
            <div className="tracker-modal__section-title">Response Tracking</div>
            <div className="tracker-modal__row">
              <div className="tracker-modal__field">
                <label className="tracker-modal__label">Response Date</label>
                <input className="tracker-modal__input" type="date" value={form.response?.date || ''} onChange={e => set('response', { date: e.target.value, type: form.response?.type || 'positive', notes: form.response?.notes || '', nextStep: form.response?.nextStep || '' })} />
              </div>
              <div className="tracker-modal__field">
                <label className="tracker-modal__label">Response Type</label>
                <select className="tracker-modal__select" value={form.response?.type || 'positive'} onChange={e => set('response', { date: form.response?.date || '', type: e.target.value as 'positive' | 'negative' | 'referral' | 'no_response', notes: form.response?.notes || '', nextStep: form.response?.nextStep || '' })}>
                  <option value="positive">Positive</option>
                  <option value="negative">Negative</option>
                  <option value="referral">Referral</option>
                  <option value="no_response">No Response</option>
                </select>
              </div>
            </div>
            <div className="tracker-modal__field">
              <label className="tracker-modal__label">Notes</label>
              <textarea className="tracker-modal__textarea" value={form.response?.notes || ''} onChange={e => set('response', { date: form.response?.date || '', type: form.response?.type || 'positive', notes: e.target.value, nextStep: form.response?.nextStep || '' })} placeholder="What did they say?" />
            </div>
            <div className="tracker-modal__field">
              <label className="tracker-modal__label">Next Step</label>
              <input className="tracker-modal__input" value={form.response?.nextStep || ''} onChange={e => set('response', { date: form.response?.date || '', type: form.response?.type || 'positive', notes: form.response?.notes || '', nextStep: e.target.value })} placeholder="e.g. Schedule interview, send portfolio" />
            </div>
          </div>

          {/* Notes */}
          <div className="tracker-modal__section">
            <div className="tracker-modal__section-title">Notes</div>
            <div className="tracker-modal__field">
              <textarea className="tracker-modal__textarea" value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Personal notes about this application..." />
            </div>
          </div>

          <div className="tracker-modal__footer">
            <button type="button" className="btn btn-ghost" onClick={handleOverlayClick}>Cancel</button>
            <button type="submit" className="btn btn-primary">{isEdit ? 'Save Changes' : 'Add Application'}</button>
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
function QuickActionButtons({ primary, secondary, overflow, onAction }: {
  primary: QuickAction | null;
  secondary: QuickAction | null;
  overflow: QuickAction[];
  onAction: (updates: Partial<Application>, label: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [menuOpen]);

  return (
    <span className="tracker-card__quick-actions" onClick={e => e.stopPropagation()}>
      {primary && (
        <button
          className={`tracker-quick-btn tracker-quick-btn--primary tracker-quick-btn--${primary.variant}`}
          onClick={() => onAction(primary.updates, primary.label)}
          title={primary.hint || primary.label}
        >
          {primary.label}
          {primary.hint && <span className="tracker-quick-btn__hint">{primary.hint}</span>}
        </button>
      )}
      {secondary && (
        <button
          className={`tracker-quick-btn tracker-quick-btn--secondary`}
          onClick={() => onAction(secondary.updates, secondary.label)}
          title={secondary.label}
        >
          {secondary.label}
        </button>
      )}
      {overflow.length > 0 && (
        <div className="tracker-quick-overflow" ref={menuRef}>
          <button
            className="tracker-quick-btn tracker-quick-btn--more"
            onClick={() => setMenuOpen(!menuOpen)}
            title="More actions"
          >
            ···
          </button>
          {menuOpen && (
            <div className="tracker-quick-overflow__menu">
              {overflow.map(a => (
                <button
                  key={a.label}
                  className={`tracker-quick-overflow__item tracker-quick-overflow__item--${a.variant}`}
                  onClick={() => { onAction(a.updates, a.label); setMenuOpen(false); }}
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </span>
  );
}

// ── Detail View (inline expand) ────────────────────────
function DetailView({ app, isReadOnly, onEdit, onDelete, onUpdate }: { app: Application; isReadOnly: boolean; onEdit: () => void; onDelete: () => void; onUpdate: (id: string, updates: Partial<Application>) => void }) {
  const scoring = calculateOutreachScore(app);
  const followUp = getFollowUpDue(app);

  const statusIndex = TIMELINE_STEPS.indexOf(app.outreachStatus);

  return (
    <div className="tracker-detail">
      {/* Job Posting URL */}
      {app.jobPostingUrl && (
        <div className="tracker-detail__section">
          <div className="tracker-detail__section-title">Job Posting</div>
          <a
            href={app.jobPostingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="tracker-detail__job-url"
          >
            {app.jobPostingUrl}
          </a>
        </div>
      )}

      {/* Details */}
      <div className="tracker-detail__section">
        <div className="tracker-detail__section-title">Details</div>
        <div className="tracker-detail__details-row">
          <span className="tracker-detail__detail-item">
            <span className="tracker-detail__detail-label">Resume</span>
            {app.resumeVersion === 'fullstack' ? 'Full-Stack' : app.resumeVersion === 'frontend' ? 'Frontend' : app.resumeVersion === 'cloud_devops' ? 'Cloud/DevOps' : 'Custom'}
          </span>
          {app.seniorityFit && (
            <span className="tracker-detail__detail-item">
              <span className="tracker-detail__detail-label">Seniority</span>
              {app.seniorityFit === 'entry' ? 'Entry/Junior' : app.seniorityFit === 'mid' ? 'Mid-level' : 'Senior'}
            </span>
          )}
        </div>
      </div>

      {/* Score Breakdown */}
      <div className="tracker-detail__section">
        <div className="tracker-detail__section-title">Outreach Score: {scoring.score}/100</div>
        <div className="tracker-detail__score-breakdown">
          {scoring.reasons.map((r, i) => (
            <div key={i} className="tracker-detail__score-row">
              <span className="tracker-detail__score-reason">{r}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Application Status */}
      <div className="tracker-detail__section">
        <div className="tracker-detail__section-title">Application Pipeline</div>
        <div className="tracker-detail__timeline">
          {(['not_applied', 'applied', 'screening', 'interviewing', 'offer'] as const).map((step, i) => {
            const steps = ['not_applied', 'applied', 'screening', 'interviewing', 'offer'] as const;
            const currentIdx = steps.indexOf(app.applicationStatus as typeof steps[number]);
            const isRejected = app.applicationStatus === 'rejected';
            const isActive = !isRejected && i <= currentIdx;
            const isCurrent = !isRejected && step === app.applicationStatus;
            const stageStart = app.applicationStatus === 'applied' ? app.dateApplied : (app.statusChangedAt || app.dateApplied);
            const stageAge = isCurrent ? Math.max(0, Math.round((Date.now() - new Date(stageStart).getTime()) / 86400000)) : null;
            const action = getAppStageAction(app, step, isCurrent);
            const canClick = !isReadOnly && !isCurrent && !isRejected;
            return (
              <span key={step}>
                {i > 0 && <span className="tracker-detail__timeline-arrow"> &rarr; </span>}
                <span className="tracker-detail__step-wrap">
                  <span
                    className={`tracker-detail__timeline-step ${isActive ? 'tracker-detail__timeline-step--active' : ''} ${action ? 'tracker-detail__timeline-step--action' : ''} ${canClick ? 'tracker-detail__timeline-step--clickable' : ''}`}
                    title={action || (canClick ? `Set status to ${APP_STATUS_LABELS[step]}` : undefined)}
                    onClick={canClick ? () => onUpdate(app.id, { applicationStatus: step }) : undefined}
                    role={canClick ? 'button' : undefined}
                  >
                    {APP_STATUS_LABELS[step]}{stageAge !== null && <span className="tracker-detail__stage-age"> ({stageAge}d)</span>}
                  </span>
                  {action && <span className="tracker-detail__action-hint">{action}</span>}
                </span>
              </span>
            );
          })}
          {app.applicationStatus === 'rejected' && (
            <>
              <span className="tracker-detail__timeline-arrow"> &rarr; </span>
              <span className="tracker-detail__timeline-step tracker-detail__timeline-step--rejected">
                Rejected
              </span>
            </>
          )}
        </div>
      </div>

      {/* Timeline */}
      <div className="tracker-detail__section">
        <div className="tracker-detail__section-title">Outreach Timeline</div>
        <div className="tracker-detail__timeline">
          {TIMELINE_STEPS.map((step, i) => {
            const isCurrent = i === statusIndex;
            const outreachAction = getOutreachStageAction(app, step, isCurrent, followUp);
            const canClick = !isReadOnly && !isCurrent;
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
              <span key={step}>
                {i > 0 && <span className="tracker-detail__timeline-arrow"> &rarr; </span>}
                <span className="tracker-detail__step-wrap">
                  <span
                    className={`tracker-detail__timeline-step ${i <= statusIndex ? 'tracker-detail__timeline-step--active' : ''} ${outreachAction ? 'tracker-detail__timeline-step--action' : ''} ${canClick ? 'tracker-detail__timeline-step--clickable' : ''}`}
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
                  {outreachAction && <span className="tracker-detail__action-hint">{outreachAction}</span>}
                </span>
              </span>
            );
          })}
        </div>
      </div>

      {/* Skills */}
      <div className="tracker-detail__section">
        <div className="tracker-detail__section-title">Skills</div>
        <div className="tracker-detail__skills">
          {app.skillMatch.matchedSkills.map(s => (
            <span key={s} className="tracker-detail__skill tracker-detail__skill--matched">{s}</span>
          ))}
          {app.skillMatch.missingSkills.map(s => (
            <span key={s} className="tracker-detail__skill tracker-detail__skill--missing">{s}</span>
          ))}
        </div>
      </div>

      {/* Contact */}
      {app.contact && (
        <div className="tracker-detail__section">
          <div className="tracker-detail__section-title">Contact</div>
          <div className="tracker-detail__contact">
            <span className="tracker-detail__contact-name">{app.contact.name}</span>
            <span className="tracker-detail__contact-role">{app.contact.role} &middot; {app.contact.source}</span>
            {app.contact.email && <span className="tracker-detail__contact-email">{app.contact.email}</span>}
            {app.contact.linkedinUrl && (
              <a className="tracker-detail__contact-linkedin" href={app.contact.linkedinUrl} target="_blank" rel="noopener noreferrer">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                LinkedIn
              </a>
            )}
          </div>
        </div>
      )}

      {/* Follow-up */}
      {followUp && (
        <div className="tracker-detail__section">
          <div className="tracker-detail__section-title">Follow-up</div>
          <span className={`tracker-card__followup ${followUp.overdue ? 'tracker-card__followup--overdue' : 'tracker-card__followup--upcoming'}`}>
            {followUp.label}
          </span>
        </div>
      )}

      {/* Response */}
      {app.response && (
        <div className="tracker-detail__section">
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
        <div className="tracker-detail__section">
          <div className="tracker-detail__section-title">Notes</div>
          <div className="tracker-detail__notes">{app.notes}</div>
        </div>
      )}

      {/* Actions */}
      {!isReadOnly && (
        <div className="tracker-detail__actions">
          <button className="btn btn-secondary" onClick={onEdit}>Edit</button>
          <button className="btn btn-ghost" style={{ color: 'var(--danger)' }} onClick={onDelete}>Delete</button>
        </div>
      )}
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
  const [view, setView] = useState<'list' | 'board'>(() => {
    const saved = localStorage.getItem('tracker_view');
    return saved === 'board' ? 'board' : 'list';
  });
  const handleSetView = (v: 'list' | 'board') => {
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
        setPrefillData(data);
      } catch {
        clearPrefill();
      }
    }
  }, [isReadOnly, searchParams, setSearchParams]);

  const [prefillData, setPrefillData] = useState<Partial<ReturnType<typeof emptyForm>> | null>(null);

  // Compute stats
  const stats = useMemo(() => {
    const total = applications.length;
    const worth = applications.filter(a => calculateOutreachScore(a).worth).length;
    const sent = applications.filter(a => ['sent', 'followed_up'].includes(a.outreachStatus)).length;
    const replied = applications.filter(a => a.outreachStatus === 'replied').length;
    const rejected = applications.filter(a => a.applicationStatus === 'rejected').length;
    return { total, worth, sent, replied, rejected };
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
      if (q && !app.companyName.toLowerCase().includes(q) && !app.roleTitle.toLowerCase().includes(q) && !(app.contact?.name || '').toLowerCase().includes(q)) return false;
      if (filter === 'worth') return calculateOutreachScore(app).worth;
      if (filter === 'follow_up') return getFollowUpDue(app) !== null;
      if (filter === 'awaiting') return app.outreachStatus === 'sent' || app.outreachStatus === 'followed_up';
      if (filter === 'completed') return app.outreachStatus === 'replied' || app.outreachStatus === 'no_response' || app.outreachStatus === 'skipped';
      if (filter === 'rejected') return app.applicationStatus === 'rejected';
      return true;
    });
  }, [applications, filter, search]);

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
        if (!window.confirm(
          `You already have an application for "${duplicate.roleTitle}" at "${duplicate.companyName}" (applied ${formatDate(duplicate.dateApplied)}). Add anyway?`
        )) {
          return;
        }
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
    <div className="page-container">
      <div className="page-header animate-in">
        <div className="tracker-header">
          <div>
            <h1>Outreach Tracker</h1>
            <p>Track applications and manage cold outreach</p>
          </div>
          <button
            className="btn btn-primary btn-create-action"
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
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Add Application
          </button>
        </div>
      </div>

      {/* Demo banner */}
      {isReadOnly && (
        <div className="tracker-demo-banner animate-in" style={{ animationDelay: '0.05s' }}>
          Demo mode — you're viewing sample data. Try bulk actions and CSV export!
        </div>
      )}

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
        <div className="tracker-banner animate-in" style={{ animationDelay: '0.08s' }}>
          <svg className="tracker-banner__icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="7" stroke="var(--accent)" strokeWidth="1.5" />
            <path d="M8 4.5V8.5L10.5 10" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <div className="tracker-banner__content">
            <span className="tracker-banner__title">Follow-up Reminders</span>
            {followUps.filter(({ due }) => due.overdue || due.daysUntil === 0).map(({ app, due }) => (
              <span
                key={app.id}
                className={`tracker-banner__item ${due.overdue ? 'tracker-banner__item--overdue' : 'tracker-banner__item--today'}`}
              >
                {app.companyName} ({app.contact?.name || 'No contact'}) — {due.label}
                {!isReadOnly && (
                  <span className="tracker-banner__actions">
                    <button className="tracker-banner__action" title="Mark follow-up sent" onClick={() => { const t = new Date(); const fd = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`; updateApplication(app.id, { followUpSent: true, outreachStatus: 'followed_up', followUpDate: fd }); }}>Sent</button>
                    <button className="tracker-banner__action tracker-banner__action--skip" title="Skip follow-up" onClick={() => updateApplication(app.id, { outreachStatus: 'skipped' })}>Skip</button>
                  </span>
                )}
              </span>
            ))}
            {followUps.some(({ due }) => !due.overdue && due.daysUntil > 0) && (
              <>
                {followUps.some(({ due }) => due.overdue || due.daysUntil === 0) && <hr className="tracker-banner__divider" />}
                <div className="tracker-banner__list">
                  {(bannerExpanded ? followUps : followUps.slice(0, 5)).filter(({ due }) => !due.overdue && due.daysUntil > 0).map(({ app, due }) => (
                    <span key={app.id} className="tracker-banner__item">
                      {app.companyName} ({app.contact?.name || 'No contact'}) — {due.label}
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
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="tracker-stats animate-in" style={{ animationDelay: '0.1s' }}>
        <div className="tracker-stat">
          <div className="tracker-stat__value">{stats.total}</div>
          <div className="tracker-stat__label">Total</div>
        </div>
        <div className="tracker-stat">
          <div className="tracker-stat__value">{stats.worth}</div>
          <div className="tracker-stat__label">Worth Outreach</div>
        </div>
        <div className="tracker-stat">
          <div className="tracker-stat__value">{stats.sent}</div>
          <div className="tracker-stat__label">Sent</div>
        </div>
        <div className="tracker-stat">
          <div className="tracker-stat__value">{stats.replied}</div>
          <div className="tracker-stat__label">Replied</div>
        </div>
        <div className="tracker-stat">
          <div className="tracker-stat__value">{stats.rejected}</div>
          <div className="tracker-stat__label">Rejected</div>
        </div>
      </div>

      {/* Controls */}
      <div className="tracker-controls animate-in" style={{ animationDelay: '0.12s' }}>
        <div className="tracker-filters">
          {filters.map(f => (
            <button
              key={f.key}
              className={`tracker-filter ${filter === f.key ? 'tracker-filter--active' : ''}`}
              onClick={() => handleFilterChange(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="tracker-controls__right">
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
          </div>
          <input
            className="tracker-search"
            type="text"
            placeholder="Search..."
            value={search}
            onChange={e => handleSearchChange(e.target.value)}
          />
          <select className="tracker-sort" value={sort} onChange={e => setSort(e.target.value as SortKey)}>
            <option value="dateApplied">Date Applied</option>
            <option value="matchPercentage">Match %</option>
            <option value="outreachScore">Outreach Score</option>
          </select>
          {sorted.length > 0 && (
            <button className="btn btn-ghost tracker-export-btn" onClick={handleExportAll} title={`Export ${sorted.length} ${filter === 'all' ? '' : filter + ' '}applications as CSV`}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 9v2.5a1 1 0 001 1h8a1 1 0 001-1V9M4.5 6L7 8.5 9.5 6M7 2v6.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              CSV
            </button>
          )}
        </div>
      </div>

      {/* Bulk action bar */}
      {someSelected && (
        <div className="tracker-bulk-bar animate-in">
          <label className="tracker-bulk-bar__select-all">
            <input type="checkbox" checked={allPageSelected} onChange={toggleSelectAll} />
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
              Export Selected
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

      {/* Application List / Board */}
      {sorted.length === 0 ? (
        <div className="tracker-empty animate-in">
          <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
            <rect x="12" y="8" width="40" height="48" rx="6" stroke="var(--border-light)" strokeWidth="2" />
            <path d="M22 22h20M22 30h14M22 38h17" stroke="var(--border-light)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <h3>{filter === 'all' ? 'No applications yet' : 'No matching applications'}</h3>
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
          onCardClick={(id) => setExpandedId(expandedId === id ? null : id)}
        />
      ) : (
        <>
          <div className="tracker-list">
            {paginatedItems.map((app, i) => {
              const scoring = calculateOutreachScore(app);
              const followUp = getFollowUpDue(app);
              const isExpanded = expandedId === app.id;

              return (
                <div
                  key={app.id}
                  className={`tracker-card card animate-in${flashId === app.id ? ' tracker-card--flash' : ''}`}
                  style={{ animationDelay: `${0.14 + i * 0.04}s` }}
                >
                  <div className="tracker-card__collapse-toggle" onClick={() => setExpandedId(isExpanded ? null : app.id)}>
                    <div className="tracker-card__top">
                      <label className="tracker-card__checkbox" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={selectedIds.has(app.id)} onChange={() => toggleSelect(app.id)} />
                      </label>
                      <div className="tracker-card__info">
                        <div>
                          <span className="tracker-card__company">{app.companyName}</span>
                          {app.jobPostingUrl && (
                            <a className="tracker-card__link" href={app.jobPostingUrl} target="_blank" rel="noopener noreferrer" title="Open job posting" onClick={e => e.stopPropagation()}>
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                <path d="M4.5 2H2.5C1.95 2 1.5 2.45 1.5 3v6.5c0 .55.45 1 1 1H9c.55 0 1-.45 1-1V7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M7 1.5h3.5V5M6 6l4.5-4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </a>
                          )}
                          <span className="tracker-card__role"><span className="tracker-card__role-dash">— </span>{app.roleTitle}</span>
                        </div>
                        <div className="tracker-card__meta">
                          <span>{app.companySize}</span>
                          <span className="tracker-card__meta-divider" />
                          <span>Applied {formatDate(app.dateApplied)}</span>
                          {app.postingAgeWeeks != null && (
                            <>
                              <span className="tracker-card__meta-divider" />
                              <span>Posted {app.postingAgeWeeks}w ago</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="tracker-card__right">
                        <span
                          className="tracker-card__match"
                          style={{
                            color: getScoreColor(app.skillMatch.matchPercentage),
                            background: getScoreBackground(app.skillMatch.matchPercentage),
                          }}
                        >
                          {app.skillMatch.matchPercentage}% match
                        </span>
                        <span className={`app-status-badge app-status-badge--${app.applicationStatus}`}>
                          {APP_STATUS_LABELS[app.applicationStatus]}
                        </span>
                        <span className={`outreach-badge outreach-badge--${app.outreachStatus}`}>
                          {STATUS_LABELS[app.outreachStatus]}
                        </span>
                        {app.response && (
                          <span className={`response-badge response-badge--${app.response.type}`}>
                            {app.response.type === 'positive' ? 'Positive' : app.response.type === 'negative' ? 'Negative' : app.response.type === 'referral' ? 'Referral' : 'No Response'}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="tracker-card__bottom">
                      <span className={`tracker-card__score ${scoring.worth ? 'tracker-card__score--worth' : 'tracker-card__score--not-worth'}`}>
                        {scoring.score}/100 — {scoring.worth ? 'Worth Outreach' : 'Low Priority'}
                      </span>
                      {app.contact && (
                        <span className="tracker-card__contact">
                          <span className="tracker-card__contact-name">{app.contact.name} ({app.contact.role})</span>
                          {app.contact.email && <span className="tracker-card__contact-email"><span className="tracker-card__contact-dot"> · </span>{app.contact.email}</span>}
                        </span>
                      )}
                      {followUp && (
                        <span className={`tracker-card__followup ${followUp.overdue ? 'tracker-card__followup--overdue' : 'tracker-card__followup--upcoming'}`}>
                          Follow-up {followUp.label.toLowerCase()}
                        </span>
                      )}
                      {!isReadOnly && (() => {
                        const { primary, secondary, overflow } = getQuickActions(app);
                        if (!primary && !secondary && overflow.length === 0) return null;
                        return (
                          <QuickActionButtons
                            primary={primary}
                            secondary={secondary}
                            overflow={overflow}
                            onAction={(updates, label) => {
                              updateApplication(app.id, updates);
                              showToast(`${app.companyName}: ${label}`);
                              flashCard(app.id);
                            }}
                          />
                        );
                      })()}
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
