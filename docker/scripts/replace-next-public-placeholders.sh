#!/bin/sh
set -e

# Next.js inlines NEXT_PUBLIC_ values at build time. Docker images build with
# placeholder values, then this script swaps those placeholders for runtime envs.

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
BUILD_OUTPUT_PATHS="apps/web/.next/ apps/web/public/"
NEXT_PUBLIC_PLACEHOLDER_PATTERN='http://NEXT_PUBLIC_[A-Z0-9_]+_PLACEHOLDER|NEXT_PUBLIC_[A-Z0-9_]+_PLACEHOLDER'

egrep -r -h -o "$NEXT_PUBLIC_PLACEHOLDER_PATTERN" $BUILD_OUTPUT_PATHS 2>/dev/null |
    sort -u |
while IFS= read -r PLACEHOLDER; do
    ENV_NAME=${PLACEHOLDER#http://}
    ENV_NAME=${ENV_NAME%_PLACEHOLDER}
    VALUE=$(printenv "$ENV_NAME" 2>/dev/null || true)
    "$SCRIPT_DIR/replace-placeholder.sh" "$PLACEHOLDER" "$VALUE"
done
