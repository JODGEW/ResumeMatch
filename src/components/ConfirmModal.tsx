import React from 'react';
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
  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-modal" onClick={e => e.stopPropagation()}>
        <h3 className="confirm-modal__title">{title}</h3>
        <div className="confirm-modal__body">{body}</div>
        {warning && <p className="confirm-modal__warning">{warning}</p>}
        <div className="confirm-modal__actions">
          <button className="confirm-modal__cancel" autoFocus onClick={onCancel}>Cancel</button>
          <button className={`confirm-modal__confirm confirm-modal__confirm--${variant}`} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
