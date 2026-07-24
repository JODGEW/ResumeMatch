"""
ResumeMatch MCP server.

Design decisions, so future-you doesn't have to re-derive them:

1. This talks to API Gateway, not DynamoDB. resolve_user_id() is the only place
   that knows whether a user's rows live under email or Cognito sub, and
   USE_SUB_IDENTITY is currently false everywhere. Keying by sub here would
   silently return zero rows. Going through the API also keeps entitlement
   enforcement, dedup, and the daily counters in one place instead of adding a
   sixth paste site for the FREE_LIMITS block.

2. Every tool projects the API response down before returning it. getAnalysis
   returns the whole DynamoDB item (~7-8k tokens: originalText, suggestedText,
   resumeText, originalSchema, full jobDescription, tokenUsage). None of that
   reaches the model. Bandwidth is cheap, context is not.

3. Stateless. No session, no server-side cache. analyze_against_job mints an
   analysis_id and the model threads it back as an ordinary argument. That's
   the handle pattern the 2026-07-28 spec recommends over session state.

4. Read-only except analyze_against_job, which uses generatePresignedUrl's
   reuse flow (existingAnalysisId + jobDescription -> S3 copy -> pipeline).
   No file upload path is exposed: making an agent do a presigned multipart
   POST is not worth it.
"""

import base64
import json
import os
import sys
import time
from datetime import datetime, timezone
from typing import Any

import httpx
from mcp.server.fastmcp import Context, FastMCP
from mcp.types import ToolAnnotations
from pydantic import BaseModel, Field

# Four of these tools are GET-only; one creates an analysis and consumes the
# user's daily quota. Without annotations a client has to assume the worst of
# all five, so a read gets the same approval prompt as a write.
READ_ONLY = ToolAnnotations(
    readOnlyHint=True,
    destructiveHint=False,
    idempotentHint=True,
    openWorldHint=False,
)

def _dotenv() -> dict[str, str]:
    """Read KEY=VALUE pairs from a .env sitting next to this script.

    Read on every call, not cached at import. The Cognito ID token expires
    hourly, and re-reading means you edit .env and call the tool again with no
    restart and no re-typing anything into a client's config form.

    This is a development convenience, not the destination. The real answer is
    the OAuth flow in _bearer_token(), where the client obtains and refreshes
    the credential itself. Until that exists, keep .env out of git.
    """
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    values: dict[str, str] = {}
    try:
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, val = line.partition("=")
                values[key.strip()] = val.strip().strip("'\"")
    except FileNotFoundError:
        pass
    return values


def _setting(name: str) -> str | None:
    """Real environment wins over .env, so a client that does inject env vars
    keeps working and .env is only the fallback."""
    return os.environ.get(name) or _dotenv().get(name)


def _api_base() -> str:
    """Read at call time, not import time.

    A module-level os.environ[...] raises KeyError during import, and both
    `mcp run` and MCP Inspector surface that as an opaque connection failure
    with the actual cause buried in stderr. Failing inside a tool call instead
    puts the message where you can read it.
    """
    base = _setting("RESUMEMATCH_API_BASE")
    if not base:
        raise RuntimeError(
            "RESUMEMATCH_API_BASE is not set. Put it in the environment or in a "
            ".env beside this script. It must include the stage, e.g. "
            "https://abc123.execute-api.us-east-1.amazonaws.com/prod"
        )
    return base.rstrip("/")


