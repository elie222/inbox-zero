#!/bin/sh
# Boot the standalone server and fail if it cannot load its instrumentation
# hook. Resolving the package by name is not enough: `pnpm deploy` leaves a
# complete copy in apps/web/node_modules that resolves fine even when the
# traced copy the server actually uses is incomplete.
set -e

main() {
    trap cleanup EXIT
    trap 'exit 1' HUP INT TERM

    LOG="$(mktemp)"
    node /app/apps/web/server.js >"$LOG" 2>&1 &
    PID=$!

    deadline=$(($(date +%s) + 60))
    until probe_server; do
        if ! kill -0 "$PID" 2>/dev/null; then
            echo "server exited before responding"
            tail -20 "$LOG"
            exit 1
        fi

        if [ "$(date +%s)" -ge "$deadline" ]; then
            echo "server never responded"
            tail -20 "$LOG"
            exit 1
        fi

        sleep 1
    done

    sleep 2

    if ! probe_server; then
        echo "server stopped responding after the initial request"
        tail -20 "$LOG"
        exit 1
    fi

    if grep -Eq "An error occurred while loading the instrumentation hook|Failed to load external module" "$LOG"; then
        echo "Standalone server cannot load its instrumentation hook:"
        tail -20 "$LOG"
        exit 1
    fi

    echo "Standalone smoke test passed."
}

probe_server() {
    node -e '
        const request = require("node:http").get("http://127.0.0.1:3000/login", (response) => {
            response.destroy();
            process.exit(0);
        });

        request.setTimeout(1_000, () => request.destroy(new Error("Request timed out")));
        request.on("error", () => process.exit(1));
    '
}

cleanup() {
    if [ -n "${PID:-}" ]; then
        kill "$PID" 2>/dev/null || true
        wait "$PID" 2>/dev/null || true
    fi
    rm -f "${LOG:-}"
}

main
