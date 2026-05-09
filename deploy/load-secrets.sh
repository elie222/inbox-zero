#!/bin/bash
# Refresh /opt/inbox-zero/.env from AWS SSM Parameter Store.
# Source of truth: /inbox-zero/* in us-east-1. Re-run after any SSM rotation.
#
# Output format: KEY="value" via jq @json. Compose 2.x strips the outer
# matching quotes during interpolation. SSM values containing a literal "
# would need a different formatter — none of our secrets currently do.
#
# Writes atomically via a tempfile and refuses to overwrite if the SSM fetch
# returns suspiciously few keys — avoids leaving a half-written .env behind
# if the AWS call fails partway through pagination.

set -euo pipefail

ENV_FILE=/opt/inbox-zero/.env
MIN_EXPECTED_KEYS=20

echo "Loading secrets from AWS Parameter Store..."

TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT

# AWS CLI v2 auto-paginates get-parameters-by-path when --output json is used.
# --recursive is required to pick up all keys under the path prefix.
aws ssm get-parameters-by-path \
  --path "/inbox-zero/" \
  --with-decryption \
  --recursive \
  --region us-east-1 \
  --output json \
  | jq -r '.Parameters[] | (.Name | split("/") | last) + "=" + (.Value | @json)' \
  > "$TMP"

COUNT=$(wc -l < "$TMP")
if [ "$COUNT" -lt "$MIN_EXPECTED_KEYS" ]; then
  echo "ERROR: only $COUNT secrets loaded, expected >= $MIN_EXPECTED_KEYS. Refusing to overwrite $ENV_FILE." >&2
  exit 1
fi

install -m 0600 "$TMP" "$ENV_FILE"
echo "Secrets loaded: $COUNT variables written to $ENV_FILE"