# Deliberately NOT the Lambda's 300s lease. The two numbers answer different
# questions and should not be kept in sync:
#
#   claim_or_exit's 300  — when may ANOTHER invocation take over this row?
#   this constant        — when may a READER conclude no worker is alive?
#
# The second is bounded by the function timeout, not by the lease. analyzeResume
# is configured at Timeout=120s and stamps processingClaimedAt early in the
# handler, before Textract, so the whole budget runs after the stamp. Past ~120s
# no invocation holding that claim can still be running. 130 is that bound plus
# margin for clock skew between this process and Lambda.
#
# At 300 a reader sat on a dead row for two and a half times longer than it could
# possibly still be working.
#
# Two things to know before touching this:
#
# 1. Safe because the advice on a stalled row is "start a fresh run", which mints
#    a new analysisId and a new row via the reuse flow. It never tries to reclaim
#    the old row, so reporting stalled at 130 while the Lambda's lease still has
#    170s left creates no conflict.
#
# 2. This is a read-side interpretation only. It is NOT the parked option B
#    (shortening claim_or_exit's lease), which changes who may claim a row and
#    stays gated behind the duplicate-skipped metric. Nothing here touches the
#    Lambda and nothing needs deploying.
#
# The coupling that did NOT exist at 300: this now depends on Timeout staying at
# 120s. Raise the Lambda timeout past ~130 and this starts calling live work
# stalled. There is no IaC, so the timeout lives only in the console and nothing
# in the repo will catch that drift. Re-check it here if you ever change it.
STALE_LEASE_SECONDS = 130

HTTP_TIMEOUT = httpx.Timeout(20.0, connect=5.0)


# ---------------------------------------------------------------------------
# output models
# ---------------------------------------------------------------------------
#
# These exist to produce an outputSchema, which bare dict returns do not, and to
# ship structuredContent alongside the text block.
#
# What they do NOT do, tested rather than assumed: they do not catch the
# string-vs-number leak. Both Lambdas serialize with json.dumps(default=str) so
# every DynamoDB Decimal arrives as a string, but pydantic runs in lax mode by
# default and quietly coerces "78" to 78. strict=True would reject it, at the
# cost of turning a harmless coercion into a crash on a read-only tool. So _num()
# is still the layer that actually normalizes; these models are a published
# contract and a schema, not a type firewall. Do not let the annotations talk you
# out of _num().
#
# Shape rule: `status` is the discriminator and is always present. Everything
# else is optional, because a tool called on a queued or stalled analysis has a
# status and nothing more. A union of two models would express that more
# precisely, but a single stable shape is easier for a model to reason about
# and does not depend on how a given client renders anyOf.


class AnalysisRow(BaseModel):
    """One entry in the history list."""

    analysis_id: str
    status: str
    job_title: str | None = None
    match_score: int | None = None
    created_at: str | None = None
    summary: str | None = None


class ListAnalysesResult(BaseModel):
    analyses: list[AnalysisRow]
    returned: int


class ExperienceCheck(BaseModel):
    """candidate_years is the app's display value, rounded UP to the nearest
    half year. candidate_years_exact is the raw computed figure. Both are
    exposed because an agent comparing against a JD's minimum should not be
    handed only the generous one."""

    candidate_years: float | None = None
    candidate_years_exact: float | None = None
    required_years: str | None = None
    below_requirement: bool = False


class AnalysisDetail(BaseModel):
    analysis_id: str
    status: str
    job_title: str | None = None
    match_score: int | None = None
    score_breakdown: dict[str, int] | None = None
    keywords_matched: int | None = None
    keywords_total: int | None = None
    summary: str | None = None
    experience: ExperienceCheck | None = None
    # present only on non-terminal or stalled states
    note: str | None = None
    error_message: str | None = None
    running_for_seconds: int | None = None
    stalled_for_seconds: int | None = None


class RankedKeyword(BaseModel):
    keyword: str
    importance: int | None = None
    why: str | None = None


class MissingKeywordsResult(BaseModel):
    analysis_id: str
    status: str
    top_priority: list[RankedKeyword] = Field(default_factory=list)
    all_missing: list[str] = Field(default_factory=list)
    missing_count: int = 0
    # Carried straight from _effective_status on non-terminal states. Present on
    # every result model so `Model(**eff)` never silently drops a field.
    note: str | None = None
    error_message: str | None = None
    running_for_seconds: int | None = None
    stalled_for_seconds: int | None = None


class SuggestedEdit(BaseModel):
    keyword: str | None = None
    original_line: str | None = None
    rewritten_line: str | None = None
    justification: str | None = None
    applied: bool | None = None
    match_type: str | None = None


class RejectedEdit(BaseModel):
    keyword: str | None = None
    reason: str | None = None


