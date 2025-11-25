#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Inbox Zero Environment Setup${NC}"
echo ""

# Determine the project root (script is in docker/scripts/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_EXAMPLE="$PROJECT_ROOT/apps/web/.env.example"
ENV_FILE="$PROJECT_ROOT/apps/web/.env"

# Check if .env.example exists
if [ ! -f "$ENV_EXAMPLE" ]; then
    echo -e "${RED}Error: .env.example not found at $ENV_EXAMPLE${NC}"
    exit 1
fi

# Check if .env already exists
if [ -f "$ENV_FILE" ]; then
    echo -e "${YELLOW}⚠️  .env file already exists at $ENV_FILE${NC}"
    read -p "Do you want to overwrite it? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted. Existing .env file preserved."
        exit 0
    fi
fi

echo "📝 Copying .env.example to .env..."
cp "$ENV_EXAMPLE" "$ENV_FILE"

echo "🔐 Generating secure secrets..."

# Function to generate a random hex string
generate_secret() {
    openssl rand -hex "$1"
}

# Function to replace a secret in the env file
# Matches patterns like: VAR_NAME= # comment or VAR_NAME=#comment or VAR_NAME=
set_secret() {
    local var_name=$1
    local secret=$2
    # Use | as delimiter since secrets don't contain |
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s|^${var_name}=.*|${var_name}=${secret}|" "$ENV_FILE"
    else
        # Linux
        sed -i "s|^${var_name}=.*|${var_name}=${secret}|" "$ENV_FILE"
    fi
    echo "  ✅ ${var_name}"
}

# Generate and set all secrets (32 bytes = 64 hex chars)
set_secret "AUTH_SECRET" "$(generate_secret 32)"
set_secret "EMAIL_ENCRYPT_SECRET" "$(generate_secret 32)"
set_secret "INTERNAL_API_KEY" "$(generate_secret 32)"
set_secret "API_KEY_SALT" "$(generate_secret 32)"
set_secret "GOOGLE_PUBSUB_VERIFICATION_TOKEN" "$(generate_secret 32)"
set_secret "MICROSOFT_WEBHOOK_CLIENT_STATE" "$(generate_secret 32)"
set_secret "UPSTASH_REDIS_TOKEN" "$(generate_secret 32)"
set_secret "TINYBIRD_ENCRYPT_SECRET" "$(generate_secret 32)"
set_secret "CRON_SECRET" "$(generate_secret 32)"

# Generate and set salts (16 bytes = 32 hex chars)
set_secret "EMAIL_ENCRYPT_SALT" "$(generate_secret 16)"
set_secret "TINYBIRD_ENCRYPT_SALT" "$(generate_secret 16)"

echo ""
echo -e "${GREEN}✅ Environment file created at:${NC} $ENV_FILE"
echo ""
echo -e "${YELLOW}📋 Next steps:${NC}"
echo "   1. Edit $ENV_FILE"
echo "   2. Add your Google OAuth credentials (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)"
echo "   3. Configure your LLM provider (uncomment one provider block)"
echo "   4. Optionally configure Microsoft OAuth, Redis, etc."
echo ""
echo "   See docs/hosting/environment-variables.md for full reference."

