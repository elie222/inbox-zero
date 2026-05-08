#!/bin/sh
set -e

# This script runs at container startup.
# It replaces the build-time placeholders with runtime environment variables.

echo "🚀 Starting Inbox Zero..."

. /app/docker/scripts/configure-rds-ca.sh

# Define the variables to replace
# Add more NEXT_PUBLIC_ variables here as needed
if [ -n "$NEXT_PUBLIC_BASE_URL" ]; then
    /app/docker/scripts/replace-placeholder.sh "http://NEXT_PUBLIC_BASE_URL_PLACEHOLDER" "$NEXT_PUBLIC_BASE_URL"
fi

if [ -n "$NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS" ]; then
    /app/docker/scripts/replace-placeholder.sh "NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS_PLACEHOLDER" "$NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS"
fi

if [ -n "$NEXT_PUBLIC_EMAIL_SEND_ENABLED" ]; then
    /app/docker/scripts/replace-placeholder.sh "NEXT_PUBLIC_EMAIL_SEND_ENABLED_PLACEHOLDER" "$NEXT_PUBLIC_EMAIL_SEND_ENABLED"
fi

if [ -n "$NEXT_PUBLIC_CLEANER_ENABLED" ]; then
    /app/docker/scripts/replace-placeholder.sh "NEXT_PUBLIC_CLEANER_ENABLED_PLACEHOLDER" "$NEXT_PUBLIC_CLEANER_ENABLED"
fi

# Always replace — the placeholder is a non-empty string that would be coerced
# to true by booleanString, incorrectly disabling drafting by default
/app/docker/scripts/replace-placeholder.sh "NEXT_PUBLIC_AUTO_DRAFT_DISABLED_PLACEHOLDER" "${NEXT_PUBLIC_AUTO_DRAFT_DISABLED:-false}"

if [ -n "$NEXT_PUBLIC_MEETING_BRIEFS_ENABLED" ]; then
    /app/docker/scripts/replace-placeholder.sh "NEXT_PUBLIC_MEETING_BRIEFS_ENABLED_PLACEHOLDER" "$NEXT_PUBLIC_MEETING_BRIEFS_ENABLED"
fi

if [ -n "$NEXT_PUBLIC_INTEGRATIONS_ENABLED" ]; then
    /app/docker/scripts/replace-placeholder.sh "NEXT_PUBLIC_INTEGRATIONS_ENABLED_PLACEHOLDER" "$NEXT_PUBLIC_INTEGRATIONS_ENABLED"
fi

if [ -n "$NEXT_PUBLIC_DIGEST_ENABLED" ]; then
    /app/docker/scripts/replace-placeholder.sh "NEXT_PUBLIC_DIGEST_ENABLED_PLACEHOLDER" "$NEXT_PUBLIC_DIGEST_ENABLED"
fi

if [ -n "$NEXT_PUBLIC_WEBHOOK_ACTION_ENABLED" ]; then
    /app/docker/scripts/replace-placeholder.sh "NEXT_PUBLIC_WEBHOOK_ACTION_ENABLED_PLACEHOLDER" "$NEXT_PUBLIC_WEBHOOK_ACTION_ENABLED"
fi

if [ "${SKIP_DB_MIGRATIONS:-false}" = "true" ]; then
    echo "Skipping database migrations during web startup."
else
    if ! /app/docker/scripts/migrate.sh; then
        echo "⚠️  Continuing startup (database might be unavailable or migrations already applied)"
    fi
fi

# Start the Next.js application
echo "✅ Configuration complete. Starting server..."
exec node apps/web/server.js
