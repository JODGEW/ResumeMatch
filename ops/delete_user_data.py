#!/usr/bin/env python3
"""Account-deletion script, per account-deletion-runbook.md (same directory).

Purges every store that keys user content by identity:
  Users / ResumeAnalysis / InterviewSessions / ResumeApplications  (query by PK, both keys)
  InterviewStartRequests                                           (scan, requestKey prefix)
  s3://resume-app-uploads-wenhaohe                                 (identity prefixes)
and finally, only with --delete-cognito-user, the Cognito user itself.

Order is load-bearing (2026-07-23 incident): resolve + record identity FIRST, delete data,
delete Cognito LAST. See the runbook for why.

Default is DRY RUN (enumerates, prints, writes nothing). --apply deletes. --verify is a
standalone read-only check that everything is gone. NO ROLLBACK EXISTS for --apply.

Usage:
  delete_user_data.py --email user@x.com                     # dry-run, resolves sub from Cognito
  delete_user_data.py --email user@x.com --apply             # delete data, keep Cognito user
  delete_user_data.py --email user@x.com --apply --delete-cognito-user   # full deletion
  delete_user_data.py --sub <dead-sub> --apply               # orphan cleanup (no Cognito user)
  delete_user_data.py --email user@x.com --sub <sub> --verify
"""
import argparse
import datetime
import json
import os
import subprocess
import sys

REGION = "us-east-1"
USER_POOL_ID = "us-east-1_7nPLOwl43"
UPLOADS_BUCKET = "resume-app-uploads-wenhaohe"

# table -> sort key attribute (None = partition key only)
TABLES = {
    "Users": None,
    "ResumeAnalysis": "analysisId",
    "InterviewSessions": "sessionId",
    "ResumeApplications": "applicationId",
}
START_REQUESTS_TABLE = "InterviewStartRequests"


def aws(*args):
    out = subprocess.check_output(["aws", *args, "--region", REGION])
    return json.loads(out) if out.strip() else {}


def aws_write(*args):
    subprocess.run(["aws", *args, "--region", REGION], check=True,
                   stdout=subprocess.DEVNULL)


def cognito_users_by(attr, value):
    resp = aws("cognito-idp", "list-users", "--user-pool-id", USER_POOL_ID,
               "--filter", f'{attr} = "{value}"')
    users = []
    for u in resp.get("Users", []):
        attrs = {a["Name"]: a["Value"] for a in u["Attributes"]}
        users.append({"username": u["Username"], "sub": attrs.get("sub"),
                      "email": attrs.get("email")})
    return users


def query_rows(table, key):
    items, start_key = [], None
    while True:
        cmd = ["dynamodb", "query", "--table-name", table,
               "--key-condition-expression", "userId = :u",
               "--expression-attribute-values", json.dumps({":u": {"S": key}})]
        if start_key:
            cmd += ["--exclusive-start-key", json.dumps(start_key)]
        resp = aws(*cmd)
        items += resp.get("Items", [])
        start_key = resp.get("LastEvaluatedKey")
        if not start_key:
            return items


def scan_start_requests(key):
    items, start_key = [], None
    while True:
        cmd = ["dynamodb", "scan", "--table-name", START_REQUESTS_TABLE,
               "--filter-expression", "begins_with(requestKey, :p)",
               "--expression-attribute-values", json.dumps({":p": {"S": key + "#"}})]
        if start_key:
            cmd += ["--exclusive-start-key", json.dumps(start_key)]
        resp = aws(*cmd)
        items += resp.get("Items", [])
        start_key = resp.get("LastEvaluatedKey")
        if not start_key:
            return items


def list_s3_prefix(prefix):
    keys, token = [], None
    while True:
        cmd = ["s3api", "list-objects-v2", "--bucket", UPLOADS_BUCKET,
               "--prefix", prefix + "/"]
        if token:
            cmd += ["--continuation-token", token]
        resp = aws(*cmd)
        keys += [o["Key"] for o in resp.get("Contents", [])]
        token = resp.get("NextContinuationToken")
        if not token:
            return keys


