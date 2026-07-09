import { useState, useEffect } from 'react';
import './ThemeToggle.css';

type ThemePreference = 'light' | 'dark' | 'auto';

const CYCLE: Record<ThemePreference, ThemePreference> = {
  light: 'dark',
  dark: 'auto',
  auto: 'light',
};

const LABELS: Record<ThemePreference, string> = {
  light: 'light mode',
  dark: 'dark mode',
  auto: 'auto (match system)',
};

function getInitialPreference(): ThemePreference {
  const stored = localStorage.getItem('theme');
  if (stored === 'dark' || stored === 'light' || stored === 'auto') return stored;
  return 'auto';
}

export function ThemeToggle() {
  const [preference, setPreference] = useState<ThemePreference>(getInitialPreference);

  useEffect(() => {
    localStorage.setItem('theme', preference);

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    // data-theme always carries the RESOLVED theme ('light'/'dark') — CSS and
    // Layout's attribute observer never see 'auto'.
    const apply = () => {
      const resolved = preference === 'auto' ? (media.matches ? 'dark' : 'light') : preference;
      document.documentElement.setAttribute('data-theme', resolved);
    };
    apply();

    if (preference !== 'auto') return;
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [preference]);

  const next = CYCLE[preference];

  return (
    <button
      className="theme-toggle"
      onClick={() => setPreference(next)}
      title={`Theme: ${LABELS[preference]} — switch to ${LABELS[next]}`}
      aria-label={`Theme: ${LABELS[preference]} — switch to ${LABELS[next]}`}
    >
      {preference === 'light' && (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      )}
      {preference === 'dark' && (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
      {preference === 'auto' && (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      )}
    </button>
  );
}
