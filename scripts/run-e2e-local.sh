#!/bin/bash
#
# Run E2E tests locally with ngrok tunnel
#
# Usage:
#   ./scripts/run-e2e-local.sh                    # Run all flow tests
#   ./scripts/run-e2e-local.sh draft-cleanup      # Run specific test file
#   ./scripts/run-e2e-local.sh full-reply-cycle   # Run specific test file
#
# Requirements:
#   - ngrok installed and configured
#   - ~/.config/inbox-zero/.env.e2e with E2E_NGROK_AUTH_TOKEN set
#
# Optional env vars:
#   - E2E_PORT: Port to run Next.js on (default: 3000)
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="${HOME}/.config/inbox-zero/.env.e2e"
TEST_FILE="${1:-}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() { echo -e "${GREEN}[E2E]${NC} $1"; }
warn() { echo -e "${YELLOW}[E2E]${NC} $1"; }
error() { echo -e "${RED}[E2E]${NC} $1"; }

# Cleanup function
cleanup() {
    log "Cleaning up..."
    if [ -n "$NGROK_PID" ]; then
        kill $NGROK_PID 2>/dev/null || true
    fi
    if [ -n "$APP_PID" ]; then
        kill $APP_PID 2>/dev/null || true
    fi
    # Kill any remaining background processes
    jobs -p | xargs -r kill 2>/dev/null || true
    log "Cleanup complete"
}

trap cleanup EXIT INT TERM

# Check for env file
if [ ! -f "$ENV_FILE" ]; then
    error "E2E env file not found: $ENV_FILE"
    echo "Create it with:"
    echo "  mkdir -p ~/.config/inbox-zero"
    echo "  # Add your E2E config to ~/.config/inbox-zero/.env.e2e"
    exit 1
fi

# Load environment variables
log "Loading environment from $ENV_FILE"
set -a
source "$ENV_FILE"
set +a

# Check required vars
if [ -z "$E2E_NGROK_AUTH_TOKEN" ]; then
    error "E2E_NGROK_AUTH_TOKEN not set in $ENV_FILE"
    exit 1
fi

if [ -z "$E2E_GMAIL_EMAIL" ] || [ -z "$E2E_OUTLOOK_EMAIL" ]; then
    error "E2E_GMAIL_EMAIL and E2E_OUTLOOK_EMAIL must be set in $ENV_FILE"
    exit 1
fi

# Check ngrok is installed
if ! command -v ngrok &> /dev/null; then
    error "ngrok is not installed. Install it with: brew install ngrok"
    exit 1
fi

cd "$PROJECT_ROOT"

# Port configuration (default 3000, can be overridden with E2E_PORT)
APP_PORT="${E2E_PORT:-3000}"
log "Using port: $APP_PORT"

# Configure ngrok auth
log "Configuring ngrok..."
ngrok config add-authtoken "$E2E_NGROK_AUTH_TOKEN" 2>/dev/null || true

# Start ngrok tunnel - use static domain if configured (required for consistent webhook URLs)
log "Starting ngrok tunnel..."
if [ -n "$E2E_NGROK_DOMAIN" ]; then
    log "Using static domain: $E2E_NGROK_DOMAIN"
    ngrok http "$APP_PORT" --domain="$E2E_NGROK_DOMAIN" --log=stdout > /tmp/ngrok-e2e.log 2>&1 &
    NGROK_URL="https://$E2E_NGROK_DOMAIN"
else
    warn "No E2E_NGROK_DOMAIN set - using dynamic URL (webhooks may not work)"
    ngrok http "$APP_PORT" --log=stdout > /tmp/ngrok-e2e.log 2>&1 &
fi
NGROK_PID=$!

# Wait for ngrok to start
log "Waiting for ngrok tunnel..."
for i in {1..30}; do
    sleep 1
    # Check if tunnel is up via the API (cache response to avoid redundant calls)
    tunnels_json=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null || true)
    if echo "$tunnels_json" | grep -q "public_url"; then
        # If no static domain, get the dynamic URL
        if [ -z "$NGROK_URL" ]; then
            NGROK_URL=$(echo "$tunnels_json" | grep -o '"public_url":"https://[^"]*"' | head -1 | cut -d'"' -f4 || true)
        fi
        break
    fi
    echo -n "."
done
echo ""

if [ -z "$NGROK_URL" ]; then
    error "Failed to get ngrok URL. Check /tmp/ngrok-e2e.log"
    cat /tmp/ngrok-e2e.log
    exit 1
fi

log "Ngrok tunnel ready: $NGROK_URL"
# Export WEBHOOK_URL for Microsoft webhook registration
# NEXT_PUBLIC_BASE_URL can stay as localhost (from .env.e2e) for browser access
export WEBHOOK_URL="$NGROK_URL"

# Start the app
log "Starting Next.js app..."
cd "$PROJECT_ROOT/apps/web"

# Create symlinks so Next.js and vitest pick up our env vars
# .env.local for Next.js, .env.e2e for vitest's dotenv
for envfile in .env.local .env.e2e; do
    if [ ! -L "$envfile" ] || [ "$(readlink $envfile)" != "$ENV_FILE" ]; then
        rm -f "$envfile" 2>/dev/null || true
        ln -sf "$ENV_FILE" "$envfile"
        log "Created $envfile symlink"
    fi
done

# Start app with current environment (NEXT_PUBLIC_BASE_URL already exported above)
pnpm dev --port "$APP_PORT" > /tmp/nextjs-e2e.log 2>&1 &
APP_PID=$!

# Wait for app to be ready
log "Waiting for app to be ready..."
APP_READY=false
for i in {1..60}; do
    # Check health endpoint (with optional API key if configured)
    # -f flag makes curl fail on 4xx/5xx responses
    if curl -sf -H "x-health-api-key: ${HEALTH_API_KEY:-}" "http://localhost:$APP_PORT/api/health" > /dev/null 2>&1; then
        APP_READY=true
        break
    fi
    # Also check if app responded on the root path
    if curl -s -o /dev/null -w "%{http_code}" "http://localhost:$APP_PORT" 2>/dev/null | grep -q "200\|302\|304"; then
        APP_READY=true
        break
    fi
    sleep 2
    echo -n "."
done
echo ""

# Verify app is running and responding with a healthy status
if ! kill -0 $APP_PID 2>/dev/null || [ "$APP_READY" != "true" ]; then
    error "App failed to start or pass health checks. Check /tmp/nextjs-e2e.log"
    tail -50 /tmp/nextjs-e2e.log
    exit 1
fi

log "App is ready at http://localhost:$APP_PORT"
log "Webhook URL: $NGROK_URL"

# Run the E2E tests
log "Running E2E tests..."
cd "$PROJECT_ROOT"

export RUN_E2E_FLOW_TESTS=true
export E2E_RUN_ID="local-$(date +%s)"

if [ -n "$TEST_FILE" ]; then
    log "Running specific test: $TEST_FILE"
    pnpm -F inbox-zero-ai test-e2e:flows "$TEST_FILE"
else
    log "Running all flow tests"
    pnpm -F inbox-zero-ai test-e2e:flows
fi

TEST_EXIT_CODE=$?

if [ $TEST_EXIT_CODE -eq 0 ]; then
    log "E2E tests passed!"
else
    error "E2E tests failed with exit code $TEST_EXIT_CODE"
fi

exit $TEST_EXIT_CODE
