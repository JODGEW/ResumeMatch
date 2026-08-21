# Deterministic browser release checks (Phase 1)

Phase 1 is a local, Chromium-only Playwright 1.57 frontend verification harness. It runs the production frontend build against synthetic fixtures and explicit mock contracts. It does not test production, staging, private backends, AWS/Cognito/S3, third parties, an LLM, CI, MCP, or Phase 2 investigation.

## Public result boundary

`runReleaseCheck(scenarioId, options)` accepts P1-01 through P1-06, an optional ignored artifact directory below `.qa-artifacts`, a headless flag, and QA-test-only fault injection. Its `RunResult` separates:

- `executionStatus`: whether browser/infrastructure lifecycle completed.
- `oracleStatus`: `not_run` before any oracle execution, `incomplete` when browser/scenario infrastructure interrupts an in-progress oracle, and `passed` or `failed` only for a completed deterministic observation. Only `OracleFailure` or a completed contract/safety mismatch produces a failed oracle.
- `expectedOracleStatus`: `failed` only for the intentional P1-06 safety probe.
- `expectationMet`: the release-check authority. It is false for `not_run`/`incomplete`, infrastructure failure, artifact rejection, or unexpected cleanup failure. P1-06 is true only for the exact expected routed violations and a successfully completed execution.
- `failures[]`: all oracle, contract, safety, artifact, infrastructure, and cleanup failures. Cleanup failures append and never replace the primary failure.
- `failedOracle`: a compatibility projection of the primary structured oracle failure, not an infrastructure/artifact alias and not the complete failure record. It remains null when no oracle failed.
- `artifactValidation`: validation result and rejected-bundle cleanup status.

This makes P1-06 machine-distinct from an unexpected product failure and provides a stable future plugin boundary without embedding Phase 2 behavior.

## Exact network guarantee

The guarantee is deliberately limited to traffic observable through Playwright 1.57 controls:

1. Browser-context HTTP(S) routing is installed before a page is created or navigated.
2. Playwright-supported WebSocket routing is installed before a page is created.
3. Browser-context service workers are configured as `block`.
4. Traffic observed by those controls is an allowlisted local application request, locally fulfilled Google Fonts CSS, locally fulfilled `.invalid` contract traffic, or an aborted and recorded violation.

The local origin is not generally trusted. Only GET document navigations to the defined application routes and GET/HEAD browser asset loads whose resource type and extension match an enumerated file in the generated QA build are continued. Unknown same-origin fetch/XHR, API-like or telemetry paths, non-GET/HEAD resource requests, and unknown localhost ports are aborted and fail the run. This prevents Vite SPA fallback from converting an unexpected API request into success.

API and S3 sentinel requests are fulfilled only after method, path, exact query, count, identifier, and body validation. In particular, `POST /upload` requires an empty query string; any query is a contract violation and is aborted without a success response. Google Fonts' one exact stylesheet URL is fulfilled with empty local CSS before network access. Other observed HTTP(S) and supported WebSocket traffic is closed/aborted and recorded with `blockedByPlaywrightRoute: true`.

This is not an OS firewall or process sandbox. Phase 1 does **not** claim to prevent or observe speculative DNS/preconnect, WebRTC STUN/TURN, WebTransport/QUIC, Chromium background traffic, worker WebSockets outside Playwright's documented routing contract, or arbitrary process-level egress. No proxy, DNS control, or firewall is installed.

## Scenarios and deterministic oracles

| ID | Behavior proved |
| --- | --- |
| P1-01 | Real `/sample` UI, report sections, signup dialog, and zero product/service/safety requests. |
| P1-02 | Real upload UI; ordered browser `FormData` entries and every `File` are observed before application fetch; exactly one `file` entry, one occurrence of each presigned text field, no duplicates/extras, exact values, filename, MIME, nonzero size, `%PDF-` signature, fixture size and SHA-256; ordered completed result and score `84` inside `.progress-ring__value`. |
| P1-03 | Existing synthetic resume reused; completed result; both router counter and normalized network summary prove no S3 request. |
| P1-04 | `processing → failed`; terminal error and recovery UI; no score. |
| P1-05 | Playwright clock `runFor` executes about forty three-second polls over two controlled minutes; timeout UI appears; polling then remains stopped; no completed or backend-failed report. |
| P1-06 | External page fetch, same-origin unexpected fetch, and Playwright-supported page WebSocket are routed, recorded, and intentionally fail the oracle; an exact allowed font request is locally fulfilled. |

Each call creates fresh scenario counters and IDs. The contract router has no generic-success fallback. Popup/new-page console and page-error listeners are attached from the browser-context page lifecycle.

## Environment and cross-process isolation

The QA launcher passes an explicit environment rather than spreading the parent environment. It includes only system path/locale values, an invocation token, browser-cache location, and visibly synthetic QA variables such as `https://api.qa.invalid`, `https://s3.qa.invalid`, `auth.qa.invalid`, and `qa-synthetic-api-key-not-secret`. Vite reads the empty QA fixture environment directory; missing QA settings cannot fall back to repository or user `.env` files. The normal production build/deployment command is not invoked.

