#!/usr/bin/env bash
# Clones the private marketing repository into the Next.js route group folder
# Only runs when GITHUB_MARKETING_TOKEN is present (i.e. on Vercel prod builds)
# Safe for local contributors :)
set -euo pipefail

MARKETING_DIR="apps/web/app/(marketing)"
REPO_URL="github.com/inbox-zero/marketing.git"

if [[ -z "${GITHUB_MARKETING_TOKEN:-}" ]]; then
  echo "ℹ️  No GITHUB_MARKETING_TOKEN provided – skipping private marketing clone."
  exit 0
fi

if [[ -d "$MARKETING_DIR/(landing)" ]]; then
  echo "✅ Marketing directory already exists – nothing to clone."
  exit 0
fi

echo "🚀 Cloning private marketing repository..."
# Disable command echo to avoid printing the full token, though Vercel masks secrets automatically.
(set +x; git clone --depth 1 "https://${GITHUB_MARKETING_TOKEN}@${REPO_URL}" "$MARKETING_DIR")

echo "✅ Private marketing repository cloned to $MARKETING_DIR" 