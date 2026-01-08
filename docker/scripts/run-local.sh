#!/bin/bash
# run-local.sh - Run locally built inbox-zero Docker image
#
# Runs the image with docker-compose including PostgreSQL and Redis,
# or standalone if you have external services configured in .env.
#
# Usage:
#   pnpm docker:local:run                    # run with docker-compose (recommended)
#   pnpm docker:local:run --standalone       # run image only (use external DB/Redis)
#   ./docker/scripts/run-local.sh            # same as above
#
set -euo pipefail

# Configuration
IMAGE_NAME="inbox-zero"
REGISTRY="ghcr.io"
ENV_FILE="apps/web/.env"
COMPOSE_FILE="docker/docker-compose.local.yml"

# Parse arguments
STANDALONE=false
for arg in "$@"; do
  case $arg in
    --standalone)
      STANDALONE=true
      ;;
  esac
done

# Check Docker is running
if ! docker info > /dev/null 2>&1; then
  echo "Docker is not running. Please start Docker Desktop."
  exit 1
fi

# Check .env file exists
if [ ! -f "$ENV_FILE" ]; then
  echo ".env file not found: $ENV_FILE"
  echo "Copy from .env.example and configure: cp apps/web/.env.example apps/web/.env"
  exit 1
fi

# Get GitHub username for image name
if ! gh auth status > /dev/null 2>&1; then
  echo "GitHub CLI not authenticated. Run: gh auth login"
  exit 1
fi
GITHUB_USERNAME="${GITHUB_USERNAME:-$(gh api user -q .login)}"
FULL_IMAGE="${REGISTRY}/${GITHUB_USERNAME}/${IMAGE_NAME}"

# Check if image exists locally
if ! docker image inspect "${FULL_IMAGE}:latest" > /dev/null 2>&1; then
  echo "Image not found: ${FULL_IMAGE}:latest"
  echo "Build first with: pnpm docker:local:build"
  exit 1
fi

if [ "$STANDALONE" = true ]; then
  echo "Running standalone (using .env for DB/Redis configuration)..."
  echo "Image: ${FULL_IMAGE}:latest"
  echo ""
  docker run --rm -it \
    -p 3000:3000 \
    --env-file "$ENV_FILE" \
    "${FULL_IMAGE}:latest"
else
  # Run with docker-compose
  if [ ! -f "$COMPOSE_FILE" ]; then
    echo "Compose file not found: $COMPOSE_FILE"
    echo "Use --standalone to run without compose"
    exit 1
  fi

  echo "Running with docker-compose (includes PostgreSQL + Redis)..."
  echo "Image: ${FULL_IMAGE}:latest"
  echo ""

  # Export for docker-compose to use
  export GITHUB_USERNAME
  export FULL_IMAGE

  docker compose -f "$COMPOSE_FILE" up
fi
