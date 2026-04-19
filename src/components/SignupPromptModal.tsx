import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
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

  const handleSignup = () => {
    onClose();
    navigate('/signup');
    logout();
  };

  return (
    <div className="confirm-overlay" onClick={onClose}>
      <div className="signup-modal" onClick={e => e.stopPropagation()}>
        <h3 className="signup-modal__title">{title}</h3>
        <p className="signup-modal__body">{body}</p>
        <div className="signup-modal__actions">
          <button className="signup-modal__primary" onClick={handleSignup}>
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