class SuggestedEditsResult(BaseModel):
    """rewrite_outcome is the field that makes this readable instead of
    inferable. Without it, "the model proposed nothing", "the guard refused
    everything", and "edits passed the guard but failed to apply" all collapse
    into an empty edit list, which is exactly the ambiguity the frontend is
    currently stuck guessing at from suggestedText == originalText."""

    analysis_id: str
    status: str
    available: bool = False
    rewrite_outcome: str | None = None
    edits: list[SuggestedEdit] = Field(default_factory=list)
    edit_count: int = 0
    rejected: list[RejectedEdit] = Field(default_factory=list)
    reason: str | None = None
    # Carried straight from _effective_status on non-terminal states. Present on
    # every result model so `Model(**eff)` never silently drops a field.
    note: str | None = None
    error_message: str | None = None
    running_for_seconds: int | None = None
    stalled_for_seconds: int | None = None


class AnalysisStarted(BaseModel):
    analysis_id: str | None = None
    status: str
    next_step: str


mcp = FastMCP("resumematch")


# ---------------------------------------------------------------------------
# auth
# ---------------------------------------------------------------------------

def _bearer_token(ctx: Context) -> str:
    """Cognito ID token for the calling user.

    Must be the ID token, not the access token. resolve_user_id() reads
    claims['email'] unconditionally while USE_SUB_IDENTITY is false, and a
    Cognito access token carries sub/username/scope but no email claim.

    RESUMEMATCH_DEV_TOKEN is a local-development shortcut: paste an ID token
    out of your browser's devtools and run the server against your own account.
    For anything else this must come from the MCP OAuth flow, where this server
    is an OAuth 2.1 resource server in front of the Cognito user pool. Wiring
    that up is a separate change; the accessor is here so there is exactly one
    place to change.
    """
    dev = _setting("RESUMEMATCH_DEV_TOKEN")
    if dev:
        return dev
    raise RuntimeError(
        "No credential available. Put RESUMEMATCH_DEV_TOKEN in the environment "
        "or in a .env beside this script, or wire the OAuth resource-server "
        "flow into _bearer_token()."
    )


def _path_identity(ctx: Context) -> str:
    """Value for the {userId} segment of GET /history/{userId}.

    getHistory declares a path parameter but never reads it: the handler
    assigns pathParameters to a local and then resolves identity from the
    Cognito claims instead. So this value is decorative today and cannot be
    used to read another user's history.

    It is still sent as the real identity rather than a placeholder, so that
    wiring the parameter up later does not silently break this client. The
    claim mirrors resolve_user_id: email while USE_SUB_IDENTITY is false.

    No signature verification here on purpose. API Gateway's Cognito authorizer
    is what validates the token; this only reads a claim to build a URL.
    """
    payload_b64 = _bearer_token(ctx).split(".")[1]
    payload_b64 += "=" * (-len(payload_b64) % 4)
    claims = json.loads(base64.urlsafe_b64decode(payload_b64))

    ident = claims.get("email") or claims.get("sub")
    if not ident:
        raise RuntimeError(
            "Token carries neither an email nor a sub claim. Check that this is "
            "a Cognito ID token, not an access token."
        )
    return ident


# ---------------------------------------------------------------------------
# http
# ---------------------------------------------------------------------------

async def _request(
    ctx: Context, method: str, path: str, *, json_body: dict | None = None
) -> Any:
    headers = {"Authorization": f"Bearer {_bearer_token(ctx)}"}
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
        r = await client.request(
            method, f"{_api_base()}{path}", headers=headers, json=json_body
        )
    if r.status_code in (401, 403):
        raise ValueError(
            "Rejected by the API Gateway authorizer. The token is expired or is "
            "an access token rather than an ID token. Cognito ID tokens last "
            "about an hour; grab a fresh one."
        )
    if r.status_code == 404:
        raise ValueError(f"Not found: {path}")
    if r.status_code == 429:
        raise ValueError(
            "Daily analysis limit reached for this account. Not retryable today."
        )
    r.raise_for_status()

    # Upstream size, before this server projects it down. Paired with
    # _log_projection() at the tool boundary, this gives the context-reduction
    # ratio without needing a separate curl against the same endpoint.
    _log(f"upstream {method} {path} -> {len(r.content)} bytes")
    return r.json()


