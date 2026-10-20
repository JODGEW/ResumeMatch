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

Hypotheses 3, probes 8, reproductions 1, actions 8, inspections 6, screenshots 2, accessibility snapshots 2, clock advances 2, oracle runs 1, tool calls 20, wall clock 8 minutes. Enforcement is in code, not in prompt text.

An attempted unauthorized action latches `policy_blocked` and leaves only `submit_finding` reachable. A spent budget is not a penalty of its own: it reaches the verdict through its consequence, since an investigation cut short has no completed reproduction oracle. Exceeding the read-only probe ceiling refuses that call without latching — probes cost the investigation only its own attention — while every other ceiling truncates real work and latches. A call refused by the probe ceiling, or by any other per-kind ceiling, still uses one of the 20 tool calls, because the tool-call ceiling is charged first; a call refused by the tool-call ceiling, the cost ceiling, or the wall clock before that charge uses none. Every budget refusal tells the model which happened and how many tool calls remain. Every refusal is recorded in the finding's `rejectedCalls`.

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

The corpus is split in two. `qa/investigation/evalCases.ts` holds the public half — three clean cases, seven seeded defects anchored to exact single-occurrence source strings, and four benign transient cases — with their mutations and faults, and gold first probes for D1–D4 and B1. Their graded root causes and evidence sets live in `rootCauseGold.ts` and `goldEvidence.ts`. `qa/investigation/evalCases.heldout.ts` holds D5, D6, D10, D11, B4, and B6 as expectations only: no mutation, no fault, no gold probe. Their definitions live in the gitignored `qa/investigation/heldout/` directory and load only under an explicit `--held-out` opt-in, and a gate test fails if any held-out id appears in the public file. Since `cd8c186` a held-out definition may also carry its case's gold root cause and evidence set; a case without them is not graded.

That made thirteen cases, not the original twelve. B2 was implemented and executed during Phase 2 development, so it can no longer serve as held out; it stays in the corpus as a public benign case and carries no gold probe, and B4 takes the held-out slot. B4 interrupts the last-resume lookup once in the reuse scenario — a route and a scenario no public benign case covers, failing as a missing element rather than a failed navigation or a stalled poll. Commit `a327a4c` added D7, D8, D9 and B5 to the public half, for seventeen cases. Step 5 added held-out D10, D11 and B6 after Freeze v6, for twenty.

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

A sweep refuses to start when the adapter checkout has uncommitted or untracked
changes (`cleanAdapterCommit`, `evalRunner/worktree.ts`): the adapter names
itself in every finding by `git rev-parse HEAD` with no dirty flag, so an edited
adapter would be recorded as a commit that did not run. Each case result records
the clean commit as `adapterCommit`. The ResumeMatch checkout is held to the
same rule when each evaluation copy is created.

`--sweep-cost-limit <dollars>` sets the sweep ceiling; without it the ceiling is
$5.00 (`EVALUATION_COST_LIMIT_USD`). A case is refused rather than started once
the sweep has spent the ceiling. Each case result records the ceiling it was
gated against as `sweepLimitUsd`, and the line under the summary table names it.

When the QA launcher fails, the case result keeps its exit code, signal, and the
last 4,000 characters of its stdout and stderr as `launcherFailure`, so a
failure such as an occupied port can be diagnosed from the artifacts.

Two errors stop the sweep before another case starts: model usage the runner
never saw (`model usage not recorded; cost ceilings were not enforced`), and a
provider with no credential (`the provider has no API key
(MISSING_CREDENTIAL)`, `guardCredential` in `evalRunner/runCase.ts`). The second
is recognized from the transcript's `turn/end` error: the code
`MISSING_CREDENTIAL`, or a message containing "no API key". That shape comes
from the only case seen so far, DeepSeek with no key (post-fix
`deepseek-run1`, D1); a provider that reports a missing key any other way is not
caught.

Known, not fixed: `INVESTIGATION_BUDGET.reproductionWallClockMs` (240 s,
`budget.ts`) is defined but not enforced. Only the 480 s investigation wall
clock is checked, and only when a budget is spent, so nothing bounds how long a
single `run_oracle` takes. Under v7 the longest scripted public case took 79 s
end to end.

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
schema, the public corpus with its gold set, and the composition. Since v6 they
also cover how a run is scored and the scenario and evidence model the cases run
in. They are frozen before any live evaluation so that a result can be
attributed to a specific investigator rather than to a moving one.

`qa/investigation/freeze.test.ts` recomputes the current version's hashes on
every `npm test`. A frozen file cannot change without this record changing in
the same commit, which is the point: the change becomes visible in review
instead of drifting silently. Only the current version gates; earlier tables
are history, and the test also checks that the Freeze v7, v6 and v5 sections
are unchanged.
An `adapter:` path resolves inside the adapter checkout, located by
`RESUMEMATCH_QA_ADAPTER_PATH` or its default; when that checkout is absent the
nine adapter rows are reported as unverified and the 28 repository rows are
still enforced.

### Freeze v8 (2026-10-18)

