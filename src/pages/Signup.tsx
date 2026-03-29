import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { CodeInput } from '../components/CodeInput';
import { useResendTimer } from '../hooks/useResendTimer';
import './Login.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

export function Signup() {
  const [step, setStep] = useState<'register' | 'confirm'>('register');
  const [email, setEmail] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const { signup, confirmAccount, login } = useAuth();
  const navigate = useNavigate();
  const { remaining, canResend, restart } = useResendTimer(30);

  const emailValid = EMAIL_RE.test(email);

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

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    try {
      await signup(email, password, '');
      setStep('confirm');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-up failed.');
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
            {step === 'register'
              ? 'Create your account'
              : <>We sent a verification code to <strong>{email}</strong></>}
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

        {step === 'register' ? (
          <form onSubmit={handleRegister} className="login-card__form">
            <div className={`login-card__field${emailTouched && email.length > 0 && !emailValid ? ' login-card__field--error' : ''}`}>
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setEmailTouched(true); }}
                onBlur={() => setEmailTouched(true)}
                placeholder="you@company.com"
                required
                autoComplete="email"
                autoFocus
              />
              {emailTouched && email.length > 0 && !emailValid && (
                <span className="login-card__pw-mismatch">Enter a valid email address</span>
              )}
            </div>

            <div className="login-card__field">
              <label htmlFor="password">Password</label>
              <div className="login-card__password-wrapper">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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
              {password.length === 0 ? (
                <p className="login-card__pw-hint">Use 8+ characters with letters, numbers &amp; symbols</p>
              ) : (
                <ul className="login-card__pw-rules">
                  <li data-met={password.length >= 8}>8+ chars</li>
                  <li data-met={/[a-z]/.test(password)}>lowercase</li>
                  <li data-met={/[A-Z]/.test(password)}>uppercase</li>
                  <li data-met={/\d/.test(password)}>number</li>
                  <li data-met={/[^a-zA-Z0-9]/.test(password)}>symbol</li>
                </ul>
              )}
              {password.length > 0 && (
                <div className={`login-card__pw-strength login-card__pw-strength--${getPasswordStrength(password)}`}>
                  <div className="login-card__pw-strength-track">
                    <div className="login-card__pw-strength-seg" />
                    <div className="login-card__pw-strength-seg" />
                    <div className="login-card__pw-strength-seg" />
                  </div>
                  <span className="login-card__pw-strength-label">{getPasswordStrength(password)}</span>
                </div>
              )}
            </div>

            <div className={`login-card__field${confirmPassword.length > 0 && confirmPassword !== password ? ' login-card__field--error' : ''}`}>
              <label htmlFor="confirmPassword">Confirm password</label>
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
                  {showConfirmPassword ? (
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
              {confirmPassword.length > 0 && (
                confirmPassword === password ? (
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
                  Creating account...
                </>
              ) : (
                'Create account'
              )}
            </button>

            <p className="login-card__link">
              Already have an account? <Link to="/login">Sign in</Link>
            </p>
          </form>
        ) : (
          <form onSubmit={handleConfirm} className="login-card__form">
            {resent && (
              <div className="login-card__success animate-in">
                A new code has been sent to your email.
              </div>
            )}

            <div className="login-card__field">
              <label>Verification code</label>
              <CodeInput value={code} onChange={setCode} />
            </div>

            <button
              type="submit"
              className="btn btn-primary login-card__submit"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="loading-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                  Verifying...
                </>
              ) : (
                'Verify email'
              )}
            </button>

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
          </form>
        )}
      </div>
    </div>
  );
}
