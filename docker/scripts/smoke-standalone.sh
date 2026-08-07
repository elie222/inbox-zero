#!/bin/sh
# Boot the standalone server and exercise a request so broken runtime tracing
# fails while the image is being built. Resolving the package by name is not
# enough: `pnpm deploy` leaves a complete copy in apps/web/node_modules that
# resolves fine even when the traced copy the server actually uses is incomplete.
set -e

main() {
    trap cleanup EXIT
    trap 'exit 1' HUP INT TERM

    LOG="$(mktemp)"
    node /app/apps/web/server.js >"$LOG" 2>&1 &
    PID=$!

    attempts=0
    until wget -q -O /dev/null -T 2 http://127.0.0.1:3000/api/health; do
        if ! kill -0 "$PID" 2>/dev/null; then
            echo "server exited before responding"
            tail -20 "$LOG"
            exit 1
        fi

        attempts=$((attempts + 1))
        if [ "$attempts" -ge 60 ]; then
            echo "server health check never passed"
            tail -20 "$LOG"
            exit 1
        fi

        sleep 1
    done

    echo "Standalone smoke test passed."
}

cleanup() {
    if [ -n "${PID:-}" ]; then
        kill "$PID" 2>/dev/null || true
        wait "$PID" 2>/dev/null || true
    fi
    rm -f "${LOG:-}"
}

main
