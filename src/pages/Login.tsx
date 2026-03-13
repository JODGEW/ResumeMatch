import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import './Login.css';

export function Login() {
  const DEMO_EMAIL = 'demo123@resumeapp.com';
  const DEMO_PASSWORD = 'ResumeApp123!?';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as { signupSuccess?: boolean; resetSuccess?: boolean } | null;
  const signupSuccess = locationState?.signupSuccess;
  const resetSuccess = locationState?.resetSuccess;

  useEffect(() => {
    if (user) {
      navigate('/upload', { replace: true });
    }
  }, [navigate, user]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Read from DOM to capture browser-autofilled values that bypass onChange
    const form = e.target as HTMLFormElement;
    const submittedEmail = (form.elements.namedItem('email') as HTMLInputElement).value;
    const submittedPassword = (form.elements.namedItem('password') as HTMLInputElement).value;

    try {
      await login(submittedEmail, submittedPassword);
      navigate('/upload');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      {/* Background decoration */}
      <div className="login-page__bg">
        <div className="login-page__grid" />
        <div className="login-page__glow" />
      </div>

      <div className="login-card animate-in">
        <div className="login-card__header">
          <div className="login-card__logo">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
              <rect x="4" y="4" width="32" height="32" rx="8" stroke="var(--accent)" strokeWidth="2.5" />
              <path d="M12 14h16M12 20h10M12 26h13" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1>ResumeMatch</h1>
          <p>Instantly analyze how well your resume matches a job description</p>
        </div>

        {signupSuccess && (
          <div className="login-card__success animate-in">
            Account created! Sign in with your credentials.
          </div>
        )}

        {resetSuccess && (
          <div className="login-card__success animate-in">
            Password reset! Sign in with your new password.
          </div>
        )}

        {error && (
          <div className="login-card__error animate-in">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="7" stroke="var(--danger)" strokeWidth="1.5" />
              <path d="M8 5v3.5M8 10.5v.5" stroke="var(--danger)" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-card__form">
          <div className="login-card__field">
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
              autoComplete="email"
              autoFocus
            />
          </div>

          <div className="login-card__field">
            <div className="login-card__label-row">
              <label htmlFor="password">Password</label>
              <Link to="/forgot-password" className={`login-card__forgot${demoLoading || loading ? ' login-card__forgot--disabled' : ''}`} tabIndex={demoLoading || loading ? -1 : undefined}>Forgot password?</Link>
            </div>
            <div className="login-card__password-wrapper">
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                className="login-card__password-toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <div className="login-card__demo">
            <button
              type="button"
              className="login-card__demo-btn"
              disabled={demoLoading || loading}
              onClick={async () => {
                setError('');
                setDemoLoading(true);
                try {
                  await login(DEMO_EMAIL, DEMO_PASSWORD);
                  navigate('/upload');
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Demo login failed');
                } finally {
                  setDemoLoading(false);
                }
              }}
            >
              {demoLoading ? (
                <>
                  <span className="loading-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                  Signing in...
                </>
              ) : (
                'Try Demo'
              )}
            </button>
            <span className="login-card__demo-hint">No signup required for demo</span>
          </div>

          <button
            type="submit"
            className="btn btn-primary login-card__submit"
            disabled={loading || demoLoading}
          >
            {loading ? (
              <>
                <span className="loading-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                Signing in...
              </>
            ) : (
              'Sign in'
            )}
          </button>
        </form>

        <div className={`login-card__footer${demoLoading || loading ? ' login-card__footer--disabled' : ''}`}>
          <p className="login-card__link">
            Don&apos;t have an account? <Link to="/signup" tabIndex={demoLoading || loading ? -1 : undefined}>Create one</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
