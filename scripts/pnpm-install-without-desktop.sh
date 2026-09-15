#!/bin/sh
# Workspace install for web/worker/server images and CI.
# Keeps @inboxzero/desktop and @inboxzero/unsubscribe-worker in the lockfile
# (package.json is still copied) but does not install Electron or Playwright.
set -eu
cd "$(dirname "$0")/.."
exec pnpm install --filter '!@inboxzero/desktop' --filter '!@inboxzero/unsubscribe-worker' "$@"
