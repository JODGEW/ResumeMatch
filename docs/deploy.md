# Deploy (CI/CD) — AWS setup

This document is the runbook for the **deploy half** of CI/CD: how the GitHub
Actions workflow authenticates to AWS and ships the built site. It exists
because this project has **no IaC in the repo** — the S3 bucket, CloudFront
distribution, Cognito pool, and now this deploy role are all created by hand in
the AWS console. Without this file, six months from now nobody can tell what the
deploy role is for or whether it's safe to delete. Keep it current.

The frontend build (`.github/workflows/ci.yml`) is separate and needs none of
this — it only lints, tests, and type-checks. Deploy is the job that pushes
`dist/` to S3 and invalidates the CDN, and **that** is what needs AWS access.

## How auth works (OIDC, no long-lived keys)

The deploy job does **not** store an AWS access key. It uses GitHub's OIDC
provider: GitHub mints a short-lived (≈15 min) signed token for the workflow
run, AWS trusts that token, and the job assumes a narrow IAM role for the length
of the run. Nothing long-lived is stored in GitHub, so there is no key to leak
or rotate.

```
GitHub Actions run (push to main)
   │  requests an OIDC token  (permissions: id-token: write)
   ▼
token.actions.githubusercontent.com   ── signs a JWT with sub = repo:JODGEW/ResumeMatch:ref:refs/heads/main
   │
   ▼
AWS STS  ── AssumeRoleWithWebIdentity ── trusts the OIDC provider + checks sub/aud
   │
   ▼
IAM role "resumematch-github-deploy"  (temp creds, ~1h max)
   │  s3:PutObject / DeleteObject / ListBucket   +   cloudfront:CreateInvalidation
   ▼
S3 site bucket  →  CloudFront invalidation  →  live at resumematchapp.com
```

---

## Placeholder legend

Everything in `<ANGLE_BRACKETS>` is an account-specific value. All of them have
already been determined locally — but this file keeps them as placeholders on
purpose: **do not commit the real values here** (public repo). They belong only
in the AWS console (where you paste the policies) and in GitHub repo
*secrets/variables* — never in the source tree. (Public-repo caveat: repo
*variables* still surface in Actions run logs — see the secrets-vs-variables
trade-off under "GitHub configuration.")

| Placeholder | What it is | How to find it (run locally with your admin creds) |
| --- | --- | --- |
| `<AWS_ACCOUNT_ID>` | 12-digit account number | `aws sts get-caller-identity --query Account --output text` |
| `<AWS_REGION>` | Region of the site bucket (likely `us-east-1` per `.env.example`) | `aws s3api get-bucket-location --bucket <SITE_BUCKET>` (empty/`null` = `us-east-1`) |
| `<SITE_BUCKET>` | The S3 bucket CloudFront serves the site from | see "Find the bucket + distribution" below |
| `<DISTRIBUTION_ID>` | CloudFront distribution ID (e.g. `E1ABCD2EFGHIJ`) | see below |
| `<ROLE_ARN>` | ARN of the role you create in step 2 | printed when you create the role; `arn:aws:iam::<AWS_ACCOUNT_ID>:role/resumematch-github-deploy` |

### Find the bucket + distribution (the distribution that serves resumematchapp.com)

```bash
# The distribution whose alias is the live domain is THE one:
aws cloudfront list-distributions \
  --query "DistributionList.Items[?contains(Aliases.Items, 'resumematchapp.com')].{Id:Id, Origin:Origins.Items[0].DomainName}" \
  --output table
```

`Id` → `<DISTRIBUTION_ID>`. `Origin` is the bucket's regional domain
(`<SITE_BUCKET>.s3.<region>.amazonaws.com` for an S3 REST origin, or an
`*.s3-website-*` domain for a website-endpoint origin) — the leading label is
`<SITE_BUCKET>`.

---

## One-time AWS setup

### Step 0 — Do you already have a GitHub OIDC provider?

**Only one** OIDC provider for `token.actions.githubusercontent.com` can exist
per account. If you set one up before (for any other repo), **reuse it** — do
not create a second (it errors). Check:

```bash
aws iam list-open-id-connect-providers
# then, for any ARN that looks like GitHub:
aws iam get-open-id-connect-provider --open-id-connect-provider-arn <ARN>
```

If one already exists for `token.actions.githubusercontent.com`, skip Step 1 and
use its ARN in the trust policy.

### Step 1 — Create the OIDC identity provider (skip if it exists)

**Console:** IAM → Identity providers → **Add provider** → Provider type
**OpenID Connect** →

