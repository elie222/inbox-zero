#!/bin/bash
set -e

echo "🔧 Setting up private marketing content..."

# Check if GitHub token is available
if [ -z "${GITHUB_ACCESS_TOKEN}" ]; then
    echo "⚠️  No GITHUB_ACCESS_TOKEN found - skipping private marketing setup"
    echo "ℹ️  This is normal for contributors and forks"
    echo "✅ Continuing with standard installation..."
    exit 0
fi

# Create .gitmodules with token from environment
# This allows Vercel to access our private marketing repository
cat > .gitmodules << EOF
[submodule "(marketing)"]
	path = apps/web/app/(marketing)
	url = https://${GITHUB_ACCESS_TOKEN}@github.com/inbox-zero/marketing.git
EOF

echo "📁 Created .gitmodules file"

# Initialize and update submodules
echo "🔄 Initializing marketing submodule..."
git submodule update --init --recursive

echo "🧹 Cleaning up .gitmodules..."
# Clean up - remove .gitmodules to avoid committing the token
rm .gitmodules

echo "✅ Private marketing setup complete!" 