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

First-probe scoring lives in `qa/investigation/goldProbe.ts` and reports two rates against the public corpus's gold probe. `goldFirstProbe` asks whether the very first read was the gold one. `goldWithinFirst3` asks whether it appeared among the opening three, and was added on 2026-08-22 after the D1 smoke test: the model read the manifest first and the gold probe third, an ordering the strict metric scores identically to never reaching for it at all. `goldWithinFirst4Excl` asks the same of the opening four once `read_failed_assertion` and `read_failure_manifest` are discounted; every live investigation opened with those two whichever case it was given, so counting them against the window measures a habit rather than a choice. Only cases declaring a gold probe are scored, so clean cases and held-out cases neither inflate nor depress any of the three rates.

## Budgets and latches

Hypotheses 3, probes 6, reproductions 1, actions 8, inspections 6, screenshots 2, accessibility snapshots 2, clock advances 2, oracle runs 1, tool calls 20, wall clock 8 minutes. Enforcement is in code, not in prompt text.

An attempted unauthorized action latches `policy_blocked` and leaves only `submit_finding` reachable. A spent budget is not a penalty of its own: it reaches the verdict through its consequence, since an investigation cut short has no completed reproduction oracle. Exceeding the read-only probe ceiling refuses that call and nothing more — probes cost the investigation only its own attention — while every other ceiling truncates real work and latches. Every refusal is recorded in the finding's `rejectedCalls`.

## Fresh reproduction

`start_fresh_reproduction` builds a new scenario instance, a new browser and context with no stored state, a new contract router and network policy, and — for the timeout scenario — a new controlled clock. It runs against the same build and the same scenario definition, and finishes with the same Phase 1 oracle function, followed by Phase 1's contract-then-safety precedence.

Reproduction artifacts are written under `.qa-artifacts/investigations/<inv-uuid>/`, never into `runs/`. The accepted bundle is a strict inventory with an immutable manifest: adding a file to it would fail revalidation, so Phase 2 opens it read-only and a test asserts the directory listing and manifest bytes are unchanged after an investigation.

## Classification

Decided by rule, from observed facts:

```
policy_blocked   the caller reached outside the application, named an authority
                 field, or pointed a reproduction at another run
inconclusive     the reproduction never ran its oracle, or never reached the
                 precondition the original failure needed
confirmed        the original failure is somewhere in the reproduction's failure set
not_reproduced   the reproduction's whole verify sweep passed
inconclusive     the sweep failed, but not on the original failure
```

A finding that names `classification`, `reproductionOracleResult`, `rejectedCalls`, `safetyViolations`, `sourceCommit`, `usage`, or `model` is refused as an unauthorized action; the narrative is discarded and the finding is recorded as `policy_blocked`.

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

### Keyless results

Five public cases, run with the scripted provider at ResumeMatch `5578e95` and
adapter `65da3b5`:

| Case | Triage | Model requests | Classification | First probe | Gold hit |
| --- | --- | --- | --- | --- | --- |
| C1 | expected | 0 | — | — | — |
| C2 | expected | 0 | — | — | — |
| C3 | expected | 0 | — | — | — |
| D1 | investigate | 6 | `confirmed` | `read_network_events` | yes |
| B1 | investigate | 11 | `not_reproduced` | `read_failed_assertion` | no |

Every case matched its expected triage and classification, the main worktree
stayed clean throughout, and every temporary worktree was removed and pruned.
The three clean cases cost zero model requests, read from the provider's own
counter file rather than inferred from an absence of calls.

The gold-probe column measures the script, not a model: B1's miss is the fixed
sequence reaching for the failed assertion before the network events, which is
the plan the script encodes. It becomes a real signal only under a live model.

D2 through D4, B2, and B3 are deliberately unrun: they are the live model's
first real work. No case has run against a real model.

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

### Freeze v5 (2026-08-23)

Superseding v4 after the first sweep left D2 inconclusive. **No file frozen in v4
moved.** The change was in `qa/browser/oracleRegistry.ts`, which v5 adds to the
set: it decides which observations a verdict is made from, so a result is only
attributable if it is pinned like the prompt and the corpus. It names
`CONTRACT_UPLOAD_BODY` — Phase 1 records a rejected upload body as a contract
violation with no oracle id, so a reproduction had nothing to match — and keys
that oracle and `P1-02_RESULTS_NAVIGATION` on the upload having been attempted
rather than accepted.

`finding.ts` was rehashed on 2026-08-23 after CI's lint gate rejected an unused
`InvestigationError` import left behind when its throws moved to
`invalidArguments`. Removing an unused import changes no behavior, so the entry
is updated inside v5 rather than opening a v6; the record still has to move with
the file, which is the point of the gate.

`cordis.yml` was rehashed on 2026-09-28 after the ResumeMatch repo moved from
`~/Desktop/resume-jd-match` to `~/code/resume-jd-match`: the `repositoryPath`
fallback default (used when `RESUMEMATCH_QA_REPOSITORY` is unset) was updated to
the new path. This changes no behavior when the env var is set, so the entry is
updated inside v5 rather than opening a v6.

`freeze.test.ts` verifies this table.

| File | sha256 |
| --- | --- |
| `adapter:prompts/investigator.md` | `a8434b2ce46dac0d58659e0b7ef6e9a983965cbf4221311ae4a1f1cc453f744c` |
| `adapter:src/qa-tools.ts` | `402ffac0d8a29c8e04028625c644fe78f15b1f40359779fae636bcc8afc28994` |
| `adapter:cordis.yml` | `0fe064eb867d7620d1f2e1e8575967d73d286d6190c787811fdde0b3a74ef714` |
| `adapter:run-config.yml` | `3d31f6c336e23ab9ec1211daec51b73b1d1f404a80c057ef643202234bb0000e` |
| `qa/browser/oracleRegistry.ts` | `c7381c8987c41153cd1875cecf8324461b5752fe4664f93f16b977b941637b61` |
| `qa/investigation/actions.ts` | `77bed40cdf1ec736f82964f1c6bbb970cdf533bb99c05b1e969499e281f009ab` |
| `qa/investigation/budget.ts` | `b2a5feef1fec034e3c1c3685a7762e5b45eba46a2469929e1bc8f3c88e61161d` |
| `qa/investigation/finding.ts` | `35064bd11a86885c5e7d0d0b55e88754398bd0556721ead8a5062aec51e04286` |
| `qa/investigation/evalCases.ts` | `c77174f5b01d81fa167940321049fb3f7fd62098df5182a7b7c4cc63164a9987` |

