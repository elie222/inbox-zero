#!/bin/sh
set -e

# This script runs at container startup.
# It replaces the build-time placeholders with runtime environment variables.

echo "🚀 Starting Inbox Zero..."

. /app/docker/scripts/configure-rds-ca.sh

/app/docker/scripts/replace-next-public-placeholders.sh

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
