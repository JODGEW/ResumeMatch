import { useState, useMemo, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApplications } from '../hooks/useApplications';
import type { Application } from '../types/tracker';
import { calculateOutreachScore } from '../types/tracker';
import './Tracker.css';

type Filter = 'all' | 'worth' | 'follow_up' | 'awaiting' | 'completed' | 'rejected';
type SortKey = 'dateApplied' | 'matchPercentage' | 'outreachScore';

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

function getScoreColor(score: number) {
  if (score >= 86) return '#16a34a';
  if (score >= 76) return '#3b82f6';
  if (score >= 61) return '#ca8a04';
  if (score >= 41) return '#dc4a20';
  return '#dc2626';
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

  function set<K extends keyof typeof form>(key: K, val: (typeof form)[K]) {
    setForm(prev => ({ ...prev, [key]: val }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.companyName.trim() || !form.roleTitle.trim()) return;

    const data = { ...form };

    // Clear empty contact/response
    if (data.contact && !data.contact.name && !data.contact.email) data.contact = undefined;
    if (data.response && !data.response.date && !data.response.notes) data.response = undefined;

    // Auto-calc match percentage if skills provided and percentage is 0
    if (data.skillMatch.matchPercentage === 0 && data.skillMatch.matchedSkills.length > 0) {
      const total = data.skillMatch.matchedSkills.length + data.skillMatch.missingSkills.length;
      data.skillMatch.matchPercentage = Math.round((data.skillMatch.matchedSkills.length / total) * 100);
    }

    onSave(data);
  }

  return (
    <div className="tracker-modal-overlay" onClick={onClose}>
      <div className="tracker-modal" onClick={e => e.stopPropagation()}>
        <div className="tracker-modal__header">
          <h2>{isEdit ? 'Edit Application' : 'Add Application'}</h2>
          <button className="tracker-modal__close" onClick={onClose}>
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
                <input className="tracker-modal__input" value={form.jobPostingUrl || ''} onChange={e => set('jobPostingUrl', e.target.value)} />
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
                <select className="tracker-modal__select" value={form.applicationStatus} onChange={e => set('applicationStatus', e.target.value as Application['applicationStatus'])}>
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
                <input className="tracker-modal__input" value={form.contact?.linkedinUrl || ''} onChange={e => set('contact', { ...form.contact!, linkedinUrl: e.target.value || undefined })} />
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
                <input className="tracker-modal__input" type="date" value={form.response?.date || ''} onChange={e => set('response', { date: e.target.value, type: form.response?.type || 'positive', notes: form.response?.notes || '', nextStep: form.response?.nextStep })} />
              </div>
              <div className="tracker-modal__field">
                <label className="tracker-modal__label">Response Type</label>
                <select className="tracker-modal__select" value={form.response?.type || 'positive'} onChange={e => set('response', { ...form.response!, type: e.target.value as 'positive' | 'negative' | 'referral' | 'no_response' })}>
                  <option value="positive">Positive</option>
                  <option value="negative">Negative</option>
                  <option value="referral">Referral</option>
                  <option value="no_response">No Response</option>
                </select>
              </div>
            </div>
            <div className="tracker-modal__field">
              <label className="tracker-modal__label">Notes</label>
              <textarea className="tracker-modal__textarea" value={form.response?.notes || ''} onChange={e => set('response', { ...form.response!, notes: e.target.value })} />
            </div>
            <div className="tracker-modal__field">
              <label className="tracker-modal__label">Next Step</label>
              <input className="tracker-modal__input" value={form.response?.nextStep || ''} onChange={e => set('response', { ...form.response!, nextStep: e.target.value || undefined })} />
            </div>
          </div>

          {/* Notes */}
          <div className="tracker-modal__section">
            <div className="tracker-modal__section-title">Notes</div>
            <div className="tracker-modal__field">
              <textarea className="tracker-modal__textarea" value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Free text notes..." />
            </div>
          </div>

          <div className="tracker-modal__footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">{isEdit ? 'Save Changes' : 'Add Application'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Detail View (inline expand) ────────────────────────
function DetailView({ app, isReadOnly, onEdit, onDelete }: { app: Application; isReadOnly: boolean; onEdit: () => void; onDelete: () => void }) {
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
            return (
              <span key={step}>
                {i > 0 && <span className="tracker-detail__timeline-arrow"> &rarr; </span>}
                <span className={`tracker-detail__timeline-step ${isActive ? 'tracker-detail__timeline-step--active' : ''}`}>
                  {APP_STATUS_LABELS[step]}
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
          {TIMELINE_STEPS.map((step, i) => (
            <span key={step}>
              {i > 0 && <span className="tracker-detail__timeline-arrow"> &rarr; </span>}
              <span className={`tracker-detail__timeline-step ${i <= statusIndex ? 'tracker-detail__timeline-step--active' : ''}`}>
                {STATUS_LABELS[step]}
                {step === 'drafted' && i <= statusIndex && app.outreachDate ? ` ${formatDate(app.outreachDate)}`
                  : step === 'sent' && i <= statusIndex && app.outreachDate ? ` ${formatDate(app.outreachDate)}`
                  : step === 'followed_up' && i <= statusIndex && app.followUpDate ? ` ${formatDate(app.followUpDate)}`
                  : ''}
              </span>
            </span>
          ))}
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

// ── Main Tracker Page ──────────────────────────────────
export function Tracker() {
  const { applications, isReadOnly, addApplication, updateApplication, deleteApplication } = useApplications();
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<SortKey>('dateApplied');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [modalState, setModalState] = useState<{ open: boolean; editId?: string }>({ open: false });
  const [bannerExpanded, setBannerExpanded] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  // Handle prefill from History page
  useEffect(() => {
    const prefill = searchParams.get('prefill');
    if (prefill && !isReadOnly) {
      try {
        const data = JSON.parse(decodeURIComponent(prefill));
        setModalState({ open: true });
        // Clear the search param
        setSearchParams({}, { replace: true });
        // We'll pass the prefill data through the modal's initial state
        setPrefillData(data);
      } catch {
        setSearchParams({}, { replace: true });
      }
    }
  }, []);

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

  function handleSave(data: ReturnType<typeof emptyForm>) {
    if (modalState.editId) {
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
        return { ...rest, id };
      }
    }
    if (prefillData) {
      return { ...emptyForm(), ...prefillData };
    }
    return emptyForm();
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
            className="btn btn-primary"
            disabled={isReadOnly}
            title={isReadOnly ? 'Sign up for full access' : undefined}
            onClick={() => { setPrefillData(null); setModalState({ open: true }); }}
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
          Demo mode — you're viewing sample data.
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
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="tracker-controls__right">
          <input
            className="tracker-search"
            type="text"
            placeholder="Search..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select className="tracker-sort" value={sort} onChange={e => setSort(e.target.value as SortKey)}>
            <option value="dateApplied">Date Applied</option>
            <option value="matchPercentage">Match %</option>
            <option value="outreachScore">Outreach Score</option>
          </select>
        </div>
      </div>

      {/* Application List */}
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
      ) : (
        <div className="tracker-list">
          {sorted.map((app, i) => {
            const scoring = calculateOutreachScore(app);
            const followUp = getFollowUpDue(app);
            const isExpanded = expandedId === app.id;

            return (
              <div
                key={app.id}
                className="tracker-card card animate-in"
                style={{ animationDelay: `${0.14 + i * 0.04}s` }}
              >
                <div onClick={() => setExpandedId(isExpanded ? null : app.id)}>
                  <div className="tracker-card__top">
                    <div className="tracker-card__info">
                      <div>
                        <span className="tracker-card__company">{app.companyName}</span>
                        <span className="tracker-card__role">— {app.roleTitle}</span>
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
                      <span className="tracker-card__match" style={{ color: getScoreColor(app.skillMatch.matchPercentage) }}>
                        {app.skillMatch.matchPercentage}%
                      </span>
                      <span className={`app-status-badge app-status-badge--${app.applicationStatus}`}>
                        {APP_STATUS_LABELS[app.applicationStatus]}
                      </span>
                      <span className={`outreach-badge outreach-badge--${app.outreachStatus}`}>
                        {STATUS_LABELS[app.outreachStatus]}
                      </span>
                    </div>
                  </div>
                  <div className="tracker-card__bottom">
                    <span className={`tracker-card__score ${scoring.worth ? 'tracker-card__score--worth' : 'tracker-card__score--not-worth'}`}>
                      {scoring.score}/100 — {scoring.worth ? 'Worth Outreach' : 'Low Priority'}
                    </span>
                    {app.contact && (
                      <span className="tracker-card__contact">
                        {app.contact.name} ({app.contact.role}){app.contact.email ? ` · ${app.contact.email}` : ''}
                      </span>
                    )}
                    {followUp && (
                      <span className={`tracker-card__followup ${followUp.overdue ? 'tracker-card__followup--overdue' : 'tracker-card__followup--upcoming'}`}>
                        Follow-up {followUp.label.toLowerCase()}
                      </span>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <DetailView
                    app={app}
                    isReadOnly={isReadOnly}
                    onEdit={() => setModalState({ open: true, editId: app.id })}
                    onDelete={() => { deleteApplication(app.id); setExpandedId(null); }}
                  />
                )}
              </div>
            );
          })}
        </div>
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
    </div>
  );
}