### Freeze v4 (2026-08-23, superseded)

Kept as the record the first full phase-1 sweep was taken under; it is history,
not a gate. Superseded v3 after that sweep. Six of the eight frozen files
moved, each for something the sweep measured rather than predicted: the sweep
evaluates a scenario's whole verify set so a reproduction can be compared to its
original failure, a refusal a caller could fix carries the scenario's policy
instead of latching, the corpus declares the request bodies a seeded defect
produces, B3's expectation matches what the product actually does with an
absorbed fault, and the probe ceiling matches what four live runs asked for.
`investigator.md` and `run-config.yml` did not move — the prompt and the model
configuration are unchanged across the sweep.

`freeze.test.ts` verifies this table.

| File | sha256 |
| --- | --- |
| `adapter:prompts/investigator.md` | `a8434b2ce46dac0d58659e0b7ef6e9a983965cbf4221311ae4a1f1cc453f744c` |
| `adapter:src/qa-tools.ts` | `402ffac0d8a29c8e04028625c644fe78f15b1f40359779fae636bcc8afc28994` |
| `adapter:cordis.yml` | `defc03624b3f0c4efe7920fcdd160e8ba02bb1f414b8548d43135d9b02a341ec` |
| `adapter:run-config.yml` | `3d31f6c336e23ab9ec1211daec51b73b1d1f404a80c057ef643202234bb0000e` |
| `qa/investigation/actions.ts` | `77bed40cdf1ec736f82964f1c6bbb970cdf533bb99c05b1e969499e281f009ab` |
| `qa/investigation/budget.ts` | `b2a5feef1fec034e3c1c3685a7762e5b45eba46a2469929e1bc8f3c88e61161d` |
| `qa/investigation/finding.ts` | `69d0713a9a239a1f6f32780208cd5ba16c1d235469808565d1d8a3bf3067730c` |
| `qa/investigation/evalCases.ts` | `c77174f5b01d81fa167940321049fb3f7fd62098df5182a7b7c4cc63164a9987` |

### Freeze v3 (2026-08-22, superseded)

Kept as the record the first full phase-1 sweep was taken under. Superseded v2
after the D1 smoke test produced a valid finding; only `finding.ts` had moved.
It is history, not a gate.

| File | sha256 |
| --- | --- |
| `adapter:prompts/investigator.md` | `a8434b2ce46dac0d58659e0b7ef6e9a983965cbf4221311ae4a1f1cc453f744c` |
| `adapter:src/qa-tools.ts` | `b6215d08e1c1fb160cd8f39726c3b46f37b9dff8fdf3ecdc3d1cb771de778379` |
| `adapter:cordis.yml` | `defc03624b3f0c4efe7920fcdd160e8ba02bb1f414b8548d43135d9b02a341ec` |
| `adapter:run-config.yml` | `3d31f6c336e23ab9ec1211daec51b73b1d1f404a80c057ef643202234bb0000e` |
| `qa/investigation/actions.ts` | `34df41395b6f61ef3ffc1d3d0491d3bb4250c76f96908031293605a08c2b877f` |
| `qa/investigation/budget.ts` | `e5307cfa5504eb0dac1eeac92ebd6878892a3fadc5008ebb46521ea8ec53dff5` |
| `qa/investigation/finding.ts` | `d6627bf8db7cd0623d5d053a6d4235211fba96decdc5ce7beffe64feed9dcb95` |
| `qa/investigation/evalCases.ts` | `e973094715410f0ae5bd00fb4c91e268c56611a0d6c792507488f8c7faa6f5f5` |

### Freeze v2 (2026-08-22, superseded)

Kept as the record the first D1 smoke test was taken under. Superseded v1 after
the first live runs. `investigator.md`, `qa-tools.ts`,
`cordis.yml`, `actions.ts`, and `finding.ts` moved to give a model enough to
repair a refused call: worked examples in the two tool descriptions it fumbled,
the finding's shape in the prompt, cache-hit pricing, and a malformed action
treated as retryable rather than as an unauthorized one. `budget.ts`,
`evalCases.ts`, and `run-config.yml` did not move.

It is history, not a gate.

| File | sha256 |
| --- | --- |
| `adapter:prompts/investigator.md` | `a8434b2ce46dac0d58659e0b7ef6e9a983965cbf4221311ae4a1f1cc453f744c` |
| `adapter:src/qa-tools.ts` | `b6215d08e1c1fb160cd8f39726c3b46f37b9dff8fdf3ecdc3d1cb771de778379` |
| `adapter:cordis.yml` | `defc03624b3f0c4efe7920fcdd160e8ba02bb1f414b8548d43135d9b02a341ec` |
| `adapter:run-config.yml` | `3d31f6c336e23ab9ec1211daec51b73b1d1f404a80c057ef643202234bb0000e` |
| `qa/investigation/actions.ts` | `34df41395b6f61ef3ffc1d3d0491d3bb4250c76f96908031293605a08c2b877f` |
| `qa/investigation/budget.ts` | `e5307cfa5504eb0dac1eeac92ebd6878892a3fadc5008ebb46521ea8ec53dff5` |
| `qa/investigation/finding.ts` | `998052f8b62678521b546183b7dbb281a0c4d0538c851f4c240b88ec5739c1f2` |
| `qa/investigation/evalCases.ts` | `e973094715410f0ae5bd00fb4c91e268c56611a0d6c792507488f8c7faa6f5f5` |

