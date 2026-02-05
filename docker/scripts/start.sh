#!/bin/sh
set -e

# This script runs at container startup.
# It replaces the build-time placeholders with runtime environment variables.

echo "🚀 Starting Inbox Zero..."

# Install AWS RDS CA certificates for SSL database connections.
# Only runs when DATABASE_URL points to an RDS instance. Managed databases use
# Amazon's own CA which isn't in the default Alpine trust store, causing the
# Prisma query engine to reject the certificate.
if echo "$DATABASE_URL" | grep -q "amazonaws.com"; then
    RDS_CA_BUNDLE="/usr/local/share/ca-certificates/aws-rds-global-bundle.crt"
    if [ ! -f "$RDS_CA_BUNDLE" ]; then
        echo "🔒 Downloading AWS RDS CA bundle..."
        if wget -q -O "$RDS_CA_BUNDLE" \
            "https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem" 2>/dev/null; then
            update-ca-certificates 2>/dev/null || true
            echo "✅ RDS CA certificates installed"
        else
            echo "⚠️  Could not download RDS CA bundle, continuing..."
            rm -f "$RDS_CA_BUNDLE"
        fi
    fi
    # Tell Node.js / Prisma to trust the system CA store
    if [ -f /etc/ssl/certs/ca-certificates.crt ]; then
        export NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt
    fi
fi

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

if [ -n "$NEXT_PUBLIC_MEETING_BRIEFS_ENABLED" ]; then
    /app/docker/scripts/replace-placeholder.sh "NEXT_PUBLIC_MEETING_BRIEFS_ENABLED_PLACEHOLDER" "$NEXT_PUBLIC_MEETING_BRIEFS_ENABLED"
fi

if [ -n "$NEXT_PUBLIC_INTEGRATIONS_ENABLED" ]; then
    /app/docker/scripts/replace-placeholder.sh "NEXT_PUBLIC_INTEGRATIONS_ENABLED_PLACEHOLDER" "$NEXT_PUBLIC_INTEGRATIONS_ENABLED"
fi

if [ -n "$NEXT_PUBLIC_DIGEST_ENABLED" ]; then
    /app/docker/scripts/replace-placeholder.sh "NEXT_PUBLIC_DIGEST_ENABLED_PLACEHOLDER" "$NEXT_PUBLIC_DIGEST_ENABLED"
fi

if [ -n "$DATABASE_URL" ] || [ -n "$PREVIEW_DATABASE_URL_UNPOOLED" ] || [ -n "$DIRECT_URL" ]; then
    echo "🔄 Running database migrations..."
    # Prisma 7 requires config file for migrations (schema no longer supports url)
    if timeout 320 prisma migrate deploy --config=/app/docker/scripts/prisma.config.ts --schema=./apps/web/prisma/schema.prisma; then
        echo "✅ Database migrations completed successfully"
    else
        EXIT_CODE=$?
        if [ $EXIT_CODE -eq 124 ]; then
            echo "⚠️  Migration timeout (320s) exceeded"
        else
            echo "⚠️  Migration failed with exit code $EXIT_CODE"
        fi
        echo "⚠️  Continuing startup (database might be unavailable or migrations already applied)"
    fi
fi

# Start the Next.js application
echo "✅ Configuration complete. Starting server..."
exec node apps/web/server.js
