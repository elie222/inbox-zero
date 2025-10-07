#!/bin/bash

# Script to monitor any currently building deployment until completion
# Usage: ./scripts/monitor-building-deployment.sh

echo "🚀 Starting deployment monitoring for any building deployment..."

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

# Function to get building deployments
get_building_deployments() {
    vercel ls --json 2>/dev/null | jq -r '.[] | select(.state == "BUILDING") | "\(.uid)|\(.url)|\(.created)"' 2>/dev/null
}

# Function to get deployment status
get_deployment_status() {
    local deployment_id="$1"
    vercel inspect "$deployment_id" --json 2>/dev/null | jq -r '.state' 2>/dev/null
}

# Function to get deployment URL
get_deployment_url() {
    local deployment_id="$1"
    vercel inspect "$deployment_id" --json 2>/dev/null | jq -r '.url' 2>/dev/null
}

echo "🔍 Looking for building deployments..."

# Get initial building deployments
BUILDING_DEPLOYMENTS=$(get_building_deployments)

if [ -z "$BUILDING_DEPLOYMENTS" ]; then
    echo "ℹ️  No deployments currently building"
    echo "🔍 Checking recent deployments..."
    
    # Show recent deployments
    echo ""
    echo "📈 Recent deployments:"
    vercel ls | head -5
    
    echo ""
    echo "💡 To monitor a specific deployment, run:"
    echo "   ./scripts/monitor-deployment.sh [deployment-id]"
    exit 0
fi

echo "📋 Found building deployment(s):"
echo "$BUILDING_DEPLOYMENTS" | while IFS='|' read -r uid url created; do
    echo "   🆔 ID: $uid"
    echo "   🌐 URL: $url"
    echo "   ⏰ Started: $created"
    echo ""
done

# Get the first building deployment ID
FIRST_BUILDING_ID=$(echo "$BUILDING_DEPLOYMENTS" | head -1 | cut -d'|' -f1)

echo "🎯 Monitoring deployment: $FIRST_BUILDING_ID"
echo "⏳ Monitoring deployment status..."
echo "Press Ctrl+C to stop monitoring"
echo ""

COUNTER=0
while true; do
    COUNTER=$((COUNTER + 1))
    
    # Get current status
    STATUS=$(get_deployment_status "$FIRST_BUILDING_ID")
    URL=$(get_deployment_url "$FIRST_BUILDING_ID")
    
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
            echo "🆔 Deployment ID: $FIRST_BUILDING_ID"
            echo "🔗 Inspector: https://vercel.com/nehil-jains-projects/inbox-zero-web/$FIRST_BUILDING_ID"
            break
            ;;
        "ERROR")
            echo ""
            echo "❌ DEPLOYMENT FAILED!"
            echo "🔴 Status: ERROR"
            echo "🆔 Deployment ID: $FIRST_BUILDING_ID"
            echo "🔗 Inspector: https://vercel.com/nehil-jains-projects/inbox-zero-web/$FIRST_BUILDING_ID"
            echo "💡 Check the inspector URL for detailed error logs"
            break
            ;;
        "CANCELED")
            echo ""
            echo "⏹️ DEPLOYMENT CANCELED!"
            echo "🟡 Status: CANCELED"
            echo "🆔 Deployment ID: $FIRST_BUILDING_ID"
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