### Freeze v1 (2026-08-22, superseded)

Kept as the record the first two live runs were taken under. It is history, not
a gate; `freeze.test.ts` does not verify it.

| File | sha256 |
| --- | --- |
| `adapter:prompts/investigator.md` | `3552005ef4a135ddd05b4607a6dd624231f5fe7e241ad21d10a196c7fe9ab09a` |
| `adapter:src/qa-tools.ts` | `61c30728d2deef46bf6fa7c7c63e2d21be66730702f5337de9822d1343fa7187` |
| `adapter:cordis.yml` | `ae0634c0a8f44b76478f983f10d65bcb6d397b90aa6e2483d2b9e976141d3d74` |
| `adapter:run-config.yml` | `3d31f6c336e23ab9ec1211daec51b73b1d1f404a80c057ef643202234bb0000e` |
| `qa/investigation/actions.ts` | `ae6ad73af507c923734b9f14f3c4be5cdac107ed3e87ad8c1f949bd21bebe74d` |
| `qa/investigation/budget.ts` | `e5307cfa5504eb0dac1eeac92ebd6878892a3fadc5008ebb46521ea8ec53dff5` |
| `qa/investigation/finding.ts` | `97884755e6d2d0c84f5e20ac5a5d6086afcc43889f6e2bd5323da091c76409b6` |
| `qa/investigation/evalCases.ts` | `e973094715410f0ae5bd00fb4c91e268c56611a0d6c792507488f8c7faa6f5f5` |

### Frozen at

| Checkout | Commit |
| --- | --- |
| ResumeMatch | `a05115ba4c9e8252a95a1c39b82b2c632337dfb5` |
| DeepSeek Harness | `47f943859bef60e4160492346772ded9b24f765a` |
| `resumematch-qa-tools` adapter | `c94f117ffa63d6bbbd2d13f7591ba0326f003fe4` |

The ResumeMatch commit is the one the hashes were taken at; the commit that adds
this section changes only this document and its test, neither of which is frozen.
The adapter commit advances whenever any adapter file changes; the record is
updated rather than left stale. Preparing the live evaluation moved four frozen
hashes: `finding.ts` gained the per-request token accounting, `qa-tools.ts`
gained the pricing configuration and the usage forwarding, `cordis.yml` gained
the rates, and `run-config.yml` was added. `investigator.md`, `actions.ts`,
`budget.ts`, and `evalCases.ts` are untouched — the prompt, the action grammar,
the tool budgets, and the corpus are what a result must be attributable to, and
none of them moved.

### Run config

The live overlay is `adapter:run-config.yml`, hashed above. It disables the
scripted provider and mounts the DeepSeek adapter; the agent row's provider and
model come from `RESUMEMATCH_QA_PROVIDER` and `RESUMEMATCH_QA_MODEL`.

| Setting | Value | Source |
| --- | --- | --- |
| Provider route | `deepseek-official` | live run environment |
| Model id | `deepseek-v4-flash` | live run environment |
| Context window | 128000 | `run-config.yml` |
| Thinking | `enabled` | harness headless example |
| Reasoning effort | `max` | harness headless example |
| Sampling parameters | adapter defaults; none set | `run-config.yml` sets none |
| Input rate | $0.44 / 1M tokens, peak | `cordis.yml` |
| Cache-hit rate | $0.014 / 1M tokens, peak | `cordis.yml` |
| Output rate | $1.32 / 1M tokens, peak | `cordis.yml` |
| Peak bands (UTC minutes) | `60-240` and `360-600`; everything else off-peak | `cordis.yml` |
| Investigation ceiling | $0.25 | `cordis.yml` |
| Sweep ceiling | $5.00 | `qa/investigation/cost.ts` |

Cache hits are charged at their own rate; a run without one configured falls
back to the input rate, which overstates rather than understates. The finding records the disjoint counts, so a more
precise bill can be recomputed from it later. The pricing band is a label only;
billing stays at the peak rates whichever band a request lands in.

`finding.costUsd` covers the requests made up to `submit_finding` and therefore
excludes the closing turn that follows it. The sweep ceiling is not enforced
against that figure: the adapter writes every request to its own log, including
the closing turn, and the runner prices that log at the peak rates.

### Toolchain

| Component | Version |
| --- | --- |
| Node (ResumeMatch build, Playwright, Vite) | 18.20.4 |
| Node (DeepSeek Harness) | 22.23.1 |
| Playwright | 1.57.0 |
| Vite | 5.4.21 |

### Anthropic cross-model run (unfrozen)

A second live configuration runs the same thirteen cases on Anthropic's API. It
is **not covered by Freeze v5**: its overlay, `adapter:run-config.anthropic.yml`,
is not a row in the v5 table, so a result taken under it is attributable to the
frozen prompt, tools, grammar, budgets, schema, and corpus, but not to a frozen
composition. The overlay changes only the model adapter and the pricing
configuration; the agent row, its workspace context, and every budget come from
`cordis.yml` and `qa/investigation/budget.ts` unchanged.

