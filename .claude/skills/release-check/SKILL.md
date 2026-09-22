---
name: release-check
description: Run the Phase 1 browser release check (P1-01..P1-06) plus repo checks and produce the delivery report. Use before reporting any change as done when it touches a trigger path listed in section 1 of this skill, or when the user asks for a release check or /release-check.
---

# Release check before handoff

Runs the repo checks and all six Phase 1 release scenarios against the current working tree, collects the evidence bundles the run produced, and writes a delivery report. The harness is documented in `docs/qa-mvp.md`; this skill only drives it and reads its output.

Shell rules for every command below: the user's shell is zsh. Never put a trailing `#` comment on a command line; explanations go on their own line above. Never start an output line with `=` (zsh expands `=word`). Prefer `find` or node over globs, which fail in zsh when nothing matches.

Never, as part of this skill: edit `src/`, `qa/`, or `tests/` to make a check pass; delete or prune anything under `.qa-artifacts/`; remove `.qa-artifacts/qa-command.lock`; commit. A failed step is reported as failed.

## 1. When it runs

**Trigger paths.** This is the only copy of this list; `CLAUDE.md` refers here.

- `src/`
- `qa/`
- `tests/`
- `index.html`
- `public/`
- Vite/TS config: `vite.config.ts` and every `tsconfig*.json` at the repository root
- `playwright.config.ts`
- `eslint.config.js`
- `package.json`, `package-lock.json`

The change set is the working tree against `HEAD`, including untracked files:

```bash
git status --porcelain --untracked-files=all
```

- If any listed path is under a trigger path: run the check.
- If the user invoked this skill explicitly: run the check regardless.
- Otherwise: do not run; the report is `NOT RUN: no trigger path changed` followed by the file list.

All six scenarios always run. The relevance map decides only the "Covers change?" label, never which scenarios run.

| Scenario | Drives | Label YES when the change set touches |
|---|---|---|
| P1-01 | `/sample` → `Results sample`, signup dialog | `src/pages/Results.tsx`, `src/pages/Results.css`, `src/components/ProgressRing.*`, `src/components/Badge.*`, `src/components/SignupPromptModal.*`, `src/utils/scoreBands.ts` |
| P1-02 | `Upload`, presigned URL + S3 POST, `usePolling`, completed `Results` | `src/pages/Upload.*`, `src/api/upload.ts`, `src/api/client.ts`, `src/api/analysis.ts`, `src/hooks/usePolling.ts`, `src/pages/Results.*`, `src/components/AnalysisProgressCard.tsx`, `src/components/ProgressRing.*`, `src/components/Badge.*` |
| P1-03 | Reuse path (`last-resume`, `requestUploadWithReuse`, no S3) | same as P1-02 |
| P1-04 | `processing → failed` terminal UI | `src/hooks/usePolling.ts` (includes `normalizeAnalysisStatus`), `src/pages/Results.*`, `src/components/AnalysisProgressCard.tsx` |
| P1-05 | 3s polling, 2-minute timeout, polling stops | `src/hooks/usePolling.ts`, `src/pages/Results.*`, `src/components/AnalysisProgressCard.tsx` |
| P1-06 | no product code; self-test of `qa/browser/networkPolicy.ts` | `qa/browser/**` only; otherwise label `n/a` |
| P1-02..P1-05 | app shell | `src/App.tsx`, `src/main.tsx`, `src/index.css`, `src/components/Layout.*`, `src/auth/**` |

`AnalysisProgressCard.tsx` is on P1-02..P1-05 because each of them renders it from `Results.tsx`: P1-02 and P1-03 in `active` then `complete` mode (fixture `pending_upload → processing → completed`), P1-04 in `active` then `failed`, P1-05 in `active` then `timeout`. P1-01 does not: `/sample` renders completed canned data with no polling, so the card never mounts.

**Labels.** A changed file is mapped when it matches any entry in the third column; a changed file under a trigger path that matches no entry is unmapped. For each scenario:

- `YES` when any changed file maps to that scenario.
- Otherwise `unmapped` when any changed file is unmapped. This replaces `no` and `n/a` for every scenario.
- Otherwise `no` (or `n/a` for P1-06). `no` is allowed only when every changed file is mapped and none maps to that scenario.

Every unmapped file is listed by path under the scenario table in the report.

## 2. Repo checks

Run each as its own command and record its exit code. Run all three even if an earlier one fails.

```bash
npm test
```

```bash
npm run lint
```

```bash
npm run build
```

## 3. Release run

Create the marker fresh, then run both release spec files in one invocation (P1-01..P1-05 live in `release-check.e2e.ts`, P1-06 in `network-policy.e2e.ts`). Record the exit code. Use a 10-minute tool timeout.

```bash
mkdir -p .qa-artifacts
rm -f .qa-artifacts/release-check.marker
touch .qa-artifacts/release-check.marker
```