- Provider URL: `https://token.actions.githubusercontent.com`
- Audience: `sts.amazonaws.com`
- Click **Get thumbprint** (the console fills it automatically — AWS ignores the
  thumbprint for this provider and validates GitHub's token via its own trust
  store, so the exact value doesn't matter).

**CLI equivalent:**

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
```

The resulting provider ARN is
`arn:aws:iam::<AWS_ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com`.

### Step 2 — Create the IAM role with this trust policy

Create a role (name suggestion: **`resumematch-github-deploy`**) for a
**Web identity / custom trust policy**, and paste this as the trust
relationship. This is what limits the role to *this repo, main branch only*:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::<AWS_ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": "repo:JODGEW/ResumeMatch:ref:refs/heads/main"
        }
      }
    }
  ]
}
```

> ⚠️ **Confirm your `sub` format BEFORE creating the role — don't wait for a failure.**
> GitHub is migrating the default OIDC `sub` claim to an *immutable* form that
> appends numeric org/repo IDs after each name, separated by `@` (the delimiter
> was changed to `@` on **2026-06-10** — earlier drafts showed `-`):
> `repo:JODGEW@<ownerId>/ResumeMatch@<repoId>:ref:refs/heads/main`.
> A repo emits the immutable form if **any** of these is true:
> - it was **created on/after 2026-07-15**, or
> - it was **renamed or transferred on/after 2026-07-15** — the sneaky one: a
>   future rename/transfer silently switches the format and breaks this trust
>   policy long after you set it up, or
> - it has **explicitly opted in** via the OIDC settings UI/API.
>
> This repo is older and (as far as we know) hasn't opted in, so the classic form
> in the policy above is expected to be correct — but **verify it, don't assume.**
> Query the repo's actual subject-claim customization (its response now carries
> the immutable-format fields):
>
> ```bash
> gh api /repos/JODGEW/ResumeMatch/actions/oidc/customization/sub
> # response includes:
> #   "use_immutable_subject": false                  ← false = the classic form applies
> #   "sub_claim_prefix": "repo:JODGEW/ResumeMatch"   ← build the policy's sub from THIS
> ```
> (UI equivalent: repo **Settings → Actions → General → OpenID Connect**, or the
> org-level setting.) If `use_immutable_subject` is `true`, take the
> `sub_claim_prefix` verbatim and append `:ref:refs/heads/main` for the trust
> policy's `token.actions.githubusercontent.com:sub` condition.
>
> Do **not** paper over a mismatch with a `StringLike` wildcard on the owner/repo
> — a `*` there matches `/`, which would let other repos assume this role.

After the role exists, its ARN is your `<ROLE_ARN>`.

### Step 3 — Attach this minimal permission policy

