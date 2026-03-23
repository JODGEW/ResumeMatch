import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ThemeToggle } from './ThemeToggle';
import { useState, useEffect, useCallback } from 'react';
import './Layout.css';

const DEMO_EMAIL = 'demo123@resumeapp.com';

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') ?? 'dark'
  );

  // Keep label in sync when ThemeToggle changes the data-theme attribute
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const t = document.documentElement.getAttribute('data-theme');
      if (t === 'light' || t === 'dark') setTheme(t);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  // ESC key support
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [menuOpen, closeMenu]);

  // Prevent background scroll
  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  async function handleLogout() {
    closeMenu();
    await logout();
    navigate('/login');
  }

  const isDashboardVisible =
    user?.email === DEMO_EMAIL || import.meta.env.VITE_DEV_BYPASS === 'true';

  return (
    <div className="layout">
      <header className="header-sticky">
        <nav className="nav">
          <div className="nav__inner">
            {/* Hamburger — mobile only */}
            <button
              className="nav__hamburger"
              onClick={() => setMenuOpen(o => !o)}
              aria-label="Open menu"
              aria-expanded={menuOpen}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="2" y1="5" x2="18" y2="5" />
                <line x1="2" y1="10" x2="18" y2="10" />
                <line x1="2" y1="15" x2="18" y2="15" />
              </svg>
            </button>

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
              {isDashboardVisible && (
                <NavLink to="/dashboard" className={({ isActive }) => `nav__link ${isActive ? 'nav__link--active' : ''}`}>
                  Dashboard
                </NavLink>
              )}
              <NavLink to="/tracker" className={({ isActive }) => `nav__link ${isActive ? 'nav__link--active' : ''}`}>
                Tracker
              </NavLink>
            </div>

            {/* Desktop right side */}
            <div className="nav__user">
              <ThemeToggle />
              <span className="nav__email">{user?.email}</span>
              <button onClick={handleLogout} className="btn btn-ghost nav__logout">
                Sign out
              </button>
            </div>
          </div>
        </nav>

        {user?.email === DEMO_EMAIL && (
          <div className="demo-banner">
            <span>You're exploring with a shared demo account.</span>
            <button
              className="demo-banner__cta"
              onClick={() => {
                navigate('/signup');
                logout();
              }}
            >
              Sign up for your own private workspace
            </button>
          </div>
        )}
      </header>

      {/* Mobile drawer backdrop */}
      <div
        className={`nav__backdrop ${menuOpen ? 'nav__backdrop--open' : ''}`}
        onClick={closeMenu}
        aria-hidden="true"
      />

      {/* Mobile drawer */}
      <div className={`nav__drawer ${menuOpen ? 'nav__drawer--open' : ''}`} role="dialog" aria-modal="true" aria-label="Menu">
        <div className="nav__drawer-header">
          <span className="nav__drawer-email">{user?.email}</span>
        </div>

        <div className="nav__drawer-section">
          <div className="nav__drawer-row">
            <span className="nav__drawer-label">{theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</span>
            <ThemeToggle />
          </div>
        </div>

        <div className="nav__drawer-divider" />

        <button onClick={handleLogout} className="btn btn-ghost nav__drawer-signout">
          Sign out
        </button>
      </div>

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
