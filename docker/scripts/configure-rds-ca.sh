#!/bin/sh

# Source this script before commands that connect to AWS RDS. Managed RDS
# databases use Amazon's CA, which is not present in the Alpine trust store.
RDS_CA_BUNDLE="/app/rds-combined-ca-bundle.pem"

if echo "$DATABASE_URL $DIRECT_URL $PREVIEW_DATABASE_URL_UNPOOLED" | grep -q "amazonaws.com"; then
    if [ ! -f "$RDS_CA_BUNDLE" ]; then
        echo "🔒 Downloading AWS RDS CA bundle..."
        if wget -q -O "$RDS_CA_BUNDLE" \
            "https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem" 2>/dev/null; then
            echo "✅ RDS CA certificates installed"
        else
            echo "⚠️  Could not download RDS CA bundle, continuing..."
            rm -f "$RDS_CA_BUNDLE"
        fi
    fi
    if [ -f "$RDS_CA_BUNDLE" ]; then
        export NODE_EXTRA_CA_CERTS="$RDS_CA_BUNDLE"
    fi
fi
