# ResumeMatch — Accessibility Conformance Report (Section 508 / WCAG 2.1 AA)

**Product:** ResumeMatch web application — https://resumematchapp.com
**Scope:** Frontend (React 18 SPA): landing page, authentication, resume upload & analysis, sample report, application tracker
**Not audited:** the mock interview flow (`/interview`, `/interview/history`, `/interview/results/:sessionId`), the dashboard (`/dashboard`), analysis history (`/history`), the signed-in analysis detail page (`/results/:analysisId`), and the remaining auth and legal pages (`/signup`, `/forgot-password`, `/privacy`, `/terms`).
**Audit date:** 2026-07-26
**Method:** Automated audit (Lighthouse 13.4.1, accessibility category only, **mobile** form factor, 412x823 at DPR 1.75) + manual keyboard walkthrough + source-level code review
**Test target:** the production build served locally by `vite preview` at `http://localhost:4173`, not the deployed site at the URL above. No desktop form factor was run.
**Standard applied:** WCAG 2.1 Level AA (the standard incorporated by the revised Section 508)

## Summary

**In the dark theme, all five representative pages score 100/100** on the Lighthouse accessibility audit, measured on 2026-07-26 against the tree committed as `58fe0a0` and confirmed again at HEAD on 2026-07-27.

**In the light theme they do not.** Three of the five routes fail `color-contrast`: the landing page scores 97 (25 failing elements), sign-in 95 (3) and the sample report 95 (16); `/upload` and `/tracker` score 100 in both themes. This is long-standing rather than new, it reproduces on `58fe0a0`, and it was invisible until 2026-07-27 because every earlier run was captured in the dark theme. It is not a secondary path: the app resolves an unset theme preference from `prefers-color-scheme`, so a first-time visitor on a light-mode OS gets the light theme. Five design tokens account for all of it: `--accent`, `--text-tertiary`, `--success`, `--success-alt` and `--warn`. The measurements are in **1.4.3** and the run-by-run comparison is in the **Evidence archive**.

Automated checks are complemented by the manual verification listed below, since automated tooling covers only a subset of WCAG success criteria. Full Lighthouse reports (HTML + JSON) are archived alongside this document; see **Evidence archive** for what the archive does and does not cover.

| Page | Route | Dark theme | Light theme |
| --- | --- | --- | --- |
| Landing page | `/` | 100 | 97 |
| Sign in | `/login` | 100 | 95 |
| Sample analysis report (public) | `/sample` | 100 | 95 |
| New analysis (core upload form) | `/upload` | 100 | 100 |
| Application tracker | `/tracker` | 100 | 100 |

Dark-theme scores are from the 2026-07-26 set and reproduce at HEAD. Light-theme scores are from the 2026-07-27 set, the first runs ever captured in that theme.

### Evidence archive

`docs/lighthouse-2026-07-26/` holds the five final runs above, each as HTML + JSON.

**Pre-remediation runs survive for three of the five routes, not all five.** `docs/lighthouse-2026-07-26/pre-remediation/` holds an earlier run of `/login` (95, one `color-contrast` failure), `/sample` (98, one `heading-order` failure) and `/tracker` (98, one `heading-order` failure), also as HTML + JSON. No pre-remediation run survives for `/` or `/upload`: both passed on their first run of the session and were never re-run, so nothing records a failing state for them.

Every run in both directories used identical configuration (Lighthouse 13.4.1, accessibility category only, mobile form factor, 412x823 at DPR 1.75, 4x CPU throttle), and all eight ran inside one ten-minute session. The scores therefore differ only by the state of the source tree at the time, not by method.

The pre-remediation `/login` report was originally filed under a filename naming `/upload`. That run requested `/upload` and the auth gate redirected it, so its `finalDisplayedUrl` is `/login` and its one failing element sits on the sign-in form. It is archived here under the route it actually audits.

**The artifacts were captured against the tree committed as `58fe0a0`, which is no longer HEAD.** Every run finished between 06:27 and 06:37 UTC on 2026-07-26; `58fe0a0` was committed at 06:44 UTC the same morning. Two later commits, `10e8166` (skip links for 2.4.1, neutral empty-state icon) and `78693fc` (error-banner copy), have since changed 8 files under `src/`, including `src/index.css`, `src/components/Layout.tsx`, `src/components/LegalLayout.tsx`, `src/pages/Landing.tsx` and `src/pages/Results.tsx`. Lighthouse was re-run at HEAD on 2026-07-27 to close that gap; see the 2026-07-27 paragraphs below. In the dark theme the five scores are unchanged, so this set remains representative of HEAD for the theme it was captured in.

