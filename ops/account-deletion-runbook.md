# Account-deletion runbook

Operational procedure behind the published promise: *"email support and your account and all
stored data are deleted within 7 days"* (landing FAQ, privacy policy §4, prepared launch
answers). Written 2026-07-25 and proven the same day end-to-end on a real throwaway account
(register → analyze → interview → tracker entry → delete → verify all zero).

**Script:** [`ops/delete_user_data.py`](./delete_user_data.py). Dry-run by default, `--apply`
deletes, `--verify` is a standalone read-only post-deletion check. Manifests are written to
`ops/deletion-manifests/` — gitignored because they contain user data; never commit them.

---

## ⚠️ Irreversibility

**There is no rollback.** DynamoDB PITR does not restore individual items, S3 versioning is not
enabled on the uploads bucket, and a deleted Cognito user cannot be re-created with the same
`sub`. Once `--apply` runs, the data is gone. Therefore:

- Always dry-run first; the manifest is the only complete record of what existed.
- Never run `--apply` against a key you have not enumerated with a dry-run in the same sitting.

## Why the order matters

An earlier incident (2026-07-23): the Cognito user was deleted *first*, which destroyed the only
email→sub mapping — the sub-keyed rows became undiscoverable orphans. Hence the hard rules,
all enforced by the script:

1. **Resolve and record email + sub + username BEFORE touching anything.**
2. **Purge BOTH identity keys.** The sub migration copies rows; the same person's data exists
   under the email key and the sub key. Deleting one leaves the other orphaned.
3. **Data first, Cognito user LAST.**

## Data inventory

All user content lives in (verified 2026-07-25; account `325611188595`, region `us-east-1`,
user pool `us-east-1_7nPLOwl43`):

| Store | Keying | Deletion path |
|---|---|---|
| `Users` | PK `userId` (email and/or sub) | script |
| `ResumeAnalysis` | PK `userId`, SK `analysisId` (incl. `counter#` rate-limit rows) | script |
| `InterviewSessions` | PK `userId`, SK `sessionId` (incl. `counter#` rows) | script |
| `ResumeApplications` | PK `userId`, SK `applicationId` | script |
| `InterviewStartRequests` | PK `requestKey` = `{userId}#{clientRequestId}`, 1h TTL | script (scan) |
| `ResumeCache` | content-hash key, 48h TTL (+≤48h TTL lag) | **not per-user deletable**; expires ≤4 days < the 7-day promise — compliant by TTL |
| `ContactCache` | company/domain key | no per-user data; out of scope |
| S3 `resume-app-uploads-wenhaohe` | `{userId}/{analysisId}/{fileName}` | script (purged-prefix rule, see below) |
| CloudWatch Lambda logs | may contain email userId + resume-derived fragments | not per-user deletable; 90-day retention, disclosed in privacy §5. **Every new Lambda must set 90-day retention at creation** (see CLAUDE.md) |
| Stripe | customer metadata | manual, Stripe dashboard, only if the Users row had a `stripeCustomerId` |
| Deepgram | interview audio in transit | not stored by us; nothing to delete |

**S3 safety rule (prevents the one irreversible foot-gun):** the script deletes only objects
under a *purged* identity prefix. A row's stored `s3Key` can point into another identity's
prefix (e.g. an orphaned sub-twin row pointing at a live re-registered email account's PDF) —
those are flagged `KEEP`, never deleted. If a sub belongs to a live Cognito user whose email is
not being purged, the script aborts unless `--force`.

## Procedure

```bash
cd ops

# 1+2. Resolve identity and dry-run enumeration (read-only; prints every row/object)
python3 delete_user_data.py --email user@example.com

# 3+4. Delete data, then the Cognito user (last). Prompts for typed DELETE;
#      add --yes only in non-interactive runs.
python3 delete_user_data.py --email user@example.com --apply --delete-cognito-user

# 5. Verify — standalone, read-only. Pass the sub recorded in step 1/the manifest
#    (after deletion Cognito can no longer resolve it).
python3 delete_user_data.py --email user@example.com --sub <recorded-sub> --verify
# Expect: VERIFY PASS — rows=0 s3_objects=0, "Cognito lookup … absent", exit 0.
```

Keep the user's deletion-request email and the `VERIFY PASS` output together — that is the
audit trail for the 7-day promise.

## Edge cases

- **Orphan cleanup (Cognito user already gone):** pass the dead keys explicitly via `--email`
  and/or `--sub`; the script notes "orphan-cleanup mode". `--delete-cognito-user` errors.
- **Email since re-registered by a new account:** the email key belongs to the *live* account.
  Purge only `--sub <old-sub>`; do not pass the email. The S3 prefix rule protects the live
  account's files automatically.
- **Deleted user tries to sign in afterwards:** Cognito anti-enumeration returns the generic
  "Incorrect username or password" — expected, and desirable (the login page cannot be used to
  probe whether an email ever existed).

## Re-validation recipe (run after any change to identity handling or storage layout)

1. Register a throwaway account; run one analysis (real PDF), one short interview, add one
   tracker application.
2. Dry-run: expect 1 Users row, the three content rows, `counter#` rows, 1 idempotency row,
   1 S3 object — and nothing else.
3. `--apply --delete-cognito-user`, then `--verify` → PASS, and a sign-in attempt fails.
4. Delete promptly — a lingering test account skews user counts.
