import { useEffect } from 'react';
import {
  applyResolvedTheme,
  cycleThemePreference,
  nextThemePreference,
  useThemePreference,
  THEME_LABELS,
  type ThemePreference,
} from '../utils/theme';
import './ThemeToggle.css';

export function ThemeIcon({ preference, size = 18 }: { preference: ThemePreference; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  if (preference === 'light') {
    return (
      <svg {...common}>
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
    );
  }

  if (preference === 'dark') {
    return (
      <svg {...common}>
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

export function ThemeToggle() {
  const preference = useThemePreference();
  const next = nextThemePreference(preference);

  // Only meaningful while the preference is 'auto'; re-subscribing on every
  // change keeps that condition in one place.
  useEffect(() => {
    if (preference !== 'auto') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    applyResolvedTheme();
    media.addEventListener('change', applyResolvedTheme);
    return () => media.removeEventListener('change', applyResolvedTheme);
  }, [preference]);

  return (
    <button
      className="theme-toggle"
      onClick={cycleThemePreference}
      title={`Theme: ${THEME_LABELS[preference]} — switch to ${THEME_LABELS[next]}`}
      aria-label={`Theme: ${THEME_LABELS[preference]} — switch to ${THEME_LABELS[next]}`}
    >
      <ThemeIcon preference={preference} />
    </button>
  );
}
