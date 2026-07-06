import { useNavigate } from 'react-router-dom';
import { BILLING_UI_ENABLED } from '../config/billing';
import './UpgradePrompt.css';

interface UpgradePromptProps {
  message: string;
  cta?: string;
  variant?: 'banner' | 'card';
}

export function UpgradePrompt({
  message,
  cta = 'View plans',
  variant = 'banner',
}: UpgradePromptProps) {
  const navigate = useNavigate();

  // Choke point: with billing UI disabled, no mount of this component may
  // render, regardless of what condition the call site checked.
  if (!BILLING_UI_ENABLED) return null;

  return (
    <div className={`upgrade-prompt upgrade-prompt--${variant} animate-in`}>
      <div className="upgrade-prompt__icon" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path
            d="M9 2l1.8 4.4 4.7.4-3.6 3 1.1 4.6L9 12l-4 2.4 1.1-4.6-3.6-3 4.7-.4L9 2z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <p className="upgrade-prompt__message">{message}</p>
      <button
        type="button"
        className="btn btn-primary upgrade-prompt__cta"
        onClick={() => navigate('/pricing')}
      >
        {cta}
      </button>
    </div>
  );
}