def _log(msg: str) -> None:
    """stderr, never stdout.

    Under STDIO transport stdout carries the JSON-RPC frames; a stray print
    there corrupts the stream. stderr is also what 2026-07-28 points stdio
    servers at now that the logging capability is deprecated. MCP Inspector
    surfaces it under Server Notifications.
    """
    print(f"[resumematch-mcp] {msg}", file=sys.stderr, flush=True)


def _log_projection(tool: str, upstream_hint: str, payload: Any) -> Any:
    """Report what the projection cost the caller in bytes."""
    if isinstance(payload, BaseModel):
        size = len(payload.model_dump_json())
    else:
        size = len(json.dumps(payload))
    _log(f"{tool} returned {size} bytes ({upstream_hint})")
    return payload


# ---------------------------------------------------------------------------
# coercion
# ---------------------------------------------------------------------------

def _num(v: Any) -> float | int | None:
    """Both Lambdas serialize with json.dumps(..., default=str), so every
    DynamoDB Decimal arrives as a string: matchScore "78", importanceScore "10".
    Declaring these as numbers in an outputSchema and returning strings fails
    validation, so coerce at the boundary rather than changing default=str,
    which the frontend depends on."""
    if v is None or v == "":
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return int(f) if f.is_integer() else f


def _iso_to_epoch(s: str | None) -> float | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s).timestamp()
    except ValueError:
        return None


# ---------------------------------------------------------------------------
# status
# ---------------------------------------------------------------------------

def _effective_status(item: dict) -> dict:
    """Derive a status an agent can act on.

    The stored status is not quite enough. If the worker dies without writing a
    terminal state, processingClaimedAt is never removed, the S3 async retries
    all land inside the 5-minute lease and get refused, and the row stays in
    'processing'. A human sees a spinner and gives up. An agent polls until it
    runs out of tokens, so this server reports anything past STALE_LEASE_SECONDS
    as terminal rather than letting it loop. That threshold tracks the 120s
    function timeout, not the 300s lease; see the constant for why they differ.

    Calibration, so nobody reads more into this than it deserves: the Lambda has
    six remaining-time checkpoints that catch the ordinary timeout path, write
    'failed' and release the lease, so the hang is only reachable in a residual
    window (a Bedrock pass starting with time left but overrunning, or a hard
    kill). A live table sweep found zero rows in 'processing'. This branch is
    cheap insurance against a rare case, not a workaround for a live defect.
    """
    raw = item.get("status")

    if raw in ("completed", "failed"):
        return {
            "status": raw,
            "error_message": item.get("errorMessage"),
        }

    if raw == "pending_upload":
        return {
            "status": "awaiting_upload",
            "note": (
                "Row exists but the resume file was never uploaded. This state "
                "is also filtered out of the history list, so it will not "
                "appear in list_analyses."
            ),
        }

    if raw == "processing":
        claimed = _num(item.get("processingClaimedAt"))
        if claimed is None:
            return {
                "status": "queued",
                "note": "Claimed by no worker yet; the S3 event may not have fired.",
            }
        age = time.time() - claimed
        if age > STALE_LEASE_SECONDS:
            return {
                "status": "stalled",
                "stalled_for_seconds": int(age),
                "note": (
                    "The worker died without writing a terminal state. This will "
                    "not resolve on its own. Do not poll. Call "
                    "analyze_against_job again to start a fresh run."
                ),
            }
        return {"status": "processing", "running_for_seconds": int(age)}

    return {"status": raw or "unknown"}


# ---------------------------------------------------------------------------
# tools
# ---------------------------------------------------------------------------

