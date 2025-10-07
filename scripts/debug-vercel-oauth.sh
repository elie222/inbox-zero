#!/bin/bash

# Enhanced Vercel OAuth Debug Script
# Comprehensive checks for OAuth issues on Vercel deployment

set -e

echo "🔍 Enhanced Vercel OAuth Debug Tool"
echo "===================================="
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

# Get current user and project info
USER=$(vercel whoami)
echo "👤 Logged in as: $USER"
echo ""

# Get current project info
echo "📋 Current Project Info:"
echo "========================"
PROJECT_INFO=$(vercel ls --limit 1)
echo "$PROJECT_INFO"
echo ""

# Extract project name for URLs
PROJECT_NAME=$(echo "$PROJECT_INFO" | tail -n +2 | head -1 | awk '{print $1}')
if [ -n "$PROJECT_NAME" ]; then
    echo "🌐 Project URLs:"
    echo "================="
    echo "Production: https://$PROJECT_NAME.vercel.app"
    echo "Debug OAuth: https://$PROJECT_NAME.vercel.app/debug-oauth"
    echo "Debug API: https://$PROJECT_NAME.vercel.app/api/debug-oauth"
    echo ""
fi

# Check environment variables
echo "🔧 Environment Variables Check:"
echo "================================"
echo "Checking OAuth-related environment variables..."

# Get all environment variables
ENV_VARS=$(vercel env ls 2>/dev/null || echo "")

if [ -n "$ENV_VARS" ]; then
    echo "All environment variables:"
    echo "$ENV_VARS"
    echo ""
    
    # Check specific OAuth variables
    GOOGLE_CLIENT_ID_EXISTS=$(echo "$ENV_VARS" | grep "GOOGLE_CLIENT_ID" | wc -l)
    GOOGLE_CLIENT_SECRET_EXISTS=$(echo "$ENV_VARS" | grep "GOOGLE_CLIENT_SECRET" | wc -l)
    BASE_URL_EXISTS=$(echo "$ENV_VARS" | grep "NEXT_PUBLIC_BASE_URL" | wc -l)
    
    echo "OAuth Environment Variables Status:"
    echo "GOOGLE_CLIENT_ID: $([ $GOOGLE_CLIENT_ID_EXISTS -gt 0 ] && echo "✅ Set" || echo "❌ Missing")"
    echo "GOOGLE_CLIENT_SECRET: $([ $GOOGLE_CLIENT_SECRET_EXISTS -gt 0 ] && echo "✅ Set" || echo "❌ Missing")"
    echo "NEXT_PUBLIC_BASE_URL: $([ $BASE_URL_EXISTS -gt 0 ] && echo "✅ Set" || echo "❌ Missing")"
    
    # Check for different environments
    echo ""
    echo "Environment-specific checks:"
    for env in production preview development; do
        echo "  $env environment:"
        ENV_VARS_ENV=$(vercel env ls --environment $env 2>/dev/null || echo "")
        if [ -n "$ENV_VARS_ENV" ]; then
            CLIENT_ID_ENV=$(echo "$ENV_VARS_ENV" | grep "GOOGLE_CLIENT_ID" | wc -l)
            CLIENT_SECRET_ENV=$(echo "$ENV_VARS_ENV" | grep "GOOGLE_CLIENT_SECRET" | wc -l)
            BASE_URL_ENV=$(echo "$ENV_VARS_ENV" | grep "NEXT_PUBLIC_BASE_URL" | wc -l)
            echo "    GOOGLE_CLIENT_ID: $([ $CLIENT_ID_ENV -gt 0 ] && echo "✅" || echo "❌")"
            echo "    GOOGLE_CLIENT_SECRET: $([ $CLIENT_SECRET_ENV -gt 0 ] && echo "✅" || echo "❌")"
            echo "    NEXT_PUBLIC_BASE_URL: $([ $BASE_URL_ENV -gt 0 ] && echo "✅" || echo "❌")"
        else
            echo "    No environment variables found for $env"
        fi
    done
else
    echo "❌ Could not retrieve environment variables"
    echo "Make sure you have access to the project"
fi
echo ""

