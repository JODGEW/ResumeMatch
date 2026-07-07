import { useMemo, useState } from 'react';
import type { Application } from '../types/tracker';
import { calculateOutreachScore } from '../types/tracker';
import { getFollowUpDue } from '../pages/Tracker';
import { findContact } from '../api/outreach';
import './OutreachQueue.css';

type LookupState = 'idle' | 'loading' | 'not_found' | 'error';

interface OutreachQueueProps {
  applications: Application[];
  isReadOnly: boolean;
  updateApplication: (id: string, updates: Partial<Application>) => Promise<void> | void;
  onEdit: (id: string) => void;
}

export function OutreachQueue({ applications, isReadOnly, updateApplication, onEdit }: OutreachQueueProps) {
  const [lookups, setLookups] = useState<Record<string, LookupState>>({});

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
      // A hit is written back through the existing optimistic update path, which
      // also recomputes outreachWorth (a contact email raises the score). We do
      // not advance outreachStatus here; the human drives that from the existing
      // quick actions. Nothing is ever sent from this surface.
      await updateApplication(app.id, { contact });
      setLookups(prev => ({ ...prev, [app.id]: 'idle' }));
    } catch {
      // Any non 404 failure means the lookup itself is unavailable.
      setLookups(prev => ({ ...prev, [app.id]: 'error' }));
    }
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
