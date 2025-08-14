#!/usr/bin/env bash

set -euo pipefail

# Source the environment file to load variables for Docker
if [ -f "apps/web/.env" ]; then
    set -a  # Enable export of all variables
    # shellcheck disable=SC1091
    source apps/web/.env
    set +a  # Disable export of all variables
    echo "✓ Sourced apps/web/.env"
    # Show only a small, safe prefix if present
    if [ -n "${UPSTASH_REDIS_TOKEN:-}" ]; then
      echo "✓ UPSTASH_REDIS_TOKEN is set: ${UPSTASH_REDIS_TOKEN:0:10}..."
    fi
else
    echo "❌ Error: apps/web/.env file not found"
    exit 1
fi

# If arguments are provided, pass them through to docker compose directly.
# Otherwise, default to `up -d`.
if [ "$#" -gt 0 ]; then
  echo "🚀 Running: docker compose $*"
  docker compose "$@"
else
  echo "🚀 Starting docker compose (default): docker compose up -d"
  docker compose up -d
fi

echo "✅ Docker compose command completed successfully"
