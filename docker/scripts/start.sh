#!/bin/sh
set -e

# This script runs at container startup.
# It replaces the build-time placeholders with runtime environment variables.

echo "🚀 Starting Inbox Zero..."

# Define the variables to replace
# Add more NEXT_PUBLIC_ variables here as needed
if [ -n "$NEXT_PUBLIC_BASE_URL" ]; then
    /app/docker/scripts/replace-placeholder.sh "http://NEXT_PUBLIC_BASE_URL_PLACEHOLDER" "$NEXT_PUBLIC_BASE_URL"
fi

if [ -n "$DATABASE_URL" ]; then
    prisma migrate deploy --schema=./apps/web/prisma/schema.prisma || {
        echo "⚠️  Migration failed, but continuing startup (database might be unavailable or migrations already applied)"
    }
fi

# Start the Next.js application
echo "✅ Configuration complete. Starting server..."
exec node apps/web/server.js
