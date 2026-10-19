#!/usr/bin/env bash
# Roll the production frontend back to an earlier index.html stored by CI under
# _releases/<git sha>/index.html. Runs locally with the operator's own AWS
# credentials. See "Rollback" in docs/deploy.md.
#
#   ops/rollback-frontend.sh --list   list releases, newest first
#   ops/rollback-frontend.sh <sha>    restore _releases/<sha>/index.html
#
# Requires FRONTEND_BUCKET and CF_DISTRIBUTION_ID in the environment.
set -euo pipefail

usage() {
  echo "usage: $0 --list | <git-sha>" >&2
  exit 2
}

[ "$#" -eq 1 ] || usage

if [ -z "${FRONTEND_BUCKET:-}" ]; then
  echo "error: FRONTEND_BUCKET is not set (the site bucket name)." >&2
  exit 1
fi
if [ -z "${CF_DISTRIBUTION_ID:-}" ]; then
  echo "error: CF_DISTRIBUTION_ID is not set (the CloudFront distribution ID)." >&2
  exit 1
fi

case "$1" in
  --list)
    # ISO-8601 UTC timestamps sort correctly as text.
    aws s3api list-objects-v2 --bucket "$FRONTEND_BUCKET" --prefix _releases/ \
      --query 'Contents[].[LastModified, Key] || `[]`' --output text | sort -r
    exit 0
    ;;
  -*)
    usage
    ;;
esac

release="$1"
key="_releases/$release/index.html"

if ! aws s3api head-object --bucket "$FRONTEND_BUCKET" --key "$key" >/dev/null; then
  echo "error: s3://$FRONTEND_BUCKET/$key not found or not readable. Run '$0 --list'." >&2
  exit 1
fi

# Same headers the deploy puts on index.html. REPLACE is required, otherwise the
# copy keeps the source object's metadata and ignores these flags.
aws s3 cp "s3://$FRONTEND_BUCKET/$key" "s3://$FRONTEND_BUCKET/index.html" \
  --content-type text/html --cache-control no-cache --metadata-directive REPLACE

aws cloudfront create-invalidation --distribution-id "$CF_DISTRIBUTION_ID" --paths "/*"

echo "Restored index.html from $key."
