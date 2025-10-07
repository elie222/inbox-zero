#!/bin/bash

# Real-time Vercel OAuth Monitoring Script
# Monitors deployment logs for OAuth-related issues in real-time

set -e

echo "🔍 Real-time Vercel OAuth Monitoring"
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

# Get project info
PROJECT_INFO=$(vercel ls --limit 1)
PROJECT_NAME=$(echo "$PROJECT_INFO" | tail -n +2 | head -1 | awk '{print $1}')

if [ -n "$PROJECT_NAME" ]; then
    echo "📋 Project: $PROJECT_NAME"
    echo "🌐 Debug URL: https://$PROJECT_NAME.vercel.app/debug-oauth"
    echo ""
fi

echo "🚀 Starting real-time log monitoring..."
echo "Press Ctrl+C to stop monitoring"
echo ""

# Function to highlight OAuth-related logs
highlight_oauth() {
    while IFS= read -r line; do
        # Check if line contains OAuth-related keywords
        if echo "$line" | grep -qi "oauth\|auth\|google\|redirect\|token\|client"; then
            echo -e "\033[33m[OAUTH]\033[0m $line"
        elif echo "$line" | grep -qi "error\|fail\|exception"; then
            echo -e "\033[31m[ERROR]\033[0m $line"
        else
            echo "$line"
        fi
    done
}

# Monitor logs in real-time
echo "📝 Monitoring deployment logs (filtering for OAuth/errors)..."
echo ""

# Start monitoring with filtering
vercel logs --follow | highlight_oauth