```bash
npm run qa:test -- tests/e2e/release-check.e2e.ts tests/e2e/network-policy.e2e.ts
```

Exit code 73 is `QA_LOCK_HELD`, 76 is a stale lock: report the run as `NOT RUN` with the printed JSON, and do not touch the lock.

## 4. Evidence collection

Run this immediately after the release run, before anything else that could create bundles. It never selects a subset: every bundle and validation report newer than the marker is printed, and anything other than exactly six accepted bundles (one per scenario, each with a passing validation report) makes the evidence verdict FAILED.

```bash
node -e '
const fs = require("fs")
const path = require("path")
const marker = fs.statSync(".qa-artifacts/release-check.marker").mtimeMs
const newer = dir => fs.existsSync(dir)
  ? fs.readdirSync(dir).map(name => path.join(dir, name)).filter(p => fs.statSync(p).mtimeMs > marker).sort()
  : []
const runDirs = newer(".qa-artifacts/runs")
const reports = newer(".qa-artifacts/validation-results")
const problems = []
const bundles = []
for (const dir of runDirs) {
  const file = path.join(dir, "manifest.json")
  if (!fs.existsSync(file)) { problems.push(`no manifest.json in ${dir}`); continue }
  bundles.push({ dir, file, m: JSON.parse(fs.readFileSync(file, "utf8")) })
}
const validation = reports.map(file => ({ file, v: JSON.parse(fs.readFileSync(file, "utf8")) }))
const expected = ["P1-01", "P1-02", "P1-03", "P1-04", "P1-05", "P1-06"]
const found = bundles.map(b => b.m.scenarioId).sort()
if (runDirs.length !== 6) problems.push(`expected 6 run directories newer than marker, found ${runDirs.length}`)
if (found.join(",") !== expected.join(",")) problems.push(`scenario set is [${found.join(", ")}], expected one each of P1-01..P1-06`)
if (validation.length !== 6) problems.push(`expected 6 validation reports newer than marker, found ${validation.length}`)
for (const r of validation) {
  if (!r.v.valid) problems.push(`validation rejected ${r.file}: ${r.v.violations.length} violation(s)`)
  if (!runDirs.some(d => path.basename(d) === path.basename(r.file, ".json"))) problems.push(`validation report without an accepted bundle: ${r.file}`)
}
for (const b of bundles) if (b.m.evaluationIdentity !== null) problems.push(`evaluation bundle, not a release run: ${b.file}`)
console.log(`Bundles found newer than marker: ${runDirs.length}`)
console.log(`Validation reports found newer than marker: ${validation.length}`)
console.log(`Evidence verdict: ${problems.length ? "FAILED" : "ACCEPTED"}`)
for (const p of problems) console.log(`  problem: ${p}`)
for (const b of bundles) {
  const m = b.m
  const result = !m.expectationMet ? "FAIL" : m.expectedOracleStatus === "failed" ? "PASS (expected failure)" : "PASS"
  const shots = m.artifacts.checkpointScreenshots
  console.log(`\n${m.scenarioId}  Result: ${result}`)
  console.log(`  manifest: ${b.file}`)
  console.log(`  executionStatus=${m.executionStatus} oracleStatus=${m.oracleStatus} expectedOracleStatus=${m.expectedOracleStatus} expectationMet=${m.expectationMet} failedOracle=${m.failedOracle}`)
  console.log(`  durationMs=${m.durationMs} browser=${m.browserVersion}`)
  console.log(`  source: head=${m.sourceIdentity.headCommit} dirty=${m.sourceIdentity.worktreeDirty} releaseGrade=${m.sourceIdentity.releaseGrade}`)
  console.log(`  final screenshot: ${shots.length ? path.join(b.dir, shots[shots.length - 1]) : "none"}`)
  if (m.artifacts.failureScreenshot) console.log(`  failure screenshot: ${path.join(b.dir, m.artifacts.failureScreenshot)}`)
  if (m.artifacts.trace) console.log(`  trace: ${path.join(b.dir, m.artifacts.trace)}`)
  for (const f of m.failures) console.log(`  failure: kind=${f.kind} phase=${f.phase}${f.oracleId ? " oracleId=" + f.oracleId : ""} message=${f.message}`)
}
for (const id of expected) if (!found.includes(id)) console.log(`\n${id}  Result: NOT RUN (no accepted bundle)`)
'
```

Rules for reading that output:

- **Result comes only from `expectationMet`.** Nothing else (screenshots, exit codes, the visual read) may change it.
- P1-06 shows `PASS (expected failure)` when `expectationMet` is true. Its oracle fails on purpose; see the fixed P1-06 note in the report.
- For any FAIL, include the `failure` lines, the failure screenshot, the trace, and `npx playwright show-trace <trace path>`; read `console-events.json` and `page-errors.json` in that bundle and quote the relevant lines.

## 5. Visual read

