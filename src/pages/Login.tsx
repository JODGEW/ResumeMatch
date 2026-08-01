import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { signInWithRedirect } from 'aws-amplify/auth';
import { useAuth } from '../auth/AuthContext';
import { isCredentialSignInFailure } from '../utils/authErrors';
import { AuthLayout } from './auth/AuthLayout';
import { GoogleIcon, EyeIcon, ErrorIcon } from './auth/authIcons';
import './auth/Auth.css';

export function Login() {
  const DEMO_EMAIL = 'demo123@resumeapp.com';
  const DEMO_PASSWORD = 'ResumeApp123!?';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [showGoogleHint, setShowGoogleHint] = useState(false);
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const { login, user, isLoading, authError, clearAuthError } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as { signupSuccess?: boolean; resetSuccess?: boolean } | null;
  const signupSuccess = locationState?.signupSuccess;
  const resetSuccess = locationState?.resetSuccess;
  const busy = loading || demoLoading;

  useEffect(() => {
    if (!isLoading && user) {
      navigate('/upload', { replace: true });
    }
  }, [isLoading, navigate, user]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setShowGoogleHint(false);
    clearAuthError();
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
      setShowGoogleHint(isCredentialSignInFailure(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to keep matching and practicing.">
      {signupSuccess && (
        <div className="auth-banner auth-banner--success">Account created! Sign in with your credentials.</div>
      )}

      {resetSuccess && (
        <div className="auth-banner auth-banner--success">Password reset! Sign in with your new password.</div>
      )}

      {(error || authError) && (
        <div className="auth-banner auth-banner--error" role="alert">
          <ErrorIcon />
          <div>
            {error || authError}
            {showGoogleHint && (
              <div className="auth-banner-hint">
                If you signed up with Google, your account has no password here — use
                &ldquo;Continue with Google&rdquo; below instead.
              </div>
            )}
          </div>
        </div>
      )}

      <button
        type="button"
        className="auth-btn auth-btn--soft"
        disabled={busy}
        onClick={() => {
          signInWithRedirect({ provider: 'Google' }).catch((err) => {
            setError(err instanceof Error ? err.message : 'Google sign-in failed');
          });
        }}
      >
        <GoogleIcon />
        Continue with Google
      </button>

      <div className="auth-divider">
        <span>or sign in with email</span>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="auth-field">
          <label htmlFor="email">Email address</label>
          <input
            id="email"
            name="email"
            type="email"
            className="auth-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            required
            autoComplete="email"
            autoFocus
          />
        </div>

        <div className="auth-field">
          <div className="auth-label-row">
            <label htmlFor="password">Password</label>
            <Link
              to="/forgot-password"
              className={busy ? 'is-disabled' : undefined}
              tabIndex={busy ? -1 : undefined}
            >
              Forgot password?
            </Link>
          </div>
          <div className="auth-pw-wrap">
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              className="auth-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              autoComplete="current-password"
            />
            <button
              type="button"
              className="auth-pw-toggle"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              <EyeIcon open={!showPassword} />
            </button>
          </div>
        </div>

        <button type="submit" className="auth-btn auth-btn--primary" disabled={busy}>
          {loading ? (
            <>
              <span className="loading-spinner loading-spinner--sm" />
              Signing in...
            </>
          ) : (
            'Sign in'
          )}
        </button>

        <button
          type="button"
          className="auth-btn auth-btn--soft auth-btn--stacked"
          disabled={busy}
          onClick={async () => {
            setError('');
            setShowGoogleHint(false);
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
              <span className="loading-spinner loading-spinner--sm" />
              Signing in...
            </>
          ) : (
            'Try demo — no signup required'
          )}
        </button>
      </form>

      <div className={`auth-switch${busy ? ' is-disabled' : ''}`}>
        Don&apos;t have an account?{' '}
        <Link to="/signup" tabIndex={busy ? -1 : undefined}>
          Create one
        </Link>
      </div>
    </AuthLayout>
  );
}
