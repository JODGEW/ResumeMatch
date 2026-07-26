# ResumeMatch — Accessibility Conformance Report (Section 508 / WCAG 2.1 AA)

**Product:** ResumeMatch web application — https://resumematchapp.com
**Scope:** Frontend (React 18 SPA): landing page, authentication, resume upload & analysis, sample report, application tracker
**Audit date:** 2026-07-26
**Method:** Automated audit (Lighthouse 13.4.1, accessibility category, production build) + manual keyboard walkthrough + source-level code review
**Standard applied:** WCAG 2.1 Level AA (the standard incorporated by the revised Section 508)

## Summary

All five representative pages score **100/100** on the Lighthouse accessibility audit as of 2026-07-26. Automated checks are complemented by the manual verification listed below, since automated tooling covers only a subset of WCAG success criteria. Full Lighthouse reports (HTML + JSON) are archived alongside this document in `docs/lighthouse-2026-07-26/`.

| Page | Route | Lighthouse a11y score |
| --- | --- | --- |
| Landing page | `/` | 100 |
| Sign in | `/login` | 100 |
| Sample analysis report (public) | `/sample` | 100 |
| New analysis (core upload form) | `/upload` | 100 |
| Application tracker | `/tracker` | 100 |

## Conformance by WCAG 2.1 AA success criterion

| Criterion | Level | Status | Notes |
| --- | --- | --- | --- |
| 1.1.1 Non-text Content | A | Supports | No raster images; all icons are inline SVG marked `aria-hidden="true"`; icon-only controls carry `aria-label` |
| 1.2.1–1.2.5 Time-based Media | A/AA | Not applicable | The product contains no prerecorded audio or video. The mock-interview voice is real-time synthesized speech (browser TTS, user-toggleable) of the exact question text already displayed on screen — the visible text is the complete equivalent. The candidate's spoken answers are transcribed and displayed as text as the core product mechanic. |
| 1.3.1 Info and Relationships | A | Supports | All form controls have programmatically associated labels (`<label for>`, `aria-label`, or `aria-labelledby`); landmark elements (`header`/`nav`/`main`/`footer`) on every page; headings in strict descending order |
| 1.4.1 Use of Color | A | Supports | Inline links in body text are underlined; status information carries text/icon in addition to color |
| 1.4.3 Contrast (Minimum) | AA | Supports | Text color tokens verified ≥ 4.5:1 against their surfaces in both light and dark themes (remediated 2026-07-26) |
| 1.4.10 Reflow / 1.4.12 Text Spacing | AA | Supports | Responsive flex/grid layout; relative units |
| 1.4.11 Non-text Contrast | AA | Partially Supports | Measured 2026-07-26 by compositing each design token against the four app surfaces (`--bg-root`, `--bg-panel`, `--surface-card`, `--surface-inset`) in both themes and taking the worst case. Scope: the 14 distinct tokens used for explicit SVG `stroke`/`fill` (44 call sites) and for focus outlines — 13 icon tokens and 2 focus tokens, overlapping in `--accent`, which serves both roles — giving 14 tokens × 2 themes = **28 measurements, of which 20 pass**. The 8 that do not are the two theme values of four out-of-scope tokens (below). All 3 focus-outline variants pass (4.05:1–4.96:1); 9 of the 13 icon tokens pass in both themes (3.54:1–11.10:1). **Out of scope rather than failing** — 1.4.11 covers only visual information required to identify a component or its state — are `--border`, `--border-light`, `--track`, `--accent-border` (1.13:1–1.54:1), which draw progress-ring and spinner tracks, a dashed chart grid, and empty-state artwork. Evidence differs by item: for `--track`, `--accent-border`, and `--border` in `ProgressRing`, the paired state-bearing element was read in the rendering code (an explicitly commented `{/* Track */}` beside a `{/* Progress */}` gradient arc; a spinner whose three states render structurally different glyphs — checkmark, animated arc, dot — plus an `sr-only` state label). For `--border-light` (History/Tracker empty-state artwork, which sits directly above its own `<h3>`/`<p>` text) and `--border` in the Dashboard dashed grid, the assessment rests on reading the call site only; the rendered output was not viewed. **Not yet measured:** the ~186 `border: 1px solid` declarations, not yet triaged into control boundaries versus decoration, and the progress/toggle/switch/checkbox component families; those need per-component visual review rather than token arithmetic. The 158 icons using `stroke="currentColor"` inherit text colour and are covered under 1.4.3. |
| 2.1.1 Keyboard / 2.1.2 No Keyboard Trap | A | Supports | All functionality operable by keyboard, including the file dropzone and expandable tracker rows; the only focus traps are modal dialogs, all dismissible with Escape |
| 2.4.1 Bypass Blocks | A | Supports | "Skip to main content" link is the first focusable element on every page template (app, landing, legal) |
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
- Raised muted/tertiary text tokens and accent-as-text usage to ≥ 4.5:1 in both themes; underlined inline body links.
- Corrected heading hierarchy (removed h1→h4 / h1→h3 skips); added `<main>` landmark to the public sample page.
- Added a "Skip to main content" link to all page templates (WCAG 2.4.1).

## Notes for testers

Screen-reader spot checks (VoiceOver/NVDA) are recommended as ongoing practice. Reduced motion is honored via `prefers-reduced-motion` in animated views.
