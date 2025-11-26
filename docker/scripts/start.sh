#!/bin/sh
set -e

# This script runs at container startup.
# It replaces the build-time placeholders with runtime environment variables,
# optionally runs database migrations, and starts the Next.js server.

echo "🚀 Starting Inbox Zero..."

# Define the variables to replace
# Add more NEXT_PUBLIC_ variables here as needed
if [ -n "$NEXT_PUBLIC_BASE_URL" ]; then
    /app/docker/scripts/replace-placeholder.sh "http://NEXT_PUBLIC_BASE_URL_PLACEHOLDER" "$NEXT_PUBLIC_BASE_URL"
fi

# Run database migrations unless SKIP_MIGRATIONS is set to 1
if [ "$SKIP_MIGRATIONS" = "1" ]; then
    echo "⏭️  Skipping database migrations (SKIP_MIGRATIONS=1)"
else
    echo "🔄 Running database migrations..."
    prisma migrate deploy --schema=/app/apps/web/prisma/schema.prisma
    echo "✅ Database migrations complete."
fi

# Start the Next.js application
echo "✅ Configuration complete. Starting server..."
exec node apps/web/server.js
