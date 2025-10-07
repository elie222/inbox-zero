#!/bin/bash

# OAuth Error Diagnosis Tool
# Analyzes OAuth errors and provides specific solutions

set -e

echo "🔍 OAuth Error Diagnosis Tool"
echo "============================="
echo ""

# Function to diagnose specific OAuth errors
diagnose_error() {
    local error_code="$1"
    local error_description="$2"
    
    echo "🔍 Diagnosing OAuth Error: $error_code"
    echo "Description: $error_description"
    echo ""
    
    case "$error_code" in
        "redirect_uri_mismatch")
            echo "❌ REDIRECT URI MISMATCH"
            echo "========================"
            echo "This error occurs when the redirect URI in your request doesn't match"
            echo "the authorized redirect URIs configured in Google Console."
            echo ""
            echo "🔧 Solutions:"
            echo "1. Go to Google Cloud Console > APIs & Services > Credentials"
            echo "2. Edit your OAuth 2.0 Client ID"
            echo "3. Add these authorized redirect URIs:"
            echo "   - https://your-app.vercel.app/api/auth/callback/google"
            echo "   - https://your-app-git-main.vercel.app/api/auth/callback/google"
            echo "   - https://your-app-git-branch.vercel.app/api/auth/callback/google"
            echo "4. Make sure NEXT_PUBLIC_BASE_URL matches your deployment URL"
            echo ""
            echo "🔍 Check your current redirect URI:"
            echo "Expected: https://your-app.vercel.app/api/auth/callback/google"
            echo "Actual: Check your debug OAuth endpoint response"
            ;;
            
        "invalid_client")
            echo "❌ INVALID CLIENT"
            echo "================="
            echo "This error occurs when the client ID or client secret is incorrect"
            echo "or doesn't match what's configured in Google Console."
            echo ""
            echo "🔧 Solutions:"
            echo "1. Verify GOOGLE_CLIENT_ID in Vercel environment variables"
            echo "2. Verify GOOGLE_CLIENT_SECRET in Vercel environment variables"
            echo "3. Check Google Console for the correct client ID and secret"
            echo "4. Make sure environment variables are set for all environments"
            echo ""
            echo "🔍 Debug steps:"
            echo "1. Run: vercel env ls"
            echo "2. Check: https://your-app.vercel.app/api/debug-oauth"
            echo "3. Compare client ID with Google Console"
            ;;
            
        "access_denied")
            echo "❌ ACCESS DENIED"
            echo "================"
            echo "This error occurs when the user denies permission or there are"
            echo "issues with the OAuth consent screen configuration."
            echo ""
            echo "🔧 Solutions:"
            echo "1. Check OAuth consent screen configuration in Google Console"
            echo "2. Ensure your app is in 'Testing' mode"
            echo "3. Add your email as a test user"
            echo "4. Verify app name matches between OAuth client and consent screen"
            echo "5. Check if all required scopes are configured"
            echo ""
            echo "🔍 Debug steps:"
            echo "1. Go to Google Console > APIs & Services > OAuth consent screen"
            echo "2. Check 'Test users' section"
            echo "3. Verify 'Scopes' section has all required permissions"
            ;;
            
        "invalid_request")
            echo "❌ INVALID REQUEST"
            echo "=================="
            echo "This error occurs when the request is malformed or missing required parameters."
            echo ""
            echo "🔧 Solutions:"
            echo "1. Verify NEXT_PUBLIC_BASE_URL is set correctly"
            echo "2. Check that all required OAuth parameters are present"
            echo "3. Ensure prompt=consent is set for refresh token"
            echo "4. Verify scope parameters are correctly formatted"
            echo ""
            echo "🔍 Debug steps:"
            echo "1. Check environment variables: vercel env ls"
            echo "2. Test OAuth URL generation: https://your-app.vercel.app/api/debug-oauth"
            echo "3. Verify base URL matches deployment URL"
            ;;
            
        "invalid_grant")
            echo "❌ INVALID GRANT"
            echo "================"
            echo "This error occurs when the authorization code is invalid or expired."
            echo ""
            echo "🔧 Solutions:"
            echo "1. Authorization codes expire quickly (usually 10 minutes)"
            echo "2. Make sure you're using a fresh authorization code"
            echo "3. Check that the code hasn't been used already"
            echo "4. Verify the redirect URI matches exactly"
            echo ""
            echo "🔍 Debug steps:"
            echo "1. Get a new authorization code from OAuth flow"
            echo "2. Use it immediately for token exchange"
            echo "3. Don't reuse old authorization codes"
            ;;
            
        *)
            echo "❌ UNKNOWN ERROR: $error_code"
            echo "============================="
            echo "This error code is not recognized. Here are general debugging steps:"
            echo ""
            echo "🔧 General Solutions:"
            echo "1. Check Vercel environment variables"
            echo "2. Verify Google Console configuration"
            echo "3. Test OAuth flow using debug endpoints"
            echo "4. Check deployment logs for more details"
            echo "5. Ensure all required scopes are configured"
            ;;
    esac
    
    echo ""
    echo "📋 Next Steps:"
    echo "1. Fix the issue based on solutions above"
    echo "2. Deploy your changes"
    echo "3. Test OAuth flow again"
    echo "4. Run debug script: ./scripts/debug-vercel-oauth.sh"
    echo "5. Monitor logs: ./scripts/monitor-vercel-oauth.sh"
    echo ""
}

# Interactive mode
if [ $# -eq 0 ]; then
    echo "Enter the OAuth error code you're experiencing:"
    echo "Common errors: redirect_uri_mismatch, invalid_client, access_denied, invalid_request, invalid_grant"
    echo ""
    read -p "Error code: " error_code
    read -p "Error description (optional): " error_description
else
    error_code="$1"
    error_description="${2:-}"
fi

# Diagnose the error
diagnose_error "$error_code" "$error_description"

echo "🔗 Useful Links:"
echo "================"
echo "Google Console: https://console.cloud.google.com/apis/credentials"
echo "OAuth Consent Screen: https://console.cloud.google.com/apis/credentials/consent"
echo "Vercel Dashboard: https://vercel.com/dashboard"
echo ""
echo "📚 Debug Tools:"
echo "==============="
echo "1. ./scripts/debug-vercel-oauth.sh - Comprehensive OAuth debugging"
echo "2. ./scripts/monitor-vercel-oauth.sh - Real-time log monitoring"
echo "3. https://your-app.vercel.app/debug-oauth - Interactive OAuth testing"
echo ""