| Setting | Value | Source |
| --- | --- | --- |
| Model adapter | `@deepseek-ai/dsh-llm-pi-ai` (pi-ai 0.82.1) | `run-config.anthropic.yml` |
| Provider route | `anthropic` | live run environment |
| Model id | `claude-sonnet-5-5`, declared by hand; pi-ai's installed catalog does not ship it | `run-config.anthropic.yml` |
| Credential reference | `ANTHROPIC_API_KEY`, forwarded only to the harness child | `run-config.anthropic.yml`, `runCase.ts` |
| Context window | 128000, matching the DeepSeek run | `run-config.anthropic.yml` |
| Output cap | 32768, pi-ai's fallback for a model whose entry sets none | `llm-pi-ai` default |
| Prompt caching | `cacheRetention: none`; no `cache_control` is sent, so no cache reads or writes are reported | `run-config.anthropic.yml` |
| Effort | No control. No effort levels are declared, so no thinking parameter is sent and the model runs at its default effort, `high`; the DeepSeek run used `max` | `run-config.anthropic.yml` |
| Input rate | $2.00 / 1M tokens | `run-config.anthropic.yml` |
| Cache-hit rate | $0.10 / 1M tokens, Anthropic's listed cache-hit rate for `claude-sonnet-5-5`; never applied while caching is off | `run-config.anthropic.yml` |
| Output rate | $10.00 / 1M tokens | `run-config.anthropic.yml` |
| Peak bands | none; every request is labelled peak | `run-config.anthropic.yml` |
| Investigation ceiling | $1.00, passed as `--cost-limit` and honoured by `serverMain.ts` over the $0.25 default | `run-config.anthropic.yml` |
| Sweep ceiling | $5.00 | `qa/investigation/cost.ts` |
| Harness HEAD | `015fa1305085bdf7fbac6e738eaf39207ad9b73a` | written against |
| Adapter HEAD | `fdc62693c2d95356d72da89e7dcbe950ab626e98`, the commit that contains `run-config.anthropic.yml` | adapter repository |

The runner's sweep rates default to the DeepSeek peak rates, so an Anthropic
sweep passes its own on the command line; otherwise the $5.00 ceiling is
enforced against an understated spend:

```bash
node qa/browser/qaCommand.mjs evaluate <caseId...> --harness-node <path> --harness-path <path> --adapter-path <path> \
  --config <adapter-path>/run-config.anthropic.yml --provider anthropic --model claude-sonnet-5-5 \
  --input-rate 2 --output-rate 10 --cache-hit-rate 0.10
```

#### Results (2026-10-08)

One full sweep of all thirteen cases with `--held-out`, at ResumeMatch
`9c5e6d7`, as printed by `qaCommand evaluate`:

```
D5 seeded_defect investigate y 10 0 confirmed y read_failure_manifest - - - $0.2496
D6 seeded_defect investigate y 10 0 confirmed y read_failure_manifest - - - $0.2470
B4 benign_transient artifact_rejected y 0 0 - y - - - - $0.0000
C1 clean expected y 0 0 - y - - - - $0.0000
C2 clean expected y 0 0 - y - - - - $0.0000
C3 clean expected y 0 0 - y - - - - $0.0000
D1 seeded_defect investigate y 8 0 confirmed y read_failure_manifest n n y $0.1634
D2 seeded_defect investigate y 10 0 confirmed y read_failure_manifest n n y $0.2362
D3 seeded_defect investigate y 11 0 confirmed y read_failure_manifest n n n $0.2558
D4 seeded_defect investigate y 11 0 confirmed y read_failure_manifest n y y $0.2842
B1 benign_transient investigate y 12 0 not_reproduced y read_failure_manifest n n y $0.2905
B2 benign_transient investigate y 10 0 not_reproduced y read_failure_manifest - - - $0.2440
B3 benign_transient expected y 0 0 - y - - - - $0.0000
Total $1.9707 of the $5.00 sweep ceiling.
```

Columns: case, kind, triage, ok, requests, rejected, classification, ok, first
probe, gold, gold3, gold4x, cost.

- Triage and classification matched on 13 of 13 cases.
- All 6 seeded defects were `confirmed`, including held-out D5 and D6.
- None of the 4 benign transient cases was `confirmed`.
- The five zero-call cases (C1, C2, C3, B3, B4) made 0 model calls.
- Over the five cases with a gold probe (D1–D4, B1): gold 0/5, gold3 1/5,
  gold4x 4/5. The strict metric and the orientation-discounted one are reported
  together; neither is read alone.
- Every case that called the model opened with `read_failure_manifest`.

Run history, same evening:

- A single-case D1 smoke run: `confirmed`, 8 requests, gold n / gold3 y /
  gold4x y, $0.1646. Its gold3 differs from the sweep's D1 while its
  classification does not.
- A first full sweep aborted at D5, because held-out cases require
  `--held-out`. It had spent $1.0767 on C1–D4 and printed no table; its results
  are not used.

Limits:

