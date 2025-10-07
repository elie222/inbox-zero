#!/bin/bash

# Test script to check Vercel deployment status (with 5 second wait)
# Usage: ./scripts/test-deployment.sh

echo "🚀 Waiting 5 seconds for deployment to complete..."
sleep 5

echo "📊 Checking Vercel deployment status..."

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

# Get project info
echo "🔍 Getting project information..."
PROJECT_NAME=$(vercel ls | head -2 | tail -1 | awk '{print $1}')
echo "📋 Project: $PROJECT_NAME"

# Get latest deployments
echo "📈 Getting latest deployments..."
vercel ls

echo ""
echo "🎯 Latest deployment details:"
vercel ls | head -3

echo ""
echo "🔗 Vercel Dashboard: https://vercel.com/dashboard"
echo "🔗 Project URL: https://vercel.com/$(vercel whoami)/$PROJECT_NAME"
