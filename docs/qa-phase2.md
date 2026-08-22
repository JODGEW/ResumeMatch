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

Sixteen tools, closed on both sides: the adapter registers exactly this list and the investigation server authorizes exactly this list, so a name added in only one place is refused rather than silently enabled.

Read-only evidence (8): `read_failure_manifest`, `read_failed_assertion`, `read_console_events`, `read_page_errors`, `read_network_events`, `read_scenario_transition_log`, `read_safety_violations`, `count_requests`.

Bounded reproduction (8): `start_fresh_reproduction`, `execute_allowed_action`, `inspect_element_state`, `capture_region_screenshot`, `capture_accessibility_snapshot`, `advance_controlled_clock`, `run_oracle`, `submit_finding`.

There is no shell, filesystem, navigation, HTTP, evaluation, or selector tool, and no Playwright handle reaches a model. Actions use a closed grammar — `open_route`, `fill_synthetic_text`, `attach_synthetic_file`, `click_by_role`, `wait_for_state` — resolved per scenario: a route names a semantic target and the scenario supplies the path, text and files come from fixtures, and click names come from an approved list. The controlled clock is authorized only for the scenario that installs one.

`read_failed_assertion` returns the oracle id and the recorded failures. Phase 1 records no expected/actual pair, and none is invented.

`capture_accessibility_snapshot` exists because Phase 1 captures no accessibility tree — its trace snapshots are DOM, not the accessibility view. Rather than read one that does not exist, Phase 2 takes its own inside the reproduction context: the snapshot is redacted with Phase 1's `redactText`, written under the investigation's own artifact root, and returned as a reference plus a bounded excerpt.

## Composition and prompt

`resumematch-qa-tools/cordis.yml` composes one `main` agent over the QA tool registry and nothing else: no bash, filesystem, subagent, or workflow rows. Its model adapter is a scripted keyless provider; swapping that one row for the DeepSeek adapter is the only change a live evaluation needs.

The investigator's prompt is a file, `resumematch-qa-tools/prompts/investigator.md`, registered as its own prompt section rather than inlined in the composition, so a prompt edit is reviewable on its own. It states the role, that the agent holds no pass/fail authority, that budgets and lifecycle state arrive in each tool result's `status`, and that `submit_finding` is the only kept output. It does not restate the tool descriptions, which the registrations already carry.

First-probe scoring lives in `qa/investigation/goldProbe.ts`: it reads the head of a finding's recorded probe order and compares it to the public corpus's gold probe. Only cases declaring a gold probe are scored, so clean cases and held-out cases neither inflate nor depress the rate.

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

The corpus is split in two. `qa/investigation/evalCases.ts` holds the public half — three clean cases, four seeded defects anchored to exact single-occurrence source strings, and three benign transient cases — with their mutations, faults, and gold first probes. `qa/investigation/evalCases.heldout.ts` holds D5, D6, and B4 as expectations only: no mutation, no fault, no gold probe. Their definitions live in the gitignored `qa/investigation/heldout/` directory and load only under an explicit `--held-out` opt-in, and a gate test fails if any held-out id appears in the public file.

That makes thirteen cases, not the original twelve. B2 was implemented and executed during Phase 2 development, so it can no longer serve as held out; it stays in the corpus as a public benign case and carries no gold probe, and B4 takes the held-out slot. B4 interrupts the last-resume lookup once in the reuse scenario — a route and a scenario no public benign case covers, failing as a missing element rather than a failed navigation or a stalled poll.

### Runner

`node qa/browser/qaCommand.mjs evaluate <caseId...> --harness-node <path> --harness-path <path> --adapter-path <path>`

Per case it creates a detached worktree at the given commit, symlinks
`node_modules`, applies the seeded mutation by case id when there is one, and
runs `tests/e2e/evalCase.e2e.ts` inside that worktree through the ordinary QA
launcher — which owns the build, the fixed preview port, and the lock, so the
evaluation copy needs none of its own. That executor asserts nothing; it records
the run and its triage decision. Only when triage says `investigate` does the
runner launch the harness, under the Node named on the command line rather than
whichever Node is first on PATH. It then reads the submitted finding, scores the
first probe, removes the worktree, and prunes the registration.

A model-request counter file is created for every case whether or not an
investigation is launched, and the scripted provider appends one entry per
request, so a clean case's zero is a reading of that counter rather than the
absence of an observation.

No case has run against a real model.

## Freeze

The files below decide what the model sees and what it is allowed to do: the
prompt, the tool descriptions, the action grammar, the budgets, the finding
schema, the public corpus with its gold set, and the composition. They are
frozen before any live evaluation so that a result can be attributed to a
specific investigator rather than to a moving one.

`qa/investigation/freeze.test.ts` recomputes these hashes on every `npm test`. A
frozen file cannot change without this record changing in the same commit, which
is the point: the change becomes visible in review instead of drifting silently.
An `adapter:` path resolves inside the adapter checkout, located by
`RESUMEMATCH_QA_ADAPTER_PATH` or its default; when that checkout is absent the
adapter rows are reported as unverified and the four repository rows are still
enforced.