@mcp.tool(annotations=READ_ONLY)
async def list_analyses(
    ctx: Context,
    limit: int = Field(
        10,
        ge=1,
        le=50,
        description=(
            "How many of the newest analyses to return. Each row costs roughly "
            "300 bytes of context; the full history is on the order of 40 rows."
        ),
    ),
) -> ListAnalysesResult:
    """List the user's recent resume analyses, newest first.

    Use this to find an analysis_id before calling any other tool, or when the
    user asks what they have already analyzed. Returns only identifiers and
    scores; call get_analysis for detail on a specific one.

    Analyses whose upload never completed do not appear here.
    """
    # The bound now lives in inputSchema via Field(ge/le), so the model sees it
    # instead of discovering it by getting an error back. Same numbers as the
    # hand-rolled check this replaces: moving the constraint into the schema is
    # the change, not loosening or tightening it.

    items = await _request(ctx, "GET", f"/history/{_path_identity(ctx)}")

    out = [
        AnalysisRow(
            analysis_id=it.get("analysisId"),
            status=_effective_status(it)["status"],
            job_title=it.get("jobTitle"),
            match_score=_num(it.get("matchScore")),
            created_at=it.get("timestamp"),
            summary=it.get("scoreSummaryShort"),
        )
        for it in items[:limit]
    ]
    return _log_projection(
        "list_analyses",
        f"{len(items)} rows upstream, {len(out)} returned",
        ListAnalysesResult(analyses=out, returned=len(out)),
    )


@mcp.tool(annotations=READ_ONLY)
async def get_analysis(ctx: Context, analysis_id: str) -> AnalysisDetail:
    """Get the score and fit summary for one analysis.

    Returns the overall match score, per-category breakdown, keyword counts, and
    the years-of-experience check. Does NOT return the resume text, the job
    description, or the rewrite suggestions. For the gaps use
    get_missing_keywords; for the proposed edits use get_suggested_edits.
    """
    item = await _request(ctx, "GET", f"/analysis/{analysis_id}")
    eff = _effective_status(item)

    if eff["status"] != "completed":
        return AnalysisDetail(analysis_id=analysis_id, **eff)

    exp = item.get("experienceCheck") or {}
    breakdown = item.get("scoreBreakdown") or {}

    return _log_projection(
        "get_analysis",
        "single analysis",
        AnalysisDetail(
            analysis_id=analysis_id,
            status="completed",
            job_title=item.get("jobTitle"),
            match_score=_num(item.get("matchScore")),
            score_breakdown={
                k: int(_num(v)) for k, v in breakdown.items() if _num(v) is not None
            },
            keywords_matched=_num(item.get("matchedCount")),
            keywords_total=_num(item.get("totalCount")),
            summary=item.get("scoreSummary"),
            experience=ExperienceCheck(
                candidate_years=_num(exp.get("displayYears")),
                candidate_years_exact=_num(exp.get("actualYears")),
                required_years=exp.get("requiredYears"),
                below_requirement=bool(exp.get("hasMismatch")),
            ),
        ),
    )


@mcp.tool(annotations=READ_ONLY)
async def get_missing_keywords(
    ctx: Context, analysis_id: str
) -> MissingKeywordsResult:
    """Get the job requirements this resume does not evidence.

    top_priority is a ranked subset with importance scores and per-keyword
    reasoning; prefer it when advising the user what to work on. all_missing is
    the full list, useful for counting or for checking a specific term.
    """
    item = await _request(ctx, "GET", f"/analysis/{analysis_id}")
    eff = _effective_status(item)

    if eff["status"] != "completed":
        return MissingKeywordsResult(analysis_id=analysis_id, **eff)

    top = [
        RankedKeyword(
            keyword=t.get("keyword"),
            importance=_num(t.get("importanceScore")),
            why=t.get("reason"),
        )
        for t in item.get("topMissing") or []
    ]
    missing = item.get("missingKeywords") or []

    return _log_projection(
        "get_missing_keywords",
        f"{len(top)} ranked, {len(missing)} total",
        MissingKeywordsResult(
            analysis_id=analysis_id,
            status="completed",
            top_priority=top,
            all_missing=missing,
            missing_count=len(missing),
        ),
    )


