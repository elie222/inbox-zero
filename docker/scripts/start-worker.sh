#!/bin/sh
set -e

echo "🚀 Starting Inbox Zero worker..."
exec node /app/apps/worker/src/index.mjs
