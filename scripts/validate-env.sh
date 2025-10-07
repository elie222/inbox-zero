#!/bin/bash
# Environment validation script for Vercel deployment
set -euo pipefail

echo "🔍 Validating environment variables..."

# Required variables
REQUIRED_VARS=(
  "DATABASE_URL"
  "AUTH_SECRET"
  "GOOGLE_CLIENT_ID"
  "GOOGLE_CLIENT_SECRET"
  "EMAIL_ENCRYPT_SECRET"
  "EMAIL_ENCRYPT_SALT"
  "GOOGLE_PUBSUB_TOPIC_NAME"
  "INTERNAL_API_KEY"
  "NEXT_PUBLIC_BASE_URL"
)

# Check required variables
MISSING_VARS=()
for var in "${REQUIRED_VARS[@]}"; do
  if [[ -z "${!var:-}" ]]; then
    MISSING_VARS+=("$var")
  fi
done

if [[ ${#MISSING_VARS[@]} -gt 0 ]]; then
  echo "❌ Missing required environment variables:"
  printf '  - %s\n' "${MISSING_VARS[@]}"
  exit 1
fi

# Validate URLs
if [[ ! "$DATABASE_URL" =~ ^postgresql:// ]]; then
  echo "❌ DATABASE_URL must be a valid PostgreSQL connection string"
  exit 1
fi

if [[ ! "$NEXT_PUBLIC_BASE_URL" =~ ^https?:// ]]; then
  echo "❌ NEXT_PUBLIC_BASE_URL must be a valid URL"
  exit 1
fi

# Check optional but recommended variables
RECOMMENDED_VARS=(
  "ANTHROPIC_API_KEY"
  "OPENAI_API_KEY"
  "SENTRY_AUTH_TOKEN"
  "POSTHOG_API_SECRET"
  "STRIPE_SECRET_KEY"
  "UPSTASH_REDIS_URL"
)

MISSING_RECOMMENDED=()
for var in "${RECOMMENDED_VARS[@]}"; do
  if [[ -z "${!var:-}" ]]; then
    MISSING_RECOMMENDED+=("$var")
  fi
done

if [[ ${#MISSING_RECOMMENDED[@]} -gt 0 ]]; then
  echo "⚠️  Missing recommended environment variables:"
  printf '  - %s\n' "${MISSING_RECOMMENDED[@]}"
  echo "   These are optional but recommended for full functionality."
fi

# Test database connection
echo "🔗 Testing database connection..."
if command -v psql >/dev/null 2>&1; then
  if psql "$DATABASE_URL" -c "SELECT 1;" >/dev/null 2>&1; then
    echo "✅ Database connection successful"
  else
    echo "❌ Database connection failed"
    exit 1
  fi
else
  echo "⚠️  psql not available, skipping database connection test"
fi

echo "✅ Environment validation completed successfully!"