@mcp.tool(annotations=READ_ONLY)
async def get_suggested_edits(
    ctx: Context, analysis_id: str
) -> SuggestedEditsResult:
    """Get the concrete line-level resume edits proposed for this job.

    Each edit is one original line, the rewritten line, the keyword it adds, and
    the existing resume experience that justifies it.

    An empty list with rejected edits present is a normal and correct outcome,
    not a failure: the server-side guard refuses any insertion the resume cannot
    evidence, so a job asking for skills the candidate does not have will
    legitimately produce zero edits. Report that plainly rather than inventing
    edits or treating it as an error.
    """
    item = await _request(ctx, "GET", f"/analysis/{analysis_id}")
    eff = _effective_status(item)

    if eff["status"] != "completed":
        return SuggestedEditsResult(analysis_id=analysis_id, **eff)

    outcome = item.get("rewriteOutcome")

    if item.get("upgradeRequired"):
        # rewriteOutcome is deliberately NOT gated behind the plan: it is a
        # single enum describing what happened, not rewrite content. So a free
        # account can still be told truthfully whether the guard refused
        # everything or the model simply proposed nothing, which is the whole
        # point of persisting it.
        return SuggestedEditsResult(
            analysis_id=analysis_id,
            status="completed",
            available=False,
            rewrite_outcome=outcome,
            reason="Rewrite suggestions require a Pro plan on this account.",
        )

    if "edits" not in item or "rejectedEdits" not in item:
        # Both must be present. Checking only `edits` would let a partially
        # written record (old cache entry, half-rolled deploy) show `edits: []`
        # with rejectedEdits absent, which reads as "the model proposed nothing"
        # when the truth is "we did not store the rejections". That is the exact
        # collapse this tool exists to prevent, one level up.
        raise ValueError(
            "This analysis has no stored edit list. The backend does not yet "
            "persist Pass 3 edits, or this record predates that change."
        )

    edits = [
        SuggestedEdit(
            keyword=e.get("keyword"),
            original_line=e.get("original"),
            rewritten_line=e.get("modified"),
            justification=e.get("justification"),
            applied=e.get("applied"),
            match_type=e.get("matchType"),
        )
        for e in item.get("edits") or []
    ]
    # Only keyword and reason are projected. rejectedEdits carries the full
    # original edit server-side so the eval harness can reconstruct raw model
    # output, but an agent has no use for the discarded text and it would cost
    # context to ship it.
    rejected = [
        RejectedEdit(keyword=r.get("keyword"), reason=r.get("reason"))
        for r in item.get("rejectedEdits") or []
    ]

    return _log_projection(
        "get_suggested_edits",
        f"{len(edits)} edits, {len(rejected)} rejected, outcome={outcome}",
        SuggestedEditsResult(
            analysis_id=analysis_id,
            status="completed",
            available=True,
            rewrite_outcome=outcome,
            edits=edits,
            edit_count=len(edits),
            rejected=rejected,
        ),
    )


@mcp.tool(
    annotations=ToolAnnotations(
        readOnlyHint=False,
        # Creates a new analysis; it never overwrites or deletes an existing
        # one. Not destructive, but not idempotent either: each call spends one
        # of the user's daily analyses.
        destructiveHint=False,
        idempotentHint=False,
        openWorldHint=False,
    )
)
async def analyze_against_job(
    ctx: Context, existing_analysis_id: str, job_description: str
) -> AnalysisStarted:
    """Score a previously uploaded resume against a new job description.

    Reuses the resume file from an earlier analysis, so no upload is needed.
    Pass the analysis_id of any prior analysis that used the resume you want.

    Returns immediately with a new analysis_id. The run takes roughly 25-45
    seconds. Poll get_analysis with the returned id, waiting about 10 seconds
    between calls; stop as soon as the status is completed, failed, or stalled.

    Counts against the user's daily analysis quota.
    """
    if len(job_description.split()) < 30:
        # analyzeResume rejects this after the quota has already been consumed,
        # so refuse here instead of burning the user's daily allowance.
        raise ValueError(
            "Job description is too short (needs at least 30 words). Paste the "
            "full posting including responsibilities and requirements."
        )

    resp = await _request(
        ctx,
        "POST",
        "/upload",
        json_body={
            "existingAnalysisId": existing_analysis_id,
            "jobDescription": job_description,
        },
    )

    return AnalysisStarted(
        analysis_id=resp.get("analysisId"),
        status="queued",
        next_step=(
            "Wait about 10 seconds, then call get_analysis with this "
            "analysis_id. Repeat until status is completed, failed, or stalled."
        ),
    )


if __name__ == "__main__":
    mcp.run()