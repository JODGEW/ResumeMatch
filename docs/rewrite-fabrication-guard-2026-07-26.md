# ResumeMatch — The Rewrite Fabrication Guard, and What Measuring It Showed

**Product:** ResumeMatch web application, https://resumematchapp.com
**Subject:** the deterministic filter that decides which LLM-proposed resume edits may ship, the offline harness that tests it, and what production logs say it actually did
**Snapshot date:** 2026-07-26
**Status:** as-shipped on 2026-07-26. Not maintained.

**This is a dated snapshot, and several things in it are expected to change.** In
particular: the 0.75 word-preservation threshold is described below as a release
gate rather than a production gate, the production attribution figures cover a
two-week window with a handful of accounts, and the piece names a specific next
fix (recording which branch of the filter passed an edit). All three are likely
to be false at some point after the date above. **This file will not be
back-edited when they change.** Corrections and later measurements go in a new
dated file, so that what was believed on 2026-07-26, and on what evidence, stays
readable.

---

## My resume tool won't rewrite your resume, and that's the feature

Open [resumematchapp.com/sample](https://resumematchapp.com/sample) and you get a
match score, the keywords the posting wants that your resume doesn't have, a set
of suggestions, and a rewritten resume with the changes highlighted. In that
sample there is exactly one highlighted change. Not five. One, because one is
what the resume could actually back up.

Run it on your own resume and you will usually see this instead:

> **No safe rewrites for this posting**
> Nothing in your resume backs up the missing keywords, so there's no honest
> wording change to make. These are real gaps, not phrasing differences, and we
> won't add tools or skills you haven't used.

Everything else still works. You still get the score, the missing keywords, the
gap analysis, the suggestions. The empty state links you straight to them. The
one thing the tool declines to do is put words in your resume, because your
resume gave it no grounds to.

That outcome is the common case, not the edge case. On my offline evaluation
corpus it is 54 of 60 runs, and in production it is closer to universal; both
figures, including why the second is weaker than it looks and what actually
causes it, are in the numbers section below.

The filter that produces it, and the empty state you're reading, both exist
because of a specific incident: the tool used to fabricate. What that incident
does *not* explain is how often the empty state appears, which turns out to have
a different and more interesting cause.

*[screenshot: no-rewrites empty state, light + dark]*

---

## What the tool is actually allowed to write

The rewrite pass is an LLM. Left alone, it will happily add "PostgreSQL" to your
skills list because the posting asked for PostgreSQL. It reads as helpful, and
it is a lie that a hiring manager finds in the first five minutes of a phone
screen.

So the model's output doesn't go to you. It goes through a deterministic filter,
and that filter has exactly two ways to say yes. Here they are, in full:

```python
def _keyword_supported_elsewhere(keyword, resume_text):
    return word_boundary_match((keyword or '').strip(), resume_text or '')


def _concept_anchor_present(keyword, original_line):
    kw = (keyword or '').strip().lower()
    if not kw or not original_line:
        return False

    anchors = CONCEPT_ANCHORS.get(kw)
    if anchors is None:
        for key, val in CONCEPT_ANCHORS.items():
            if kw.startswith(key) or kw.rstrip('s') == key.rstrip('s'):
                anchors = val
                break
    if not anchors:
        return False

    return any(word_boundary_match(a, original_line) for a in anchors)
```

An edit ships only if one of those returns true. Anything else is rejected, and
an unrecognised keyword fails closed.

The first is literal promotion: the word is already somewhere in your resume, so
moving it onto the line an applicant tracking system reads adds no new claim.

The second is a vocabulary reframe, and it is the one I got wrong twice. Some
concepts can be genuinely evidenced without using the word: if your resume says
you built dashboards and alerts, you did observability. Others cannot. You
either used Docker or you didn't, and no synonym proves it. So concepts need an
allowlist with anchor words:

```python
CONCEPT_ANCHORS = {
    'observability': {
        'logging', 'logs', 'monitoring', 'metrics', 'dashboard', 'dashboards',
        'alert', 'alerts', 'alerting', 'tracing', 'telemetry',
        'datadog', 'grafana', 'prometheus', 'cloudwatch', 'splunk', 'kibana',
    },
```

Note what `_concept_anchor_present` searches. It takes `original_line`, not the
resume. The anchor has to be present in the specific line being edited.

That scoping is what cost me two rounds. When I searched the whole resume
instead, "pipeline" matched a sentence about an event-driven data pipeline built
on S3 and Textract, and on that evidence the tool appended "CI/CD" to a tools
list belonging to someone with no CI work at all. I tightened it to the edited
line and it happened again on a weaker anchor: "release" turned "improve release
quality" into "improve release quality using CI/CD."

Both of those edits were fluent, within the edit budget, and passed every
automated check I had. Both were caught by reading the output by eye.

### What this filter does not do

It checks whether a claim is **supported**. It does not check whether the edit
was **necessary**.

There is a measurement for that. `word_preservation_ratio` scores how much of
your original line survived, and `violates_75_rule` flags any edit that drops
more than a quarter of it. The production code computes both on every single
edit. It then writes them to a log line and does nothing else. The value never
reaches the filter.

So an edit that rewrites a sentence you didn't need rewritten, or discards a
third of your wording to make a keyword fit grammatically, reaches you exactly
as if it were a minimal insertion. The 0.75 threshold is real, but it is a
release gate, not a production gate: it runs in my offline evaluation and fails
the build there. Nothing enforces it at request time. If an edit mangles one of
your lines, the guard didn't fail. It was never asked.

---

## The part of my own test harness that never ran

I have an offline evaluation harness. It runs the real backend against a fixture
corpus, imports the actual production filter rather than a copy, and hard-fails
the run if the two ever disagree. I was fairly pleased with it.

Here is its own description of the checks meant to cover the cases arithmetic
can't reach:

```
Per-case authored expectations (the only deterministic way to cover semantic
cases: redundant-with-product, semantic mismatch, net-new single-token tool,
soft skill):
  expect.insert : keyword must appear in some produced edit.
  expect.skip   : keyword must NOT appear in any produced edit.
```

"The only deterministic way to cover semantic cases."

Both fields are read from each fixture's expectations file. Across all ten
fixtures, neither is defined. Not once. The code that consumes them resolves to
an empty list on every run, the checks never execute, and the harness reports
green.

I found it while reading my own harness for something unrelated. Nothing failed.
Nothing could have failed. An assertion that never runs cannot go red, so the
only way to catch it was to go looking, and I had no reason to.

That is the shape of nearly everything I keep finding in this codebase: **a
missing signal is indistinguishable from a passing one.** A fabricated skill
reads exactly like a real one. An empty diff used to read exactly like an error.
A check that never fires reads exactly like a check that keeps passing. Once you
start looking for that shape, it turns up in places that have nothing to do with
resumes, and the last two sections of this piece are both instances of it.

The next section has numbers, and you can't verify any of them. The section
after that has the same class of bug in a file you *can* open. That one is the
point, which is precisely why the numbers aren't.

> **On verifiability:** the evaluation harness, its fixtures, and its reports
> are not in the public repository. I've quoted the code above so you can judge
> whether it says what I claim, but you cannot run it and you cannot check my
> arithmetic against the raw output.

---

## Numbers, and why you shouldn't lean on them

Everything here comes from one 60-run sweep of the offline harness, whose report
lives outside the public repository. **You cannot verify any of it.** What I can
do is give you the denominators, the smallest of which is 8, say what was
measured, and be explicit about what these numbers can't support. If you deleted
this whole section the argument above would survive unchanged. That's
deliberate.

On that sweep, 10 fixtures across 3 model configurations, run twice each:

- The model proposed **31** edits. The filter rejected **22** as unevidenced.
  n=31, so a single edit moves that share by three points.
- **8** edits survived to users across all 60 runs.
- **54 of 60** runs produced no rewrite at all, 90.0%.
- No surviving edit tripped the over-rewrite checks. Exactly one raw model edit
  did, before filtering: asked to insert "PostgreSQL," it tried to smuggle
  "databases" in alongside it.

These are fixture numbers, not user numbers. The corpus is ten resumes. A
different ten would give different results.

### The production data, and what it actually says

I also have production data, and I'm deliberately not leading with it, because
when I decomposed it the headline dissolved.

After the filter shipped, 30 of 32 production analyses produced no rewrite. My
first instinct was to write that as "the filter refuses almost everything." It
isn't what happened. A zero-rewrite result has two completely different causes,
and the empty diff looks identical either way: the model may have proposed edits
that the filter then rejected, or the model may have proposed nothing at all.

The stored record can't tell them apart, because the field that would say which
happened isn't persisted yet. The logs can, so I went and looked. Of those 32
analyses, 5 were cache replays where the rewrite pass never ran, leaving 27 I
can attribute:

| what actually happened | count |
| --- | --- |
| the model proposed nothing at all | 15 (56%) |
| the model proposed, the filter rejected everything | 10 (37%) |
| an edit survived | 2 (7%) |

So the majority of the silence isn't the filter. It's the rewrite pass producing
nothing to filter.

I want to be careful about *why*, because that is exactly the kind of claim I
just corrected. The logs record that the model proposed nothing. They do not
record why it proposed nothing. The prompt does instruct it to prefer zero edits
over bad ones, and its edit budget was tightened after the fabrication incident,
so that instruction is a plausible cause. It is not a measured one.

Where the filter did act, it rejected 19 edits across those 10 analyses: 14 as
unevidenced, 5 for smuggling in words that weren't part of any requested
keyword.

And the two survivors are worth naming, because one of them is visible to you.
Both landed on the same account, and one is analysis `8b85ea60`, which is the
run the public [sample report](https://resumematchapp.com/sample) was exported
from. The single highlighted change you can go and look at right now is one of
only two edits this filter has passed in production since it shipped.

That is not a rate I can offer you either way, because those 32 analyses came
from four accounts and three of them are mine. It isn't 32 observations, it's
roughly four, and most are me running my own resume against real postings. A
number that looks solid and isn't is worse than no number, so I'm not going to
print 94% as a finding.

The within-account comparison is the one cut I do trust, because the population
is held constant. It's also lopsided, and I'd rather say so than let the table
imply otherwise: the "before" side is 146 analyses over four months, the "after"
side 26 over two weeks.

| account (both mine) | no rewrite, before | after |
| --- | --- | --- |
| A | 12 of 79 (15%) | 17 of 17 |
| B | 12 of 67 (18%) | 9 of 9 |

Same person, same resume, same workflow, different code.

Neither column counts independent observations, and they aren't measured the
same way. On the "after" side, 4 of account A's 17 were cache replays that never
ran the rewrite pass at all, so 22 of those 26 analyses actually exercised the
code. Decomposed, those 22 are 14 where the model proposed nothing and 8 where
the filter rejected everything it proposed; none produced a surviving edit. The
"before" side has never been decomposed that way, because those runs predate the
logging that makes it possible. So the two columns are a rate against a rate,
one of which I can take apart and one of which I can't.

**So is the filter too tight?** The decomposition splits that question in two,
and only one half is even about the filter.

For the 56% where the model proposed nothing, the filter never ran. If that
behaviour is wrong, the thing to change is the rewrite prompt. But that isn't a
free dial: the prompt's conservatism came out of the same fabrication incident
as the filter. Its edit budget went from 0-5 to 0-4 to a target of 0-3, and it
gained an explicit instruction to skip when in doubt. Loosening it means
partially reverting that fix and pushing the load back onto the filter, which is
the component I trust to hold precisely because it hasn't had to carry that
weight yet.

For the 37% where it did refuse, here's the part I can't dress up. A rejection
means *both* paths failed: the keyword wasn't literally in the resume, and no
allowlisted concept anchor matched the line. So across those 19 rejections the
concept allowlist did nothing by definition, which is a tautology, not a
finding. The real question is the two survivors, and there I have nothing: the
filter returns a yes or a no and keeps no record of which branch produced it, so
whether the allowlist has *ever* fired in production is simply unknown to me. I
rewrote that half of the design twice and I can't tell you whether it has been
used once.

That gap is the same missing-signal shape from the last section, sitting in my
own guard. The filter computes the evidence and then discards it. Recording
which branch passed is the next thing I'm fixing.

What I won't claim is that the filter is correctly calibrated. Ten refusals is
what I have, and they only say something about the keywords the model actually
attempted: for those, on one person's resume against real postings in their
field, the resume contained no literal support and no anchor match. The 15 runs
where the model proposed nothing say nothing at all about whether support
existed, because nothing was ever tested against it. That's a narrow finding
about a handful of runs on my own resume, and it is not evidence about yours.

The experiment that would settle it is one I haven't run: take resumes that
genuinely do support their target postings' missing keywords, and count how many
the filter refuses anyway. Every one of those is a false refusal. Until someone
runs it, "correctly strict" and "too strict for resumes unlike mine" both fit
the data I have.

### Limitations of the fixture corpus

The ten evaluation fixtures are not a documented corpus. Nothing in the repo
records where they came from, and they lack the "all details are fictitious"
line the product's own demo fixtures carry. One of the ten is my own resume. The
other nine follow a generator's signature: every handle is lower(first+last).
That suggests synthetic personas rather than de-identified real resumes, but it
is an inference from structure, not a record, so their provenance is
unconfirmed. Separately, seven of those mechanically-derived GitHub handles
resolve to real, unrelated accounts, so the fixtures are not safe to reproduce
even if the personas are invented; two further handles are LinkedIn URLs, which
sit behind a login wall and could not be checked either way. No fixture text is
quoted anywhere in this piece.

**Other things I haven't measured:** prompt caching never engaged on any of the
60 runs, so my per-analysis cost figures are worst-case uncached. The dollar
amounts come from a price table hard-coded in my own source, never reconciled
against a bill.

---

## A verifier that says "I don't know"

Everything above asks you to take my word for it. This part doesn't.

The product promises that deleting your account deletes your data within seven
days. The script that does it is
[ops/delete_user_data.py](https://github.com/JODGEW/ResumeMatch/blob/main/ops/delete_user_data.py)
and the procedure is
[ops/account-deletion-runbook.md](https://github.com/JODGEW/ResumeMatch/blob/main/ops/account-deletion-runbook.md).
Both are in the public repository. You can read them right now.

Deletion runs in a fixed order: stored files, then the data tables, then the
user's entitlement row, then the identity-provider account last. `--verify` then
re-enumerates everything and prints `VERIFY PASS, rows=0`. That output is the
audit trail for the seven-day promise.

Here's the bug. A user is keyed two ways, by email and by an opaque
identity-provider ID. `--verify` resolved the second by looking the user up in
the identity provider. But deletion removes that account last, on purpose, so by
the time `--verify` ran, the lookup it depended on returned nothing.

Every post-deletion `--verify` was therefore checking strictly fewer identity
keys than the deletion it was meant to confirm. It printed `VERIFY PASS` and
exited zero. It would have printed exactly that with rows still sitting under
the key it never looked at.

The fix is in the file. `--apply` writes a manifest before deleting anything,
while the identity is still resolvable. `--verify` now reads the keys back out
of that manifest and compares them as a set against what it actually
enumerated. Point it at a manifest belonging to a different user and it refuses
rather than reporting a pass.

And it has three exit codes now instead of two:

```
  0  VERIFY PASS         — key set complete AND nothing found under it
  1  VERIFY FAIL         — data still present under the keys that were checked
  2  VERIFY INCONCLUSIVE — the run cannot support a conclusion: the key set is
                           known-incomplete, or the operator pointed --verify at
                           a manifest belonging to a different identity
```

Exit 2 prints `rows=0`, exactly like a pass, because nothing *was* found under
the keys it managed to check. It simply knows it didn't check them all, so it
refuses to be filed as evidence.

A verifier that can say "I don't know" and a product that can say "I won't
rewrite this" came out of the same decision, made twice.

---

## What you can check, and what you can't

**You can open these:**

- [The repository](https://github.com/JODGEW/ResumeMatch)
- [The accessibility conformance report](https://github.com/JODGEW/ResumeMatch/blob/main/docs/section-508-accessibility-audit-2026-07-26.md).
  WCAG 2.1 AA. The row for non-text contrast says *Partially Supports*, because
  20 of 28 measurements pass and the row lists what I haven't measured rather
  than only what I have.
- [The empty state](https://github.com/JODGEW/ResumeMatch/blob/main/src/pages/Results.tsx)
  from the screenshot at the top.
- [The deletion script](https://github.com/JODGEW/ResumeMatch/blob/main/ops/delete_user_data.py)
  and [its runbook](https://github.com/JODGEW/ResumeMatch/blob/main/ops/account-deletion-runbook.md).
- [The error-message layer](https://github.com/JODGEW/ResumeMatch/blob/main/src/api/errors.ts).
  Backend quota errors put a machine code where user-facing copy belonged, and
  it rendered straight into the error banner: users who hit their daily limit
  were shown the literal string `interview_quota_exceeded`. Known codes now map
  to sentences, and an unrecognised one falls back to generic copy and logs a
  warning, so the next one doesn't vanish into a vague message with nobody
  noticing.
- [The resume parser](https://github.com/JODGEW/ResumeMatch/blob/main/src/utils/resumeParser.ts)
  and [its 46 tests](https://github.com/JODGEW/ResumeMatch/blob/main/src/utils/resumeParser.test.ts).
- [resumematchapp.com/sample](https://resumematchapp.com/sample), no signup.

**You can't check these, and I'd rather say so than imply otherwise:**

- The rewrite filter itself, the evaluation harness, its fixtures, and every
  number in the numbers section. That code isn't in the public repository. The
  excerpts above are real, but excerpts are not verification.
- Anything about what's deployed: environment configuration, infrastructure
  behaviour, log volumes. Those are console observations. I can't prove them
  from the repository and I've tried not to phrase them as though I could.

The irony isn't lost on me that the most convincing evidence sits on the wrong
side of that line. The deletion verifier is the one piece where the bug, the
fix, and the reasoning are all in a file you can open, which is exactly why it's
the section I'd point at first.
