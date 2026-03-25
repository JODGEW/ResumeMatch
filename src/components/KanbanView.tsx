import { useMemo, useState, useCallback } from 'react';
import type { Application } from '../types/tracker';
import { calculateOutreachScore } from '../types/tracker';
import './KanbanView.css';

const COLUMNS: { key: Application['applicationStatus']; label: string }[] = [
  { key: 'not_applied', label: 'Not Applied' },
  { key: 'applied', label: 'Applied' },
  { key: 'screening', label: 'Screening' },
  { key: 'interviewing', label: 'Interviewing' },
  { key: 'offer', label: 'Offer' },
  { key: 'rejected', label: 'Rejected' },
];

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

function getScoreColor(score: number) {
  if (score >= 86) return '#16a34a';
  if (score >= 76) return '#3b82f6';
  if (score >= 61) return '#ca8a04';
  if (score >= 41) return '#dc4a20';
  return '#dc2626';
}

function getColumnAccent(key: Application['applicationStatus']): string {
  switch (key) {
    case 'not_applied': return 'var(--text-muted)';
    case 'applied': return '#3b82f6';
    case 'screening': return '#ca8a04';
    case 'interviewing': return '#8b5cf6';
    case 'offer': return '#16a34a';
    case 'rejected': return '#dc2626';
  }
}

interface Props {
  applications: Application[];
  isReadOnly: boolean;
  onUpdateStatus: (id: string, status: Application['applicationStatus']) => void;
  onCardClick: (id: string) => void;
}

export function KanbanView({ applications, isReadOnly, onUpdateStatus, onCardClick }: Props) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<Application['applicationStatus'] | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<Application['applicationStatus'], Application[]>();
    for (const col of COLUMNS) {
      map.set(col.key, []);
    }
    for (const app of applications) {
      const list = map.get(app.applicationStatus);
      if (list) list.push(app);
    }
    return map;
  }, [applications]);

  const handleDragOver = useCallback((e: React.DragEvent, colKey: Application['applicationStatus']) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget(colKey);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, colKey: Application['applicationStatus']) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    if (id) {
      const app = applications.find(a => a.id === id);
      if (app && app.applicationStatus !== colKey) {
        onUpdateStatus(id, colKey);
      }
    }
    setDragId(null);
    setDropTarget(null);
  }, [applications, onUpdateStatus]);

  const handleDragEnd = useCallback(() => {
    setDragId(null);
    setDropTarget(null);
  }, []);

  return (
    <div className="kanban">
      {COLUMNS.map(col => {
        const apps = grouped.get(col.key) || [];
        const accent = getColumnAccent(col.key);
        const isOver = dropTarget === col.key && dragId !== null;
        return (
          <div
            key={col.key}
            className={`kanban__column${isOver ? ' kanban__column--drop-target' : ''}`}
            onDragOver={(e) => handleDragOver(e, col.key)}
            onDragLeave={() => setDropTarget(null)}
            onDrop={(e) => handleDrop(e, col.key)}
          >
            <div className="kanban__column-header">
              <span className="kanban__column-dot" style={{ background: accent }} />
              <span className="kanban__column-title">{col.label}</span>
              <span className="kanban__column-count">{apps.length}</span>
            </div>
            <div className="kanban__column-body">
              {apps.length === 0 && (
                <div className="kanban__empty">
                  {isOver ? 'Drop here' : 'No applications'}
                </div>
              )}
              {apps.map(app => (
                <KanbanCard
                  key={app.id}
                  app={app}
                  isReadOnly={isReadOnly}
                  isDragging={dragId === app.id}
                  onDragStart={() => setDragId(app.id)}
                  onDragEnd={handleDragEnd}
                  onClick={() => onCardClick(app.id)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function KanbanCard({
  app,
  isReadOnly,
  isDragging,
  onDragStart,
  onDragEnd,
  onClick,
}: {
  app: Application;
  isReadOnly: boolean;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onClick: () => void;
}) {
  const scoring = calculateOutreachScore(app);
  const matchColor = getScoreColor(app.skillMatch.matchPercentage);

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', app.id);
    e.dataTransfer.effectAllowed = 'move';
    onDragStart();
  };

  return (
    <div
      className={`kanban__card${isDragging ? ' kanban__card--dragging' : ''}`}
      draggable={!isReadOnly}
      onDragStart={handleDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
    >
      <div className="kanban__card-header">
        <span className="kanban__card-company">{app.companyName}</span>
        <span
          className="kanban__card-match"
          style={{ color: matchColor, background: matchColor + '18' }}
        >
          {app.skillMatch.matchPercentage}%
        </span>
      </div>
      <span className="kanban__card-role">{app.roleTitle}</span>
      <div className="kanban__card-tags">
        <span className={`outreach-badge outreach-badge--${app.outreachStatus}`}>
          {STATUS_LABELS[app.outreachStatus]}
        </span>
        {scoring.worth && (
          <span className="kanban__card-worth">Worth outreach</span>
        )}
      </div>
      {app.contact && (
        <span className="kanban__card-contact">{app.contact.name}</span>
      )}
    </div>
  );
}
