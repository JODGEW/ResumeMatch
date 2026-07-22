import { useSyncExternalStore } from 'react';

export type ThemePreference = 'light' | 'dark' | 'auto';

const CYCLE: Record<ThemePreference, ThemePreference> = {
  light: 'dark',
  dark: 'auto',
  auto: 'light',
};

/** Lower-case, for the desktop icon button's "switch to …" tooltip. */
export const THEME_LABELS: Record<ThemePreference, string> = {
  light: 'light mode',
  dark: 'dark mode',
  auto: 'auto (match system)',
};

/** Title-case, for the mobile account menu row. */
const MENU_LABELS: Record<ThemePreference, string> = {
  light: 'Light Mode',
  dark: 'Dark Mode',
  auto: 'Auto (match system)',
};

function readStored(): ThemePreference {
  const stored = localStorage.getItem('theme');
  if (stored === 'dark' || stored === 'light' || stored === 'auto') return stored;
  return 'auto';
}

// Module-level store rather than per-instance state: Layout mounts the desktop
// icon button and the mobile account menu row at the same time, and two copies
// of the preference would drift apart as soon as either one was used.
let preference: ThemePreference = typeof window === 'undefined' ? 'auto' : readStored();
const listeners = new Set<() => void>();

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// data-theme always carries the RESOLVED theme ('light'/'dark') — CSS never
// sees 'auto'.
export function applyResolvedTheme() {
  if (typeof document === 'undefined') return;
  const resolved = preference === 'auto' ? (systemPrefersDark() ? 'dark' : 'light') : preference;
  document.documentElement.setAttribute('data-theme', resolved);
}

export function setThemePreference(next: ThemePreference) {
  preference = next;
  localStorage.setItem('theme', next);
  applyResolvedTheme();
  listeners.forEach((listener) => listener());
}

export function cycleThemePreference() {
  setThemePreference(CYCLE[preference]);
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => preference,
    () => preference,
  );
}

/** The preference the next tap moves to. */
export function nextThemePreference(current: ThemePreference): ThemePreference {
  return CYCLE[current];
}

/** Menu label for the state the next tap moves to. */
export function nextThemeLabel(current: ThemePreference): string {
  return MENU_LABELS[CYCLE[current]];
}