The skip link is the one part of `10e8166` that no automated run covers, and the reason is not that it went unaudited. Lighthouse reports its `bypass` audit as `notApplicable` on these pages in every set, including 2026-07-27, because the link is parked off-viewport by a `transform` until it takes focus and an unfocused pass never evaluates it. Re-running did not and cannot change that. 2.4.1 rests on source review and the manual keyboard walkthrough instead.

Commit `58fe0a0` carries the message "Lighthouse 100 on all pages". That is true of the five final runs, and not of the three superseded runs the same commit also added. Those three are the pre-remediation set described here, and the message should be read as describing the former only.

**A third set was captured at HEAD on 2026-07-27** and lives in `docs/lighthouse-2026-07-27/`, split into `dark/` and `light/`. It was run against commit `8c252af` with the same Lighthouse version and settings as the two sets above, to test whether the skip link added in `10e8166` regressed anything.

It did not. Rebuilding `58fe0a0` and auditing it under identical conditions gives 0.96 / 0.95 / 0.95 on landing, sign-in and sample; HEAD gives 0.97 / 0.95 / 0.95, so HEAD is unchanged on four routes and one point better on the landing page. In the dark theme all five routes still score 100 at HEAD, matching the 2026-07-26 set exactly.

That comparison surfaced something the earlier sets could not: **the light theme has never passed, and no archived run before 2026-07-27 tested it.** At HEAD in light, the landing page scores 97 (25 failing elements), sign-in 95 (3) and the sample report 95 (16), every one of them `color-contrast`; `/upload` and `/tracker` score 100 in both themes. The same three routes score 0.96 / 0.95 / 0.95 when `58fe0a0` is rebuilt and audited in light, and the light-theme token block is byte-identical between the two commits, so this predates both later commits and is not a regression. See 1.4.3, whose claim this measurement contradicts.

Theme is not recorded in a Lighthouse report, so the 2026-07-26 set's theme is established indirectly: its only report carrying colour evidence (`pre-remediation/login.json`) shows a dark surface (`#08090a`), and `58fe0a0` audited in light scores 95 to 96 rather than the 100 that set recorded. Both point to dark. The 2026-07-27 set removes the ambiguity by naming the theme in the directory. Dark was forced with Chrome's `--force-dark-mode`; light is the headless default.

Reaching `/upload` and `/tracker` requires an authenticated session, so those two were audited against a build with `VITE_DEV_BYPASS=true`, and the other three with it off, which is how each route renders for a first-time visitor. The 2026-07-26 set was captured the same way: its `/upload` and `/tracker` runs resolve to those routes instead of redirecting to `/login`, which only happens with the bypass on.

## Conformance by WCAG 2.1 AA success criterion

The table has **18 rows covering 26 distinct success criteria**: five rows group closely related criteria (1.2.1 to 1.2.5; 1.4.10 with 1.4.12; 2.1.1 with 2.1.2; 3.2.1 with 3.2.2; 3.3.1 with 3.3.2). Counted by row, the statuses are **15 Supports, 2 Partially Supports, 1 Not applicable**. Where this document says "criterion count" it means the 18 rows. This is a subset of WCAG 2.1 Level A and AA selected for relevance to this product, not the complete criterion list.