Attach an inline (or customer-managed) policy to the role. This is the whole set
the deploy job needs — nothing more:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ListSiteBucket",
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::<SITE_BUCKET>"
    },
    {
      "Sid": "WriteSiteObjects",
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::<SITE_BUCKET>/*"
    },
    {
      "Sid": "InvalidateCdn",
      "Effect": "Allow",
      "Action": "cloudfront:CreateInvalidation",
      "Resource": "arn:aws:cloudfront::<AWS_ACCOUNT_ID>:distribution/<DISTRIBUTION_ID>"
    }
  ]
}
```

Notes on why it's exactly this:

- `s3:ListBucket` (on the **bucket** ARN) is required for `aws s3 sync` to diff
  the destination, and specifically for `--delete` to know what to remove.
- `s3:PutObject` + `s3:DeleteObject` (on the **`/*` object** ARN) upload changed
  files and remove deleted ones. No `s3:GetObject` — `sync` compares by
  size/mtime from the listing, it does not download to compare.
- `cloudfront:CreateInvalidation` uses a **global** ARN (note the empty region
  field: `arn:aws:cloudfront::<ACCOUNT>:distribution/<ID>`), scoped to the one
  distribution.
- **No KMS permissions needed (verified).** The bucket encrypts with **SSE-S3**
  (`AES256`, bucket-key enabled; SSE-C blocked) — S3-managed keys, not KMS. So
  `s3:PutObject` alone is enough; no `kms:GenerateDataKey` / `kms:Encrypt`.
  **If the bucket is ever switched to SSE-KMS, this policy MUST add
  `kms:GenerateDataKey` and `kms:Encrypt` on the key ARN**, or every upload fails
  with `AccessDenied`.
- **Do not reuse your personal/admin identity as the CI principal.** Your local
  creds can already sync + invalidate, but CI gets its own narrow role. That's
  the point of this whole setup.

### Bucket policy — checked, does not block the deploy role

The site bucket's **resource (bucket) policy** was reviewed: **two `Allow`
statements, zero `Deny`**, so it does not block the identity permissions above.

- **Statement 1** — `Principal: "*"`, `s3:GetObject` on `<SITE_BUCKET>/*`: a
  legacy **public-read** grant.
- **Statement 2** — the CloudFront **OAC** grant, restricted by `aws:SourceArn`
  to this distribution.

**Public access block:** `aws s3api get-public-access-block` returns all four
flags `false` — nothing overrides Statement 1, so the public-read grant is
genuinely **live** and the direct-to-S3 bypass below is real, not dead config.

> 📌 **Separate TODO — not a CD blocker, do not touch in this change.** The
> public-read Statement 1 means every object is fetchable **directly from the S3
> endpoint, bypassing CloudFront** (so the CDN's caching, logging, and anything
> fronting the distribution are skipped for direct-to-S3 fetches). Worth
> tightening later — drop the public-read grant and rely solely on the OAC
> statement — but that's an independent hardening task, out of scope for wiring
> up CD.

---

## GitHub configuration

Set these in the repo: **Settings → Secrets and variables → Actions**.

### Secrets (masked in logs)

The six build-time Vite vars. These get baked into the JS bundle at build time,
so the site is dead without them — see the trap below. (They end up publicly
readable in the shipped bundle regardless; storing them as *secrets* just keeps
them out of CI logs.)

| Secret name | Example / source |
| --- | --- |
| `VITE_USER_POOL_ID` | `us-east-1_XXXXXXXXX` |
| `VITE_USER_POOL_CLIENT_ID` | Cognito app client id |
| `VITE_COGNITO_OAUTH_DOMAIN` | `your-domain.auth.us-east-1.amazoncognito.com` |
| `VITE_APP_URL` | `https://resumematchapp.com` |
| `VITE_API_BASE_URL` | `https://…execute-api.us-east-1.amazonaws.com/prod` |
| `VITE_API_KEY` | API Gateway key |

> Pull these from your local `.env` (gitignored) — same values you build with now.

### Variables (operational config — but see the public-repo trade-off)

| Variable name | Value |
| --- | --- |
| `AWS_ROLE_ARN` | `<ROLE_ARN>` |
| `AWS_REGION` | `<AWS_REGION>` (likely `us-east-1`) |
| `S3_BUCKET` | `<SITE_BUCKET>` |
| `CLOUDFRONT_DISTRIBUTION_ID` | `<DISTRIBUTION_ID>` |

> ⚠️ **Public-repo trade-off — this is a decision, not a default.** On a public
> repo **anyone can read the Actions run logs**, and repo *variables* render into
> those logs in plain text (only *secrets* are masked). We kept account-specific
> values out of the committed source precisely to avoid publishing the account ID
> — but `AWS_ROLE_ARN` **contains that same account ID**, so as a *variable* it
> gets published in the logs anyway. Choose deliberately:
> - **Accept it** (common, pragmatic): an account ID + role ARN are low-value on
>   their own — the role can only be assumed by this repo's `main` via the trust
>   policy, so knowing the ARN doesn't grant anyone access.
> - **Or store them as secrets instead** — `AWS_ROLE_ARN` (and, if you prefer,
>   `AWS_REGION` / `S3_BUCKET` / `CLOUDFRONT_DISTRIBUTION_ID`) work identically as
>   secrets, just masked in logs.
>
> The point: on a public repo a *variable* is *published*. Don't treat
> "variable = not secret = harmless" — decide what you're fine publishing.

The deploy job (step 2 of this project — the workflow) will read the role ARN
from `AWS_ROLE_ARN` and **skip cleanly if it's unset**, so CI stays green before
this AWS setup is done; the deploy activates automatically once the variable
exists.

---

## Verify the role before the first real deploy (optional)

The trust policy trusts **only** the GitHub OIDC principal, so you **cannot**
assume this role from your laptop (`aws sts assume-role` will be denied — that's
correct, not a misconfiguration). The only way to exercise it is a real push to
`main`: the `configure-aws-credentials` step either assumes the role (✅) or fails
with the `sub`/`aud` mismatch described above.

The **permission half** actually *can* be checked ahead of time (only the trust
half needs a real run):

- **Permission policy — simulate the role's own identity policy.** Once the role
  exists, with your admin creds run a policy simulation *against the role's ARN*
  (this evaluates the role's permissions, not yours):
  ```bash
  aws iam simulate-principal-policy \
    --policy-source-arn <ROLE_ARN> \
    --action-names s3:PutObject s3:DeleteObject s3:ListBucket \
    --resource-arns arn:aws:s3:::<SITE_BUCKET> arn:aws:s3:::<SITE_BUCKET>/index.html
  ```
  (`s3:ListBucket` resolves against the **bucket** ARN, `PutObject`/`DeleteObject`
  against the **object** ARN — hence both resources.) **Caveat:** this evaluates
  only the role's *identity* policy; it does **not** automatically factor in the
  bucket policy, so an `allowed` here plus a bucket `Deny` could still fail at
  runtime. (The bucket policy was checked above — zero `Deny` — so that gap is
  covered here.)

  > ✅ **Verified 2026-07-25.** The role's inline policy was checked with
  > `aws iam get-role-policy` — literal content matches, no placeholder residue —
  > and all four action/resource combinations (`s3:PutObject`, `s3:DeleteObject`,
  > `s3:ListBucket`, `cloudfront:CreateInvalidation`) simulate as `allowed`. The
  > permission side needs no further changes. Concise per-combo form:
  > ```bash
  > aws iam simulate-principal-policy --policy-source-arn <ROLE_ARN> \
  >   --action-names s3:PutObject --resource-arns arn:aws:s3:::<SITE_BUCKET>/index.html \
  >   --query 'EvaluationResults[].EvalDecision' --output text   # → allowed
  > ```
- **Command / ID sanity — uses your admin identity, not the role.** Confirm the
  IDs resolve with read-only calls: `aws s3 sync dist/ s3://<SITE_BUCKET> --dryrun`
  (shows what *would* upload/delete, changes nothing) and
  `aws cloudfront get-distribution --id <DISTRIBUTION_ID>` (verifies the ID
  resolves). Catches typos in the ARNs.
- **Trust half** — only a real `main` run tests it (plus the `customization/sub`
  pre-check above). Enable `--delete` only after reading the gotchas below.

## Gotchas (read before the first deploy)

1. **Empty-config trap (silent).** `vite build` does **not** error on missing
   `VITE_*` vars — it bakes empty strings in. A deploy built without the six
   secrets produces a site that loads but whose Cognito/API config is blank, so
   **login breaks** with no build failure to warn you. The six secrets above are
   mandatory, not optional.

2. **`--delete` is destructive.** `aws s3 sync dist/ s3://<SITE_BUCKET> --delete`
   removes anything in the bucket not present in `dist/`. That's correct for a
   pure static-site bucket, but if the bucket also holds anything not produced by
   the build, it will be deleted. The demo resumes are safe: they ship *inside*
   `dist/demo-resumes/` from `public/` (verified). Confirm nothing else lives in
   that bucket before enabling `--delete`, or scope the sync with `--exclude`.

3. **CloudFront caches; invalidate after sync.** New `dist/` in S3 won't be
   served until the CDN cache is invalidated (`/*`). The deploy job does this;
   just know that skipping it = stale site.

4. **Pin the action version.** Use `aws-actions/configure-aws-credentials@v6`
   (latest release: **v6.2.0, 2026-06-01**). For supply-chain hardening you can
   pin to a full commit SHA instead of the major tag. Note v6.0.0's breaking
   change moved the action runtime to **Node 24**, which requires an Actions
   runner ≥ **v2.327.1** — GitHub-hosted runners already meet this, so on
   GitHub-hosted runners you're unaffected.

5. **A "fail if `VITE_*` missing" guard must go in the right job.** If you later
   add an assertion that fails the build when the six vars are absent (to catch
   the trap in #1), it **cannot** run in `ci.yml`'s build job — that job has no
   secrets, so it would go red on every run. Put such a guard on the **deploy
   job's** build (which has the secrets), or feed the CI build job a set of dummy
   `VITE_*` values.

---

## Local ↔ CI Node version parity (fresh-clone checks)

CI runs **Node 20** (`setup-node` `node-version: 20` in `ci.yml`). Local dev on
this machine is **Node v18.20.4**, and several dependencies now declare
`engines.node >= 20`, so `npm ci` on Node 18 prints `EBADENGINE` warnings
throughout. They are non-fatal today, but they mean **a fresh-clone verification
only counts if it runs under Node 20** — matching CI. On Node 18 an engine-related
failure could hide, or a spurious one could appear, and neither reflects CI.

Before a fresh-clone check: `nvm use 20` (or otherwise switch to Node 20), then
`npm ci && npm run lint && npm test && npm run build`.

> The `resumeParser.test.ts` collection crash is the exception that proves the
> rule: it's a missing-`eval/` `ENOENT`, so it reproduces on both Node 18 and 20.
> Version-independent bugs will show either way — but don't rely on that; run
> parity checks on 20.

---

## References

- [aws-actions/configure-aws-credentials — releases](https://github.com/aws-actions/configure-aws-credentials/releases)
- [aws-actions/configure-aws-credentials (repo/README)](https://github.com/aws-actions/configure-aws-credentials)
- [AWS Security Blog — use IAM roles to connect GitHub Actions to AWS](https://aws.amazon.com/blogs/security/use-iam-roles-to-connect-github-actions-to-actions-in-aws)
- [GitHub Changelog — immutable subject claims for GitHub Actions OIDC tokens](https://github.blog/changelog/2026-04-23-immutable-subject-claims-for-github-actions-oidc-tokens/)
- [GitHub REST API — Actions OIDC subject-claim customization](https://docs.github.com/en/rest/actions/oidc)
