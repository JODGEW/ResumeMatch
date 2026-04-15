import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import './ConfirmModal.css';
import './SignupPromptModal.css';

interface SignupPromptModalProps {
  onClose: () => void;
}

export function SignupPromptModal({ onClose }: SignupPromptModalProps) {
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
        <h3 className="signup-modal__title">Download Your Optimized Resume</h3>
        <p className="signup-modal__body">
          Create a free account to download your AI-optimized resume as a
          Word document, ready to submit.
        </p>
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