| Criterion | Level | Status | Notes |
| --- | --- | --- | --- |
| 1.1.1 Non-text Content | A | Supports | No raster images; all icons are inline SVG marked `aria-hidden="true"`; icon-only controls carry `aria-label` |
| 1.2.1–1.2.5 Time-based Media | A/AA | Not applicable | The product contains no prerecorded audio or video. The mock-interview voice is real-time synthesized speech (browser TTS, user-toggleable) of the exact question text already displayed on screen — the visible text is the complete equivalent. The candidate's spoken answers are transcribed and displayed as text as the core product mechanic. |
| 1.3.1 Info and Relationships | A | Supports | All form controls have programmatically associated labels (`<label for>`, `aria-label`, or `aria-labelledby`); landmark elements (`header`/`nav`/`main`/`footer`) on every page; headings in strict descending order |
| 1.4.1 Use of Color | A | Supports | Inline links in body text are underlined; status information carries text/icon in addition to color |
| 1.4.3 Contrast (Minimum) | AA | Partially Supports | **Dark theme:** text color tokens verified ≥ 4.5:1 against their surfaces, and all five audited routes pass (remediated 2026-07-26). **Light theme: three of the five routes fail**, detailed below. Pre-remediation evidence is archived: `pre-remediation/login.json` records the sign-in divider label "or sign in with email" (`main.auth-main > div.auth-box > div.auth-divider > span`) at 3.45:1, foreground `#62666d` on background `#08090a` at 12.5px, against a 4.5:1 requirement. The post-fix `/login` run reports no `color-contrast` finding. See the note on citation strength in the remediation log. **Why this row is Partially Supports, measured 2026-07-27.** The "both light and dark themes" verification above holds for dark and not for light. The 2026-07-27 light-theme run fails `color-contrast` on three of the five audited routes: landing 25 elements, sign-in 3, sample report 16. Five tokens account for all 44 failing nodes, with these distinct surfaces and measured ratios: `--accent` `#5e6ad2` on `--surface-inset` `#f7f8f8` (4.41:1), on `#eff0fb` (4.14:1), on `#e8eaf4` (3.91:1) and on `#e1e4f2` (3.71:1); `--warn` `#a3721c` on `#f8f4ed` (3.84:1); light `--text-tertiary` `#6c7482` on `#f7f8f8` (4.42:1), a token whose comment in `src/index.css` previously claimed "≥4.5:1 on white card surfaces" and which does hold on white but not on the inset surface, since corrected to name both surfaces; light `--success` `#178753` on `#f7f8f8` (4.26:1); and `--success-alt` `#0e9668` on `#ffffff` (3.76:1) and `#f3faf7` (3.55:1). Per route: landing 25 nodes (`--accent` 16, `--text-tertiary` 5, `--success` 2, `--success-alt` 1, `--warn` 1), sign-in 3 (`--accent` 2, `--text-tertiary` 1), sample report 16 (`--accent` 12, `--text-tertiary` 3, `--success-alt` 1). `--accent` is 30 of the 44. Two facts are needed to read the scores. First, `color-contrast` is `scoreDisplayMode: binary` with weight 7, and it is the only failing audit on all three routes, so one surviving failing node forfeits all 7 points and **no partial fix moves any score**. Second, the 97 versus 95 spread is denominator rather than severity: per-page `notApplicable` audits give scored-weight totals of 201 on landing, 147 on sign-in and 143 on the sample report, so the same 7-point loss reads as 194/201, 140/147 and 136/143. This is not a regression: `58fe0a0` audited in light fails the same way. The dark theme passes on all five routes in every run. A first-time visitor on a light-mode OS gets the light theme, so this is a default-path defect rather than an opt-in one; see the Summary. |
| 1.4.10 Reflow / 1.4.12 Text Spacing | AA | Supports | Responsive flex/grid layout; relative units |
| 1.4.11 Non-text Contrast | AA | Partially Supports | Computed by hand 2026-07-26 by compositing each design token against the four app surfaces (`--bg-root`, `--bg-panel`, `--surface-card`, `--surface-inset`) in both themes and taking the worst case. Scope: the 14 distinct tokens used for explicit SVG `stroke`/`fill` (44 call sites) and for focus outlines — 13 icon tokens and 2 focus tokens, overlapping in `--accent`, which serves both roles — giving 14 tokens × 2 themes = **28 measurements, of which 20 pass**. The 8 that do not are the two theme values of four out-of-scope tokens (below). All 3 focus-outline variants pass (4.05:1–4.96:1); 9 of the 13 icon tokens pass in both themes (3.54:1–11.10:1). **Out of scope rather than failing** — 1.4.11 covers only visual information required to identify a component or its state — are `--border`, `--border-light`, `--track`, `--accent-border` (1.13:1–1.54:1), which draw progress-ring and spinner tracks, a dashed chart grid, and empty-state artwork. Evidence differs by item: for `--track`, `--accent-border`, and `--border` in `ProgressRing`, the paired state-bearing element was read in the rendering code (an explicitly commented `{/* Track */}` beside a `{/* Progress */}` gradient arc; a spinner whose three states render structurally different glyphs — checkmark, animated arc, dot — plus an `sr-only` state label). For `--border-light` (History/Tracker empty-state artwork, which sits directly above its own `<h3>`/`<p>` text) and `--border` in the Dashboard dashed grid, the assessment rests on reading the call site only; the rendered output was not viewed. **Not yet measured:** the 186 token-valued border declarations (`grep -ro 'border: 1px solid var(--' --include='*.css' src/` counted by line gives 186; dropping the `var(--` qualifier gives 207, the difference being literal non-token colours), not yet triaged into control boundaries versus decoration, and the progress/toggle/switch/checkbox component families; those need per-component visual review rather than token arithmetic. The 158 icons using `stroke="currentColor"` inherit text colour and are covered under 1.4.3. **Provenance of the 28 measurements:** they were computed by hand on 2026-07-26 from the token values and the four surface colours. No calculation script or data file was retained, so these ratios cannot be re-derived from this repository. They are reported as computed and not archived; every other number in this row is a `grep` count reproducible from the commands shown. |
| 2.1.1 Keyboard / 2.1.2 No Keyboard Trap | A | Supports | All functionality operable by keyboard, including the file dropzone and expandable tracker rows; the only focus traps are modal dialogs, all dismissible with Escape |
| 2.4.1 Bypass Blocks | A | Supports | "Skip to main content" link is the first focusable element on every page template (app, landing, legal). **Basis: source review at HEAD, not an archived Lighthouse run.** Lighthouse reports its `bypass` audit as `notApplicable` on these pages in every archived run, including the 2026-07-27 set captured after the link shipped, so no automated run has ever exercised it. The link is present in the shipped bundle and is parked off-viewport by a `transform` until it takes focus (`src/index.css`), which is why an unfocused automated pass does not evaluate it. Keyboard verification is the manual walkthrough below. |
| 2.4.2 Page Titled | A | Supports | Document title set |
| 2.4.3 Focus Order | A | Supports | No positive `tabindex`; DOM order matches visual order (no CSS reordering used anywhere) |
| 2.4.6 Headings and Labels | AA | Supports | One `h1` per page; descriptive labels throughout |
| 2.4.7 Focus Visible | AA | Supports | Global `:focus-visible` outline; every `outline: none` is paired with a replacement focus indicator |
| 3.1.1 Language of Page | A | Supports | `<html lang="en">` |
| 3.2.1 / 3.2.2 On Focus / On Input | A | Supports | No context changes on focus or input |
| 3.3.1 Error Identification / 3.3.2 Labels or Instructions | A | Supports | Errors announced via `role="alert"`; required fields marked; visible labels on all inputs |
| 4.1.2 Name, Role, Value | A | Supports | Modal dialogs implement the WAI-ARIA APG pattern (`role="dialog"`, `aria-modal`, labelled/described-by, focus trap, focus restore); custom controls expose `role`, `aria-expanded`, `aria-current`; progress bars expose value/min/max |
| 4.1.3 Status Messages | AA | Supports | `aria-live` / `role="status"` regions for async state (analysis progress, interview state, saving indicators) |