Superseding v7 after its live sweeps (see
[Freeze v7 live results](#freeze-v7-live-results-2026-10-11)). Under v7 the
prompt described `rootCause` as the investigator's conclusion about the
original failure, while the gold grades the defect the reproduction exposes.
Where the original run failed for a one-off reason and a seeded defect showed
only in the reproduction, the prompt supported one answer and the gold graded
another. The Freeze v7 table below is kept byte for byte as history; its line
saying `freeze.test.ts` verifies it describes the gate as it stood until v8.

**The change.** `rootCause` is now the cause the investigation found, not
limited to the original failure. If the original run or the reproduction shows
the application itself behaving wrongly, the investigator names that defect,
even when the original failure also had a separate one-off cause.
`transient_or_environment` now also requires that neither run shows an
application defect.

**What moved since v7.** One file: `adapter:prompts/investigator.md`
(`649b94a`), from `bec5c5176c6b38a5bee3745cec546fd1d1d77cdbc6c8e568c53af456a475d100`
to `360f051fd50f5241dba85babda0a23a8ec9923a8028352cf59697baf3ef6d1bc`. The tool
descriptions, the finding schema, the graders, the gold answers and the cases
are unchanged, and the other 36 rows carry their v7 hashes.

**D10 is exposed.** Its v7 results were inspected, its definition was read
during the v8 diagnosis, and it is one of the cases that motivated the change.
Under v8 it runs as usual but is left out of every held-out aggregate; the clean
held-out cases are D5, D11 and B6. The runner does not know this: its printed
total line still counts D10, so held-out aggregates under v8 are computed
without it.

**Known gap, not fixed.** The held-out definitions in
`qa/investigation/heldout/*.json` are not rows in this table, so a change to a
gold answer there is not caught by `freeze.test.ts`. v8 leaves it, because those
files are gitignored and do not exist on CI.

**Not comparable with v7.** The prompt reaches every investigation, so
classification and root-cause results recorded under v7 are not comparable with
v8. A v8 comparison needs full sweeps of all twenty cases. The full sweeps
were completed on 2026-10-19; their results are in
[Freeze v8 live results](#freeze-v8-live-results-2026-10-19). The diagnostic
pilot described below ran before them.

**D8's evidence boundary.** D8 drops the file from the S3 multipart POST
(`qa/investigation/evalCases.ts:163-172`) and also injects `upload_503_once`.
The original run stops at the 503, so its accepted bundle holds no
`/synthetic-upload` request. The defect shows only in the reproduction: the
contract router finds no file entry and records `s3-multipart-schema-or-count`
(`qa/browser/contractRouter.ts:161`, `:173-174`), the network policy records
the request as `blocked` with one opaque `multipartFormData` field and aborts
it (`qa/browser/networkPolicy.ts:94-96`, `:226-228`, `:290`), and the upload
page absorbs the failure and reaches the completed report
(`src/pages/Upload.tsx:159-168`).

The investigator cannot read any of that. Every `read_*` tool reads the
accepted bundle of the original run (`qa/investigation/session.ts:254`,
resolved at `qa/investigation/serverMain.ts:105`), and `read_network_events`
takes no source (`session.ts:275-278`). The reproduction is visible only
through `count_requests` with `source: reproduction`, which returns counts by
one dimension and no events or fields (`session.ts:285-298`), and through
`run_oracle`, which reports the generic oracle ids `CONTRACT_NO_VIOLATIONS` and
`CONTRACT_UNEXPECTED_REQUEST` without the violation code
(`qa/browser/oracleRegistry.ts:195-197`,
`qa/investigation/reproduction.ts:276-278`). Once `run_oracle` has run the
session is `judged` (`session.ts:383-391`) and every read tool is refused with
`INVALID_STATE` (`session.ts:247-250`; the tools are listed at `:57-60`). Under
the v8 tool set D8's `routeTemplate` and `failureMode` are therefore not
observable. `qa/investigation/goldEvidence.ts:10-15` already records that D8's
defect appears only in the reproduction and that D8 is measured by attribution.

**Scoring D8.** The runner is unchanged: it grades D8 as a full triple, and its
total line includes D8. Every v8 report gives the triple as two numbers, the raw
value including D8 and the value excluding D8, and names this boundary as the
reason for the second. Attribution counts D8 as usual.

**What a correct D8 attribution shows.** It shows that the investigator read an
application defect from the reproduction's oracle failure, not that it
identified the defect. The v8 diagnostic pilot ran D8 and D10 three times each
on Haiku, Sonnet, Opus and DeepSeek; it was run only to diagnose and counts
toward no v8 result. Two earlier attempts failed before any model replied: in
one, port 4173 was held by a leftover preview server, and in the other the API
key was not bound to a workspace, so requests were refused with 400. Neither
produced a result, so nothing from them was counted or discarded. Eight of the
pilot's twelve D8 findings attributed `product_defect`, and none named the
missing file. Each named a duplicate `/upload` or an extra
`/analysis/:analysisId` poll, and the same oracle result had passed
`CONTRACT_UPLOAD_COUNT` and `CONTRACT_ANALYSIS_COUNT`, which rule both out.

**Known gap, not fixed: the network-events description.** The
`read_network_events` description does not say that it reads only the original
run (`adapter:src/qa-tools.ts:110-118`), while `count_requests` names both
sources (`:121-128`). In one pilot finding the investigator read the original
run's events after starting the reproduction and took them for the
reproduction's. The file is frozen, and v8 leaves it.

`freeze.test.ts` verifies this table.

| File | sha256 |
| --- | --- |
| `adapter:prompts/investigator.md` | `360f051fd50f5241dba85babda0a23a8ec9923a8028352cf59697baf3ef6d1bc` |
| `adapter:src/qa-tools.ts` | `745117fa998d5da7db885087c3f5af9a10b7af2e0e6bead80d5d41ab225fa5a4` |
| `adapter:cordis.yml` | `cb14edabb8f2c819268d03b166c190f80ffc02dd058d046f9b1ed86a71d1ba45` |
| `adapter:run-config.yml` | `3d31f6c336e23ab9ec1211daec51b73b1d1f404a80c057ef643202234bb0000e` |
| `adapter:run-config.anthropic.yml` | `996694916d76eb5346a80ff8cd365bb1c5e435474fddcc3468c3c1f2795bc83c` |
| `adapter:run-config.anthropic-haiku.yml` | `b6aff68226e9e27b29edd9d266fce103417eaa2b51cfe4b00a88f55c379787c3` |
| `adapter:run-config.anthropic-opus.yml` | `fbcdf5976d914b6f605462c9c6673232a6e9ff614fb9f0cbe9d1e97bd938d9f2` |
| `adapter:src/system-prompt.ts` | `f4eae4af1f8739cf140ecd33990836bd53c19e5359f3c3dbab5ec0225f820f3b` |
| `adapter:src/pricing.ts` | `1559e8e4160ab6747d3d1aac916e2321869cd7e2ff7dad911b1b3297c30f2b32` |
| `qa/investigation/finding.ts` | `973cd66da05b2bd257b748be6d128828745ab23ae4cafdb349582a06a24e780f` |
| `qa/investigation/actions.ts` | `77bed40cdf1ec736f82964f1c6bbb970cdf533bb99c05b1e969499e281f009ab` |
| `qa/investigation/budget.ts` | `b2a5feef1fec034e3c1c3685a7762e5b45eba46a2469929e1bc8f3c88e61161d` |
| `qa/investigation/session.ts` | `d7d85c06b10091f3c2c367784be2cbc003a436b76260983979ece7b056987b66` |
| `qa/investigation/errors.ts` | `8890d8f41bec0034be479ac2d5cf5bb8d6132541fd4daf308068e53868b7e9ec` |
| `qa/investigation/evidenceReader.ts` | `92c30372a3e70d16c409dd2a493e2c620a855ed59c5e0e660264491517513acb` |
| `qa/investigation/reproduction.ts` | `4de416f40f815a33190f4043ad6221f62440015ad7bfdae5846d4eb791203acc` |
| `qa/investigation/cost.ts` | `1fe360e99eecdfe402ad951d8eb3d86981f849d5a01c0433496440b5993c8438` |
| `qa/investigation/evalRunner/runCase.ts` | `d02e2251ef8b51455b4dca0dbec58082d5e1bd81ce085b3c5f7c0bcad14d8fee` |
| `qa/investigation/evalCases.ts` | `cb7cecae87ebe23f85c355c40e726635c58b5f1fec4c30f1521db312905e1b92` |
| `qa/browser/oracleRegistry.ts` | `1b46cf267f2c3acae7f5239476b4678d50a99ee082dd4f56e72b4c896a774e55` |
| `qa/investigation/triage.ts` | `4f7153b63d43d02beacd52d928ba7f4643462fc6c24c1e575d684b03b9f88f27` |
| `qa/investigation/rootCauseGold.ts` | `a15441a3e5944bf0f26533cf7dd13196ecd6ce8e98a6e59ba6285ddc81703dc3` |
| `qa/investigation/rootCauseScore.ts` | `dbe5a364f0297e33f6529794912a4a6bb82677cad233f569782e1d9aadb9aa1e` |
| `qa/investigation/goldEvidence.ts` | `a84ba136e4d3663d28965f7cbe36f3738da7d5583562252194ce5a5ff45b6fa1` |
| `qa/investigation/goldProbe.ts` | `b3421e9d9288bf1c19b2e2d7c94116b1aca47e95916bc3ff5a8a702fa1a7b27d` |
| `qa/investigation/heldoutDefinitions.ts` | `2116fe94c802f0901ca29188f07ad296b618ddb61184cc6c6c01f3dbd51733af` |
| `qa/investigation/evalRunner/mutation.ts` | `2c24d0dea1599dd8867a625a6c6a94a7bcd3b9d235a943a849a0cf08f7190a50` |
| `tests/e2e/evalCase.e2e.ts` | `c93916d905ca5cfd5b05404389225cc1949b4fd0f6402b528666321981963983` |
| `qa/browser/scenarios.ts` | `1f146807f83623881da0a64a792794a75c08b50966b95d127f2167d840a004cc` |
| `qa/browser/contractRouter.ts` | `92242a3db70e1d5bd0f30b3908b14b250e476d2c93537df6311d9b67668c4c67` |
| `qa/browser/networkPolicy.ts` | `77f4734ffa4281b351476d3f678f099220fbf83aeec18bfc48f929d75f52d977` |
| `qa/browser/evidence.ts` | `e2cce31f7d5f34d7ad333a4a48f2de25fbf778ea906d943c40def17ccd1a2d62` |
| `qa/browser/uploadObservation.ts` | `eb45c67b874e07b8b30b5763a56d86eedd62b0da229bac8008998f9c6f2efb7c` |
| `qa/browser/runReleaseCheck.ts` | `1bb6ee6c67a08dfdbce5929b837492bb9b34c57d188d1c1b770a596315c7ac4e` |
| `qa/browser/oracles.ts` | `b76a8b3d33268b5f9f608679fb07186fcd51bcac7f277f5cf763ed60cdcf5ec4` |
| `qa/browser/artifactValidator.ts` | `5d0d53c5327afeb08d83c6fdba4df14af56a41672aaa71d7d2539f013f9efeee` |
| `qa/fixtures/data.ts` | `f39559c24e52b45512bc7639c8f30058702099aa841051912aed2dd6031fe305` |

#### Frozen at

| Checkout | Commit |
| --- | --- |
| ResumeMatch | `9b28bf634cc4c3b0f25cd09ed587233514893f87` |
| DeepSeek Harness | `015fa1305085bdf7fbac6e738eaf39207ad9b73a` |
| `resumematch-qa-tools` adapter | `649b94a9e6c7897daa7a99f638a865553abac04a` |

The ResumeMatch commit is the one the hashes were taken at; the commit that adds
this section changes only this document and its test, neither of which is
frozen. The 28 repository rows are unchanged since v7. The adapter rows were
taken at the adapter commit above.

### Freeze v7 (2026-10-11)

Superseding v6 after its first live sweep, in which Haiku classified public
case B5, a benign transient, as `confirmed`. Its reproduction opened the
timeout results page, waited for the processing state, advanced the controlled
clock 30 000 ms of the 120 000 ms the poll timeout needs
(`src/hooks/usePolling.ts`), and ran the oracle. `P1-05_TIMEOUT_STATE` failed
because the timeout had not been reached yet, and its precondition only checked
that the route had been opened, so the case was confirmed. The same kind of
gap existed in real time: the sweep gave every observation 3 s
(`SWEEP_TIMEOUT_MS`), while Phase 1 had recorded the original failure under its
own longer waits, so a reproduction judged soon after its trigger could fail
B1's navigation or B2's completed report for want of time. The Freeze v6 table
below is kept byte for byte as history; its line saying `freeze.test.ts`
verifies it describes the gate as it stood until v7.

**The principle.** The investigator is never told to wait before `run_oracle`,
and the prompt is frozen, so a reproduction is judged under the waits Phase 1
recorded the failure under, not by a waiting rule the investigator was never
given.

- The original failed oracle is judged at the end of its Phase 1 wait chain,
  counted from the chain's trigger (the submit click, the route opening, or the
  controlled-clock advance): the sum of Phase 1's budgets along the chain,
  `requireVisible` 8 s and `requireUrl` 30 s (`oracles.ts`) and Playwright's
  default 30 s for `goto`. P1-02's navigation is judged until 30 s after the
  click, its processing state until 38 s, its completed report until 46 s.
  Time already spent since the trigger counts, so a reproduction that waited
  is not made to wait again, and none is judged sooner than Phase 1 would have
  been. The original failure's precondition is read after its wait.
- The verify sweep shares that deadline, which expires once, instead of a
  fixed 3 s per observation.
- Controlled-clock states are the exception, because time passes under the
  controlled clock only when the reproduction advances it. A failed P1-05
  timeout observation can confirm only when more than 120 000 ms were advanced
  since the route was last opened, counting only advances begun while the
  status card was visible: the poll timeout is armed in the step that first
  renders it. Otherwise the precondition is not met and the case is
  `inconclusive`. The gate stands only between a failure and a confirmation; a
  timeout state that did appear needs no such check.

**What moved since v6.** Two files, both in `1514378`:
`qa/browser/oracleRegistry.ts` (each observation's Phase 1 wait chain, what it
waits for, and the controlled-clock check) and `qa/investigation/reproduction.ts`
(records the submit click and the counted clock advances; `judgeReproduction`,
extracted from `runOracle`, applies the waits and the gate). The prompt, the
tool descriptions, the finding schema, the graders and the public cases are
unchanged, and the other 35 rows carry their v6 hashes.

**Not comparable with v6.** Classification results recorded under v6 are not
comparable with v7. The same reproduction steps can be judged differently in
both directions: a reproduction judged soon after its trigger no longer fails
for want of time, and an under-advanced timeout no longer confirms. The oracle
result an investigator reads after `run_oracle` can differ too, so the rest of
a live run can as well.

**Scripted public sweep at `1514378`** (scripted provider, 2026-10-11). All
fourteen public cases matched their expected triage and classification:

| Case | Triage | Classification | Wall |
| --- | --- | --- | --- |
| C1, C2, C3, B3 | expected | — | 9–19 s |
| D1 | investigate | `confirmed` | 19 s |
| D2 | investigate | `confirmed` | 79 s |
| D3 | investigate | `confirmed` | 34 s |
| D4 | investigate | `confirmed` | 70 s |
| D7 | investigate | `confirmed` | 70 s |
| D8 | investigate | `inconclusive` | 60 s |
| D9 | investigate | `confirmed` | 61 s |
| B1 | investigate | `not_reproduced` | 60 s |
| B2 | investigate | `not_reproduced` | 34 s |
| B5 | investigate | `not_reproduced` | 23 s |

D1 is `confirmed`, which resolves the long-standing scripted D1 `inconclusive`
seen in every earlier scripted run. The script runs the oracle right after
opening `/sample`; under v6, `P1-01_NO_REST` was checked before D1's unexpected
analysis request had been sent, so only `CONTRACT_UNEXPECTED_REQUEST` failed.
v7 checks it after the page's network has gone idle and the sample report has
rendered, as Phase 1 did. Where the original state never appears, the wait runs
to the end of its chain: D4 and D7 took 70 s and D2 79 s, with no tool-call
timeout.

`freeze.test.ts` verifies this table.

| File | sha256 |
| --- | --- |
| `adapter:prompts/investigator.md` | `bec5c5176c6b38a5bee3745cec546fd1d1d77cdbc6c8e568c53af456a475d100` |
| `adapter:src/qa-tools.ts` | `745117fa998d5da7db885087c3f5af9a10b7af2e0e6bead80d5d41ab225fa5a4` |
| `adapter:cordis.yml` | `cb14edabb8f2c819268d03b166c190f80ffc02dd058d046f9b1ed86a71d1ba45` |
| `adapter:run-config.yml` | `3d31f6c336e23ab9ec1211daec51b73b1d1f404a80c057ef643202234bb0000e` |
| `adapter:run-config.anthropic.yml` | `996694916d76eb5346a80ff8cd365bb1c5e435474fddcc3468c3c1f2795bc83c` |
| `adapter:run-config.anthropic-haiku.yml` | `b6aff68226e9e27b29edd9d266fce103417eaa2b51cfe4b00a88f55c379787c3` |
| `adapter:run-config.anthropic-opus.yml` | `fbcdf5976d914b6f605462c9c6673232a6e9ff614fb9f0cbe9d1e97bd938d9f2` |
| `adapter:src/system-prompt.ts` | `f4eae4af1f8739cf140ecd33990836bd53c19e5359f3c3dbab5ec0225f820f3b` |
| `adapter:src/pricing.ts` | `1559e8e4160ab6747d3d1aac916e2321869cd7e2ff7dad911b1b3297c30f2b32` |
| `qa/investigation/finding.ts` | `973cd66da05b2bd257b748be6d128828745ab23ae4cafdb349582a06a24e780f` |
| `qa/investigation/actions.ts` | `77bed40cdf1ec736f82964f1c6bbb970cdf533bb99c05b1e969499e281f009ab` |
| `qa/investigation/budget.ts` | `b2a5feef1fec034e3c1c3685a7762e5b45eba46a2469929e1bc8f3c88e61161d` |
| `qa/investigation/session.ts` | `d7d85c06b10091f3c2c367784be2cbc003a436b76260983979ece7b056987b66` |
| `qa/investigation/errors.ts` | `8890d8f41bec0034be479ac2d5cf5bb8d6132541fd4daf308068e53868b7e9ec` |
| `qa/investigation/evidenceReader.ts` | `92c30372a3e70d16c409dd2a493e2c620a855ed59c5e0e660264491517513acb` |
| `qa/investigation/reproduction.ts` | `4de416f40f815a33190f4043ad6221f62440015ad7bfdae5846d4eb791203acc` |
| `qa/investigation/cost.ts` | `1fe360e99eecdfe402ad951d8eb3d86981f849d5a01c0433496440b5993c8438` |
| `qa/investigation/evalRunner/runCase.ts` | `d02e2251ef8b51455b4dca0dbec58082d5e1bd81ce085b3c5f7c0bcad14d8fee` |
| `qa/investigation/evalCases.ts` | `cb7cecae87ebe23f85c355c40e726635c58b5f1fec4c30f1521db312905e1b92` |
| `qa/browser/oracleRegistry.ts` | `1b46cf267f2c3acae7f5239476b4678d50a99ee082dd4f56e72b4c896a774e55` |
| `qa/investigation/triage.ts` | `4f7153b63d43d02beacd52d928ba7f4643462fc6c24c1e575d684b03b9f88f27` |
| `qa/investigation/rootCauseGold.ts` | `a15441a3e5944bf0f26533cf7dd13196ecd6ce8e98a6e59ba6285ddc81703dc3` |
| `qa/investigation/rootCauseScore.ts` | `dbe5a364f0297e33f6529794912a4a6bb82677cad233f569782e1d9aadb9aa1e` |
| `qa/investigation/goldEvidence.ts` | `a84ba136e4d3663d28965f7cbe36f3738da7d5583562252194ce5a5ff45b6fa1` |
| `qa/investigation/goldProbe.ts` | `b3421e9d9288bf1c19b2e2d7c94116b1aca47e95916bc3ff5a8a702fa1a7b27d` |
| `qa/investigation/heldoutDefinitions.ts` | `2116fe94c802f0901ca29188f07ad296b618ddb61184cc6c6c01f3dbd51733af` |
| `qa/investigation/evalRunner/mutation.ts` | `2c24d0dea1599dd8867a625a6c6a94a7bcd3b9d235a943a849a0cf08f7190a50` |
| `tests/e2e/evalCase.e2e.ts` | `c93916d905ca5cfd5b05404389225cc1949b4fd0f6402b528666321981963983` |
| `qa/browser/scenarios.ts` | `1f146807f83623881da0a64a792794a75c08b50966b95d127f2167d840a004cc` |
| `qa/browser/contractRouter.ts` | `92242a3db70e1d5bd0f30b3908b14b250e476d2c93537df6311d9b67668c4c67` |
| `qa/browser/networkPolicy.ts` | `77f4734ffa4281b351476d3f678f099220fbf83aeec18bfc48f929d75f52d977` |
| `qa/browser/evidence.ts` | `e2cce31f7d5f34d7ad333a4a48f2de25fbf778ea906d943c40def17ccd1a2d62` |
| `qa/browser/uploadObservation.ts` | `eb45c67b874e07b8b30b5763a56d86eedd62b0da229bac8008998f9c6f2efb7c` |
| `qa/browser/runReleaseCheck.ts` | `1bb6ee6c67a08dfdbce5929b837492bb9b34c57d188d1c1b770a596315c7ac4e` |
| `qa/browser/oracles.ts` | `b76a8b3d33268b5f9f608679fb07186fcd51bcac7f277f5cf763ed60cdcf5ec4` |
| `qa/browser/artifactValidator.ts` | `5d0d53c5327afeb08d83c6fdba4df14af56a41672aaa71d7d2539f013f9efeee` |
| `qa/fixtures/data.ts` | `f39559c24e52b45512bc7639c8f30058702099aa841051912aed2dd6031fe305` |

#### Frozen at

| Checkout | Commit |
| --- | --- |
| ResumeMatch | `1514378b9d38b67073abcb9c7fb8a38494c87338` |
| DeepSeek Harness | `015fa1305085bdf7fbac6e738eaf39207ad9b73a` |
| `resumematch-qa-tools` adapter | `4041ae20ac9c2d6987e7ef8bf6fdebf9e45854fa` |

The ResumeMatch commit is the one the hashes were taken at; the commit that adds
this section changes only this document and its test, neither of which is
frozen. The adapter rows were taken at the adapter commit above, unchanged since
v6.

### Freeze v6 (2026-10-11)

Superseding v5 after the cross-model sweeps of 2026-10-08 to 2026-10-10, in
which Haiku, Sonnet and Opus each matched 13 of 13 on triage and
classification: the benchmark did not separate them. v6 freezes what makes a
result model-sensitive and attributable: a structured root cause in the
finding, four harder public cases, and the metrics that grade them. The Freeze
v5 table below is kept byte-for-byte as history; its line saying
`freeze.test.ts` verifies it describes the gate as it stood until v6.

**What moved since v5.** Five v5 files moved; `run-config.yml`,
`oracleRegistry.ts`, `actions.ts` and `budget.ts` did not.

- `qa/investigation/finding.ts` (`5945e39`): `rootCause` is required, with
  exactly `attribution`, `routeTemplate` and `failureMode`; the schema is
  `phase2-finding/2`, and stored `phase2-finding/1` findings still load. The
  example narrative returned with every rejected submission was replaced: the
  old one described D1's scenario, and 25 rejections across DeepSeek, Sonnet and
  Opus had returned it. The new one, a duplicated `/user/last-resume` request,
  matches no public answer, and the held-out loader refuses a gold answer equal
  to it.
- `qa/investigation/evalCases.ts` (`a327a4c`, `c51bc38`, `6951836`): public
  cases D7, D8, D9 and B5. Their triage and original failed oracles were
  measured in a scripted pilot at `a327a4c`, and B5's classification in the
  scripted pilot at `c51bc38`, both on 2026-10-11.
- `adapter:prompts/investigator.md` and `adapter:src/qa-tools.ts` (`1d6d7aa`):
  the prompt and the `submit_finding` description name `rootCause` and its
  values.
- `adapter:cordis.yml` (`fa754fe`): the investigator is offered only the 16 QA
  tools. `skills`, `toolJobs` and `toolBash` are off, which removes `skill`,
  `job_kill`, `job_list` and `job_output`, offered in every earlier transcript,
  and `bash`, which was never offered.

**What v6 adds, and why.** v5 pinned the prompt, the tools, the grammar, the
budgets, the schema, the corpus and the composition. v6 pins every file whose
change could alter, for the same model, any byte the investigator receives,
which actions it can take or what they do, or any recorded score. Files that
only move bytes, build, lock or report are left out; the three commits under
Frozen at pin everything else.

- The investigator's interface: `session.ts` (tool dispatch, the manifest view
  with the evaluation identity removed, budget and refusal wording),
  `errors.ts`, `evidenceReader.ts`, `reproduction.ts`, `cost.ts` (when the cost
  ceiling blocks tools), `evalRunner/runCase.ts` (the task message the model
  receives, and the grades it records), and the adapter's `system-prompt.ts`,
  `pricing.ts` and three Anthropic overlays, which v5 did not cover.
- Scoring and cases: `triage.ts`, `rootCauseGold.ts`, `rootCauseScore.ts`,
  `goldEvidence.ts`, `goldProbe.ts`, `heldoutDefinitions.ts` (held-out cases
  and, from `cd8c186`, their gold answers and evidence sets),
  `evalRunner/mutation.ts` and `tests/e2e/evalCase.e2e.ts`.
- The scenario and evidence model, which produces every byte of evidence:
  `scenarios.ts`, `contractRouter.ts`, `networkPolicy.ts`, `evidence.ts`,
  `uploadObservation.ts`, `runReleaseCheck.ts`, `oracles.ts`,
  `artifactValidator.ts` and `qa/fixtures/data.ts`. A Phase 1 change to any of
  them moves the original-run evidence for every case, so it is recorded as v7
  rather than left to drift under v6.

Left out: the runner's command line, checkouts and drift guard (`main.ts`,
`worktree.ts`, `digest.ts`); the line protocol and paths (`serverMain.ts`,
`paths.ts`, `adapter:src/investigation-client.ts`); `adapter:src/git-identity.ts`;
the scripted provider and its driver; `qa/browser/types.ts`; build and launch
mechanics; and `qa/investigation/evalCases.heldout.ts`, whose expectation rows
the held-out step adds after this freeze. The gitignored held-out definitions
are not hashed here.

