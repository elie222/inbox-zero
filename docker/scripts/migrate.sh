#!/bin/sh
set -e

. /app/docker/scripts/configure-rds-ca.sh

if [ -z "$DATABASE_URL" ] && [ -z "$PREVIEW_DATABASE_URL_UNPOOLED" ] && [ -z "$DIRECT_URL" ]; then
    echo "No database URL configured. Skipping database migrations."
    exit 0
fi

MIGRATION_TIMEOUT_SECONDS="${MIGRATION_TIMEOUT_SECONDS:-320}"

echo "🔄 Running database migrations..."

# Prisma 7 requires a config file for migrations because the schema no longer
# carries the datasource URL.
if timeout "$MIGRATION_TIMEOUT_SECONDS" prisma migrate deploy --config=/app/docker/scripts/prisma.config.ts --schema=./apps/web/prisma/schema.prisma; then
    echo "✅ Database migrations completed successfully"
else
    EXIT_CODE=$?
    if [ "$EXIT_CODE" -eq 124 ]; then
        echo "⚠️  Migration timeout (${MIGRATION_TIMEOUT_SECONDS}s) exceeded"
    else
        echo "⚠️  Migration failed with exit code $EXIT_CODE"
    fi
    exit "$EXIT_CODE"
fi
