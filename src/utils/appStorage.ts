/**
 * Sign-out scrub for the app's own localStorage keys.
 *
 * Runs at the top of AuthContext.logout() — before Amplify signOut and before
 * any hosted-UI redirect can unload the page — so every sign-out path scrubs,
 * but a mere page load without a session (checkAuth miss) does not.
 *
 * What this deletes is metadata, never documents: no resume PDF or conversation
 * text is ever stored client-side (resume PDFs live in S3; the picked File in
 * Upload exists only in React state). The win is privacy hygiene on shared
 * machines — the next person at this browser can't see what file you last
 * uploaded or which analyses you'd opened.
 *
 * Deliberately KEPT (device preferences, not personal data):
 *   - 'theme'            resolved theme preference (utils/theme.ts)
 *   - 'resumematch_tts'  interview text-to-speech on/off (Interview.tsx)
 *   - 'tracker_view'     tracker list/board view choice (Tracker.tsx)
 * Cognito's own CognitoIdentityServiceProvider.* keys are Amplify's to manage;
 * signOut clears them itself.
 */

// Exact keys, one per feature that persists user-scoped state.
const USER_SCOPED_KEYS = [
  // Last-resume reuse breadcrumb {analysisId, fileName, uploadedAt} (Upload.tsx)
  'resumematch_last_resume',
  // Pre-migration tracker applications; normally deleted after the one-time
  // DynamoDB migration, scrubbed here for accounts that never completed it
  // (hooks/useApplications.ts)
  'resumematch_tracker_applications',
  // "New" badge ids for completed analyses (utils/newAnalyses.ts)
  'resumematch_new_analyses',
];

// Interview pointers are keyed by a content hash: resumematch_interview_<hash>
// (utils/interviewPointer.ts). Swept by prefix.
const USER_SCOPED_PREFIXES = ['resumematch_interview_'];

export function clearUserScopedStorage() {
  try {
    const doomed = USER_SCOPED_KEYS.filter((k) => localStorage.getItem(k) !== null);
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && USER_SCOPED_PREFIXES.some((p) => key.startsWith(p))) {
        doomed.push(key);
      }
    }
    doomed.forEach((k) => localStorage.removeItem(k));
  } catch {
    // Storage unavailable (private mode edge cases) — sign-out must not fail
    // over hygiene cleanup.
  }
}
