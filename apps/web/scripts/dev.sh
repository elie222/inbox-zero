#!/bin/bash

# Local Development Manager
# Supports both Docker-based and traditional PostgreSQL workflows

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_DIR="$(dirname "$SCRIPT_DIR")"
ROOT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_success() { echo -e "${GREEN}✅ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
print_error() { echo -e "${RED}❌ $1${NC}"; }
print_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }

check_docker() {
    docker info >/dev/null 2>&1
}

check_postgres() {
    pg_isready -h localhost -p 5432 >/dev/null 2>&1
}

setup_env() {
    if [ -f "$WEB_DIR/.env.local" ]; then
        print_warning ".env.local exists. Backing up to .env.local.backup"
        cp "$WEB_DIR/.env.local" "$WEB_DIR/.env.local.backup"
    fi
    
    cp "$WEB_DIR/env.local.template" "$WEB_DIR/.env.local"
    print_success "Created .env.local from template"
    print_info "Edit .env.local with your API keys and settings"
}

start_docker() {
    if ! check_docker; then
        print_error "Docker not running. Start Docker Desktop first."
        exit 1
    fi
    
    print_info "Starting Docker services..."
    cd "$ROOT_DIR"
    docker compose -f docker-compose.dev.yml up -d
    
    # Wait for services
    for i in {1..30}; do
        if docker exec inbox-zero-dev-db pg_isready -U postgres -d inboxzero >/dev/null 2>&1; then
            break
        fi
        sleep 2
    done
    
    print_success "Docker services ready (PostgreSQL: 5432, Redis: 6379)"
}

stop_docker() {
    print_info "Stopping Docker services..."
    cd "$ROOT_DIR"
    docker compose -f docker-compose.dev.yml down
    print_success "Docker services stopped"
}

setup_db() {
    cd "$WEB_DIR"
    print_info "Running migrations..."
    npx prisma migrate deploy
    print_success "Database ready"
}

start_dev() {
    if [ ! -f "$WEB_DIR/.env.local" ]; then
        print_error ".env.local not found. Run: ./dev.sh setup"
        exit 1
    fi
    
    # Check if Docker services are running, if not try to start them
    if check_docker && ! docker ps | grep -q inbox-zero-dev-db; then
        print_info "Starting Docker services..."
        start_docker
    fi
    
    export NODE_ENV=development
    print_success "Starting dev server at http://localhost:3000"
    cd "$WEB_DIR"
    npm run dev
}

case "${1:-help}" in
    "setup")
        print_info "Setting up local development..."
        setup_env
        if check_docker; then
            start_docker
            setup_db
            print_success "Setup complete! Edit .env.local then run: ./dev.sh start"
        else
            print_warning "Docker not available. Install Docker or use local PostgreSQL."
            print_info "After configuring .env.local, run: ./dev.sh db"
        fi
        ;;
    "start")
        start_dev
        ;;
    "docker")
        case "${2:-start}" in
            "start") start_docker ;;
            "stop") stop_docker ;;
            *) echo "Usage: $0 docker [start|stop]" ;;
        esac
        ;;
    "db")
        setup_db
        ;;
    "logs")
        cd "$ROOT_DIR"
        docker compose -f docker-compose.dev.yml logs -f
        ;;
    *)
        cat << EOF
Local Development Manager

Usage: $0 <command>

Commands:
  setup          First-time setup (creates .env.local, starts Docker)
  start          Start development server
  docker start   Start Docker services (PostgreSQL, Redis)
  docker stop    Stop Docker services
  db             Run database migrations
  logs           View Docker service logs

Quick Start:
  1. ./dev.sh setup
  2. Edit .env.local with your API keys
  3. ./dev.sh start

Docker Services:
  - PostgreSQL: localhost:5432
  - Redis: localhost:6379
EOF
        ;;
esac