def enumerate_all(purge_keys):
    """Everything currently stored under the given identity keys."""
    plan = {"tables": {}, "start_requests": [], "s3_objects": [], "s3_foreign": []}
    stored_s3_keys = []
    for table, sk in TABLES.items():
        for key in purge_keys:
            rows = query_rows(table, key)
            entries = []
            for it in rows:
                sk_val = it.get(sk, {}).get("S", "") if sk else ""
                entries.append(sk_val)
                if table == "ResumeAnalysis":
                    s3k = it.get("s3Key", {}).get("S", "")
                    if s3k:
                        stored_s3_keys.append(s3k)
            plan["tables"].setdefault(table, {})[key] = entries
    for key in purge_keys:
        plan["start_requests"] += [it["requestKey"]["S"] for it in scan_start_requests(key)]

    s3_set = set()
    for key in purge_keys:
        s3_set.update(list_s3_prefix(key))
    # Stored s3Key pointers: only delete objects living under a purged identity prefix.
    # A pointer into a non-purged prefix belongs to a live identity (e.g. a sub-twin row
    # pointing at the live email account's PDF) — flag it, never delete it.
    for s3k in stored_s3_keys:
        owner = s3k.split("/", 1)[0]
        if owner in purge_keys:
            s3_set.add(s3k)
        else:
            plan["s3_foreign"].append(s3k)
    plan["s3_objects"] = sorted(s3_set)
    return plan