| File | sha256 |
| --- | --- |
| `adapter:prompts/investigator.md` | `3552005ef4a135ddd05b4607a6dd624231f5fe7e241ad21d10a196c7fe9ab09a` |
| `adapter:src/qa-tools.ts` | `aa58b8a66ae82cbd9ff725951d578765dbc5580f881930b9e798d336dd74ad0b` |
| `adapter:cordis.yml` | `fec97d76c5511d4329944689b592a4ee17122511ec180be66c9804d022433609` |
| `qa/investigation/actions.ts` | `ae6ad73af507c923734b9f14f3c4be5cdac107ed3e87ad8c1f949bd21bebe74d` |
| `qa/investigation/budget.ts` | `e5307cfa5504eb0dac1eeac92ebd6878892a3fadc5008ebb46521ea8ec53dff5` |
| `qa/investigation/finding.ts` | `d65a735aeddfb46002ce537beaf3d1407e41075cfb1dca48db139a3beeb97a2f` |
| `qa/investigation/evalCases.ts` | `e973094715410f0ae5bd00fb4c91e268c56611a0d6c792507488f8c7faa6f5f5` |

### Frozen at

| Checkout | Commit |
| --- | --- |
| ResumeMatch | `b0bc3e597a18abdc13b139f8501fa399362444a6` |
| DeepSeek Harness | `47f943859bef60e4160492346772ded9b24f765a` |
| `resumematch-qa-tools` adapter | `d8959fc8454afaf3488a85af79446e17d007deee` |

The ResumeMatch commit is the one the hashes were taken at; the commit that adds
this section changes only this document and its test, neither of which is frozen.
The adapter commit advanced once afterwards, to instrument the scripted
provider's request counter; all three frozen adapter hashes are unchanged, and
the commit is updated here rather than left stale.

### Toolchain

| Component | Version |
| --- | --- |
| Node (ResumeMatch build, Playwright, Vite) | 18.20.4 |
| Node (DeepSeek Harness) | 22.23.1 |
| Playwright | 1.57.0 |
| Vite | 5.4.21 |

## Evaluation identity

A run that belongs to the evaluation corpus carries `evaluationIdentity` in its manifest; a release check carries `null`. It records the case id, the mutation applied, the transient faults configured, a source digest, a build digest, and a worktree label. The label is deliberately not a path: an absolute temp path would carry the operator's home directory into evidence.

It does two things. `releaseGrade` is false whenever it is present, no matter how clean the worktree is, and artifact validation asserts both directions — an evaluation bundle can never be release grade, and a release-grade bundle can never carry one. And it is the only thing that widens the synthetic allowlist: with `null`, `canonicalApiResponseHashes` and `validNetworkEvent` are byte-for-byte the Phase 1 sets, so a bundle recording a transient failure body or a transient S3 status without having declared that fault is rejected as `INVALID_ARTIFACT_SCHEMA`. A manifest that fails its own schema is judged under the strict release set, so a malformed manifest cannot widen anything.

No model-reachable surface can produce one. The runner, the mutation applier, and worktree creation are not tools; `evaluationIdentity` is an authority field a submitted finding may not name.

### Evaluation copies

Each case runs in a detached `git worktree` under the system temp directory, never inside the main worktree, and the main worktree must be clean before one is created. The mutation applier takes a case id only — never a patch — resolves it through a registry, requires its anchor to match exactly once, and re-counts both strings after the write.

`investigate` rebuilds the application, so it recomputes both digests at startup and compares them to the manifest's. A mismatch is `EVALUATION_SOURCE_DRIFT` (exit 5) rather than an investigation of a different build.

### Measured build facts

Both measured on this machine at commit `f111fd3`, macOS 25.5, Node 18.20.4, Vite 5.4.21.

- **The QA build is byte-reproducible.** Three consecutive `qa:build` runs of the same commit produced the identical digest `1ce1aff0…2390` over 11 files. `buildDigest` is therefore an assertable identity, not just a record.
- **A temporary worktree uses a symlinked `node_modules`, not `npm ci`.** Symlinking the main checkout's `node_modules` into the evaluation worktree built successfully three times, and its output digest equals the main worktree's for the same commit. `npm ci` per case is unnecessary.
- **Dot entries are excluded from `buildDigest`.** The only difference between the two otherwise identical builds was a `.DS_Store` the file browser dropped into `.qa-dist`. Left in, it would change the evaluation identity and read as source drift.

## Evaluation-only transient faults

`RunOptions.transientFaults` is empty in every release check. Each fault fires at most once per scenario instance and models a contract-legal failure, so it records no contract violation:

- `upload_503_once` — `/upload` returns a fixed synthetic failure body once.
- `analysis_interrupted_once` — the second analysis poll is aborted; the response sequence still advances.
- `s3_response_500_once` — the multipart object is accepted and recorded, then the response fails.
- `last_resume_interrupted_once` — the previous-resume lookup is aborted, so the reuse path has nothing to offer.

Artifact validation accepts exactly two more fixed synthetic values for these — the transient upload body hash, and the transient S3 status with its empty body — and only for a run whose `evaluationIdentity` declared the matching fault. The allowlist stays closed, and stays exactly the Phase 1 set for every release check.

Two Phase 1 behaviors changed to make this usable. `createScenario` takes options, defaulting to no faults. And the results navigation in P1-02/P1-03 now goes through `requireUrl`, so a page that never navigates is a deterministic oracle failure rather than an unbounded wait inherited from the context's navigation timeout.
