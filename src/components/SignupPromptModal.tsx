import { useId, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useFocusTrap } from '../hooks/useFocusTrap';
import './ConfirmModal.css';
import './SignupPromptModal.css';

interface SignupPromptModalProps {
  onClose: () => void;
  title?: string;
  body?: string;
}

export function SignupPromptModal({
  onClose,
  title = 'Please sign up to explore this feature...',
  body = 'Create a free account to unlock the full experience.',
}: SignupPromptModalProps) {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const panelRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const titleId = `${id}-title`;
  const bodyId = `${id}-body`;
  useFocusTrap(panelRef, onClose);

  const handleSignup = () => {
    onClose();
    navigate('/signup');
    logout();
  };

  return (
    <div className="confirm-overlay" onClick={onClose}>
      <div
        ref={panelRef}
        className="signup-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        onClick={e => e.stopPropagation()}
      >
        <h3 className="signup-modal__title" id={titleId}>{title}</h3>
        <p className="signup-modal__body" id={bodyId}>{body}</p>
        <div className="signup-modal__actions">
          <button className="signup-modal__primary" autoFocus onClick={handleSignup}>
            Sign Up Free
          </button>
          <button className="signup-modal__secondary" onClick={onClose}>
            Maybe Later
          </button>
        </div>
      </div>
    </div>
  );
}
