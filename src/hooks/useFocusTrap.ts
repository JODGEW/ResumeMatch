import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * Focus management for modal dialogs (WAI-ARIA APG modal pattern), for
 * components that are conditionally rendered — mounted means open.
 *
 * While mounted: Tab / Shift+Tab cycle within `containerRef`'s focusable
 * elements, and Escape calls `onEscape`. On unmount, focus returns to the
 * element that was focused before the modal opened.
 */
export function useFocusTrap(containerRef: RefObject<HTMLElement>, onEscape: () => void) {
  // Captured in a state initializer so it reads document.activeElement during
  // the first render — a mount effect would run after the modal's autoFocus
  // has already moved focus, and would capture the modal's own button.
  const [previouslyFocused] = useState<Element | null>(() => document.activeElement);

  const onEscapeRef = useRef(onEscape);
  useEffect(() => {
    onEscapeRef.current = onEscape;
  });

  useEffect(() => {
    // The panel node is stable while the modal is mounted; capture it here so
    // the cleanup can inspect it (the ref is detached before cleanup runs).
    const container = containerRef.current;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onEscapeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      if (!container) return;
      const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      const activeInside = active instanceof HTMLElement && container.contains(active);
      if (event.shiftKey) {
        if (!activeInside || active === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (!activeInside || active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      // StrictMode re-runs this cleanup in dev while the modal is still open
      // and holds focus; restoring then would yank focus out of the dialog.
      // Only restore once the modal no longer owns focus (it really closed).
      if (container?.isConnected && container.contains(document.activeElement)) return;
      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) {
        previouslyFocused.focus();
      }
    };
  }, [containerRef, previouslyFocused]);
}
