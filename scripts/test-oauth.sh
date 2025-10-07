#!/bin/bash

# OAuth Configuration Test Script
# Tests Google OAuth configuration using curl

set -e

# Load Google client secret JSON file
GOOGLE_CLIENT_SECRET_FILE=".env.google_client_secret.json"

if [ ! -f "$GOOGLE_CLIENT_SECRET_FILE" ]; then
    echo "❌ $GOOGLE_CLIENT_SECRET_FILE not found in root directory"
    exit 1
fi

# Extract client ID and secret from JSON file
CLIENT_ID=$(grep -o '"client_id":"[^"]*"' "$GOOGLE_CLIENT_SECRET_FILE" | cut -d'"' -f4)
CLIENT_SECRET=$(grep -o '"client_secret":"[^"]*"' "$GOOGLE_CLIENT_SECRET_FILE" | cut -d'"' -f4)

# Load environment variables for base URL
if [ -f "apps/web/.env" ]; then
    # Only load variables that don't start with # and don't contain comments
    while IFS= read -r line; do
        if [[ $line =~ ^[A-Z_][A-Z0-9_]*= ]]; then
            export "$line"
        fi
    done < "apps/web/.env"
else
    echo "❌ apps/web/.env file not found"
    exit 1
fi

# Check required variables
if [ -z "$CLIENT_ID" ]; then
    echo "❌ CLIENT_ID not found in JSON file"
    exit 1
fi

if [ -z "$CLIENT_SECRET" ]; then
    echo "❌ CLIENT_SECRET not found in JSON file"
    exit 1
fi

if [ -z "$NEXT_PUBLIC_BASE_URL" ]; then
    echo "❌ NEXT_PUBLIC_BASE_URL not set"
    exit 1
fi

REDIRECT_URI="${NEXT_PUBLIC_BASE_URL}/api/auth/callback/google"

echo "🔍 OAuth Configuration Test"
echo "============================"
echo "Client ID: ${CLIENT_ID:0:20}..."
echo "Redirect URI: $REDIRECT_URI"
echo ""

# Test 1: Validate redirect URI format
echo "🧪 Test 1: Validating redirect URI format..."
if [[ $REDIRECT_URI =~ ^https?://[a-zA-Z0-9.-]+(:[0-9]+)?/api/auth/callback/google$ ]]; then
    echo "✅ Redirect URI format is valid"
else
    echo "❌ Redirect URI format is invalid"
    echo "Expected format: https://domain.com/api/auth/callback/google"
    echo "Actual: $REDIRECT_URI"
fi
echo ""

# Test 2: Test OAuth discovery endpoint
echo "🧪 Test 2: Testing OAuth discovery endpoint..."
DISCOVERY_URL="https://accounts.google.com/.well-known/openid_configuration"
RESPONSE=$(curl -s -w "%{http_code}" "$DISCOVERY_URL" -o /dev/null)

if [ "$RESPONSE" = "200" ]; then
    echo "✅ OAuth discovery endpoint is accessible"
else
    echo "❌ OAuth discovery endpoint returned HTTP $RESPONSE"
fi
echo ""

# Test 3: Generate auth URL and test components
echo "🧪 Test 3: Testing auth URL generation..."
SCOPES="https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.settings.basic https://www.googleapis.com/auth/contacts"
SCOPES_ENCODED=$(echo "$SCOPES" | sed 's/ /%20/g')

AUTH_URL="https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&scope=${SCOPES_ENCODED}&response_type=code&access_type=offline&prompt=consent"

echo "Generated auth URL:"
echo "$AUTH_URL"
echo ""

# Test 4: Validate auth URL components
echo "🧪 Test 4: Validating auth URL components..."
if [[ $AUTH_URL =~ client_id=${GOOGLE_CLIENT_ID} ]]; then
    echo "✅ Client ID is present in auth URL"
else
    echo "❌ Client ID is missing from auth URL"
fi

if [[ $AUTH_URL =~ redirect_uri= ]]; then
    echo "✅ Redirect URI is present in auth URL"
else
    echo "❌ Redirect URI is missing from auth URL"
fi

if [[ $AUTH_URL =~ scope= ]]; then
    echo "✅ Scope is present in auth URL"
else
    echo "❌ Scope is missing from auth URL"
fi
echo ""

# Test 5: Test token endpoint accessibility
echo "🧪 Test 5: Testing token endpoint accessibility..."
TOKEN_URL="https://oauth2.googleapis.com/token"
TOKEN_RESPONSE=$(curl -s -w "%{http_code}" "$TOKEN_URL" -o /dev/null)

if [ "$TOKEN_RESPONSE" = "200" ]; then
    echo "✅ Token endpoint is accessible"
else
    echo "❌ Token endpoint returned HTTP $TOKEN_RESPONSE"
fi
echo ""

# Test 6: Interactive OAuth flow test
echo "🚀 Interactive OAuth Test"
echo "=========================="
echo "1. Open this URL in your browser:"
echo "$AUTH_URL"
echo ""
echo "2. Complete the OAuth flow"
echo "3. Copy the authorization code from the redirect URL"
echo "4. Paste it below to test token exchange"
echo ""

read -p "Enter authorization code (or press Enter to skip): " AUTH_CODE

if [ -n "$AUTH_CODE" ]; then
    echo ""
    echo "🔄 Testing token exchange..."
    
    TOKEN_RESPONSE=$(curl -s -X POST "$TOKEN_URL" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "client_id=${GOOGLE_CLIENT_ID}" \
        -d "client_secret=${GOOGLE_CLIENT_SECRET}" \
        -d "code=${AUTH_CODE}" \
        -d "grant_type=authorization_code" \
        -d "redirect_uri=${REDIRECT_URI}")
    
    echo "Token response:"
    echo "$TOKEN_RESPONSE" | jq . 2>/dev/null || echo "$TOKEN_RESPONSE"
    
    # Check if we got an access token
    if echo "$TOKEN_RESPONSE" | grep -q "access_token"; then
        echo "✅ Successfully obtained access token!"
        
        # Extract access token and test API access
        ACCESS_TOKEN=$(echo "$TOKEN_RESPONSE" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
        
        echo ""
        echo "🧪 Testing API access..."
        USER_INFO=$(curl -s "https://www.googleapis.com/oauth2/v2/userinfo?access_token=${ACCESS_TOKEN}")
        
        echo "User info response:"
        echo "$USER_INFO" | jq . 2>/dev/null || echo "$USER_INFO"
        
        if echo "$USER_INFO" | grep -q "email"; then
            echo "✅ Successfully accessed user info!"
        else
            echo "❌ Failed to access user info"
        fi
        
    else
        echo "❌ Failed to obtain access token"
        echo "Response: $TOKEN_RESPONSE"
    fi
else
    echo "⏭️  Skipping token exchange test"
fi

echo ""
echo "✅ OAuth configuration test completed!"
echo ""
echo "🔍 Debugging Tips:"
echo "- If you get 'invalid_request', check redirect URI matches exactly"
echo "- If you get 'access_denied', check app name and consent screen"
echo "- If you get 'unauthorized_client', check client ID and secret"
echo "- Make sure all required scopes are configured in Google Console"
