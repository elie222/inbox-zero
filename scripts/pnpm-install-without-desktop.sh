#!/bin/sh
# Workspace install for web/worker/server images and CI.
# Keeps @inboxzero/desktop in the lockfile (package.json is still copied) but
# does not install Electron.
set -eu
cd "$(dirname "$0")/.."
exec pnpm install --filter '!@inboxzero/desktop' "$@"
