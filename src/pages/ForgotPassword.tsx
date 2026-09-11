import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { CodeInput } from '../components/CodeInput';
import { useResendTimer } from '../hooks/useResendTimer';
import { validatePassword, friendlyPasswordPolicyError } from '../utils/passwordPolicy';
import { AuthLayout, AuthBackLink, AuthCardSwitch } from './auth/AuthLayout';
import { AuthPasswordMeter, AuthMatchNote } from './auth/AuthPasswordMeter';
import { EyeIcon, ErrorIcon, SuccessIcon } from './auth/authIcons';
import './auth/Auth.css';

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
      // The countdown runs from when the code was sent, not from page load.
      restart();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(e: FormEvent) {
    e.preventDefault();
    setError('');

    // Collect every client-side problem in form order (code, then password) —
    // the banner names everything wrong with the submit, not just the first
    // failed check.
    const problems: string[] = [];
    if (code.length !== 6) {
      problems.push('Enter the 6-digit verification code from your email.');
    }
    const policyError = validatePassword(newPassword);
    if (policyError) {
      problems.push(policyError);
    }
    if (newPassword !== confirmPassword) {
      problems.push('Passwords do not match.');
    }
    if (problems.length > 0) {
      // Newline-joined: .auth-banner--error renders pre-line, one problem per line.
      setError(problems.join('\n'));
      return;
    }

    setLoading(true);
    try {
      await confirmForgotPassword(email, code, newPassword);
      navigate('/login', { state: { resetSuccess: true, email } });
    } catch (err) {
      setError(
        friendlyPasswordPolicyError(err)
          ?? (err instanceof Error ? err.message : 'Password reset failed.')
      );
    } finally {
      setLoading(false);
    }
  }

  function handleChangeEmail() {
    setStep('request');
    setCode('');
    setError('');
    setResent(false);
  }

  return (
    <AuthLayout
      title="Reset your password"
      step={step === 'request' ? [1, 2] : [2, 2]}
      switcher={<AuthBackLink to="/login" label="Back to sign in" />}
      subtitle={
        step === 'request' ? (
          'Enter your email and we’ll send you a reset code.'
        ) : (
          <>
            Code sent to{' '}
            <span className="auth-email-row">
              <strong>{email}</strong>{' '}
              <button type="button" className="auth-link-btn" onClick={handleChangeEmail} disabled={loading}>
                Change
              </button>
            </span>
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

      {step === 'request' ? (
        <form onSubmit={handleRequest}>
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
              autoFocus
              autoComplete="email"
            />
          </div>

          <button type="submit" className="auth-btn auth-btn--primary" disabled={loading}>
            {loading ? (
              <>
                <span className="loading-spinner loading-spinner--sm" />
                Sending code...
              </>
            ) : (
              'Send reset code'
            )}
          </button>
        </form>
      ) : (
        <form onSubmit={handleReset}>
          {resent && !error && (
            <div className="auth-banner auth-banner--success" role="status">
              <SuccessIcon />
              <span>A new code has been sent to your email.</span>
            </div>
          )}

          <div className="auth-field">
            <div className="auth-label-row">
              <label>Verification code</label>
              <button
                type="button"
                className="auth-resend"
                onClick={handleResend}
                disabled={!canResend || resending}
              >
                {resending ? 'Resending...' : canResend ? 'Resend code' : `Resend in ${remaining}s`}
              </button>
            </div>
            <CodeInput value={code} onChange={setCode} />
          </div>

          <div className="auth-field auth-field--pw">
            <label htmlFor="newPassword">New password</label>
            <div className="auth-pw-wrap">
              <input
                id="newPassword"
                name="newPassword"
                type={showPassword ? 'text' : 'password'}
                className="auth-input"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
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
            <AuthPasswordMeter password={newPassword} />
          </div>

          <div className="auth-field">
            <label htmlFor="confirmPassword">Confirm new password</label>
            <div className="auth-pw-wrap">
              <input
                id="confirmPassword"
                name="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                className={`auth-input${confirmPassword.length > 0 && confirmPassword !== newPassword ? ' is-error' : ''}`}
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
            <AuthMatchNote password={newPassword} confirm={confirmPassword} />
          </div>

          <button type="submit" className="auth-btn auth-btn--primary" disabled={loading}>
            {loading ? (
              <>
                <span className="loading-spinner loading-spinner--sm" />
                Resetting...
              </>
            ) : (
              'Reset password'
            )}
          </button>
        </form>
      )}

      <AuthCardSwitch to="/login" label="Back to sign in" disabled={loading} />
    </AuthLayout>
  );
}
