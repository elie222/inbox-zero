#!/bin/bash

# Docker + Local Development Environment Manager
# This script manages Docker services (Redis, DB) and runs the web app locally

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_DIR="$(dirname "$SCRIPT_DIR")"
ROOT_DIR="$(dirname "$(dirname "$(dirname "$SCRIPT_DIR")")")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_docker() {
    echo -e "${PURPLE}🐳 $1${NC}"
}

# Function to check if Docker is running
check_docker() {
    if ! docker info >/dev/null 2>&1; then
        print_error "Docker is not running. Please start Docker Desktop first."
        exit 1
    fi
}

# Function to check if Docker Compose file exists
check_compose_file() {
    if [ ! -f "$ROOT_DIR/docker-compose.dev.yml" ]; then
        print_error "docker-compose.dev.yml not found in project root"
        exit 1
    fi
}

# Function to start Docker services
start_docker_services() {
    print_docker "Starting Docker services (Redis, PostgreSQL)..."
    
    check_docker
    check_compose_file
    
    cd "$ROOT_DIR"
    
    # Start services in detached mode
    docker compose -f docker-compose.dev.yml up -d
    
    # Wait for services to be healthy
    print_info "Waiting for services to be ready..."
    
    # Wait for PostgreSQL
    print_info "Waiting for PostgreSQL..."
    for i in {1..30}; do
        if docker exec inbox-zero-dev-db pg_isready -U postgres -d inboxzero >/dev/null 2>&1; then
            break
        fi
        sleep 2
    done
    
    # Wait for Redis
    print_info "Waiting for Redis..."
    for i in {1..15}; do
        if docker exec inbox-zero-dev-redis redis-cli ping | grep -q PONG 2>/dev/null; then
            break
        fi
        sleep 2
    done
    
    print_status "Docker services are ready!"
    echo ""
    print_info "Services running:"
    echo "  📊 PostgreSQL: localhost:5432"
    echo "  🔴 Redis: localhost:6379"
    echo "  🌐 Redis HTTP: localhost:8079"
}

# Function to stop Docker services
stop_docker_services() {
    print_docker "Stopping Docker services..."
    
    cd "$ROOT_DIR"
    docker compose -f docker-compose.dev.yml down
    
    print_status "Docker services stopped"
}

# Function to restart Docker services
restart_docker_services() {
    print_docker "Restarting Docker services..."
    stop_docker_services
    sleep 2
    start_docker_services
}

# Function to show Docker services status
show_docker_status() {
    print_docker "Docker Services Status:"
    echo ""
    
    cd "$ROOT_DIR"
    docker compose -f docker-compose.dev.yml ps
    echo ""
    
    # Check if services are healthy
    if docker exec inbox-zero-dev-db pg_isready -U postgres -d inboxzero >/dev/null 2>&1; then
        print_status "PostgreSQL is healthy"
    else
        print_warning "PostgreSQL is not responding"
    fi
    
    if docker exec inbox-zero-dev-redis redis-cli ping | grep -q PONG 2>/dev/null; then
        print_status "Redis is healthy"
    else
        print_warning "Redis is not responding"
    fi
}

# Function to setup local environment
setup_local_env() {
    print_info "Setting up local development environment..."
    
    if [ -f "$WEB_DIR/.env.local" ]; then
        print_warning ".env.local already exists. Backing up to .env.local.backup"
        cp "$WEB_DIR/.env.local" "$WEB_DIR/.env.local.backup"
    fi
    
    # Copy template
    cp "$WEB_DIR/env.local.template" "$WEB_DIR/.env.local"
    
    print_status "Created .env.local from template"
    print_info "Please edit .env.local with your local settings:"
    echo "  - Add your API keys (Anthropic, OpenAI, etc.)"
    echo "  - Set your admin email in ADMINS"
    echo "  - Update any other settings as needed"
}

# Function to setup database
setup_database() {
    print_info "Setting up database..."
    
    # Ensure Docker services are running
    if ! docker exec inbox-zero-dev-db pg_isready -U postgres -d inboxzero >/dev/null 2>&1; then
        print_warning "Docker services not running. Starting them first..."
        start_docker_services
    fi
    
    # Run Prisma migrations
    print_info "Running Prisma migrations..."
    cd "$WEB_DIR"
    npx prisma migrate deploy
    
    print_status "Database setup complete!"
}

