import { useMemo, useRef, useState } from 'react';
import type { Application } from '../types/tracker';
import { calculateOutreachScore } from '../types/tracker';
import { getFollowUpDue, splitReason, isOutreachNotNeeded } from '../pages/Tracker';
import { findContact } from '../api/outreach';
import type { FoundContact, LookupMethod } from '../api/outreach';
import './OutreachQueue.css';

type LookupState = 'idle' | 'loading' | 'not_found' | 'error';

// State of a domain-corrected re-run, tracked separately from the initial
// lookup. The retry is offered from two places: the review panel when a fuzzy
// company match returned someone, and the not-found state when a fuzzy company
// match returned nobody. A domain-exact not-found gets no retry, since the
// same domain would hit the 7 day not-found cache and return the same 404.
type RetryState = 'idle' | 'loading' | 'not_found' | 'error';

// Outreach that has concluded, one way or the other. These stay visible in the
// list/board views; the queue is only for outreach still worth doing.
const OUTREACH_DONE: ReadonlySet<Application['outreachStatus']> = new Set([
  'replied',
  'no_response',
  'skipped',
]);

// Plain-language membership rules, surfaced as a hover/focus tooltip on the
// count line and read to screen readers. Status names match the UI labels.
// Keep in sync with the queue memo below and the empty-state copy.
const QUEUE_RULES =
  'Shows open applications with an outreach score of 60 or higher, highest first. '
  + 'Not shown: applications marked Rejected or Offer, outreach already marked '
  + 'Replied, No Response, or Skipped, and applications that reached Screening or '
  + 'Interviewing before any outreach — those no longer need it.';

interface OutreachQueueProps {
  applications: Application[];
  // True when the tracker search box has a query; switches the empty state from
  // "nothing qualifies" to "no matches".
  isSearching: boolean;
  isReadOnly: boolean;
  updateApplication: (id: string, updates: Partial<Application>) => Promise<void> | void;
  onEdit: (id: string) => void;
}

