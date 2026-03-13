import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import './Layout.css';

const DEMO_EMAIL = 'demo123@resumeapp.com';

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="layout">
      <header className="header-sticky">
        <nav className="nav">
          <div className="nav__inner">
            <div className="nav__brand">
              <div className="nav__logo">
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                  <rect x="2" y="2" width="24" height="24" rx="6" stroke="var(--accent)" strokeWidth="2" />
                  <path d="M8 9h12M8 14h8M8 19h10" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
              <span className="nav__title">ResumeMatch</span>
            </div>

            <div className="nav__links">
              <NavLink to="/upload" className={({ isActive }) => `nav__link ${isActive ? 'nav__link--active' : ''}`}>
                Upload
              </NavLink>
              <NavLink to="/history" className={({ isActive }) => `nav__link ${isActive ? 'nav__link--active' : ''}`}>
                History
              </NavLink>
              {(user?.email === 'demo123@resumeapp.com' || import.meta.env.VITE_DEV_BYPASS === 'true') && (
                <NavLink to="/dashboard" className={({ isActive }) => `nav__link ${isActive ? 'nav__link--active' : ''}`}>
                  Dashboard
                </NavLink>
              )}
              <NavLink to="/tracker" className={({ isActive }) => `nav__link ${isActive ? 'nav__link--active' : ''}`}>
                Tracker
              </NavLink>
            </div>

            <div className="nav__user">
              <span className="nav__email">{user?.email}</span>
              <button onClick={handleLogout} className="btn btn-ghost nav__logout">
                Sign out
              </button>
            </div>
          </div>
          <div className="nav__mobile-user">
            <span className="nav__email">{user?.email}</span>
            <button onClick={handleLogout} className="btn btn-ghost nav__logout">
              Sign out
            </button>
          </div>
        </nav>

        {user?.email === DEMO_EMAIL && (
          <div className="demo-banner">
            <span>You are viewing a demo workspace.</span>
            <button
              className="demo-banner__cta"
              onClick={() => {
                navigate('/signup');
                logout();
              }}
            >
              Create an account to save your analysis
            </button>
          </div>
        )}
      </header>

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
