#!/bin/bash
set -e

# Only run if GITMODULES is set
if [ -n "$GITMODULES" ]; then
    echo "🚀 Starting private marketing setup..."
    
    echo "📝 Creating .gitmodules from environment variable..."
    echo "$GITMODULES" > .gitmodules
    echo "✅ .gitmodules created."

    echo "🔄 Syncing submodule configuration..."
    git submodule sync --recursive
    echo "✅ Submodule configuration synced."
    
    echo "🔄 Initializing and updating submodules (force, remote)..."
    git submodule update --init --force --recursive --remote
    echo "✅ Submodules initialized and updated."
    
    echo "📁 Checking marketing directory contents..."
    MARKETING_DIR="apps/web/app/(marketing)"
    if [ -d "$MARKETING_DIR" ]; then
        echo "✅ Marketing directory exists!"
        echo "📋 Contents of marketing directory ($MARKETING_DIR):"
        ls -la "$MARKETING_DIR/"
        
        # Check for specific directories
        REAL_ESTATE_DIR="$MARKETING_DIR/(landing)/real-estate"
        if [ -d "$REAL_ESTATE_DIR" ]; then
            echo "✅ Real estate page directory found! ($REAL_ESTATE_DIR)"
        else
            echo "❌ Real estate page directory NOT found! ($REAL_ESTATE_DIR)"
            echo "🔍 Listing contents of $MARKETING_DIR/(landing)/ to debug:"
            ls -la "$MARKETING_DIR/(landing)/" || echo "Could not list contents of $MARKETING_DIR/(landing)/"
        fi
    else
        echo "❌ Marketing directory NOT found! ($MARKETING_DIR)"
    fi
    
    echo "✅ Private marketing setup complete!"
else
    echo "ℹ️  No GITMODULES environment variable found - skipping private marketing setup"
fi