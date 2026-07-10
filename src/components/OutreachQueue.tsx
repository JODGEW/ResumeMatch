import { useMemo, useState } from 'react';
import type { Application } from '../types/tracker';
import { calculateOutreachScore } from '../types/tracker';
import { getFollowUpDue } from '../pages/Tracker';
import { findContact } from '../api/outreach';
import type { FoundContact } from '../api/outreach';
import './OutreachQueue.css';

type LookupState = 'idle' | 'loading' | 'not_found' | 'error';

// State of a domain-corrected re-run, tracked separately from the initial
// lookup: the panel that hosts the retry only renders when the initial lookup
// is already back, so the two are never in flight at the same time but need
// their own messages.
type RetryState = 'idle' | 'loading' | 'not_found' | 'error';

interface OutreachQueueProps {
  applications: Application[];
  isReadOnly: boolean;
  updateApplication: (id: string, updates: Partial<Application>) => Promise<void> | void;
  onEdit: (id: string) => void;
}

export function OutreachQueue({ applications, isReadOnly, updateApplication, onEdit }: OutreachQueueProps) {
  const [lookups, setLookups] = useState<Record<string, LookupState>>({});
  // Contacts returned by a lookup but not yet reviewed. Nothing here has been
  // written anywhere; the user must save or discard each one.
  const [pendingContacts, setPendingContacts] = useState<Record<string, FoundContact>>({});
  // Domain-corrected re-run state, per application. The typed domain is used
  // for that one lookup only and is never persisted to the Application.
  const [retries, setRetries] = useState<Record<string, RetryState>>({});
  const [domainInputs, setDomainInputs] = useState<Record<string, string>>({});

  // Derived view over useApplications: only the applications the outreach score
  // already flagged as worth it, highest score first. This does not read the
  // list view's filter, search, or sort state; it is its own prioritized queue.
  const queue = useMemo(() => {
    return applications
      .map(app => ({ app, scoring: calculateOutreachScore(app) }))
      .filter(({ scoring }) => scoring.worth)
      .sort((a, b) => b.scoring.score - a.scoring.score);
  }, [applications]);

  async function handleFindContact(app: Application) {
    setLookups(prev => ({ ...prev, [app.id]: 'loading' }));
    try {
      const contact = await findContact({ applicationId: app.id, companyName: app.companyName });
      if (!contact) {
        // 404 from the proxy: the lookup ran and found nobody.
        setLookups(prev => ({ ...prev, [app.id]: 'not_found' }));
        return;
      }
      // A hit is only held locally for review; nothing is written until the
      // user saves it. Saving goes through the existing optimistic update path,
      // which also recomputes outreachWorth (a contact email raises the score).
      // We do not advance outreachStatus here; the human drives that from the
      // existing quick actions. Nothing is ever sent from this surface.
      setPendingContacts(prev => ({ ...prev, [app.id]: contact }));
      setLookups(prev => ({ ...prev, [app.id]: 'idle' }));
    } catch {
      // Any non 404 failure means the lookup itself is unavailable.
      setLookups(prev => ({ ...prev, [app.id]: 'error' }));
    }
  }

  async function handleRetryWithDomain(app: Application) {
    const domain = (domainInputs[app.id] || '').trim();
    if (!domain) return;
    setRetries(prev => ({ ...prev, [app.id]: 'loading' }));
    try {
      const contact = await findContact({ applicationId: app.id, companyName: app.companyName, domain });
      if (!contact) {
        // 404: nobody at that domain. Keep the previous pending result on
        // screen rather than silently falling back to it; the user can still
        // save or discard it.
        setRetries(prev => ({ ...prev, [app.id]: 'not_found' }));
        return;
      }
      // Replace the pending result, but only if it is still pending; if the
      // user discarded while this was in flight, do not resurrect the panel.
      setPendingContacts(prev => (app.id in prev ? { ...prev, [app.id]: contact } : prev));
      setRetries(prev => ({ ...prev, [app.id]: 'idle' }));
    } catch {
      setRetries(prev => ({ ...prev, [app.id]: 'error' }));
    }
  }

  function clearReviewState(appId: string) {
    setPendingContacts(prev => {
      const next = { ...prev };
      delete next[appId];
      return next;
    });
    setRetries(prev => {
      const next = { ...prev };
      delete next[appId];
      return next;
    });
    setDomainInputs(prev => {
      const next = { ...prev };
      delete next[appId];
      return next;
    });
  }

  async function handleSaveContact(app: Application) {
    const contact = pendingContacts[app.id];
    if (!contact) return;
    clearReviewState(app.id);
    await updateApplication(app.id, { contact });
  }

  function handleDiscardContact(appId: string) {
    clearReviewState(appId);
  }

  if (queue.length === 0) {
    return (
      <div className="outreach-queue__empty">
        <h3>Nothing to reach out to yet</h3>
        <p className="text-secondary">
          Applications the outreach score rates 60 or higher appear here, ranked by score.
        </p>
      </div>
    );
  }

  return (
    <div className="outreach-queue">
      <p className="outreach-queue__count text-secondary">
        {queue.length} worth reaching out to, highest score first
      </p>

      {queue.map(({ app, scoring }) => {
        const followUp = getFollowUpDue(app);
        const lookup = lookups[app.id] || 'idle';
        const hasContact = !!app.contact?.name;
        const pendingContact = pendingContacts[app.id];
        const retry = retries[app.id] || 'idle';
        const domainInput = domainInputs[app.id] || '';

        return (
          <div
            key={app.id}
            className={`outreach-queue__card card${isReadOnly ? '' : ' outreach-queue__card--clickable'}`}
            onClick={isReadOnly ? undefined : () => onEdit(app.id)}
          >
            <div className="outreach-queue__head">
              <div className="outreach-queue__title">
                <span className="outreach-queue__role">{app.roleTitle}</span>
                <span className="outreach-queue__company">{app.companyName}</span>
              </div>
              <div className="outreach-queue__score" title="Outreach score">{scoring.score}</div>
            </div>

            {followUp && (
              <div className={`outreach-queue__followup${followUp.overdue ? ' outreach-queue__followup--overdue' : ''}`}>
                Follow up: {followUp.label}
              </div>
            )}

            <div className="outreach-queue__reasons">
              <div className="outreach-queue__reasons-title">Why it is worth it</div>
              <ul>
                {scoring.reasons.map((reason, i) => (
                  <li key={i}>{reason}</li>
                ))}
              </ul>
            </div>

            <div className="outreach-queue__contact" onClick={e => e.stopPropagation()}>
              {hasContact ? (
                <div className="outreach-queue__contact-found">
                  <span className="outreach-queue__contact-name">{app.contact!.name}</span>
                  {app.contact!.role && <span className="outreach-queue__contact-role">{app.contact!.role}</span>}
                  {app.contact!.email && <span className="outreach-queue__contact-email">{app.contact!.email}</span>}
                  {app.contact!.source && <span className="outreach-queue__contact-source">via {app.contact!.source}</span>}
                </div>
              ) : isReadOnly ? (
                <span className="text-secondary">No contact yet</span>
              ) : pendingContact ? (
                <div className="outreach-queue__contact-review">
                  <div className="outreach-queue__contact-found">
                    <span className="outreach-queue__contact-name">{pendingContact.name}</span>
                    {pendingContact.role && <span className="outreach-queue__contact-role">{pendingContact.role}</span>}
                    {pendingContact.email && <span className="outreach-queue__contact-email">{pendingContact.email}</span>}
                    {pendingContact.linkedinUrl && (
                      <a
                        className="outreach-queue__contact-link"
                        href={pendingContact.linkedinUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        LinkedIn
                      </a>
                    )}
                    {pendingContact.source && <span className="outreach-queue__contact-source">via {pendingContact.source}</span>}
                  </div>
                  {pendingContact.lookupMethod === 'company' && (
                    <span className="outreach-queue__contact-caution">
                      Matched by company name only, which can hit a different company with a similar name
                    </span>
                  )}
                  <span className="outreach-queue__contact-msg">
                    Check this is the right person before saving
                  </span>
                  {pendingContact.lookupMethod === 'company' && (
                    <div className="outreach-queue__domain-retry">
                      <input
                        type="text"
                        className="outreach-queue__domain-input"
                        placeholder="Company domain, e.g. withglide.com"
                        value={domainInput}
                        disabled={retry === 'loading'}
                        onChange={e => setDomainInputs(prev => ({ ...prev, [app.id]: e.target.value }))}
                      />
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={retry === 'loading' || !domainInput.trim()}
                        onClick={() => handleRetryWithDomain(app)}
                      >
                        {retry === 'loading' ? 'Looking...' : 'Look up by domain'}
                      </button>
                      {retry === 'not_found' && (
                        <span className="outreach-queue__contact-msg">No contact found at that domain</span>
                      )}
                      {retry === 'error' && (
                        <span className="outreach-queue__contact-msg outreach-queue__contact-msg--error">
                          Lookup unavailable, try again later
                        </span>
                      )}
                    </div>
                  )}
                  <div className="outreach-queue__contact-review-actions">
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={retry === 'loading'}
                      onClick={() => handleSaveContact(app)}
                    >
                      Save contact
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={retry === 'loading'}
                      onClick={() => handleDiscardContact(app.id)}
                    >
                      Discard
                    </button>
                  </div>
                </div>
              ) : (
                <div className="outreach-queue__contact-find">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={lookup === 'loading'}
                    onClick={() => handleFindContact(app)}
                  >
                    {lookup === 'loading' ? 'Looking...' : 'Find contact'}
                  </button>
                  {lookup === 'not_found' && (
                    <span className="outreach-queue__contact-msg">No contact found</span>
                  )}
                  {lookup === 'error' && (
                    <span className="outreach-queue__contact-msg outreach-queue__contact-msg--error">
                      Lookup unavailable, try again later
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