`freeze.test.ts` verifies this table.

| File | sha256 |
| --- | --- |
| `adapter:prompts/investigator.md` | `bec5c5176c6b38a5bee3745cec546fd1d1d77cdbc6c8e568c53af456a475d100` |
| `adapter:src/qa-tools.ts` | `745117fa998d5da7db885087c3f5af9a10b7af2e0e6bead80d5d41ab225fa5a4` |
| `adapter:cordis.yml` | `cb14edabb8f2c819268d03b166c190f80ffc02dd058d046f9b1ed86a71d1ba45` |
| `adapter:run-config.yml` | `3d31f6c336e23ab9ec1211daec51b73b1d1f404a80c057ef643202234bb0000e` |
| `adapter:run-config.anthropic.yml` | `996694916d76eb5346a80ff8cd365bb1c5e435474fddcc3468c3c1f2795bc83c` |
| `adapter:run-config.anthropic-haiku.yml` | `b6aff68226e9e27b29edd9d266fce103417eaa2b51cfe4b00a88f55c379787c3` |
| `adapter:run-config.anthropic-opus.yml` | `fbcdf5976d914b6f605462c9c6673232a6e9ff614fb9f0cbe9d1e97bd938d9f2` |
| `adapter:src/system-prompt.ts` | `f4eae4af1f8739cf140ecd33990836bd53c19e5359f3c3dbab5ec0225f820f3b` |
| `adapter:src/pricing.ts` | `1559e8e4160ab6747d3d1aac916e2321869cd7e2ff7dad911b1b3297c30f2b32` |
| `qa/investigation/finding.ts` | `973cd66da05b2bd257b748be6d128828745ab23ae4cafdb349582a06a24e780f` |
| `qa/investigation/actions.ts` | `77bed40cdf1ec736f82964f1c6bbb970cdf533bb99c05b1e969499e281f009ab` |
| `qa/investigation/budget.ts` | `b2a5feef1fec034e3c1c3685a7762e5b45eba46a2469929e1bc8f3c88e61161d` |
| `qa/investigation/session.ts` | `d7d85c06b10091f3c2c367784be2cbc003a436b76260983979ece7b056987b66` |
| `qa/investigation/errors.ts` | `8890d8f41bec0034be479ac2d5cf5bb8d6132541fd4daf308068e53868b7e9ec` |
| `qa/investigation/evidenceReader.ts` | `92c30372a3e70d16c409dd2a493e2c620a855ed59c5e0e660264491517513acb` |
| `qa/investigation/reproduction.ts` | `15f2b2559a9a730f50578336c941ec9e670b62ad92e74575e3041ce3f523ba82` |
| `qa/investigation/cost.ts` | `1fe360e99eecdfe402ad951d8eb3d86981f849d5a01c0433496440b5993c8438` |
| `qa/investigation/evalRunner/runCase.ts` | `d02e2251ef8b51455b4dca0dbec58082d5e1bd81ce085b3c5f7c0bcad14d8fee` |
| `qa/investigation/evalCases.ts` | `cb7cecae87ebe23f85c355c40e726635c58b5f1fec4c30f1521db312905e1b92` |
| `qa/browser/oracleRegistry.ts` | `c7381c8987c41153cd1875cecf8324461b5752fe4664f93f16b977b941637b61` |
| `qa/investigation/triage.ts` | `4f7153b63d43d02beacd52d928ba7f4643462fc6c24c1e575d684b03b9f88f27` |
| `qa/investigation/rootCauseGold.ts` | `a15441a3e5944bf0f26533cf7dd13196ecd6ce8e98a6e59ba6285ddc81703dc3` |
| `qa/investigation/rootCauseScore.ts` | `dbe5a364f0297e33f6529794912a4a6bb82677cad233f569782e1d9aadb9aa1e` |
| `qa/investigation/goldEvidence.ts` | `a84ba136e4d3663d28965f7cbe36f3738da7d5583562252194ce5a5ff45b6fa1` |
| `qa/investigation/goldProbe.ts` | `b3421e9d9288bf1c19b2e2d7c94116b1aca47e95916bc3ff5a8a702fa1a7b27d` |
| `qa/investigation/heldoutDefinitions.ts` | `2116fe94c802f0901ca29188f07ad296b618ddb61184cc6c6c01f3dbd51733af` |
| `qa/investigation/evalRunner/mutation.ts` | `2c24d0dea1599dd8867a625a6c6a94a7bcd3b9d235a943a849a0cf08f7190a50` |
| `tests/e2e/evalCase.e2e.ts` | `c93916d905ca5cfd5b05404389225cc1949b4fd0f6402b528666321981963983` |
| `qa/browser/scenarios.ts` | `1f146807f83623881da0a64a792794a75c08b50966b95d127f2167d840a004cc` |
| `qa/browser/contractRouter.ts` | `92242a3db70e1d5bd0f30b3908b14b250e476d2c93537df6311d9b67668c4c67` |
| `qa/browser/networkPolicy.ts` | `77f4734ffa4281b351476d3f678f099220fbf83aeec18bfc48f929d75f52d977` |
| `qa/browser/evidence.ts` | `e2cce31f7d5f34d7ad333a4a48f2de25fbf778ea906d943c40def17ccd1a2d62` |
| `qa/browser/uploadObservation.ts` | `eb45c67b874e07b8b30b5763a56d86eedd62b0da229bac8008998f9c6f2efb7c` |
| `qa/browser/runReleaseCheck.ts` | `1bb6ee6c67a08dfdbce5929b837492bb9b34c57d188d1c1b770a596315c7ac4e` |
| `qa/browser/oracles.ts` | `b76a8b3d33268b5f9f608679fb07186fcd51bcac7f277f5cf763ed60cdcf5ec4` |
| `qa/browser/artifactValidator.ts` | `5d0d53c5327afeb08d83c6fdba4df14af56a41672aaa71d7d2539f013f9efeee` |
| `qa/fixtures/data.ts` | `f39559c24e52b45512bc7639c8f30058702099aa841051912aed2dd6031fe305` |