# Function to start web development server
start_web_dev() {
    print_info "Starting web development server..."
    
    # Check if .env.local exists
    if [ ! -f "$WEB_DIR/.env.local" ]; then
        print_error ".env.local not found. Run 'dev setup' first."
        exit 1
    fi
    
    # Check if Docker services are running
    if ! docker exec inbox-zero-dev-db pg_isready -U postgres -d inboxzero >/dev/null 2>&1; then
        print_warning "Docker services not running. Starting them first..."
        start_docker_services
    fi
    
    # Set NODE_ENV to development
    export NODE_ENV=development
    
    print_status "Starting Next.js development server..."
    echo ""
    print_info "🌐 Web app will be available at: http://localhost:3000"
    print_info "📊 Database: localhost:5432"
    print_info "🔴 Redis: localhost:6379"
    echo ""
    
    cd "$WEB_DIR"
    npm run dev
}

# Function to show overall status
show_status() {
    print_info "Development Environment Status:"
    echo ""
    echo "NODE_ENV: ${NODE_ENV:-'not set'}"
    echo "Current directory: $(pwd)"
    echo ""
    
    if [ -f "$WEB_DIR/.env.local" ]; then
        print_status ".env.local exists"
        echo "Database URL: $(grep DATABASE_URL "$WEB_DIR/.env.local" | head -1)"
    else
        print_warning ".env.local not found"
    fi
    
    echo ""
    show_docker_status
}

# Function to clean up everything
cleanup() {
    print_info "Cleaning up development environment..."
    
    stop_docker_services
    
    # Remove volumes if requested
    if [ "$1" = "--volumes" ]; then
        print_warning "Removing Docker volumes (this will delete all data)..."
        cd "$ROOT_DIR"
        docker compose -f docker-compose.dev.yml down -v
        print_status "Volumes removed"
    fi
    
    print_status "Cleanup complete"
}

# Function to show logs
show_logs() {
    print_docker "Showing Docker services logs..."
    cd "$ROOT_DIR"
    docker compose -f docker-compose.dev.yml logs -f
}

# Main command handling
case "${1:-help}" in
    "start")
        start_docker_services
        start_web_dev
        ;;
    "services")
        case "${2:-start}" in
            "start")
                start_docker_services
                ;;
            "stop")
                stop_docker_services
                ;;
            "restart")
                restart_docker_services
                ;;
            "status")
                show_docker_status
                ;;
            *)
                echo "Usage: $0 services [start|stop|restart|status]"
                ;;
        esac
        ;;
    "web")
        start_web_dev
        ;;
    "setup")
        print_info "Setting up complete development environment..."
        setup_local_env
        start_docker_services
        setup_database
        print_status "Development environment ready!"
        echo ""
        print_info "Next steps:"
        echo "1. Edit .env.local with your settings"
        echo "2. Run 'dev start' to start everything"
        echo "3. Or run 'dev web' to start just the web app"
        ;;
    "db")
        setup_database
        ;;
    "status")
        show_status
        ;;
    "logs")
        show_logs
        ;;
    "cleanup")
        cleanup "$2"
        ;;
    "help"|*)
        echo "Docker + Local Development Environment Manager"
        echo ""
        echo "Usage: $0 <command> [options]"
        echo ""
        echo "Commands:"
        echo "  start                    - Start Docker services and web app"
        echo "  services [cmd]          - Manage Docker services (start|stop|restart|status)"
        echo "  web                     - Start only the web app (assumes services are running)"
        echo "  setup                   - Complete first-time setup"
        echo "  db                      - Setup database only"
        echo "  status                  - Show current environment status"
        echo "  logs                    - Show Docker services logs"
        echo "  cleanup [--volumes]     - Stop services and optionally remove volumes"
        echo "  help                    - Show this help message"
        echo ""
        echo "Examples:"
        echo "  $0 setup               # First time setup"
        echo "  $0 start               # Start everything"
        echo "  $0 services start      # Start only Docker services"
        echo "  $0 web                 # Start only web app"
        echo "  $0 services status     # Check Docker services"
        echo "  $0 logs                # View Docker logs"
        echo "  $0 cleanup --volumes   # Clean everything including data"
        echo ""
        echo "Workflow:"
        echo "  1. Run 'dev setup' for first-time setup"
        echo "  2. Edit .env.local with your API keys"
        echo "  3. Run 'dev start' to start everything"
        echo "  4. Or run 'dev services start' then 'dev web' in separate terminals"
        ;;
esac
