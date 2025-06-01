#!/bin/bash
set -e

# Only run if GITMODULES is set
if [ -n "$GITMODULES" ]; then
    echo "🚀 Starting private marketing setup..."
    
    echo "📝 Creating .gitmodules from environment variable..."
    echo "$GITMODULES" > .gitmodules
    
    echo "🔄 Initializing submodules..."
    git submodule update --init --recursive
    
    echo "📁 Checking marketing directory contents..."
    if [ -d "apps/web/app/(marketing)" ]; then
        echo "✅ Marketing directory exists!"
        echo "📋 Contents of marketing directory:"
        ls -la "apps/web/app/(marketing)/"
        
        # Check for specific directories
        if [ -d "apps/web/app/(marketing)/(landing)/real-estate" ]; then
            echo "✅ Real estate page directory found!"
        else
            echo "❌ Real estate page directory NOT found!"
        fi
    else
        echo "❌ Marketing directory NOT found!"
    fi
    
    echo "✅ Private marketing setup complete!"
else
    echo "ℹ️  No GITMODULES environment variable found - skipping private marketing setup"
fi 