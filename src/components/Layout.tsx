import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { LogoMark } from './LogoMark';
import { ThemeToggle, ThemeIcon } from './ThemeToggle';
import {
  cycleThemePreference,
  nextThemeLabel,
  nextThemePreference,
  useThemePreference,
} from '../utils/theme';
import { useState, useEffect, useCallback, useLayoutEffect, useRef } from 'react';
import './Layout.css';

// The account menu takes over from the desktop nav's right-hand cluster at this
// width, per the approved Claude Design bundle (New Analysis.dc.html nav).
const MOBILE_NAV_QUERY = '(max-width: 1024px)';

const DEMO_EMAIL = 'demo123@resumeapp.com';

// The cost dashboard shows per-analysis estimatedCost and token counts — internal unit
// economics. It is owner-only. Note this is NOT demo123@resumeapp.com: that is the public
// "Try Demo" account, so gating on it meant anyone who clicked Try Demo could open
// /dashboard from the nav and read our costs.
const COST_DASHBOARD_EMAIL = 'demo@resumeapp.com';

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const themePref = useThemePreference();
  const layoutRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);

  // The sticky header's height varies (demo banner, wrapping). Publish the measured
  // height as --app-header-h so page-level sticky chrome (e.g. the InterviewResults
  // Assessment/Transcript switcher) can offset against the real header instead of a
  // hardcoded 60px. Layout effect: set before first paint to avoid a one-frame jump.
  useLayoutEffect(() => {
    const layout = layoutRef.current;
    const header = headerRef.current;
    if (!layout || !header) return;
    const publishHeight = () => {
      layout.style.setProperty('--app-header-h', `${header.getBoundingClientRect().height}px`);
    };
    publishHeight();
    const observer = new ResizeObserver(publishHeight);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  // The menu only exists below MOBILE_NAV_QUERY; leave it closed when a resize
  // swaps the nav back to its desktop form.
  useEffect(() => {
    const media = window.matchMedia(MOBILE_NAV_QUERY);
    const handler = () => setMenuOpen(false);
    media.addEventListener('change', handler);
    return () => media.removeEventListener('change', handler);
  }, []);

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
    try {
      await logout();
    } catch (err) {
      console.error('Sign out failed:', err);
    }
  }

  const isDashboardVisible = user?.email === COST_DASHBOARD_EMAIL;

  return (
    <div className="layout" ref={layoutRef}>
      <header className="header-sticky" ref={headerRef}>
        <nav className="nav">
          <div className="nav__inner">
            <Link to="/upload" className="nav__brand" aria-label="ResumeMatch home">
              <div className="nav__logo">
                <LogoMark />
              </div>
              <span className="nav__title">ResumeMatch</span>
            </Link>

            <div className="nav__links">
              <NavLink to="/upload" className={({ isActive }) => `nav__link ${isActive ? 'nav__link--active' : ''}`}>
                <svg width="17" height="17" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7.5 10V3m0 0L4.5 6m3-3 3 3" />
                  <path d="M2.5 10.5v1.5a1 1 0 001 1h8a1 1 0 001-1v-1.5" />
                </svg>
                Upload
              </NavLink>
              <NavLink to="/history" className={({ isActive }) => `nav__link ${isActive ? 'nav__link--active' : ''}`}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                  <path d="M12 7v5l4 2" />
                </svg>
                History
              </NavLink>
              <NavLink to="/interview/history" className={({ isActive }) => `nav__link ${isActive ? 'nav__link--active' : ''}`}>
                <svg width="17" height="17" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="5" y="1.75" width="5" height="7.5" rx="2.5" />
                  <path d="M3.25 7.25c0 2.35 1.9 4.25 4.25 4.25s4.25-1.9 4.25-4.25" />
                  <path d="M7.5 11.5v1.75" />
                  <path d="M5.5 13.25h4" />
                </svg>
                Interviews
              </NavLink>
              {isDashboardVisible && (
                <NavLink to="/dashboard" className={({ isActive }) => `nav__link ${isActive ? 'nav__link--active' : ''}`}>
                  <svg width="17" height="17" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 11.5V7h2.5v4.5M6.25 11.5V4h2.5v7.5M10.5 11.5V2H13v9.5" />
                  </svg>
                  Dashboard
                </NavLink>
              )}
              <NavLink to="/tracker" className={({ isActive }) => `nav__link ${isActive ? 'nav__link--active' : ''}`}>
                <svg width="17" height="17" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="2" width="11" height="11" rx="2" />
                  <path d="M5 7.5l2 2 3-4" />
                </svg>
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

            {/* Replaces the cluster above below MOBILE_NAV_QUERY */}
            <button
              className="nav__hamburger"
              onClick={() => setMenuOpen(o => !o)}
              title="Menu"
              aria-label="Menu"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M3 5h12M3 9h12M3 13h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
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

      {/* Mobile account menu */}
      {menuOpen && (
        <>
          <div className="nav__menu-backdrop" onClick={closeMenu} aria-hidden="true" />
          <div className="nav__menu" role="menu" aria-label="Account">
            <div className="nav__menu-label">Account</div>

            <button type="button" role="menuitem" className="nav__menu-item" onClick={cycleThemePreference}>
              <span className="nav__menu-item-main">
                <ThemeIcon preference={nextThemePreference(themePref)} size={16} />
                {nextThemeLabel(themePref)}
              </span>
            </button>

            <div className="nav__menu-divider" />

            <div className="nav__menu-email">{user?.email}</div>

            <button type="button" role="menuitem" className="nav__menu-item" onClick={handleLogout}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M6 2H3v12h3M10 11l3-3-3-3M13 8H6"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Sign out
            </button>
          </div>
        </>
      )}

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
