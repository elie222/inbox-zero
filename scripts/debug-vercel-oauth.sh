#!/bin/bash

# Vercel OAuth Debug Script
# Checks Vercel deployment logs and environment for OAuth issues

set -e

echo "🔍 Vercel OAuth Debug Tool"
echo "=========================="
echo ""

# Check if Vercel CLI is available
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI not found. Install it with: npm i -g vercel"
    exit 1
fi

# Check if logged in to Vercel
if ! vercel whoami &> /dev/null; then
    echo "❌ Not logged in to Vercel. Run: vercel login"
    exit 1
fi

echo "✅ Vercel CLI is available and logged in"
echo ""

# Get current project info
echo "📋 Current Project Info:"
echo "========================"
vercel ls --limit 1
echo ""

# Check environment variables
echo "🔧 Environment Variables Check:"
echo "================================"
echo "Checking OAuth-related environment variables..."

# Check if env vars exist
GOOGLE_CLIENT_ID_EXISTS=$(vercel env ls | grep "GOOGLE_CLIENT_ID" | wc -l)
GOOGLE_CLIENT_SECRET_EXISTS=$(vercel env ls | grep "GOOGLE_CLIENT_SECRET" | wc -l)
BASE_URL_EXISTS=$(vercel env ls | grep "NEXT_PUBLIC_BASE_URL" | wc -l)

echo "GOOGLE_CLIENT_ID: $([ $GOOGLE_CLIENT_ID_EXISTS -gt 0 ] && echo "✅ Set" || echo "❌ Missing")"
echo "GOOGLE_CLIENT_SECRET: $([ $GOOGLE_CLIENT_SECRET_EXISTS -gt 0 ] && echo "✅ Set" || echo "❌ Missing")"
echo "NEXT_PUBLIC_BASE_URL: $([ $BASE_URL_EXISTS -gt 0 ] && echo "✅ Set" || echo "❌ Missing")"
echo ""

# Get recent deployments
echo "🚀 Recent Deployments:"
echo "======================"
vercel ls --limit 5
echo ""

# Get deployment logs (if we can identify the latest deployment)
echo "📝 Recent Deployment Logs:"
echo "=========================="
echo "Getting logs from the latest deployment..."

# Try to get logs from the latest deployment
LATEST_DEPLOYMENT=$(vercel ls --limit 1 --json | jq -r '.[0].uid' 2>/dev/null || echo "")

if [ -n "$LATEST_DEPLOYMENT" ]; then
    echo "Latest deployment ID: $LATEST_DEPLOYMENT"
    echo ""
    echo "Recent logs:"
    vercel logs $LATEST_DEPLOYMENT --limit 50 2>/dev/null || echo "Could not fetch logs for this deployment"
else
    echo "Could not identify latest deployment"
fi

echo ""
echo "🔍 OAuth Debug Checklist:"
echo "========================="
echo "1. ✅ Check if GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set"
echo "2. ✅ Verify NEXT_PUBLIC_BASE_URL matches your deployment URL"
echo "3. ✅ Check Google Console OAuth consent screen app name"
echo "4. ✅ Verify redirect URIs in Google Console match your deployment"
echo "5. ✅ Test OAuth flow using /debug-oauth page on your deployment"
echo ""

echo "🌐 Debug URLs:"
echo "=============="
echo "Visit these URLs on your Vercel deployment:"
echo "- https://your-deployment.vercel.app/api/debug-oauth"
echo "- https://your-deployment.vercel.app/debug-oauth"
echo ""

echo "📋 Next Steps:"
echo "=============="
echo "1. Deploy your app with the new debug endpoints"
echo "2. Visit /debug-oauth on your Vercel deployment"
echo "3. Use the debug tool to test OAuth flow"
echo "4. Check the logs for any OAuth-related errors"
echo "5. Verify Google Console settings match your deployment"