#### Frozen at

| Checkout | Commit |
| --- | --- |
| ResumeMatch | `cd8c186b73ec13dd5fb0f55759abf1b01622fc6a` |
| DeepSeek Harness | `015fa1305085bdf7fbac6e738eaf39207ad9b73a` |
| `resumematch-qa-tools` adapter | `4041ae20ac9c2d6987e7ef8bf6fdebf9e45854fa` |

The ResumeMatch commit is the one the hashes were taken at; the commit that adds
this section changes only this document and its test, neither of which is
frozen. The adapter rows were taken at the adapter commit above; `evaluate`
refuses to run from a dirty adapter checkout and records its commit in every
case result as `adapterCommit`.

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

These are Freeze v5's commits; Freeze v6 records its own in its section.

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
| Sweep ceiling | $5.00 by default; `evaluate --sweep-cost-limit <dollars>` overrides it | `qa/investigation/cost.ts` |

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

## Freeze v8 live results (2026-10-19)

These are the full sweeps under Freeze v8: all twenty cases, on three Anthropic
models and DeepSeek, with the same sweep counts as v7. Held-out results appear
only as aggregates, except D10, which v8 marks exposed. The reporting rules are
the ones in [Freeze v8](#freeze-v8-2026-10-18): D10 is left out of every
held-out aggregate, the clean held-out cases are D5, D11 and B6, and the triple
is given with and without D8. The full analysis, with per-run and per-case
values, quoted findings and a cause for every miss, is in
`.qa-artifacts/analysis/v8/report.md`.

Run conditions:

| Setting | Value |
| --- | --- |
| ResumeMatch | `7f3f627` (the Freeze v8 record with its D8 boundary), `worktreeDirty: false` in every investigation manifest |
| Adapter | `649b94a9e6c7897daa7a99f638a865553abac04a`, recorded as `adapterCommit` in every case result |
| Models | `claude-haiku-5-5`, `claude-sonnet-5-5`, `claude-opus-5-5`, `deepseek-v4-flash` |
| Run window | 2026-10-19, 12:08–18:27 UTC, in the order Haiku, Sonnet, Opus, DeepSeek |
| Rates per 1M tokens (input / output / cache hit) | Unchanged from v7: Haiku 0.10 / 0.50 / 0.01, Sonnet 2 / 10 / 0.10, Opus 4 / 20 / 0.20, DeepSeek 0.44 / 1.32 / 0.014 |
| Prompt caching | Anthropic off (0 cache-hit tokens). DeepSeek provider-side, about 94% of prompt tokens served as cache hits |
| Sweep limit (`sweepLimitUsd`) | Haiku $5, Sonnet $8, Opus $15, DeepSeek $5; no sweep reached its limit |
| Sweeps (n) | Haiku 5, Sonnet 5, Opus 3, DeepSeek 3 |

Data integrity, checked before comparing, on all 16 sweeps:

- The printed table equals `summary.json`, total line included, and each
  `<case>.json` equals its summary entry.
- Request-log lines, `modelRequests` and the transcript's usage events agree in
  every case.
- Every cost equals its request log priced at the rates above.
- One case recorded an error: Sonnet run 3, D7, `no finding was submitted` (see
  Known issues below).
- Every transcript names only its sweep's model.
- The 80 cases that triage routes away from an investigator (C1–C3, B3 and B4 in
  every sweep) made no model request and cost $0.

Classification. A sweep has 15 investigations: 10 public, 4 held-out and D10.

| Model | n | Classification ok | Public | Held-out, without D10 | D10 |
| --- | --- | --- | --- | --- | --- |
| Haiku 5.5 | 5 | 62/75 | 45/50 | 12/20 | 5/5 |
| Sonnet 5.5 | 5 | 73/75 | 49/50 | 19/20 | 5/5 |
| Opus 5.5 | 3 | 45/45 | 30/30 | 12/12 | 3/3 |
| DeepSeek v4 flash | 3 | 40/45 | 27/30 | 10/12 | 3/3 |

The held-out column covers D5, D6, D11 and B6; D6 has a classification
expectation but no root-cause gold. The clean held-out columns under Root cause
cover D5, D11 and B6. Neither includes D10.

- **No false confirms.** No benign investigation was classified `confirmed`:
  0 of 64. That is four per sweep (three public, one held-out) across all
  16 sweeps.
- **20 misses, none from the classification rule.** All are `inconclusive`
  except one with no classification. 9 are public and 11 held-out. Each public
  miss comes from how the reproduction was driven or finished:
  - **P1-05 clock not advanced far enough (6, all B5).** Haiku 5, DeepSeek 1.
    The reproduction oracle returned `preconditionMet: false`. Haiku advanced
    the clock by at most 60 000 ms, and its one 120 000 ms advance was refused
    because no reproduction was active; DeepSeek advanced 29 000 ms in total.
    Of the 11 B5 runs that matched their expectation, 10 advanced 180 000 ms.
  - **DeepSeek tool-call budget exhausted (2).** The 20-call limit was spent
    before `run_oracle` succeeded, and both calls were refused with
    `BUDGET_EXHAUSTED`.
  - **No finding (1).** Sonnet run 3, D7; see Known issues below.
  - **Held-out (11).** Given as a total only; per-model counts are in the
    table above.

Root cause. Graded findings are 14 per sweep: 10 public and 4 held-out, D10
among them. The totals include D10, as the runner's total line does; D10 is left
out of the held-out columns only. The triple without D8 leaves D8 out under the
[D8 evidence boundary](#freeze-v8-2026-10-18). No model had a correct D8 triple,
so leaving it out changes only the denominator.

| Model | n | Attribution | Triple, with D8 | Triple, without D8 | Undetermined | Clean held-out attribution | Clean held-out triple | D10 attribution / triple (exposed) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Haiku 5.5 | 5 | 53/70 | 45/70 | 45/65 | 15/70 | 12/15 | 12/15 | 3/5 / 3/5 |
| Sonnet 5.5 | 5 | 64/70 | 64/70 | 64/65 | 5/70 | 15/15 | 15/15 | 5/5 / 5/5 |
| Opus 5.5 | 3 | 38/42 | 37/42 | 37/39 | 2/42 | 9/9 | 9/9 | 3/3 / 3/3 |
| DeepSeek v4 flash | 3 | 41/42 | 36/42 | 36/39 | 0/42 | 9/9 | 9/9 | 3/3 / 3/3 |

- **Sonnet's denominators.** Sonnet run 3, D7 submitted no finding. The runner
  leaves it out: its denominators give attribution 64/69, triple 64/69, triple
  without D8 64/64 and undetermined 5/69. The table counts it as a miss, and
  these strict denominators (70, and 65 without D8) are the ones to report
  outside this record.
- **DeepSeek's triple.** Attribution is 41/42 but the triple 36/42. Three of the
  six triple misses are D8. The other three name the wrong failure mode, once on
  D9 and twice on B5; one of the B5 findings also has the wrong attribution.

**D10 (exposed).** All 16 reproduction oracles failed `CONTRACT_UPLOAD_COUNT`
alongside `CONTRACT_NO_VIOLATIONS` and `CONTRACT_UNEXPECTED_REQUEST`. Every one
of the 14 correct findings cites that upload-count failure, by its id or its
message. Nine also read the reproduction's route count before reads were
locked; the other five say they inferred the extra request from the oracle
alone. None is an unsupported guess. Under v7 no D10 finding was correct. D10 is
exposed, though: its v7 results were inspected, it motivated the v8 change, and
its oracle id names the route and the failure directly. Its result is not
held-out evidence and does not show that the change generalizes.

**D8.** Attribution is correct in 6 of 16 findings (Haiku 2/5, Sonnet 0/5,
Opus 1/3, DeepSeek 3/3), and the triple in none. All six correct attributions
name a mechanism the oracle had already ruled out: a duplicate `/upload`
(Haiku), or an extra `/analysis/:analysisId` poll after completion (Opus,
DeepSeek). In all 16 runs `CONTRACT_UPLOAD_COUNT`, `CONTRACT_ANALYSIS_COUNT` and
`CONTRACT_S3_COUNT` were evaluated and passed. Sonnet answered `undetermined` in
5 of 5, as did Opus in 2 and Haiku in 3. This matches the Freeze v8 record: a
correct D8 attribution shows that the investigator read an application defect
from the oracle failure, not that it identified the defect.

Statistics. Each proportion has a Wilson score 95% interval, and models are
compared pairwise with a two-sided Fisher exact test. Both treat every finding
as an independent sample, but the same cases repeat in every sweep, so the
intervals are too narrow and the p-values optimistic. Thirty comparisons were
made (six model pairs, five measures) with no correction for multiple
comparisons.

| Model | Attribution | Triple, without D8 |
| --- | --- | --- |
| Haiku 5.5 | 53/70 (65–84%) | 45/65 (57–79%) |
| Sonnet 5.5 | 64/70 (83–96%) | 64/65 (92–100%) |
| Opus 5.5 | 38/42 (78–96%) | 37/39 (83–99%) |
| DeepSeek v4 flash | 41/42 (88–100%) | 36/39 (80–97%) |

Correct triples per sweep, which does not depend on treating findings as
independent:

| Model | Correct triples per sweep |
| --- | --- |
| Haiku 5.5 | 10, 8, 10, 8, 9 |
| Sonnet 5.5 | 13, 13, 12, 13, 13 |
| Opus 5.5 | 13, 12, 12 |
| DeepSeek v4 flash | 12, 11, 13 |

- **Holds: Haiku is below the other three.** On the triple, with and without
  D8, p ≤ 0.017 against each, and the per-sweep counts do not overlap (8–10
  against 11–13).
- **Does not hold: any difference among Sonnet, Opus and DeepSeek.** On
  attribution, triple, triple without D8, classification and clean held-out
  triple, every pairwise p between them is above 0.05. No ranking of these three
  is claimed.

Cost:

| Model | n | Total | Per sweep, mean (min–max) | Correct triples | Cost per correct triple |
| --- | --- | --- | --- | --- | --- |
| Haiku 5.5 | 5 | $1.0505 | $0.2101 ($0.2060–$0.2219) | 45 | $0.0233 |
| Sonnet 5.5 | 5 | $20.8132 | $4.1626 ($4.0103–$4.2360) | 64 | $0.3252 |
| Opus 5.5 | 3 | $21.8200 | $7.2733 ($7.0347–$7.4008) | 37 | $0.5897 |
| DeepSeek v4 flash | 3 | $1.0916 | $0.3639 ($0.3153–$0.4055) | 36 | $0.0303 |

The four models together cost $44.7752. No D8 triple was correct, so the cost
per correct triple is the same with or without D8. Sonnet run 3, D7 cost $0.4540
and produced no finding. As under v7, DeepSeek's cost reflects provider-side
caching while the Anthropic runs had caching off, so this is not a like-for-like
price comparison.

Against v7, descriptively. The prompt change reaches every investigation, so
these results are not comparable with v7's; the table only shows where the
numbers moved.

| Model | Attribution | Triple | Triple, without D8 | Classification ok |
| --- | --- | --- | --- | --- |
| Haiku 5.5 | 52/70 → 53/70 | 45/70 → 45/70 | 45/65 → 45/65 | 65/75 → 62/75 |
| Sonnet 5.5 | 60/70 → 64/70 | 55/70 → 64/70 | 55/65 → 64/65 | 74/75 → 73/75 |
| Opus 5.5 | 36/42 → 38/42 | 34/42 → 37/42 | 34/39 → 37/39 | 45/45 → 45/45 |
| DeepSeek v4 flash | 37/42 → 41/42 | 34/42 → 36/42 | 34/39 → 36/39 | 43/45 → 40/45 |

- **D10:** correct attribution and triple went from 0/16 to 14/16.
- **D7:** the triple went from 4/16 to 10/16. Sonnet and Opus moved from
  `aborted_response` to `stopped_early`. Haiku's attribution went from 4/5 to
  1/5, mostly to `undetermined`.
- **D8:** the triple is 0 in both. Attribution went from 2/16 to 6/16; Sonnet and
  Opus moved from the transient to `undetermined`.
- **Moved down:**
  - Haiku: D9 triple 2/5 → 0/5; clean held-out triple 14/15 → 12/15.
  - Opus: B2 attribution 3/3 → 1/3.
  - DeepSeek: classification 43/45 → 40/45.
- **Benign cases attributed to `product_defect`:** 5 of 64 in both.
  - v7: Haiku B5 4, DeepSeek B5 1.
  - v8: Haiku B5 2, DeepSeek B5 1, Opus B2 2.

Known issues, recorded rather than fixed. v8 changes nothing in response; each
is left to a later freeze.

- **Sonnet submission format.** 39 of 75 Sonnet investigations had at least one
  `submit_finding` refused, against 14 of 75 under v7.
  - 56 of the 57 refusals carried `finding` as a JSON string with one extra
    closing brace at the end. That string does not parse, so the adapter passes
    it on unchanged and the server refuses it as "Finding narrative must be an
    object".
  - In run 3, D7 used all four attempts (the fourth wrapped the narrative in a
    second `finding` key), so no finding was recorded. The refused narrative
    named D7's gold root cause.
  - Why the rate rose is not established.
- **B2 and the meaning of a defect.** Opus attributed B2 to `product_defect`
  (`stopped_early`) in 2 of 3 runs, both classified `not_reproduced`.
  - Graded against the frozen gold, `transient_or_environment`, they are misses,
    and the gold is not changed.
  - This is recorded as a prompt gap. The v8 prompt does not define what counts
    as the application behaving wrongly, and these findings counted a robustness
    judgment about the original run as a defect even though the reproduction
    passed.
- **Haiku and DeepSeek reproduction and labelling.**
  - All five Haiku D9 findings named `unexpected_request`, the oracle id's
    wording, instead of `malformed_request`. One says so directly: "the
    deterministic oracle reports CONTRACT_UNEXPECTED_REQUEST, so I recorded…".
  - Haiku's clock advances on P1-05 were too short (see Classification).
  - DeepSeek exhausted its tool-call budget before a completed oracle 4 times.
- **Evidence source, again.** The `read_network_events` description gap recorded
  in Freeze v8 recurred. In at least four Haiku findings, two on D10 and two on
  D8, the investigator took the original run's events for the reproduction's.

What these results do not show:

- that any investigator identified D8's defect;
- that D10's result is held-out evidence;
- a ranking of Sonnet, Opus and DeepSeek.

## Freeze v7 live results (2026-10-11)

These are the first live sweeps under Freeze v7: all twenty cases, on three
Anthropic models and DeepSeek. Held-out results appear only as aggregates. The
full analysis, with per-run and per-case values and a cause for every miss, is
in `.qa-artifacts/analysis/v7-sweeps.md`.

Run conditions:

| Setting | Value |
| --- | --- |
| ResumeMatch | `1f7e1a0` (the Freeze v7 record), `worktreeDirty: false` in every investigation manifest |
| Adapter | `4041ae20ac9c2d6987e7ef8bf6fdebf9e45854fa`, recorded as `adapterCommit` in every case result |
| Harness | `015fa1305085bdf7fbac6e738eaf39207ad9b73a`, the checkout's HEAD; case results don't record it |
| Models | `claude-haiku-5-5`, `claude-sonnet-5-5`, `claude-opus-5-5`, `deepseek-v4-flash` |
| Overlays (all Freeze v7 rows) | `run-config.anthropic-haiku.yml`, `run-config.anthropic.yml`, `run-config.anthropic-opus.yml`, `run-config.yml` |
| Effort | Anthropic: no effort parameter is sent, so the documented defaults apply (Haiku 5.5 medium, Sonnet 5.5 high, Opus 5.5 medium), unverifiable here. DeepSeek: `reasoningEffort: max`, from the request header |
| Prompt caching | Anthropic off (`cacheRetention: none`; 0 cache-hit tokens). DeepSeek provider-side, about 94% of prompt tokens served as cache hits |
| Rates per 1M tokens (input / output / cache hit) | Haiku 0.10 / 0.50 / 0.01, Sonnet 2 / 10 / 0.10, Opus 4 / 20 / 0.20, DeepSeek 0.44 / 1.32 / 0.014 |
| Investigation ceiling | Haiku and Sonnet $1.00, Opus $2.00, DeepSeek $0.25 |
| Sweep limit (`sweepLimitUsd`) | Haiku $5, Sonnet $8, Opus $15, DeepSeek $5 |
| Sweeps (n) | Haiku 5, Sonnet 5, Opus 3, DeepSeek 3 |

Data integrity, checked before comparing, on all 16 sweeps:

- The table re-rendered from `summary.json` equals the printed table, total
  line included, and each `<case>.json` equals its summary entry.
- Request-log lines, `modelRequests` and the transcript's usage events agree in
  every case.
- Every cost equals its request log priced at the rates above.
- No case recorded an error.
- Every transcript names only its sweep's model.

Per model. A sweep has 15 investigations: 10 public and 5 held-out. Attribution,
triple and undetermined are counted over graded findings: 10 public and 4
held-out per sweep. Column set (a) counts every graded finding; set (b) leaves
out D8 and a held-out case of the same pattern as D8 (see Known issues below).

| Model | n | Classification ok, public | Classification ok, held-out | Attribution (a) | Triple (a) | Undetermined (a) | Attribution (b) | Triple (b) | Undetermined (b) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Haiku 5.5 | 5 | 45/50 | 20/25 | 52/70 | 45/70 | 13/70 | 52/60 | 45/60 | 4/60 |
| Sonnet 5.5 | 5 | 50/50 | 24/25 | 60/70 | 55/70 | 1/70 | 60/60 | 55/60 | 0/60 |
| Opus 5.5 | 3 | 30/30 | 15/15 | 36/42 | 34/42 | 0/42 | 36/36 | 34/36 | 0/36 |
| DeepSeek v4 flash | 3 | 29/30 | 14/15 | 37/42 | 34/42 | 0/42 | 35/36 | 34/36 | 0/36 |

Attribution (a), split:

| Model | Public | Held-out |
| --- | --- | --- |
| Haiku 5.5 | 38/50 | 14/20 |
| Sonnet 5.5 | 45/50 | 15/20 |
| Opus 5.5 | 27/30 | 9/12 |
| DeepSeek v4 flash | 28/30 | 9/12 |

Classification:

- **No false confirms.** No benign investigation was classified `confirmed`:
  0 of 64. That is four per sweep (three public, one held-out) across all
  16 sweeps.
- **Every classification miss is `inconclusive`.** There are 13 misses among the
  240 investigations: Haiku 10, Sonnet 1, DeepSeek 2, Opus 0.
  - 6 are public, all B5 (Haiku 5, DeepSeek 1). Each was judged before the
    controlled clock had passed the polling timeout, so the v7 clock gate held
    the precondition unmet.
  - 7 are held-out (Haiku 5, Sonnet 1, DeepSeek 1).
- **The original v7 case is fixed.** Public B5's v6 false confirm does not recur
  in any model.

The P1-05 clock finding, on public B5 (n=16): the classification was
`not_reproduced`, as expected, exactly when the investigator had advanced the
controlled clock past 120 000 ms. Otherwise it was `inconclusive`.

| Model | Past 120 000 ms, `not_reproduced` | At most 120 000 ms, `inconclusive` |
| --- | --- | --- |
| Haiku 5.5 | 0 | 5 (one advance each, 8 000–60 000 ms) |
| Sonnet 5.5 | 5 (one 180 000 ms advance each) | 0 |
| Opus 5.5 | 3 (one 180 000 ms advance each) | 0 |
| DeepSeek v4 flash | 2 | 1 (one 60 000 ms advance) |

`wait_for_state` does not move the controlled clock, so a reproduction that
waits for the timeout report without advancing past the threshold times out.
Four of Haiku's five B5 findings then read the short window's low poll count as
polling stopping early, and attributed a product defect.

Cost and size per sweep, as mean (min–max):

| Model | n | Requests | Cost | Mean case wall time per investigation |
| --- | --- | --- | --- | --- |
| Haiku 5.5 | 5 | 149.4 (143–154) | $0.2078 ($0.1996–$0.2142) | 70 s |
| Sonnet 5.5 | 5 | 154.2 (148–163) | $3.7030 ($3.4902–$4.0050) | 72 s |
| Opus 5.5 | 3 | 150.7 (148–156) | $7.6654 ($7.4046–$8.0170) | 94 s |
| DeepSeek v4 flash | 3 | 185.7 (182–188) | $0.3629 ($0.3502–$0.3713) | 137 s |

DeepSeek's cost reflects provider-side caching while the Anthropic runs had
caching off, so this is not a like-for-like price comparison. Case wall time
includes model latency; it is not the reproduction wall clock, which is still
not enforced (see [Runner](#runner)).

Known issues, recorded rather than fixed. Both would need a prompt-wording
change, which would be a future v8; none is proposed here.

- **D8 and a held-out case of the same pattern: the root cause is ambiguous.**
  - In both, the original failure was caused by the transient fault, and the
    seeded defect surfaces only as a different failure in the reproduction.
  - So "the root cause of the recorded failure" can be read two ways: the
    transient that caused the recorded failure, or the defect the gold grades.
  - Nearly every finding answered for the transient or abstained. On D8, across
    16 findings: 10 attributed the transient; 4 were `undetermined`; 2
    (DeepSeek) blamed the app for not handling the transient error. None named
    the seeded defect's route and failure mode.
  - Set (b) above shows how much these two cases move the attribution numbers.
- **D7 `failureMode`.** 11 of 16 D7 findings named the failure mode after the
  original run's aborted poll (`aborted_response`). The gold is
  `stopped_early`: the reproduction stops polling with no abort at all.
- **Evidence source.** `read_network_events` reads only the original run, and
  reads are locked once `run_oracle` has run. In several findings a model took
  the original run's events for the reproduction's, or tried to read the
  reproduction after the oracle and was refused.

Limits: n is 5 for Haiku and Sonnet and 3 for Opus and DeepSeek, and no
significance is claimed. Effort for the Anthropic models is their default and
could not be set or verified.

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
- None of the DeepSeek counts above includes the 2 held-out live DeepSeek
  transcripts in `.qa-artifacts/heldout-live/`.

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

##### DeepSeek `deepseek-v4-flash` (2026-10-10)

Three post-fix sweeps of all thirteen cases on the frozen DeepSeek
configuration, in `.qa-artifacts/postfix/deepseek-v2-run1..3`.

Run conditions:

| Setting | Value | Source |
| --- | --- | --- |
| ResumeMatch commit | `846a4c6`, all three runs | `sourceIdentity.headCommit` in each `read_failure_manifest` result |
| Provider route, model | `deepseek-official`, `deepseek-v4-flash` | the request header of all 24 investigations |
| Reasoning effort, output cap | `max`, 256000 | the same headers |
| Overlay | `adapter:run-config.yml`, a Freeze v5 row; `freeze.test.ts` passes 4/4 at `846a4c6` | [Run config](#run-config) |
| Sweep rates per 1M tokens | input 0.44, output 1.32, cache hit 0.014: the runner's defaults (`qa/investigation/evalRunner/main.ts:44-46`) | same as `cordis.yml` |
| Investigation ceiling | $0.25 | `adapter:cordis.yml` |
| Sweep ceiling | $5.00 | `EVALUATION_COST_LIMIT_USD`, `qa/investigation/cost.ts` |
| Prompt caching | provider-side. Cache-hit tokens per sweep: 1,190,144, 1,082,496, 1,241,088. The Anthropic runs had caching off | request logs |
| Sweeps (n) | 3 | |

Data integrity:

- For each run, the table re-rendered from `summary.json` equals the printed
  table, and each `<case>.json` equals its summary entry.
- In every case, request-log lines equal `modelRequests`, which equal the
  transcript's usage events.
- Every cost equals its request log priced at the rates above.
- No case recorded the usage-guard error.

Results per run:

| Run | Classification | Requests | Cost | gold / gold3 / gold4x |
| --- | --- | --- | --- | --- |
| run1 | 13/13 | 95 | $0.1825 | 0/5, 1/5, 3/5 |
| run2 | 13/13 | 92 | $0.1640 | 0/5, 1/5, 3/5 |
| run3 | 12/13 (D2 `inconclusive`) | 97 | $0.1929 | 0/5, 1/5, 1/5 |
| Pooled | 38/39 | mean 94.7 (92–97) | mean $0.1798 ($0.1640–$0.1929) | 0/15, 3/15, 7/15 |

The D2 miss is the first post-fix classification miss on any model.

First probe, over the 24 model-calling cases: `read_failed_assertion` 19,
`read_failure_manifest` 5.

Finding text (24 findings):

| Term | Findings with a hit |
| --- | --- |
| Case id | 0 |
| `mutation` | 0 |
| `seeded` | 1 |
| `evaluationIdentity` | 0 |
| `transient` | 5 |

- **`seeded`.** The one hit is run3 D1, "locally seeded sample data": the
  model's word for the sample page's bundled data.
- **`transient`.** The five hits are B1 in all three runs, B2 in run3, and D3
  in run1. Four describe the observed 503 or the blocked poll. D3 rules one out:
  "a contract/implementation mismatch rather than a transient execution fault".
- **Tool results.** Neither word appears in any tool result. Each run's 8
  `evaluationIdentity` hits are the `"evaluationIdentity": null` key of the
  fixed view.

**Why D2 in run3 is `inconclusive`.**

- **Cause.** `run_oracle` never ran, so `reproductionOracleResult` was `null`
  and `classify()` returned `inconclusive` (`finding.ts:203`). The precondition
  rule did not apply, and there was no policy latch.
- **What happened.** The investigation reached the 20-call tool ceiling one
  action before the oracle:
  - Calls 1–8: eight probes, which used the whole probe budget.
  - Calls 9–10: two more `count_requests` (grouped by `mockDecision`, then by
    `originAlias`), each refused with `BUDGET_EXHAUSTED` for probes.
  - Call 11: `start_fresh_reproduction`.
  - Calls 12–20: open the upload page; a `wait_for_state upload_ready` before
    the form was filled, which timed out after 10 s (`REPRODUCTION_FAILED`);
    one inspection; one screenshot; one accessibility snapshot; fill; attach;
    a wait; the Analyze click.
  - Call 21: `wait_for_state completed_report`, refused with `BUDGET_EXHAUSTED`
    for tool calls. This latched `budgetExhausted`.
- **The three rejected calls** are the two refused probes and that last wait.
  - The refused probes mattered. Each still used one of the 20 tool calls, and
    without them the model had exactly enough calls left for the wait and
    `run_oracle`.
  - The early wait cost one more.
- **What was not reached.** Cost ($0.0261 against $0.25) and wall time (137 s
  against 8 minutes).
- **The narrative was right.** It named the rejected upload body
  (`new-upload-body-schema`) as the cause.

Budget refusals per case (the table's `rejected` column):

| Run | D5 | D6 | D1 | D2 | D3 | D4 | B1 | B2 | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| run1 | 2 | 0 | 0 | 1 | 0 | 1 | 0 | 1 | 5 |
| run2 | 7 | 1 | 5 | 0 | 0 | 0 | 1 | 1 | 15 |
| run3 | 1 | 0 | 0 | 3 | 0 | 0 | 2 | 0 | 6 |

- **Probe ceiling: 22 of the 26.** 21 were `count_requests` and 1
  `read_network_events`.
- **Tool-call ceiling: the other 4.** Three were inspections in run2 D5, after
  its oracle had run, so it stayed `confirmed`. The fourth is the run3 D2 wait
  above.
- **Other refusals, not counted in the column:**
  - 15 `REPRODUCTION_FAILED`: all `wait_for_state` timeouts;
  - 17 `INVALID_STATE`: mostly reads after the oracle had run;
  - 12 `INVALID_ARGUMENTS`: 11 on `submit_finding`, for example the
    unsupported fields `reasoningSummaryNote` and `confidence`.

**Known discrepancies, not fixed:**

- **Refused probes still use a tool call.** `InvestigationSession.call` spends a
  tool call (`session.ts:174`) before `readTool` checks the probe ceiling
  (`session.ts:225`). So a probe refused for budget still uses one of the 20
  tool calls. The statement under [Budgets and latches](#budgets-and-latches)
  that exceeding the probe ceiling "refuses that call and nothing more" is
  inaccurate in effect. This caused the run3 D2 `inconclusive`. That statement
  was corrected on 2026-10-11, and refusals now say how many tool calls remain;
  the accounting itself is unchanged.
- **The harness offers a tool outside the 16 QA tools.**
  - `skill("failure-investigation")` was called 8 times in 7 transcripts
    across the three runs: run1 D1, run2 B2, run3 B2, D1, D2, D4, and D3
    twice.
  - The harness answered that the skill "is unknown or no longer available".
    The call did not count against the QA tool budget.
  - This contradicts the statement under
    [Composition and prompt](#composition-and-prompt) that the composition has
    no other rows.
  - Freeze v6 must address it.

**Excluded attempts.** These folders hold no counted results:

- `.qa-artifacts/postfix/deepseek-run1` holds two attempts:
  - 21:39–21:40: D5, D6 and D1 stopped with `MISSING_CREDENTIAL`, "no API key
    for provider route deepseek-official", because `DEEPSEEK_API_KEY` was not
    exported.
  - 21:41–21:42: D5, D6 and D1 failed in the QA launcher in about 3 s each,
    and the attempt stopped at D2.
- `deepseek-run2` and `deepseek-run3`: all 13 cases record "the QA launcher did
  not complete the scenario", 3–4 s each, with 0 requests.
- The operator's stated cause for those launcher failures is an orphaned
  `vite preview` on port 4173 left by an interrupted run. The artifacts are
  consistent with that, but no file records the port.

**Comparison with the 2026-08-22/23 pre-fix DeepSeek runs.** They were not one
sweep under one freeze. The thirteen cases come from three runs:

- **Public, minus D2:** the v4 sweep `phase1-v4` at `2647925` (Freeze v4). It
  matched 9 of its 10 public cases. Its D2 was `inconclusive` because the v4
  oracle registry had no oracle for a rejected upload body, the gap Freeze v5
  closed.
- **D2:** rerun alone under v5 as `phase1-v5-d2` at `2d65cfb`, `confirmed`.
- **D5, D6 and B4:** run as `heldout-live` at `bb0ebc4`. The v5-frozen files are
  unchanged from `2d65cfb`. That commit also corrected B4's expectation, after
  the scripted `heldout-verify` run showed `artifact_rejected`.

Post-fix, D2 was `confirmed` in 2 of 3 runs. With n = 1 pre-fix run of D2 under
v5, the run3 miss cannot be attributed to the fix. Its cause, the shared
tool-call ceiling, is also not something the fix changed.

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
