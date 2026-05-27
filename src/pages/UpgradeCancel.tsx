import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEntitlements } from '../hooks/useEntitlements';
import './UpgradeCancel.css';

export function UpgradeCancel() {
  const navigate = useNavigate();
  const { refresh } = useEntitlements();

  // If the user briefly hit Stripe (or a webhook fired mid-cancel), the cached
  // entitlements may have drifted. Re-fetch on mount so subsequent navigation
  // reflects the true server state. Mirrors the UpgradeSuccess pattern.
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="page-container">
      <div className="upgrade-cancel-content animate-in">
        <h1>Checkout canceled</h1>
        <p>Your account hasn't been changed. You can try again whenever you're ready.</p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => navigate('/pricing')}
        >
          Back to pricing
        </button>
        <button
          type="button"
          className="upgrade-cancel-secondary"
          onClick={() => navigate('/upload')}
        >
          Or go to upload
        </button>
      </div>
    </div>
  );
}
