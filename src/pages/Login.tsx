import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import './Login.css';

export function Login() {
  const DEMO_EMAIL = 'demo123@resumeapp.com';
  const DEMO_PASSWORD = 'ResumeApp123!?';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [demoSelected, setDemoSelected] = useState(false);
  const { login, user } = useAuth();
  const navigate = useNavigate();

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
          <p>Sign in to analyze your resume against job descriptions</p>
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

        <form onSubmit={handleSubmit} className="login-card__form">
          <div className="login-card__field">
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              name="email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (demoSelected) {
                  setDemoSelected(false);
                }
              }}
              placeholder="you@company.com"
              required
              autoComplete="email"
              autoFocus
            />
          </div>

          <div className="login-card__field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (demoSelected) {
                  setDemoSelected(false);
                }
              }}
              placeholder="Enter your password"
              required
              autoComplete="current-password"
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
                Signing in...
              </>
            ) : (
              'Sign in'
            )}
          </button>
        </form>

        <div className="login-card__demo">
          <button
            type="button"
            className="login-card__demo-btn"
            aria-pressed={demoSelected}
            onClick={() => {
              setDemoSelected((isSelected) => {
                const nextSelected = !isSelected;

                if (nextSelected) {
                  setEmail(DEMO_EMAIL);
                  setPassword(DEMO_PASSWORD);
                } else if (email === DEMO_EMAIL && password === DEMO_PASSWORD) {
                  setEmail('');
                  setPassword('');
                }

                return nextSelected;
              });
            }}
          >
            Try Demo
          </button>
        </div>
      </div>
    </div>
  );
}