For scenarios labelled "Covers change? YES": open the final screenshot with the Read tool and write one line, prefixed exactly `Visual read, not an automated check:`. For scenarios labelled `no`, `unmapped`, or `n/a`, do not read the final screenshot.

For every scenario whose Result is `FAIL`, whatever its label: also open its failure screenshot (`failure.png`, the `failure screenshot:` line in step 4) and write one line with the same prefix, naming it as the failure screenshot. If the bundle has no failure screenshot, say so. `PASS (expected failure)` is not `FAIL`.

A visual read never changes the Result column or the overall verdict.

## 6. Additional specs (after evidence collection only)

Run these as separate invocations after step 4, so they never fall inside the evidence window. Report each with its exit code.

- Landing, legal, or support pages touched: `npm run qa:test -- tests/e2e/landing.e2e.ts tests/e2e/public-pages.e2e.ts`
- Results resume modal touched: `npm run qa:test -- tests/e2e/resume-modal.e2e.ts`
- `qa/` or `tests/` touched: `npm run qa:typecheck`, then the full `npm run qa:test`

## 7. Report

Overall verdict:

- `PASS` only if all three repo checks exited 0, the release run exited 0, the evidence verdict is ACCEPTED, and all six Results are PASS or `PASS (expected failure)`.
- `NOT RUN` if no trigger path changed (and the skill was not invoked explicitly) or the QA lock blocked the run.
- `FAIL` otherwise.

Plain text only: PASS / FAIL / NOT RUN, no emoji. Template:

```
Release check: <PASS | FAIL | NOT RUN>
Source: HEAD <full sha>, worktree dirty: <true|false>, releaseGrade: <true|false>
Change set (git status --porcelain --untracked-files=all):
  <one line per file>
Trigger paths matched: <list, or "none (invoked explicitly)">

Repo checks
  npm test       <PASS|FAIL> (exit <n>)
  npm run lint   <PASS|FAIL> (exit <n>)
  npm run build  <PASS|FAIL> (exit <n>)

Release run: npm run qa:test -- tests/e2e/release-check.e2e.ts tests/e2e/network-policy.e2e.ts
  exit <n>
  Marker: .qa-artifacts/release-check.marker
  Bundles found newer than marker: <n>
  Validation reports found newer than marker: <n>
  Evidence verdict: <ACCEPTED | FAILED>
  <problem lines, if any>

| Scenario | Result | Covers change? | Final screenshot |
|---|---|---|---|
| P1-01 | <PASS|FAIL|NOT RUN> | <YES|no|unmapped> | <path> |
| ... one row per bundle found, plus NOT RUN rows for missing scenarios ...

Unmapped files:
  <one path per line, or "none">

Manifests:
  <every manifest path printed in step 4>

Visual reads (final screenshot for YES labels; failure.png for every FAIL):
  P1-0x  Visual read, not an automated check: <one line>
  (or: none, no scenario labelled YES and none failed)

Failures: <failure lines, screenshots, traces, console/page errors; or "none">

Additional specs: <command, PASS|FAIL (exit n); or "none required">

P1-06 note: P1-06 is a harness self-test, not a product check. Its oracle fails
by design: it passes only when exactly three probes are blocked and recorded
(external fetch, same-origin /api/unexpected, WebSocket), the oracle failure is
SAFETY_UNEXPECTED_EGRESS, and the allowed font stylesheet is served locally.
"PASS (expected failure)" means the network safety net worked; it says nothing
about product behavior.

What this check cannot verify:
<the list below, verbatim>
```

### Cannot-verify list (copy verbatim into every report)

1. Backend behavior: Lambda logic, DynamoDB, Textract, Bedrock, analysis quality. The API and S3 are hand-written mocks (`qa/fixtures/data.ts`); if a deployed Lambda changes its response shape, these checks still pass.
2. Auth: the QA build runs with `VITE_DEV_BYPASS=true`, so Cognito, login, signup, OAuth, and protected-route gating are never exercised.
3. Pages with no scenario: Interview (and all voice/Deepgram input), Tracker, Dashboard, History, Interview History/Results, DiffView/download, Support, and landing-page mock drift.
4. Other browsers and sizes: Chromium only, 1440×1000 viewport only. No Safari, Firefox, or mobile widths.
5. Visual regressions: oracles check roles and text. Screenshots are captured but never compared against a baseline.
6. The production build and deploy: the run uses `vite.qa.config.ts` with synthetic env, not the real env vars, headers, or hosting.
7. Egress outside Playwright routing: DNS preconnect, WebRTC, QUIC, Chromium background traffic, process-level egress (the manifest's `exclusions` list).
8. The exact commit that gets pushed: runs made before the user commits are on a dirty tree, so `releaseGrade` is false. Only a rerun on the clean committed tree gives release grade.
9. Flakiness: each result is one sample with no retries. `npm run qa:test:repeat` (10x) is not part of this check.
10. Accessibility and performance beyond the role-based locators the oracles already use.
