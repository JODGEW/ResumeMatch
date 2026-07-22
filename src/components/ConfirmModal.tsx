import React, { useId, useRef } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import './ConfirmModal.css';

type ConfirmVariant = 'destructive' | 'warning';

interface ConfirmModalProps {
  title: string;
  body: React.ReactNode;
  warning?: React.ReactNode;
  confirmLabel: string;
  variant?: ConfirmVariant;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({ title, body, warning, confirmLabel, variant = 'destructive', onConfirm, onCancel }: ConfirmModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const titleId = `${id}-title`;
  const bodyId = `${id}-body`;
  const warningId = `${id}-warning`;
  useFocusTrap(panelRef, onCancel);
  useBodyScrollLock();

  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div
        ref={panelRef}
        className="confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={warning ? `${bodyId} ${warningId}` : bodyId}
        onClick={e => e.stopPropagation()}
      >
        <h3 className="confirm-modal__title" id={titleId}>{title}</h3>
        <div className="confirm-modal__body" id={bodyId}>{body}</div>
        {warning && <p className="confirm-modal__warning" id={warningId}>{warning}</p>}
        <div className="confirm-modal__actions">
          <button className="confirm-modal__cancel" autoFocus onClick={onCancel}>Cancel</button>
          <button className={`confirm-modal__confirm confirm-modal__confirm--${variant}`} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