# Get recent deployments
echo "🚀 Recent Deployments:"
echo "======================"
DEPLOYMENTS=$(vercel ls --limit 5)
echo "$DEPLOYMENTS"
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
    echo "Recent logs (last 50 lines):"
    LOGS=$(vercel logs $LATEST_DEPLOYMENT --limit 50 2>/dev/null || echo "Could not fetch logs for this deployment")
    echo "$LOGS"
    
    # Check for OAuth-related errors in logs
    echo ""
    echo "🔍 OAuth-related log entries:"
    echo "============================="
    OAUTH_LOGS=$(echo "$LOGS" | grep -i "oauth\|auth\|google\|redirect" || echo "No OAuth-related logs found")
    echo "$OAUTH_LOGS"
    
    # Check for error logs
    echo ""
    echo "❌ Error logs:"
    echo "=============="
    ERROR_LOGS=$(echo "$LOGS" | grep -i "error\|fail\|exception" || echo "No error logs found")
    echo "$ERROR_LOGS"
else
    echo "Could not identify latest deployment"
fi

# Test deployment accessibility
echo ""
echo "🌐 Deployment Accessibility Test:"
echo "================================="
if [ -n "$PROJECT_NAME" ]; then
    echo "Testing deployment URLs..."
    
    # Test main deployment
    echo "Testing main deployment: https://$PROJECT_NAME.vercel.app"
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://$PROJECT_NAME.vercel.app" || echo "000")
    echo "  Status: $HTTP_STATUS"
    
    # Test debug OAuth endpoint
    echo "Testing debug OAuth endpoint: https://$PROJECT_NAME.vercel.app/api/debug-oauth"
    HTTP_STATUS_DEBUG=$(curl -s -o /dev/null -w "%{http_code}" "https://$PROJECT_NAME.vercel.app/api/debug-oauth" || echo "000")
    echo "  Status: $HTTP_STATUS_DEBUG"
    
    if [ "$HTTP_STATUS_DEBUG" = "200" ]; then
        echo "✅ Debug OAuth endpoint is accessible"
        echo "💡 You can now test OAuth flow at: https://$PROJECT_NAME.vercel.app/debug-oauth"
    else
        echo "❌ Debug OAuth endpoint is not accessible (Status: $HTTP_STATUS_DEBUG)"
        echo "💡 Make sure you've deployed the debug endpoints"
    fi
else
    echo "Could not determine project name for URL testing"
fi

echo ""
echo "🔍 OAuth Debug Checklist:"
echo "========================="
echo "1. ✅ Environment variables are set for all environments"
echo "2. ✅ NEXT_PUBLIC_BASE_URL matches your deployment URL"
echo "3. ✅ Google Console OAuth client configuration"
echo "4. ✅ Redirect URIs in Google Console match deployment"
echo "5. ✅ OAuth consent screen configuration"
echo "6. ✅ Test OAuth flow using debug endpoints"
echo ""

echo "🌐 Debug URLs:"
echo "=============="
if [ -n "$PROJECT_NAME" ]; then
    echo "Visit these URLs on your Vercel deployment:"
    echo "- https://$PROJECT_NAME.vercel.app/api/debug-oauth"
    echo "- https://$PROJECT_NAME.vercel.app/debug-oauth"
    echo ""
    echo "Google Console URLs:"
    echo "- https://console.cloud.google.com/apis/credentials"
    echo "- https://console.cloud.google.com/apis/credentials/consent"
else
    echo "Visit these URLs on your Vercel deployment:"
    echo "- https://your-deployment.vercel.app/api/debug-oauth"
    echo "- https://your-deployment.vercel.app/debug-oauth"
fi
echo ""

echo "📋 Next Steps:"
echo "=============="
echo "1. Fix any missing environment variables"
echo "2. Deploy your app with debug endpoints"
echo "3. Visit /debug-oauth on your Vercel deployment"
echo "4. Use the debug tool to test OAuth flow"
echo "5. Check Google Console settings"
echo "6. Monitor logs for OAuth errors"
echo ""

echo "🚨 Common Issues & Solutions:"
echo "============================="
echo "❌ redirect_uri_mismatch:"
echo "   → Add https://$PROJECT_NAME.vercel.app/api/auth/callback/google to Google Console"
echo ""
echo "❌ invalid_client:"
echo "   → Verify GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET match Google Console"
echo ""
echo "❌ access_denied:"
echo "   → Check OAuth consent screen, add your email as test user"
echo ""
echo "❌ invalid_request:"
echo "   → Verify NEXT_PUBLIC_BASE_URL matches deployment URL"
echo ""

echo "📞 Need Help?"
echo "============="
echo "1. Run this script again after making changes"
echo "2. Check Vercel deployment logs: vercel logs --follow"
echo "3. Test OAuth flow using debug endpoints"
echo "4. Verify Google Console configuration"
echo "5. Check environment variables for all environments"
