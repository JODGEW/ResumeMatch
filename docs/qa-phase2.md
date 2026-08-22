# Bounded agentic failure investigator (Phase 2)

Phase 2 investigates a Phase 1 failure. It never decides whether the product passed: the deterministic oracle, the lifecycle classification, and the terminal finding classification all stay in code. A model may read accepted evidence, choose probes, drive a closed set of browser actions in a fresh context, and write narrative. Nothing else.

Phase 1 is unchanged in what it proves. See [qa-mvp.md](qa-mvp.md).

## Trigger

An investigation starts only for an accepted, completed run whose expectation was not met by an unexpected oracle failure:

```
executionStatus === 'completed'
artifacts accepted (a persisted manifest exists)
oracleStatus is 'passed' or 'failed'
expectationMet === false
oracleStatus === 'failed' with a failedOracle
```

`oracleStatus === 'failed'` alone is not a trigger. P1-06 is a safety self-test whose expected outcome is a failed oracle and which reaches triage as `expectationMet: true`; it is classified `expected` and refused. Infrastructure failures, rejected artifacts, and oracles that never completed carry no trustworthy product observation and are refused as `infrastructure_defect`, `artifact_rejected`, and `oracle_incomplete`. An unmet expectation without an unexpected oracle failure — a cleanup-only failure, for one — is `unexpected_shape` and stays on the human-review path.

## Boundary

| Repository | Owns |
| --- | --- |
| ResumeMatch | Lifecycle state, budgets, action grammar, evidence reads, fresh reproduction, the deterministic oracle, the finding schema, and the classification rule |
| `resumematch-qa-tools` adapter (in the harness checkout) | Translating the harness tool protocol to the line protocol; recording provider, model id, and token usage |
| DeepSeek Harness | Model invocation, agent loop, session log |

The adapter holds no policy. Every refusal is a structured `error` code returned as tool data, so the model sees the refusal and the investigation continues under its latches.

## Invocation

An investigation is a separate command over an accepted bundle. Phase 1's release run never launches a model runtime.

```bash
node qa/browser/qaCommand.mjs investigate --run-id <p1-0X-...> --model-provider <p> --model-id <m>
```

It takes the same process lock as `qa:test`, rebuilds the QA application, bundles the investigation server, serves the build on the fixed port, and then speaks one JSON request per stdin line and one JSON response per stdout line. Build output is kept off stdout so the protocol stream stays pure. Exit codes: `0` submitted, `3` not investigable, `4` closed without a finding.

## Tools

Read-only evidence: `read_failure_manifest`, `read_failed_assertion`, `read_console_events`, `read_page_errors`, `read_network_events`, `read_scenario_transition_log`, `read_safety_violations`, `count_requests`.

Bounded reproduction: `start_fresh_reproduction`, `execute_allowed_action`, `inspect_element_state`, `capture_region_screenshot`, `capture_accessibility_snapshot`, `advance_controlled_clock`, `run_oracle`, `submit_finding`.

There is no shell, filesystem, navigation, HTTP, evaluation, or selector tool, and no Playwright handle reaches a model. Actions use a closed grammar — `open_route`, `fill_synthetic_text`, `attach_synthetic_file`, `click_by_role`, `wait_for_state` — resolved per scenario: a route names a semantic target and the scenario supplies the path, text and files come from fixtures, and click names come from an approved list. The controlled clock is authorized only for the scenario that installs one.

`read_failed_assertion` returns the oracle id and the recorded failures. Phase 1 records no expected/actual pair, and none is invented.

## Budgets and latches

Hypotheses 3, probes 6, reproductions 1, actions 8, inspections 6, screenshots 2, accessibility snapshots 2, clock advances 2, oracle runs 1, tool calls 20, wall clock 8 minutes. Enforcement is in code, not in prompt text.

Two latches survive into the finding. An attempted unauthorized action latches `policy_blocked` and leaves only `submit_finding` reachable. A spent budget latches `inconclusive`; the agent may still submit.

## Fresh reproduction

`start_fresh_reproduction` builds a new scenario instance, a new browser and context with no stored state, a new contract router and network policy, and — for the timeout scenario — a new controlled clock. It runs against the same build and the same scenario definition, and finishes with the same Phase 1 oracle function, followed by Phase 1's contract-then-safety precedence.

Reproduction artifacts are written under `.qa-artifacts/investigations/<inv-uuid>/`, never into `runs/`. The accepted bundle is a strict inventory with an immutable manifest: adding a file to it would fail revalidation, so Phase 2 opens it read-only and a test asserts the directory listing and manifest bytes are unchanged after an investigation.

## Classification

Decided by rule, from observed facts:

```
policy_blocked   an unauthorized action was attempted
inconclusive     a budget was exhausted, or no completed reproduction oracle
not_reproduced   the reproduction oracle passed
confirmed        the reproduction failed the same oracle as the source run
inconclusive     the reproduction failed a different oracle
```

A finding that names `classification`, `reproductionOracleResult`, `safetyViolations`, `sourceCommit`, `usage`, or `model` is refused as an unauthorized action; the narrative is discarded and the finding is recorded as `policy_blocked`.

## Evaluation

The twelve-case corpus lives in `qa/investigation/evalCases.ts`: three clean cases, six seeded defects anchored to exact single-occurrence source strings, and three benign transient cases driven by evaluation-only fault injection. D5, D6, and B2 are held out and carry no gold first probe. The runner is not built yet, and no case has run against a real model.

## Evaluation-only transient faults

`RunOptions.transientFaults` is empty in every release check. Each fault fires at most once per scenario instance and models a contract-legal failure, so it records no contract violation:

- `upload_503_once` — `/upload` returns a fixed synthetic failure body once.
- `analysis_interrupted_once` — the second analysis poll is aborted; the response sequence still advances.
- `s3_response_500_once` — the multipart object is accepted and recorded, then the response fails.

Artifact validation accepts exactly two more fixed synthetic values for these: the transient upload body hash, and the transient S3 status with its empty body. The allowlist stays closed.

Two Phase 1 behaviors changed to make this usable. `createScenario` takes options, defaulting to no faults. And the results navigation in P1-02/P1-03 now goes through `requireUrl`, so a page that never navigates is a deterministic oracle failure rather than an unbounded wait inherited from the context's navigation timeout.