def print_plan(plan, purge_keys, verb):
    total = 0
    for table in TABLES:
        for key in purge_keys:
            entries = plan["tables"].get(table, {}).get(key, [])
            print(f"{table:22s} {key} : {len(entries)} row(s)")
            for e in entries:
                print(f"    {verb} {table} userId={key}" + (f" sk={e}" if e else ""))
            total += len(entries)
    print(f"{START_REQUESTS_TABLE:22s} (prefix scan) : {len(plan['start_requests'])} row(s)")
    for rk in plan["start_requests"]:
        print(f"    {verb} requestKey={rk}")
    total += len(plan["start_requests"])
    print(f"s3://{UPLOADS_BUCKET}   : {len(plan['s3_objects'])} object(s)")
    for k in plan["s3_objects"]:
        print(f"    {verb} {k}")
    if plan["s3_foreign"]:
        print("\n*** NOT deleted — stored s3Key pointers into NON-purged identity prefixes")
        print("*** (these objects belong to a live identity; see runbook edge cases):")
        for k in plan["s3_foreign"]:
            print(f"    KEEP {k}")
    return total, len(plan["s3_objects"])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--email")
    ap.add_argument("--sub", action="append", default=[])
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--verify", action="store_true")
    ap.add_argument("--delete-cognito-user", action="store_true")
    ap.add_argument("--force", action="store_true",
                    help="proceed even if a purge key belongs to a live Cognito user "
                         "whose email is not being purged")
    ap.add_argument("--yes", action="store_true", help="skip the typed confirmation on --apply")
    args = ap.parse_args()

    if not args.email and not args.sub:
        ap.error("need --email and/or --sub")
    if args.apply and args.verify:
        ap.error("--apply and --verify are mutually exclusive")

    # ---- Step 1: resolve and RECORD identity before anything else ----
    purge_keys = []
    cognito_matches = []
    if args.email:
        purge_keys.append(args.email)
        cognito_matches = cognito_users_by("email", args.email)
        if cognito_matches:
            for u in cognito_matches:
                print(f"Cognito user FOUND  email={u['email']} sub={u['sub']} "
                      f"username={u['username']}")
                if u["sub"] and u["sub"] not in args.sub:
                    args.sub.append(u["sub"])
        else:
            print(f"Cognito user NOT found for {args.email} (orphan-cleanup mode)")
            if args.delete_cognito_user:
                sys.exit("--delete-cognito-user set but no Cognito user exists; aborting.")
    for s in args.sub:
        if s not in purge_keys:
            purge_keys.append(s)
        # Safety: a live Cognito user owns this sub but their email is not being purged?
        live = cognito_users_by("sub", s)
        for u in live:
            if u["email"] != args.email:
                msg = (f"*** DANGER: sub {s} belongs to LIVE Cognito user "
                       f"{u['email']} ({u['username']}), whose email key is NOT being purged.")
                print(msg)
                if not args.force:
                    sys.exit("Aborting. Re-run with --force only if you are certain.")

    print(f"\nIdentity keys to purge ({len(purge_keys)}):")
    for k in purge_keys:
        print(f"  {k}")
    print()

    # ---- Step 2: enumerate ----
    plan = enumerate_all(purge_keys)

    if args.verify:
        rows, objs = print_plan(plan, purge_keys, "FOUND")
        cognito_clear = True
        if args.email:
            cognito_clear = not cognito_users_by("email", args.email)
            print(f"Cognito lookup for {args.email}: "
                  f"{'absent' if cognito_clear else 'STILL PRESENT'}")
        ok = rows == 0 and objs == 0 and cognito_clear
        print(f"\nVERIFY {'PASS' if ok else 'FAIL'} — rows={rows} s3_objects={objs}")
        sys.exit(0 if ok else 1)

    verb = "DELETE " if args.apply else "would delete"
    rows, objs = print_plan(plan, purge_keys, verb)
    print(f"\nTOTAL: {rows} DynamoDB row(s), {objs} S3 object(s), "
          f"Cognito user(s): {len(cognito_matches) if args.delete_cognito_user else 0} to delete")

    if not args.apply:
        print("\nDRY RUN — nothing written. Re-run with --apply to delete. NO ROLLBACK.")
        return

    # ---- Step 3: apply — manifest first, then S3, then rows, Cognito LAST ----
    ts = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    mdir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "deletion-manifests")
    os.makedirs(mdir, exist_ok=True)
    mpath = os.path.join(mdir, f"manifest-{ts}.json")
    with open(mpath, "w") as f:
        json.dump({"timestamp": ts, "purge_keys": purge_keys,
                   "cognito": cognito_matches, "plan": plan}, f, indent=2)
    print(f"\nManifest written: {mpath}")

    if not args.yes:
        typed = input(f"Type DELETE to permanently destroy the {rows} rows / {objs} objects above: ")
        if typed.strip() != "DELETE":
            sys.exit("Not confirmed; nothing deleted.")

    for k in plan["s3_objects"]:
        aws_write("s3api", "delete-object", "--bucket", UPLOADS_BUCKET, "--key", k)
        print(f"deleted s3://{UPLOADS_BUCKET}/{k}")

    for table, sk in TABLES.items():
        if table == "Users":
            continue  # Users rows go last among tables — data first
        for key in purge_keys:
            for e in plan["tables"][table][key]:
                dk = {"userId": {"S": key}}
                if sk:
                    dk[sk] = {"S": e}
                aws_write("dynamodb", "delete-item", "--table-name", table,
                          "--key", json.dumps(dk))
                print(f"deleted {table} userId={key}" + (f" sk={e}" if e else ""))
    for rk in plan["start_requests"]:
        aws_write("dynamodb", "delete-item", "--table-name", START_REQUESTS_TABLE,
                  "--key", json.dumps({"requestKey": {"S": rk}}))
        print(f"deleted {START_REQUESTS_TABLE} requestKey={rk}")
    for key in purge_keys:
        for _ in plan["tables"]["Users"][key]:
            aws_write("dynamodb", "delete-item", "--table-name", "Users",
                      "--key", json.dumps({"userId": {"S": key}}))
            print(f"deleted Users userId={key}")

    if args.delete_cognito_user:
        for u in cognito_matches:
            aws_write("cognito-idp", "admin-delete-user", "--user-pool-id", USER_POOL_ID,
                      "--username", u["username"])
            print(f"deleted Cognito user {u['username']} ({u['email']})")

    print("\nDone. Now run --verify (see runbook step 5).")


if __name__ == "__main__":
    main()
