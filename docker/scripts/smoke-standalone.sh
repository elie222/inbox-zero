#!/bin/sh
# Boot the standalone server and fail if it cannot load its instrumentation
# hook. Resolving the package by name is not enough: `pnpm deploy` leaves a
# complete copy in apps/web/node_modules that resolves fine even when the
# traced copy the server actually uses is incomplete.
set -e

LOG=/tmp/smoke-standalone.log

node /app/apps/web/server.js >"$LOG" 2>&1 &
PID=$!
trap 'kill "$PID" 2>/dev/null || true' EXIT

waited=0
until grep -q "Ready in" "$LOG" 2>/dev/null; do
    kill -0 "$PID" 2>/dev/null || { echo "server exited before becoming ready"; tail -20 "$LOG"; exit 1; }
    waited=$((waited + 1))
    [ "$waited" -lt 60 ] || { echo "server never became ready"; tail -20 "$LOG"; exit 1; }
    sleep 1
done

# The hook is evaluated on the request path, so make one request before judging.
# Its status does not matter; there is no database here and a 500 is expected.
wget -q -O /dev/null -T 5 http://127.0.0.1:3000/login 2>/dev/null || true
sleep 2

if grep -q "Failed to load external module" "$LOG"; then
    echo "Standalone server cannot load its instrumentation hook:"
    grep -m1 "Failed to load external module" "$LOG"
    exit 1
fi

echo "Standalone smoke test passed."
