import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signInWithRedirect } from 'aws-amplify/auth';
import { useAuth } from '../auth/AuthContext';
import { CodeInput } from '../components/CodeInput';
import { useResendTimer } from '../hooks/useResendTimer';
import { validatePassword, friendlyPasswordPolicyError } from '../utils/passwordPolicy';
import { AuthLayout } from './auth/AuthLayout';
import { AuthPasswordMeter, AuthMatchNote } from './auth/AuthPasswordMeter';
import { GoogleIcon, EyeIcon, ErrorIcon } from './auth/authIcons';
import './auth/Auth.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function Signup() {
  const [step, setStep] = useState<'register' | 'confirm'>('register');
  const [email, setEmail] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const { signup, confirmAccount, login } = useAuth();
  const navigate = useNavigate();
  const { remaining, canResend, restart } = useResendTimer(30);

  const emailValid = EMAIL_RE.test(email);
  const emailShowsError = emailTouched && email.length > 0 && !emailValid;

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    setError('');
    setEmailTouched(true);

    if (!emailValid) {
      setError('Please enter a valid email address.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    const policyError = validatePassword(password);
    if (policyError) {
      setError(policyError);
      return;
    }

    setLoading(true);
    try {
      await signup(email, password, '');
      setStep('confirm');
    } catch (err) {
      setError(
        friendlyPasswordPolicyError(err)
          ?? (err instanceof Error ? err.message : 'Sign-up failed.')
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setResending(true);
    setError('');
    setResent(false);
    try {
      await signup(email, password, '');
      setResent(true);
      restart();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend code.');
    } finally {
      setResending(false);
    }
  }

  async function handleConfirm(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (code.length !== 6) {
      setError('Enter the 6-digit verification code from your email.');
      return;
    }
    setLoading(true);
    try {
      await confirmAccount(email, code);
      await login(email, password);
      navigate('/upload');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Confirmation failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle={
        step === 'register' ? (
          'Start matching your resume in under a minute.'
        ) : (
          <>
            We sent a verification code to <strong>{email}</strong>
          </>
        )
      }
    >
      {error && (
        <div className="auth-banner auth-banner--error" role="alert">
          <ErrorIcon />
          {error}
        </div>
      )}

      {step === 'register' ? (
        <>
          <button
            type="button"
            className="auth-btn auth-btn--soft"
            disabled={loading}
            onClick={() => {
              signInWithRedirect({ provider: 'Google' }).catch((err) => {
                setError(err instanceof Error ? err.message : 'Google sign-up failed');
              });
            }}
          >
            <GoogleIcon />
            Sign up with Google
          </button>

          <div className="auth-divider">
            <span>or sign up with email</span>
          </div>

          <form onSubmit={handleRegister}>
            <div className="auth-field">
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                name="email"
                type="email"
                className={`auth-input${emailShowsError ? ' is-error' : ''}`}
                value={email}
                onChange={(e) => { setEmail(e.target.value); setEmailTouched(true); }}
                onBlur={() => setEmailTouched(true)}
                placeholder="you@company.com"
                required
                autoComplete="email"
                autoFocus
              />
              {emailShowsError && <span className="auth-inline-error">Enter a valid email address</span>}
            </div>

            <div className="auth-field auth-field--pw">
              <label htmlFor="password">Password</label>
              <div className="auth-pw-wrap">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  className="auth-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setPasswordFocused(true)}
                  onBlur={() => setPasswordFocused(false)}
                  placeholder="Create a strong password"
                  required
                  autoComplete="new-password"
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
              <AuthPasswordMeter password={password} visible={passwordFocused || password.length > 0} />
            </div>

            <div className="auth-field">
              <label htmlFor="confirmPassword">Confirm password</label>
              <div className="auth-pw-wrap">
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  className={`auth-input${confirmPassword.length > 0 && confirmPassword !== password ? ' is-error' : ''}`}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
                  required
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="auth-pw-toggle"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  <EyeIcon open={!showConfirmPassword} />
                </button>
              </div>
              <AuthMatchNote password={password} confirm={confirmPassword} />
            </div>

            <button type="submit" className="auth-btn auth-btn--primary" disabled={loading}>
              {loading ? (
                <>
                  <span className="loading-spinner loading-spinner--sm" />
                  Creating account...
                </>
              ) : (
                'Create account'
              )}
            </button>

            <p className="auth-consent">
              {/* New tab: same-tab navigation would discard the half-filled signup form. */}
              By creating an account, you agree to our{' '}
              <Link to="/terms" target="_blank" rel="noopener noreferrer">Terms</Link> and{' '}
              <Link to="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</Link>.
            </p>
          </form>

          <div className="auth-switch">
            Already have an account? <Link to="/login">Sign in</Link>
          </div>
        </>
      ) : (
        <form onSubmit={handleConfirm}>
          {resent && (
            <div className="auth-banner auth-banner--success">A new code has been sent to your email.</div>
          )}

          <div className="auth-field auth-field--tight">
            <label>Verification code</label>
            <CodeInput value={code} onChange={setCode} />
          </div>

          <p className="auth-resend-line">
            Didn&apos;t receive the code?{' '}
            <button
              type="button"
              className="auth-resend"
              onClick={handleResend}
              disabled={!canResend || resending}
            >
              {resending ? 'Resending...' : canResend ? 'Resend code' : `Resend (${remaining}s)`}
            </button>
          </p>

          <button type="submit" className="auth-btn auth-btn--primary" disabled={loading}>
            {loading ? (
              <>
                <span className="loading-spinner loading-spinner--sm" />
                Verifying...
              </>
            ) : (
              'Verify email'
            )}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
