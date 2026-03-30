import { useMemo, useState, useCallback, useRef } from 'react';
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
  const columnRefs = useRef<Map<Application['applicationStatus'], HTMLDivElement>>(new Map());
  const touchState = useRef<{
    id: string;
    startX: number;
    startY: number;
    moved: boolean;
    ghost: HTMLDivElement | null;
  } | null>(null);

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

  // Touch drag helpers
  const findColumnAtPoint = useCallback((x: number, y: number): Application['applicationStatus'] | null => {
    for (const [key, el] of columnRefs.current.entries()) {
      const rect = el.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        return key;
      }
    }
    return null;
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent, appId: string) => {
    if (isReadOnly || window.innerWidth <= 480) return;
    const touch = e.touches[0];
    touchState.current = {
      id: appId,
      startX: touch.clientX,
      startY: touch.clientY,
      moved: false,
      ghost: null,
    };
  }, [isReadOnly]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const state = touchState.current;
    if (!state) return;

    const touch = e.touches[0];
    const dx = touch.clientX - state.startX;
    const dy = touch.clientY - state.startY;

    // Require minimum movement to start drag (avoid blocking taps)
    if (!state.moved && Math.abs(dx) + Math.abs(dy) < 10) return;

    if (!state.moved) {
      state.moved = true;
      setDragId(state.id);

      // Create ghost element
      const target = e.currentTarget as HTMLElement;
      const ghost = document.createElement('div');
      ghost.className = 'kanban__card kanban__card--ghost';
      ghost.textContent = target.querySelector('.kanban__card-company')?.textContent ?? '';
      ghost.style.cssText = `
        position: fixed; z-index: 1000; pointer-events: none;
        width: ${target.offsetWidth}px; opacity: 0.85;
        box-shadow: 0 8px 24px rgba(0,0,0,0.2);
        transform: rotate(2deg);
      `;
      document.body.appendChild(ghost);
      state.ghost = ghost;
    }

    e.preventDefault(); // prevent scroll while dragging

    if (state.ghost) {
      state.ghost.style.left = `${touch.clientX - 40}px`;
      state.ghost.style.top = `${touch.clientY - 20}px`;
    }

    const col = findColumnAtPoint(touch.clientX, touch.clientY);
    setDropTarget(col);
  }, [findColumnAtPoint]);

  const handleTouchEnd = useCallback(() => {
    const state = touchState.current;
    if (!state) return;

    if (state.ghost) {
      state.ghost.remove();
    }

    if (state.moved && dropTarget) {
      const app = applications.find(a => a.id === state.id);
      if (app && app.applicationStatus !== dropTarget) {
        onUpdateStatus(state.id, dropTarget);
      }
    }

    touchState.current = null;
    setDragId(null);
    setDropTarget(null);
  }, [dropTarget, applications, onUpdateStatus]);

  return (
    <div className="kanban">
      {COLUMNS.map(col => {
        const apps = grouped.get(col.key) || [];
        const accent = getColumnAccent(col.key);
        const isOver = dropTarget === col.key && dragId !== null;
        return (
          <div
            key={col.key}
            ref={el => { if (el) columnRefs.current.set(col.key, el); }}
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
                  onClick={() => { if (!touchState.current?.moved) onCardClick(app.id); }}
                  onTouchStart={(e) => handleTouchStart(e, app.id)}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                  onUpdateStatus={onUpdateStatus}
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
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  onUpdateStatus,
}: {
  app: Application;
  isReadOnly: boolean;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onClick: () => void;
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: () => void;
  onUpdateStatus: (id: string, status: Application['applicationStatus']) => void;
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
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
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
      {!isReadOnly && (
        <select
          className="kanban__card-status-select"
          value={app.applicationStatus}
          onClick={e => e.stopPropagation()}
          onChange={e => {
            e.stopPropagation();
            onUpdateStatus(app.id, e.target.value as Application['applicationStatus']);
          }}
        >
          {COLUMNS.map(col => (
            <option key={col.key} value={col.key}>{col.label}</option>
          ))}
        </select>
      )}
    </div>
  );
}
