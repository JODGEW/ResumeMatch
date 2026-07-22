import { useEffect } from 'react';

// Ref-counted rather than a plain set/restore: overlays nest (the tracker's
// discard-changes ConfirmModal opens *inside* ApplicationModal), and a naive
// cleanup would unfreeze the page when the inner one closes while the outer is
// still up.
let lockCount = 0;
let restoreOverflow = '';

/** Freeze page scroll behind an overlay for as long as the caller is mounted. */
export function useBodyScrollLock(active = true) {
  useEffect(() => {
    if (!active) return;

    if (lockCount === 0) {
      restoreOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    lockCount += 1;

    return () => {
      lockCount -= 1;
      if (lockCount === 0) document.body.style.overflow = restoreOverflow;
    };
  }, [active]);
}
