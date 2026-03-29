import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { CodeInput } from '../components/CodeInput';
import { useResendTimer } from '../hooks/useResendTimer';
import './Login.css';

function getPasswordStrength(pw: string): 'weak' | 'medium' | 'strong' {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[a-z]/.test(pw)) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw)) score++;
  if (pw.length >= 12) score++;
  if (score <= 2) return 'weak';
  if (score <= 4) return 'medium';
  return 'strong';
}

export function ForgotPassword() {
  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const { forgotPassword, confirmForgotPassword } = useAuth();
  const navigate = useNavigate();
  const { remaining, canResend, restart } = useResendTimer(30);

  function friendlyError(err: unknown): string {
    const msg = err instanceof Error ? err.message : '';
    if (/attempt limit|too many|throttl/i.test(msg)) {
      return 'Too many attempts. Please wait a few minutes before trying again.';
    }
    return msg || 'Something went wrong. Please try again.';
  }

  async function handleResend() {
    setResending(true);
    setError('');
    setResent(false);
    try {
      await forgotPassword(email);
      setResent(true);
      restart();
    } catch (err) {
      setResent(false);
      setError(friendlyError(err));
    } finally {
      setResending(false);
    }
  }

  async function handleRequest(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await forgotPassword(email);
      setStep('reset');
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    try {
      await confirmForgotPassword(email, code, newPassword);
      navigate('/login', { state: { resetSuccess: true } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password reset failed.');
    } finally {
      setLoading(false);
    }
  }

  const eyeOpen = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );

  const eyeClosed = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );

  return (
    <div className="login-page">
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
          <p>
            {step === 'request'
              ? 'Enter your email and we\u2019ll send you a reset code.'
              : 'Enter the code from your email and set a new password.'}
          </p>
        </div>

        {error && (
          <div className="login-card__error animate-in">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="7" stroke="var(--danger)" strokeWidth="1.5" />
              <path d="M8 5v3.5M8 10.5v.5" stroke="var(--danger)" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            {error}
          </div>
        )}

        {step === 'request' ? (
          <form onSubmit={handleRequest} className="login-card__form">
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
                autoFocus
                autoComplete="email"
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary login-card__submit"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="loading-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                  Sending code...
                </>
              ) : (
                'Send reset code'
              )}
            </button>

          </form>
        ) : (
          <form onSubmit={handleReset} className="login-card__form">
            {!error && !resending && (
              <p className="login-card__success animate-in" style={{ display: 'block', textAlign: 'center' }}>
                {resent ? 'A new code has been sent to your email.' : <>We&apos;ve sent a reset code to <strong>{email}</strong></>}
              </p>
            )}

            <div className="login-card__field">
              <label>Verification code</label>
              <CodeInput value={code} onChange={setCode} />
            </div>

            <p className="login-card__link">
              Didn&apos;t receive the code?{' '}
              <button
                type="button"
                className="login-card__resend"
                onClick={handleResend}
                disabled={!canResend || resending}
              >
                {resending ? 'Resending...' : canResend ? 'Resend code' : `Resend (${remaining}s)`}
              </button>
            </p>

            <div className="login-card__field">
              <label htmlFor="newPassword">New password</label>
              <div className="login-card__password-wrapper">
                <input
                  id="newPassword"
                  name="newPassword"
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Create a strong password"
                  required
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="login-card__password-toggle"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? eyeClosed : eyeOpen}
                </button>
              </div>
              {newPassword.length === 0 ? (
                <p className="login-card__pw-hint">Use 8+ characters with letters, numbers &amp; symbols</p>
              ) : (
                <ul className="login-card__pw-rules">
                  <li data-met={newPassword.length >= 8}>8+ chars</li>
                  <li data-met={/[a-z]/.test(newPassword)}>lowercase</li>
                  <li data-met={/[A-Z]/.test(newPassword)}>uppercase</li>
                  <li data-met={/\d/.test(newPassword)}>number</li>
                  <li data-met={/[^a-zA-Z0-9]/.test(newPassword)}>symbol</li>
                </ul>
              )}
              {newPassword.length > 0 && (
                <div className={`login-card__pw-strength login-card__pw-strength--${getPasswordStrength(newPassword)}`}>
                  <div className="login-card__pw-strength-track">
                    <div className="login-card__pw-strength-seg" />
                    <div className="login-card__pw-strength-seg" />
                    <div className="login-card__pw-strength-seg" />
                  </div>
                  <span className="login-card__pw-strength-label">{getPasswordStrength(newPassword)}</span>
                </div>
              )}
            </div>

            <div className={`login-card__field${confirmPassword.length > 0 && confirmPassword !== newPassword ? ' login-card__field--error' : ''}`}>
              <label htmlFor="confirmPassword">Confirm new password</label>
              <div className="login-card__password-wrapper">
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
                  required
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="login-card__password-toggle"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? eyeClosed : eyeOpen}
                </button>
              </div>
              {confirmPassword.length > 0 && (
                confirmPassword === newPassword ? (
                  <span className="login-card__pw-match login-card__pw-match--yes">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    Passwords match
                  </span>
                ) : (
                  <span className="login-card__pw-match login-card__pw-match--no">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                    Passwords do not match
                  </span>
                )
              )}
            </div>

            <button
              type="submit"
              className="btn btn-primary login-card__submit"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="loading-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                  Resetting...
                </>
              ) : (
                'Reset password'
              )}
            </button>

          </form>
        )}

        <p className="login-card__link" style={{ marginTop: '1.25rem' }}>
          <Link to="/login">← Back to log in</Link>
        </p>

        <div className="login-card__footer">
          <p className="login-card__link">
            Don&apos;t have an account? <Link to="/signup">Create one</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