## Manual checks performed (items automated tooling cannot cover)

Verified 2026-07-26 by keyboard walkthrough and code review:

- Interactive controls are keyboard focusable, and indicate purpose and state (ARIA labels and state attributes present).
- Tab order is logical; visual order follows DOM order (no `order:` or reverse-flex CSS in the codebase).
- Focus is never unintentionally trapped; modal traps release on Escape and return focus to the invoking element.
- Focus is directed to newly opened dialogs (`autoFocus` on the primary/close control).
- HTML5 landmarks present on all pages; offscreen/decorative content hidden from assistive technology (`aria-hidden`, conditional rendering).
- Custom controls have associated labels and ARIA roles.

## Remediation log (2026-07-26)

- Associated visible labels with every form control (upload form, tracker editor — 24 fields, file dropzone input, sort control).
- Made expandable tracker rows keyboard-operable (`role="button"`, `tabIndex`, Enter/Space, `aria-expanded`, visible focus ring).
- Wired the shared focus-trap hook into the two remaining dialogs (resume viewer, tracker editor) with correct stacked-dialog behavior.
- Raised muted/tertiary text tokens and accent-as-text usage to ≥ 4.5:1 in both themes; underlined inline body links. Archived evidence: `pre-remediation/login.json` fails `color-contrast` on the sign-in divider label at 3.45:1; the post-fix `/login` run passes with no such finding.
- Corrected heading hierarchy (removed h1→h4 / h1→h3 skips); added `<main>` landmark to the public sample page. Archived evidence: `pre-remediation/sample.json` fails `heading-order` on `h4.results-breakdown-title`, and `pre-remediation/tracker.json` on the `<h3>` inside `div.tracker-empty`; both routes pass after the fix.
- Added a "Skip to main content" link to all page templates (WCAG 2.4.1).

**On the strength of those two citations.** All eight archived runs predate commit `58fe0a0`, which committed them together with the first five entries above, so no artifact ties a given run to a given state of the source tree. The pre-remediation failures correspond one-to-one with the two entries that cite them, and the elements they name carry the corrected values at HEAD, but that is strong circumstantial evidence rather than proof. Read the archive as showing that these failures were real and are now absent, not as a per-commit audit trail.

The other four entries have no archived before-side evidence. Three were fixed before the first surviving run, or cover criteria automated tooling does not test. The fourth, the skip link, landed later still in `10e8166` and postdates every run in this archive, so no archived run exercised it.

## Notes for testers

Screen-reader spot checks (VoiceOver/NVDA) are recommended as ongoing practice. Reduced motion is honored via `prefers-reduced-motion` in animated views.