export function OutreachQueue({ applications, isSearching, isReadOnly, updateApplication, onEdit }: OutreachQueueProps) {
  const [lookups, setLookups] = useState<Record<string, LookupState>>({});
  // Contacts returned by a lookup but not yet reviewed. Nothing here has been
  // written anywhere; the user must save or discard each one.
  const [pendingContacts, setPendingContacts] = useState<Record<string, FoundContact>>({});
  // Domain-corrected re-run state, per application. The typed domain is used
  // for that one lookup only and is never persisted to the Application.
  const [retries, setRetries] = useState<Record<string, RetryState>>({});
  const [domainInputs, setDomainInputs] = useState<Record<string, string>>({});
  // Which branch a failed initial lookup ran, from the 404 body. Only read
  // while the lookup state is not_found; company means the domain retry is
  // offered, domain means it is not.
  const [notFoundMethods, setNotFoundMethods] = useState<Record<string, LookupMethod>>({});

  // Per-application request token. Every lookup or retry stamps a fresh id;
  // a response is applied only if its id is still the latest for that
  // application. Save and discard invalidate the token, so a response landing
  // after the user acted (or after a newer request started) is dropped. Refs,
  // not state: the guard must not depend on render timing or UI state.
  const requestSeq = useRef(0);
  const latestRequest = useRef<Record<string, number>>({});

  function beginRequest(appId: string): number {
    const id = ++requestSeq.current;
    latestRequest.current[appId] = id;
    return id;
  }

  function isCurrentRequest(appId: string, id: number): boolean {
    return latestRequest.current[appId] === id;
  }

  // Derived view over useApplications: open applications the outreach score
  // flagged as worth it, highest score first. The Tracker applies its search box
  // before passing `applications`; the list view's filter tabs and sort dropdown
  // are hidden in this view and never apply — the queue owns its membership and
  // ranking. Closed-out items are excluded: dead or decided applications
  // (rejected / offer) and outreach that already concluded (OUTREACH_DONE).
  const queue = useMemo(() => {
    return applications
      .filter(app =>
        app.applicationStatus !== 'rejected'
        && app.applicationStatus !== 'offer'
        && !OUTREACH_DONE.has(app.outreachStatus)
        // Advanced to screening/interviewing without outreach — it was never
        // needed, so the queue shouldn't keep asking for it.
        && !isOutreachNotNeeded(app))
      .map(app => ({ app, scoring: calculateOutreachScore(app) }))
      .filter(({ scoring }) => scoring.worth)
      .sort((a, b) => b.scoring.score - a.scoring.score);
  }, [applications]);

  async function handleFindContact(app: Application) {
    const requestId = beginRequest(app.id);
    setLookups(prev => ({ ...prev, [app.id]: 'loading' }));
    try {
      const result = await findContact({ applicationId: app.id, companyName: app.companyName });
      if (!isCurrentRequest(app.id, requestId)) return;
      if (!result.found) {
        // 404 from the proxy: the lookup ran and found nobody. Record which
        // branch failed; a fuzzy company-name miss gets a domain retry.
        setNotFoundMethods(prev => ({ ...prev, [app.id]: result.lookupMethod }));
        setLookups(prev => ({ ...prev, [app.id]: 'not_found' }));
        return;
      }
      // A hit is only held locally for review; nothing is written until the
      // user saves it. Saving goes through the existing optimistic update path,
      // which also recomputes outreachWorth (a contact email raises the score).
      // We do not advance outreachStatus here; the human drives that from the
      // existing quick actions. Nothing is ever sent from this surface.
      setPendingContacts(prev => ({ ...prev, [app.id]: result.contact }));
      setLookups(prev => ({ ...prev, [app.id]: 'idle' }));
    } catch {
      if (!isCurrentRequest(app.id, requestId)) return;
      // Any non 404 failure means the lookup itself is unavailable.
      setLookups(prev => ({ ...prev, [app.id]: 'error' }));
    }
  }

  async function handleRetryWithDomain(app: Application) {
    const domain = (domainInputs[app.id] || '').trim();
    if (!domain) return;
    const requestId = beginRequest(app.id);
    setRetries(prev => ({ ...prev, [app.id]: 'loading' }));
    try {
      const result = await findContact({ applicationId: app.id, companyName: app.companyName, domain });
      if (!isCurrentRequest(app.id, requestId)) return;
      if (!result.found) {
        // 404: nobody at that exact domain. Show that plainly and keep the
        // input available; never silently fall back to a previous result.
        setRetries(prev => ({ ...prev, [app.id]: 'not_found' }));
        return;
      }
      // Opens the review panel. When the retry started from the not-found
      // state there is no prior pending contact; when it started from the
      // review panel this replaces the fuzzy-matched one.
      setPendingContacts(prev => ({ ...prev, [app.id]: result.contact }));
      setRetries(prev => ({ ...prev, [app.id]: 'idle' }));
    } catch {
      if (!isCurrentRequest(app.id, requestId)) return;
      setRetries(prev => ({ ...prev, [app.id]: 'error' }));
    }
  }

  function clearReviewState(appId: string) {
    // Invalidate any in-flight request so a late response cannot reopen or
    // rewrite state the user has already acted on.
    delete latestRequest.current[appId];
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
    return isSearching ? (
      <div className="outreach-queue__empty">
        <h3>No matches</h3>
        <p className="text-secondary">
          No queued applications match your search.
        </p>
      </div>
    ) : (
      <div className="outreach-queue__empty">
        <h3>Nothing to reach out to yet</h3>
        <p className="text-secondary">
          Open applications the outreach score rates 60 or higher appear here, ranked by
          score. Closed-out applications, finished outreach, and anything that reached
          screening on its own don&apos;t show up.
        </p>
      </div>
    );
  }

  return (
    <div className="outreach-queue">
      <p className="outreach-queue__count">
        {queue.length} worth reaching out to, highest score first
        {/* tabIndex makes the tooltip reachable by keyboard and by tap on touch
            devices (focus in, tap away to dismiss). */}
        <span className="outreach-queue__count-info" tabIndex={0} role="img" aria-label={QUEUE_RULES}>
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <circle cx="7" cy="7" r="5.6" stroke="currentColor" strokeWidth="1.3" />
            <path d="M7 6.6v3.1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            <circle cx="7" cy="4.3" r="0.7" fill="currentColor" />
          </svg>
        </span>
        <span className="outreach-queue__count-tooltip" role="tooltip" aria-hidden="true">
          {QUEUE_RULES}
        </span>
      </p>

      {queue.map(({ app, scoring }) => {
        const followUp = getFollowUpDue(app);
        const lookup = lookups[app.id] || 'idle';
        const hasContact = !!app.contact?.name;
        const pendingContact = pendingContacts[app.id];
        const retry = retries[app.id] || 'idle';
        const domainInput = domainInputs[app.id] || '';
        const notFoundMethod = notFoundMethods[app.id];

        // Verification presentation, strongest wins: a failed verification
        // beats the accept-all note, which beats the quiet verified tag.
        // Null status with a normal domain shows nothing.
        const verifyState = !pendingContact
          ? null
          : pendingContact.verificationStatus === 'invalid'
            ? 'invalid'
            : pendingContact.verificationStatus === 'valid'
              ? 'valid'
              : pendingContact.domainAcceptAll
                ? 'accept_all'
                : null;

        // Shared by the review panel (fuzzy match returned someone) and the
        // not-found state (fuzzy match returned nobody).
        const domainRetryRow = (
          <div className="outreach-queue__domain-retry">
            <input
              type="text"
              className="outreach-queue__domain-input"
              placeholder="Company domain, e.g. company.com"
              value={domainInput}
              disabled={retry === 'loading'}
              onChange={e => setDomainInputs(prev => ({ ...prev, [app.id]: e.target.value }))}
            />
            <button
              type="button"
              className="tracker-btn tracker-btn--ghost tracker-btn--sm"
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
        );

        return (
          <div
            key={app.id}
            className={`outreach-queue__card${isReadOnly ? '' : ' outreach-queue__card--clickable'}`}
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
              <div className="outreach-queue__reasons-title">Why it&apos;s worth it</div>
              <ul>
                {scoring.reasons.map((reason, i) => {
                  const { label, pts } = splitReason(reason);
                  return (
                    <li key={i}>
                      {label}
                      {pts && (
                        <span className={`outreach-queue__reason-pts${pts === '+0' ? ' outreach-queue__reason-pts--zero' : ''}`}>{pts}</span>
                      )}
                    </li>
                  );
                })}
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
                    {verifyState === 'valid' && (
                      <span className="outreach-queue__contact-verified">verified</span>
                    )}
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
                  {verifyState === 'invalid' && (
                    <span className="outreach-queue__contact-bounce">
                      {pendingContact.linkedinUrl
                        ? 'This address failed verification and will likely bounce. The LinkedIn profile is the better channel.'
                        : 'This address failed verification and will likely bounce.'}
                    </span>
                  )}
                  {verifyState === 'accept_all' && (
                    <span className="outreach-queue__contact-msg">
                      This company's mail server accepts all addresses, so individual emails cannot be verified
                    </span>
                  )}
                  {pendingContact.lookupMethod === 'company' && (
                    <span className="outreach-queue__contact-caution">
                      Matched by company name, which is fuzzy and may have found a different company with a similar name. If this looks wrong and you know the real domain, try it below.
                    </span>
                  )}
                  <span className="outreach-queue__contact-msg">
                    Check this is the right person before saving
                  </span>
                  {pendingContact.lookupMethod === 'company' && domainRetryRow}
                  <div className="outreach-queue__contact-review-actions">
                    <button
                      type="button"
                      className="tracker-btn tracker-btn--brand tracker-btn--sm"
                      disabled={retry === 'loading'}
                      onClick={() => handleSaveContact(app)}
                    >
                      Save contact
                    </button>
                    <button
                      type="button"
                      className="tracker-btn tracker-btn--ghost tracker-btn--sm"
                      disabled={retry === 'loading'}
                      onClick={() => handleDiscardContact(app.id)}
                    >
                      Discard
                    </button>
                  </div>
                </div>
              ) : (
                <div className="outreach-queue__contact-find-block">
                  <div className="outreach-queue__contact-find">
                    <button
                      type="button"
                      className="tracker-btn tracker-btn--ghost tracker-btn--sm outreach-queue__find-btn"
                      disabled={lookup === 'loading' || retry === 'loading'}
                      onClick={() => handleFindContact(app)}
                    >
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                        <circle cx="6" cy="5.5" r="2.4" stroke="currentColor" strokeWidth="1.4" />
                        <path d="M2.5 13c0-2 1.6-3.4 3.5-3.4S9.5 11 9.5 13M10.5 6.5l1.6 1.6 2.4-2.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      {lookup === 'loading' ? 'Looking...' : 'Find contact'}
                    </button>
                    {lookup === 'not_found' && (
                      <span className="outreach-queue__contact-msg">
                        {notFoundMethod === 'company'
                          ? 'No contact found by company name, which is fuzzy and may have searched a different company with a similar name. If you know the real domain, try it below.'
                          : 'No contact found'}
                      </span>
                    )}
                    {lookup === 'error' && (
                      <span className="outreach-queue__contact-msg outreach-queue__contact-msg--error">
                        Lookup unavailable, try again later
                      </span>
                    )}
                  </div>
                  {lookup === 'not_found' && notFoundMethod === 'company' && domainRetryRow}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