An atomic filesystem lock serializes the QA build, fixed preview port, and Playwright process across complete `qa:test` launcher processes. A live owner produces structured `QA_LOCK_HELD`; inherited preview processes borrow the owner's token. A dead, malformed, unsafe, or unverifiable owner produces distinct `QA_STALE_LOCK`; the harness never replaces that lock and never kills a process. Manual recovery requires the operator to inspect `.qa-artifacts/qa-command.lock/owner.json`, verify the recorded PID is absent (for example with `kill -0 <pid>`), verify the lock is the exact non-symlink directory, and only then manually remove `.qa-artifacts/qa-command.lock`. Invocation-specific home, temp, browser runtime, and transform storage are removed in `finally`.

## Evidence, privacy, and rejection

Each accepted run bundle is `.qa-artifacts/runs/<internally-generated-scenario-UUID>/`. The artifact root and every output component are checked using `lstat`/`realpath`; symlinked components, traversal, and paths outside the approved root are rejected. Recursive removal is permitted only for the branded, exact generated UUID directory after fresh root/containment/non-symlink checks. A missing exact run directory (`ENOENT`) means cleanup already completed; every other filesystem error remains a failure, so repeated cleanup is safe without hiding permission or path errors.

The immutable `manifest.json` has an exact closed schema containing source identity, separated execution/oracle/artifact semantics, closed structured failures, the precise network enforcement scope, normalized counts, and closed references to trace, video, screenshots, console/page errors, normalized network events, transitions, and safety violations. It records a full lowercase 40-character `HEAD` when Git identity is available, dynamically observed dirty state, `exactCommittedSource`, and `releaseGrade`. Tests independently observe both HEAD and the documented `git status --porcelain --untracked-files=all` scope, so they pass while Phase 1 is dirty and after it is committed clean. Dirty state always makes exact-commit and release-grade false; release grade additionally requires completed execution, accepted artifacts, and `expectationMet: true`.

The validator treats the manifest as a strict inventory: every reference must exist, every file must be referenced, and unknown paths/types are rejected. Required artifacts depend on oracle outcome. JSON artifacts use recursively closed, discriminated schemas. Normalized network events enumerate the only origin aliases, route templates, methods, resource types, decisions/status shapes, query keys, and request-field names allowed by Phase 1; method/query/resource constraints are checked per route and unknown properties fail. Request-field metadata is only `name`, byte `length`, and SHA-256. Raw or encoded JD/resume/PDF bodies—including exact synthetic fixtures, base64 PDF, body-bearing properties, or fixture content hidden in another allowed string—are rejected. Headers, query values, authorization, cookies, and presigned values are not persisted there.

Trace ZIP validation follows Playwright 1.57's observed repository format: request/response resources are referenced by `_sha1` from `resource-snapshot` records and trace-owned screenshots by `sha1` from `screencast-frame` records. Every resource inventory file must have a classifiable referencing event; missing, orphaned, or content-address-mismatched resources fail. Known API request and mocked-response bodies are matched to canonical synthetic serializations/hashes. S3 multipart fields and file identity are matched to canonical values and to the separately observed normalized upload hash; Playwright's trace representation omits the multipart file bytes, so its empty file placeholder is accepted only when that independently observed upload exists. Local response resources must byte-match files independently read from the actual QA build. Arbitrary `.dat` content, unknown routes/fields/hashes, and unknown resume-like request bodies fail.

Missing `unzip`, malformed ZIPs, unsafe entries, and unreadable files fail closed. Only those closed synthetic API/S3 bodies may remain in raw trace resources. Trace-owned JPEG plus bundle PNG/WebM artifacts receive documented format-signature checks only—this is not semantic DLP, content redaction, or OCR. Their privacy guarantee relies on synthetic-only Phase 1 inputs and the stated Playwright routing boundary.

Validation produces a separate report, avoiding circular mutation of the manifest. If persistence or validation fails, the result contains a sanitized artifact failure and the invalid bundle (including raw trace) is removed from the normal runs directory. A small sanitized validation report may remain under `.qa-artifacts/validation-results`; no rejected bundle is quarantined as normal evidence.

## Commands

```bash
npm run qa:build
npm run qa:typecheck
npm run qa:test
npm run qa:test:repeat
```

Repository checks remain `npm test`, `npm run lint`, `npx tsc -b`, and `npm run build`. Generated QA builds, runtime data, browsers' artifacts, reports, traces, videos, and screenshots are ignored.

## What Phase 1 does not prove

Phase 1 proves deterministic behavior of the real built frontend against its synthetic contract boundary, plus the limited Playwright routing guarantees above. It does not prove backend implementation, cloud permissions, real upload processing, authentication/payment/model quality, third-party availability, production health, visual privacy through OCR, or any unsupported browser/OS egress class.
