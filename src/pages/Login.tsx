import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { signInWithRedirect } from 'aws-amplify/auth';
import { useAuth } from '../auth/AuthContext';
import { isCredentialSignInFailure } from '../utils/authErrors';
import { AuthLayout, AuthSwitch, AuthCardSwitch } from './auth/AuthLayout';
import { GoogleIcon, EyeIcon, ErrorIcon, SuccessIcon, ArrowRightIcon } from './auth/authIcons';
import './auth/Auth.css';

export function Login() {
  const DEMO_EMAIL = 'demo123@resumeapp.com';
  const DEMO_PASSWORD = 'ResumeApp123!?';
  const location = useLocation();
  // ForgotPassword lands here with the email it just reset, so the user only
  // has to type the new password.
  const locationState = location.state as { resetSuccess?: boolean; email?: string } | null;
  const resetSuccess = locationState?.resetSuccess;
  const prefilledEmail = locationState?.email ?? '';
  const [email, setEmail] = useState(prefilledEmail);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [showGoogleHint, setShowGoogleHint] = useState(false);
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const { login, user, isLoading, authError, clearAuthError } = useAuth();
  const navigate = useNavigate();
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

  async function handleDemo() {
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
  }

  const googleButton = (
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
  );

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to keep matching and practicing."
      switcher={<AuthSwitch prompt="New here?" to="/signup" label="Create account" disabled={busy} />}
      belowCard={
        <button type="button" className="auth-demo" disabled={busy} onClick={handleDemo}>
          {demoLoading ? (
            <span>
              <span className="loading-spinner loading-spinner--sm" /> Signing in...
            </span>
          ) : (
            <span>
              <strong>Just looking?</strong>{' '}
              <span className="auth-demo__long">Open the demo workspace — shared, read-only, no account.</span>
              <span className="auth-demo__short">Open the demo — shared, read-only, no account.</span>
            </span>
          )}
          <ArrowRightIcon />
        </button>
      }
    >
      {resetSuccess && (
        <div className="auth-banner auth-banner--success" role="status">
          <SuccessIcon />
          <span>
            <strong>Password updated.</strong> Sign in with your new password.
          </span>
        </div>
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

      {!resetSuccess && googleButton}

      {!resetSuccess && (
        <div className="auth-divider">
          <span>or sign in with email</span>
        </div>
      )}

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
            autoFocus={!prefilledEmail}
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
              placeholder={resetSuccess ? 'Enter your new password' : 'Enter your password'}
              required
              autoComplete="current-password"
              autoFocus={Boolean(prefilledEmail)}
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
      </form>

      {/* After a reset the email is prefilled, so the password form is the
          primary path and Google drops below it. */}
      {resetSuccess && (
        <div className="auth-divider">
          <span>or</span>
        </div>
      )}

      {resetSuccess && googleButton}

      <AuthCardSwitch prompt="New here?" to="/signup" label="Create account" disabled={busy} />
    </AuthLayout>
  );
}