- Not covered by Freeze v5.
- Effort is the model's default, `high`; the DeepSeek run used `max`.
- Prompt caching is off.
- Context window 128000.
- A single sweep (n=1).
- Pre-fix: measured with the evaluation identity visible to the investigator,
  so only the classifications compare with post-fix runs; see
  [Investigator-view leak and fix](#investigator-view-leak-and-fix-2026-10-10).

## Evaluation identity

A run that belongs to the evaluation corpus carries `evaluationIdentity` in its manifest; a release check carries `null`. It records the case id, the mutation applied, the transient faults configured, a source digest, a build digest, and a worktree label. The label is deliberately not a path: an absolute temp path would carry the operator's home directory into evidence.

It does two things. `releaseGrade` is false whenever it is present, no matter how clean the worktree is, and artifact validation asserts both directions — an evaluation bundle can never be release grade, and a release-grade bundle can never carry one. And it is the only thing that widens the synthetic allowlist: with `null`, `canonicalApiResponseHashes` and `validNetworkEvent` are byte-for-byte the Phase 1 sets, so a bundle recording a transient failure body or a transient S3 status without having declared that fault is rejected as `INVALID_ARTIFACT_SCHEMA`. A manifest that fails its own schema is judged under the strict release set, so a malformed manifest cannot widen anything.

No model-reachable surface can produce one. The runner, the mutation applier, and worktree creation are not tools; `evaluationIdentity` is an authority field a submitted finding may not name. That covers producing an identity, not reading one: until 2026-10-10 the investigator could read it verbatim, see [Investigator-view leak and fix](#investigator-view-leak-and-fix-2026-10-10).

### Investigator-view leak and fix (2026-10-10)

**What leaked.** Three surfaces gave the investigator the answer before it read
any evidence:

- `read_failure_manifest` returned the manifest verbatim
  (`qa/investigation/session.ts`, via `readManifest`), including
  `evaluationIdentity`: `caseId`, `mutationApplied` (the case id itself, never a
  description), `transientFaults`, and `worktreeLabel` (which ends in the
  lower-case case id, such as `700e0c69bbe7-d3`).
- `sourceIdentity.worktreeDirty` and `exactCommittedSource` in the same manifest
  separated the cases: `true`/`false` for every seeded defect, whose copy carries
  a mutation, and `false`/`true` for every benign case.
- The transition log named the injected fault: `qa/browser/scenarios.ts`
  recorded `transient-fault:<name>`, such as `transient-fault:upload_503_once`.

**Present in every model run to date.** It was verified from the transcripts and
the code.

- Every transcript that called `read_failure_manifest` received a populated
  `evaluationIdentity`: 106 of 106.
  - DeepSeek `deepseek-v4-flash` 12: the 2026-08-22/23 runs in
    `.qa-artifacts/phase1/`, `phase1-v4/` and `phase1-v5-d2/`, at `d5ccabc`,
    `2647925` and `2d65cfb`.
  - Haiku 40, Sonnet 40 and Opus 14: the 2026-10-08/09 sweeps.
  - The other 26 Opus transcripts ended on the provider's usage-limit 400
    before any tool call.
- The transition log carried `transient-fault:<name>` in every B1 and B2
  transcript that read it.
- The code path did not change between those runs.
  - `git diff --stat 2647925 700e0c6` is empty for `qa/browser/evidence.ts`,
    `scenarios.ts`, `contractRouter.ts`, `qa/investigation/session.ts`,
    `evidenceReader.ts` and `serverMain.ts`.
  - The adapter's `src/` is unchanged since `c94f117`.
- Findings repeated the identity. A finding's text named the case id in 34 of
  40 Sonnet findings, 14 of 14 Opus, 20 of 40 Haiku, and 4 of the 12 DeepSeek
  transcripts.

**Fix: `f1e5aff`.** Only the investigator's view changed.

- `read_failure_manifest` now returns an evaluation run exactly as a clean,
  committed release run records itself:
  - `evaluationIdentity: null`;
  - `sourceIdentity` with `worktreeDirty: false`, `exactCommittedSource: true`
    and `releaseGrade: false`, with `headCommit` unchanged.
  - `releaseGrade` is false for every investigated run anyway. Triage only
    investigates an unmet expectation, and only a met one is release eligible.
- A release run, whose identity is `null`, is returned as recorded.
- The manifest on disk keeps the real values, as do the drift check in
  `serverMain.ts`, the finding's deterministic facts, and artifact validation.
- A transient fault now records what the browser observed:
  - `upload-response:503`
  - `s3-response:500`
  - `analysis-response:aborted`
  - `last-resume-response:aborted`
- The frozen `oracleRegistry.ts` keys on none of the old or new strings, and
  artifact validation checks only the transition's shape.
- The upload 503 body text never reaches a model-visible surface, so it is
  unchanged. The page shows its own fallback for any 5xx
  (`src/api/errors.ts`), and network events carry no bodies.

Measured after the fix:

- A scripted `evaluate C1 D1 D3 B1 B2` at `f1e5aff` had zero hits in every tool
  result. The scan looked for case ids (case-insensitive, including inside
  worktree labels), `mutation`, `seeded`, `evaluationIdentity`,
  `transient-fault`, `transient`, and the four fault names.
- That script calls neither `read_failure_manifest` nor
  `read_scenario_transition_log`, so those two surfaces were checked
  separately:
  - The real D1, D3, B1 and B2 manifests, replayed through the committed view,
    return `evaluationIdentity: null` and identical `sourceIdentity` values for
    all four, with zero hits.
  - The six evaluation bundles written by the QA suite on 2026-10-10 hold zero
    hits in their transition logs.
- In that scripted run, D1 was `inconclusive` rather than `confirmed`; the
  other four cases matched. D1 is also `inconclusive` from the same script at
  the pre-fix commit `700e0c6`, so the fix did not cause it.

**What it means for recorded results.**

- **Classification results remain valid.** The reproduction oracle decides
  them, never the model (`qa/investigation/finding.ts:200-209`).
- **Probe and wording results do not carry over.** gold, gold3, gold4x, first
  probe, and finding text recorded before the fix were measured with the
  identity visible. They must not be compared with post-fix runs.
- **Pre-fix runs still compare with each other.** DeepSeek, Haiku, Sonnet and
  Opus all ran with the same surfaces exposed.

**Known gaps, not fixed:**

- The authority-field check in `finding.ts` rejects a narrative that supplies a
  key such as `evaluationIdentity`. It does not inspect free text, so a finding
  can still write a case id in prose.
- After the fix, only benign cases produce a `*-response:5xx` or
  `*-response:aborted` transition. That marks a benign transient case as a
  shortcut in case design, not a leak.
- A provider 400, such as a usage-limit refusal, is turned into an ordinary
  finish. The table reports it only as `no finding was submitted`; the error
  text survives only in the transcript.

#### Post-fix results (2026-10-10)

The thirteen cases were run again on all three Anthropic models after the fix,
and compared with the pre-fix sweeps of 2026-10-08/09. The full analysis,
including every quoted hit, is in `.qa-artifacts/analysis/postfix-comparison.md`.

Run conditions:

| Setting | Pre-fix | Post-fix |
| --- | --- | --- |
| ResumeMatch commit | `9c5e6d7` (Sonnet run1), `700e0c6` (all others) | `d6005e8`; Haiku run1 at `79fbad3`, which has the leak fix but not the output-path fix |
| Models | `claude-haiku-5-5`, `claude-sonnet-5-5`, `claude-opus-5-5` | same |
| Overlays | `run-config.anthropic-haiku.yml`, `run-config.anthropic.yml`, `run-config.anthropic-opus.yml` (adapter `f8a1ecc`) | same |
| Rates per 1M tokens (input / output / cache hit) | Haiku 0.10 / 0.50 / 0.01, Sonnet 2.00 / 10.00 / 0.10, Opus 4.00 / 20.00 / 0.20 | same |
| Investigation ceiling | $1.00 Haiku and Sonnet, $2.00 Opus, as configured in each overlay | same |
| Sweep ceiling | $5.00 (`EVALUATION_COST_LIMIT_USD`, `qa/investigation/cost.ts`) | same |
| Effort | Anthropic's documented defaults: Haiku 5.5 medium, Sonnet 5.5 high, Opus 5.5 medium (https://platform.claude.com/docs/en/models/overview, checked 2026-10-08). This setup sends no effort parameter, so the level could not be verified or changed here | same |
| Prompt caching | off (`cacheRetention: none`) | same |
| Sweeps (n) | Haiku 5, Sonnet 5, Opus 1 complete + 1 partial | Haiku 5, Sonnet 5, Opus 3 |

Pre-fix Opus coverage:

- Run1 is complete.
- Run2 counts for D5, D6 and D1–D4. Its B1 and B2 ended on a provider 400.
- Runs 3, 4 and 5 are excluded: every model-calling case ended on a provider 400.
- Each of those 26 excluded cases failed on the account's monthly API spend
  limit, not on model behaviour. The transcript reads "You have reached your
  specified API usage limits", and the case made 0 requests.

Data integrity, checked before comparing:

- For each post-fix run, the table re-rendered from `summary.json` equals the
  printed table, and each `<case>.json` equals its summary entry.
- No case recorded `model usage not recorded; cost ceilings were not enforced`.
- Every case has triage ok and classification ok.
- Request-log lines equal transcript usage events in every case except Haiku
  run1, whose logs were lost.
- Every recorded cost equals its request log priced at the overlay rates.

Classification: every post-fix run matched 13 of 13 on every model. The pre-fix
runs also matched every counted case: 13/13, and 11/11 for Opus run2.

Sweep totals, as mean (min–max):

| Model | Pre n | Pre requests | Pre cost | Post n | Post requests | Post cost |
| --- | --- | --- | --- | --- | --- | --- |
| Haiku | 5 | 77 (72–82) | $0.1125 (0.1056–0.1195) | 5 | 79.2 (75–82) | $0.1149 (0.1086–0.1206) |
| Sonnet | 5 | 81.6 (79–85) | $1.9645 (1.8951–2.0553) | 5 | 82.6 (80–85) | $1.9495 (1.8837–2.0108) |
| Opus | 1 | 81 | $4.1682 | 3 | 84.3 (82–88) | $4.5308 (4.3771–4.8176) |

Requests per case, as mean (min–max). n is 5 for Haiku and Sonnet. For Opus it
is 2 pre-fix (1 for B1 and B2) and 3 post-fix:

| Case | Haiku pre | Haiku post | Sonnet pre | Sonnet post | Opus pre | Opus post |
| --- | --- | --- | --- | --- | --- | --- |
| D5 | 8.2 (7–9) | 8 (7–9) | 9.2 (9–10) | 9 (9) | 9 (9) | 9 (9) |
| D6 | 9.4 (8–10) | 10.4 (9–11) | 9.2 (9–10) | 10.2 (10–11) | 10.5 (10–11) | 10.3 (10–11) |
| D1 | 8.2 (6–11) | 7.4 (6–9) | 8.2 (8–9) | 8.2 (8–9) | 8.5 (8–9) | 8.7 (8–10) |
| D2 | 10.8 (9–12) | 10 (9–11) | 10.4 (10–11) | 10.4 (10–11) | 9.5 (9–10) | 11 (11) |
| D3 | 9.6 (9–10) | 10.8 (10–13) | 11.2 (11–12) | 10.8 (10–11) | 12.5 (12–13) | 12.3 (12–13) |
| D4 | 10.4 (9–11) | 11 (10–12) | 11.6 (11–13) | 11.4 (11–12) | 8.5 (7–10) | 11 (10–12) |
| B1 | 10.2 (8–12) | 10.2 (8–13) | 11.4 (11–12) | 12 (11–13) | 10 | 12 (11–13) |
| B2 | 10.2 (9–11) | 11.4 (10–12) | 10.4 (10–11) | 10.6 (10–11) | 11 | 10 (10) |

Cost per case in USD, as mean (min–max). n as above:

| Case | Haiku pre | Haiku post | Sonnet pre | Sonnet post | Opus pre | Opus post |
| --- | --- | --- | --- | --- | --- | --- |
| D5 | .0113 (.0099–.0127) | .0109 (.0095–.0125) | .2137 (.2027–.2496) | .2008 (.1995–.2029) | .4529 (.4482–.4576) | .4593 (.4517–.4737) |
| D6 | .0196 (.0177–.0210) | .0209 (.0193–.0225) | .2264 (.2186–.2470) | .2491 (.2427–.2703) | .5698 (.5517–.5880) | .5805 (.5576–.6183) |
| D1 | .0100 (.0078–.0130) | .0092 (.0080–.0108) | .1748 (.1631–.2081) | .1728 (.1565–.1886) | .4068 (.3853–.4283) | .4274 (.3829–.5128) |
| D2 | .0148 (.0127–.0164) | .0138 (.0125–.0150) | .2468 (.2362–.2590) | .2479 (.2314–.2765) | .4990 (.4913–.5068) | .5862 (.5607–.6014) |
| D3 | .0135 (.0127–.0144) | .0146 (.0124–.0166) | .2691 (.2558–.3063) | .2534 (.2438–.2634) | .6160 (.5785–.6535) | .6559 (.6067–.7360) |
| D4 | .0154 (.0133–.0171) | .0157 (.0153–.0164) | .3030 (.2830–.3579) | .2912 (.2796–.3094) | .4642 (.3810–.5474) | .6538 (.5632–.7250) |
| B1 | .0136 (.0114–.0159) | .0136 (.0109–.0181) | .2764 (.2658–.2905) | .2825 (.2593–.3145) | .5223 | .6401 (.5935–.6701) |
| B2 | .0143 (.0130–.0155) | .0162 (.0142–.0176) | .2542 (.2428–.2727) | .2518 (.2374–.2615) | .5756 | .5276 (.4938–.5464) |

Gold probes, as gold / gold3 / gold4x per run. Each run counts the cases with a
gold probe (D1–D4 and B1), 5 per run, except Opus pre-fix run2 at 4:

| Model | Pre-fix runs | Pre-fix pooled | Post-fix runs | Post-fix pooled |
| --- | --- | --- | --- | --- |
| Haiku | 0/0/3, 0/1/3, 0/0/1, 0/1/3, 0/1/3 | 0/25, 3/25, 13/25 | 0/1/3, 0/0/1, 0/0/2, 0/1/2, 0/1/2 | 0/25, 3/25, 10/25 |
| Sonnet | 0/1/4, 0/1/5, 0/1/4, 0/1/4, 0/1/4 | 0/25, 5/25, 21/25 | 0/1/4, 0/1/5, 0/1/5, 0/1/5, 0/1/4 | 0/25, 5/25, 23/25 |
| Opus | 0/1/5, 0/1/4 | 0/9, 2/9, 9/9 | 0/1/5, 0/1/4, 0/1/4 | 0/15, 3/15, 13/15 |

First probe, over model-calling cases:

| Model | Pre-fix | Post-fix |
| --- | --- | --- |
| Haiku | `read_failed_assertion` 40/40 | `read_failed_assertion` 40/40 |
| Sonnet | `read_failure_manifest` 40/40 | `read_failure_manifest` 40/40 |
| Opus | `read_failure_manifest` 9/14, `read_failed_assertion` 5/14 | `read_failure_manifest` 24/24 |

Finding text. Each cell is the number of submitted findings whose free text
contains the term at least once, case-insensitive. "Case id" means C1–C3, D1–D6
or B1–B4 as a whole word:

| Model | Phase | Findings | Case id | `mutation` | `seeded` | `evaluationIdentity` | `transient` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Haiku | pre | 40 | 20 | 17 | 0 | 0 | 13 |
| Haiku | post | 40 | 0 | 0 | 0 | 0 | 3 |
| Sonnet | pre | 40 | 34 | 30 | 0 | 0 | 14 |
| Sonnet | post | 40 | 0 | 0 | 0 | 0 | 7 |
| Opus | pre | 14 | 14 | 11 | 0 | 0 | 5 |
| Opus | post | 24 | 0 | 0 | 0 | 0 | 5 |

The 15 post-fix `transient` hits:

- All 15 are in B1 or B2. They are the model's own wording for the 503 or
  aborted request it observed. Examples:
  - Sonnet run1 B1: "an injected or transient 503 on the upload POST".
  - Opus run3 B2: "a transient or order-dependent gap in route registration or mock state".
- The word appears in zero tool results post-fix. A scan of every post-fix tool
  result found:
  - no case id, no `mutation`, no `seeded`, no `transient`, and no fault name;
  - `evaluationIdentity` only as the `"evaluationIdentity": null` key the fixed
    view returns.

Mean wall time per case, in seconds. n as above:

| Case | Haiku pre | Haiku post | Sonnet pre | Sonnet post | Opus pre | Opus post |
| --- | --- | --- | --- | --- | --- | --- |
| D5 | 69 | 71 | 70 | 69 | 88 | 96 |
| D6 | 68 | 71 | 69 | 72 | 87 | 100 |
| D1 | 29 | 32 | 33 | 32 | 44 | 59 |
| D2 | 75 | 80 | 72 | 73 | 92 | 103 |
| D3 | 48 | 54 | 52 | 52 | 68 | 86 |
| D4 | 82 | 83 | 85 | 84 | 90 | 114 |
| B1 | 72 | 78 | 76 | 77 | 86 | 106 |
| B2 | 48 | 52 | 51 | 50 | 100 | 73 |
| B4 | 14 | 16 | 14 | 14 | 14 | 14 |
| C1 | 6 | 8 | 6 | 6 | 6 | 6 |
| C2 | 16 | 17 | 16 | 16 | 16 | 16 |
| C3 | 16 | 18 | 16 | 16 | 16 | 16 |
| B3 | 16 | 17 | 16 | 16 | 16 | 16 |

Notes:

- Haiku run1 lost its request logs to the `--output` path bug fixed in
  `d6005e8`. Its requests and cost were rebuilt from its transcripts, one request
  per `assistant/message` event that carries usage. The rebuilt table is
  `.qa-artifacts/postfix-haiku-run1.corrected.txt`; the printed one is kept
  unchanged.
- Opus sweeps ran at $4.38–$4.82 against the $5.00 sweep ceiling
  (`EVALUATION_COST_LIMIT_USD` in `qa/investigation/cost.ts`). The most
  expensive Opus case was $0.7360, against its $2.00 investigation ceiling.
- The D1 `inconclusive` result from the scripted provider predates the fix and
  is unexplained.

Observations:

- After the fix, finding text no longer names case ids.
- For Haiku and Sonnet, classification, requests, cost and probe paths changed
  little.
- Opus has only one complete pre-fix sweep, so its change is not characterised.
- These are observed differences at small n, not significance tests.
- Pre-fix probe and wording numbers were measured with the identity visible.
  They appear beside the post-fix numbers to show what changed when it was
  hidden, not as like-for-like results.

### Evaluation copies

Each case runs in a detached `git worktree` under the system temp directory, never inside the main worktree, and the main worktree must be clean before one is created. The mutation applier takes a case id only — never a patch — resolves it through a registry, requires its anchor to match exactly once, and re-counts both strings after the write.

`investigate` rebuilds the application, so it recomputes both digests at startup and compares them to the manifest's. A mismatch is `EVALUATION_SOURCE_DRIFT` (exit 5) rather than an investigation of a different build.

### Measured build facts

Both measured on this machine at commit `f111fd3`, macOS 25.5, Node 18.20.4, Vite 5.4.21.

- **The QA build is byte-reproducible.** Three consecutive `qa:build` runs of the same commit produced the identical digest `1ce1aff0…2390` over 11 files. `buildDigest` is therefore an assertable identity, not just a record.
- **A temporary worktree uses a symlinked `node_modules`, not `npm ci`.** Symlinking the main checkout's `node_modules` into the evaluation worktree built successfully three times, and its output digest equals the main worktree's for the same commit. `npm ci` per case is unnecessary.
- **Dot entries are excluded from `buildDigest`.** The only difference between the two otherwise identical builds was a `.DS_Store` the file browser dropped into `.qa-dist`. Left in, it would change the evaluation identity and read as source drift.

### Declared boundary: a fault the product absorbs

B3 injects a failing S3 response after the object is accepted. The upload page
catches that failure on purpose and navigates anyway
([src/pages/Upload.tsx:159-168](../src/pages/Upload.tsx#L159-L168)): the comment
there records the reasoning — a presigned POST can fail to return a readable
response while the upload itself succeeded, so the page lets polling decide.
Measured 2026-08-23: the fault fires (`transient-fault:s3_response_500_once` is
in the transition log, the S3 request is recorded once with status 500), the
analysis polls to `completed`, and every oracle passes.
Since `f1e5aff` the same firing records `s3-response:500` instead; see [Investigator-view leak and fix](#investigator-view-leak-and-fix-2026-10-10).

So B3 reaches no investigator, and its expectation is `expected` with zero model
requests. It still earns its place: it is the corpus's only case proving that an
injected fault the product deliberately absorbs does not manufacture work for a
model.

### Declared boundary: failures before the first checkpoint

A run whose first oracle failure precedes its scenario's first checkpoint
produces a bundle with a trace and a video but no checkpoint screenshot, and
artifact validation requires all three
([artifactValidator.ts:674](../qa/browser/artifactValidator.ts#L674)). The whole
bundle is rejected, triage routes the run to `artifact_rejected`, and no
investigator is reachable.

Found by held-out case B4 on 2026-08-23. B4 interrupts the previous-resume
lookup in the reuse scenario; without a previous resume the upload page never
offers one, so `P1-03_EXISTING_FILE` fails at
[runReleaseCheck.ts:121](../qa/browser/runReleaseCheck.ts#L121) — two lines
before the `existing-resume-ready` checkpoint. Its `checkpointScreenshots` array
is empty and the bundle is refused.

B4 was registered expecting `not_reproduced`. That expectation was written
before the case ran and was wrong about this boundary, not about the product:
the expectation is corrected to `artifact_rejected` with zero model calls. This
is a change to a held-out expectation made after seeing its result, which is
exactly what the held-out set exists to prevent — so it is recorded here rather
than quietly applied. Nothing about the investigator, the prompt, the budgets,
or the validator changed in response.

**Outside the corpus this class is not covered.** A production defect that fails
before its scenario's first checkpoint is rejected as evidence and goes to human
review.

### Declared boundary: request-shape defects

A seeded defect that changes the *shape* of a request — D2 renames `fileName` to
`filename` — produces a body the closed synthetic allowlist cannot know. Phase 1
rejects that evidence as `INVALID_TRACE_RESOURCE`, the bundle is deleted, and
triage routes the run to `artifact_rejected` without invoking a model. That is
the allowlist doing its job: it exists to keep anything but known synthetic
bytes out of a raw trace, not to judge whether a request is well formed.

The evaluation corpus can declare such a body in advance:
`mutation.approvedRequestHashes` travels into the manifest's evaluation identity
and is admitted only for the run whose own `mutationApplied` names that case. A
release bundle, or an evaluation run attributing the hash to another case, sees
the Phase 1 set byte for byte.

**Outside the evaluation corpus this class is not covered.** A production defect
that changes a request's shape will be rejected as evidence and routed to human
review, because its body cannot have been declared beforehand. The investigator
does not see it.

## Evaluation-only transient faults

`RunOptions.transientFaults` is empty in every release check. Each fault fires at most once per scenario instance and models a contract-legal failure, so it records no contract violation:

- `upload_503_once` — `/upload` returns a fixed synthetic failure body once.
- `analysis_interrupted_once` — the second analysis poll is aborted; the response sequence still advances.
- `s3_response_500_once` — the multipart object is accepted and recorded, then the response fails.
- `last_resume_interrupted_once` — the previous-resume lookup is aborted, so the reuse path has nothing to offer.

Artifact validation accepts exactly two more fixed synthetic values for these — the transient upload body hash, and the transient S3 status with its empty body — and only for a run whose `evaluationIdentity` declared the matching fault. The allowlist stays closed, and stays exactly the Phase 1 set for every release check.

Two Phase 1 behaviors changed to make this usable. `createScenario` takes options, defaulting to no faults. And the results navigation in P1-02/P1-03 now goes through `requireUrl`, so a page that never navigates is a deterministic oracle failure rather than an unbounded wait inherited from the context's navigation timeout.
