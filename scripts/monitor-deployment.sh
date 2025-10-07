#!/bin/bash

# Enhanced deployment monitoring script
# Continuously checks deployment status until completion
# Usage: ./scripts/monitor-deployment.sh [deployment-id]

echo "🚀 Starting deployment monitoring..."

# Check if vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI not found. Installing..."
    npm install -g vercel
fi

# Check if logged in
if ! vercel whoami &> /dev/null; then
    echo "❌ Not logged into Vercel CLI"
    echo "💡 Please run: vercel login"
    exit 1
fi

echo "✅ Logged into Vercel CLI"

# Get the latest deployment ID if not provided
if [ -z "$1" ]; then
    echo "🔍 Getting latest deployment..."
    LATEST_DEPLOYMENT=$(vercel ls --json 2>/dev/null | jq -r '.[0].uid' 2>/dev/null)
    if [ "$LATEST_DEPLOYMENT" = "null" ] || [ -z "$LATEST_DEPLOYMENT" ]; then
        echo "❌ Could not get latest deployment ID"
        echo "💡 Try running: vercel ls"
        exit 1
    fi
    DEPLOYMENT_ID="$LATEST_DEPLOYMENT"
else
    DEPLOYMENT_ID="$1"
fi

echo "📋 Monitoring deployment: $DEPLOYMENT_ID"

# Function to check deployment status
check_deployment_status() {
    local deployment_id="$1"
    
    # Try to get deployment info using MCP-style API call
    local status=$(vercel inspect "$deployment_id" --json 2>/dev/null | jq -r '.state' 2>/dev/null)
    local url=$(vercel inspect "$deployment_id" --json 2>/dev/null | jq -r '.url' 2>/dev/null)
    
    if [ "$status" = "null" ] || [ -z "$status" ]; then
        # Fallback to vercel ls if inspect fails
        status=$(vercel ls | grep "$deployment_id" | awk '{print $4}' | head -1)
        url=$(vercel ls | grep "$deployment_id" | awk '{print $2}' | head -1)
    fi
    
    echo "$status|$url"
}

# Monitor the deployment
echo "⏳ Monitoring deployment status..."
echo "Press Ctrl+C to stop monitoring"
echo ""

COUNTER=0
while true; do
    COUNTER=$((COUNTER + 1))
    
    # Get current status
    STATUS_INFO=$(check_deployment_status "$DEPLOYMENT_ID")
    STATUS=$(echo "$STATUS_INFO" | cut -d'|' -f1)
    URL=$(echo "$STATUS_INFO" | cut -d'|' -f2)
    
    # Display current status
    TIMESTAMP=$(date '+%H:%M:%S')
    echo "[$TIMESTAMP] Check #$COUNTER - Status: $STATUS"
    
    if [ -n "$URL" ] && [ "$URL" != "null" ]; then
        echo "           URL: $URL"
    fi
    
    # Check if deployment is complete
    case "$STATUS" in
        "READY")
            echo ""
            echo "🎉 DEPLOYMENT SUCCESS!"
            echo "✅ Status: READY"
            echo "🌐 URL: $URL"
            echo "🆔 Deployment ID: $DEPLOYMENT_ID"
            echo "🔗 Inspector: https://vercel.com/nehil-jains-projects/inbox-zero-web/$DEPLOYMENT_ID"
            break
            ;;
        "ERROR")
            echo ""
            echo "❌ DEPLOYMENT FAILED!"
            echo "🔴 Status: ERROR"
            echo "🆔 Deployment ID: $DEPLOYMENT_ID"
            echo "🔗 Inspector: https://vercel.com/nehil-jains-projects/inbox-zero-web/$DEPLOYMENT_ID"
            echo "💡 Check the inspector URL for detailed error logs"
            break
            ;;
        "CANCELED")
            echo ""
            echo "⏹️ DEPLOYMENT CANCELED!"
            echo "🟡 Status: CANCELED"
            echo "🆔 Deployment ID: $DEPLOYMENT_ID"
            break
            ;;
        "BUILDING"|"QUEUED"|"")
            echo "           Still processing... waiting 30 seconds"
            sleep 30
            ;;
        *)
            echo "           Unknown status: $STATUS - waiting 30 seconds"
            sleep 30
            ;;
    esac
done

echo ""
echo "🏁 Monitoring complete!"
echo "🔗 Vercel Dashboard: https://vercel.com/dashboard"
