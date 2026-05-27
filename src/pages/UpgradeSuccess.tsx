import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useEntitlements } from '../hooks/useEntitlements';
import './UpgradeSuccess.css';

export function UpgradeSuccess() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session_id');
  void sessionId; // read per spec; UI doesn't gate on it (Stripe may strip it)
  const { refresh } = useEntitlements();

  useEffect(() => {
    refresh();
    const timer = window.setTimeout(() => {
      navigate('/upload', { replace: true });
    }, 3000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="page-container">
      <div className="upgrade-success-content animate-in">
        <h1>Welcome to Pro</h1>
        <p>Your account has been upgraded. Redirecting you in a moment…</p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => navigate('/upload', { replace: true })}
        >
          Go to upload now
        </button>
      </div>
    </div>
  );
}
