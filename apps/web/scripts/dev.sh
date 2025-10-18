#!/bin/bash

# Development Environment Manager
# This script helps you switch between different development environments
# 
# For Docker-based development, use dev-docker.sh instead

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_DIR="$(dirname "$SCRIPT_DIR")"

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

# Function to check if PostgreSQL is running
check_postgres() {
    if ! pg_isready -h localhost -p 5432 >/dev/null 2>&1; then
        print_error "PostgreSQL is not running. Please start it first:"
        echo "  brew services start postgresql  # macOS"
        echo "  sudo service postgresql start  # Linux"
        echo ""
        print_info "Or use Docker-based development:"
        echo "  ./scripts/dev-docker.sh setup"
        return 1
    fi
    return 0
}

# Function to setup local database
setup_local_db() {
    print_info "Setting up local development database..."
    
    if ! check_postgres; then
        exit 1
    fi
    
    DB_NAME="inbox_zero_local"
    DB_USER="postgres"
    DB_PASSWORD="password"
    DB_HOST="localhost"
    DB_PORT="5432"
    
    # Create database if it doesn't exist
    psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres -c "CREATE DATABASE $DB_NAME;" 2>/dev/null || print_warning "Database $DB_NAME already exists"
    
    print_status "Database $DB_NAME ready"
    
    # Run Prisma migrations
    print_info "Running Prisma migrations..."
    cd "$WEB_DIR"
    npx prisma migrate deploy
    
    print_status "Local database setup complete!"
}

# Function to create local environment file
create_local_env() {
    print_info "Creating local environment configuration..."
    
    if [ -f "$WEB_DIR/.env.local" ]; then
        print_warning ".env.local already exists. Backing up to .env.local.backup"
        cp "$WEB_DIR/.env.local" "$WEB_DIR/.env.local.backup"
    fi
    
    # Copy template
    cp "$WEB_DIR/env.local.template" "$WEB_DIR/.env.local"
    
    print_status "Created .env.local from template"
    print_info "Please edit .env.local with your local settings:"
    echo "  - Update DATABASE_URL to use inbox_zero_local"
    echo "  - Add your API keys"
    echo "  - Set your admin email"
}

# Function to start local development
start_local_dev() {
    print_info "Starting local development environment..."
    
    # Check if .env.local exists
    if [ ! -f "$WEB_DIR/.env.local" ]; then
        print_error ".env.local not found. Run 'dev local setup' first."
        exit 1
    fi
    
    # Check database connection
    if ! check_postgres; then
        exit 1
    fi
    
    # Set NODE_ENV to development
    export NODE_ENV=development
    
    print_status "Starting development server..."
    cd "$WEB_DIR"
    npm run dev
}

# Function to show current environment status
show_status() {
    print_info "Current Environment Status:"
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
    if check_postgres; then
        print_status "PostgreSQL is running"
    else
        print_error "PostgreSQL is not running"
    fi
}

# Main command handling
case "${1:-help}" in
    "setup")
        print_info "Setting up local development environment..."
        create_local_env
        setup_local_db
        print_status "Local development environment ready!"
        echo ""
        print_info "Next steps:"
        echo "1. Edit .env.local with your settings"
        echo "2. Run 'dev start' to start development server"
        echo ""
        print_info "💡 For Docker-based development, use:"
        echo "  ./scripts/dev-docker.sh setup"
        ;;
    "start")
        start_local_dev
        ;;
    "status")
        show_status
        ;;
    "db")
        setup_local_db
        ;;
    "help"|*)
        echo "Development Environment Manager"
        echo ""
        echo "Usage: $0 <command>"
        echo ""
        echo "Commands:"
        echo "  setup    - Set up local development environment"
        echo "  start    - Start local development server"
        echo "  status   - Show current environment status"
        echo "  db       - Set up local database only"
        echo "  help     - Show this help message"
        echo ""
        echo "Examples:"
        echo "  $0 setup     # First time setup"
        echo "  $0 start     # Start development server"
        echo "  $0 status    # Check current environment"
        echo ""
        echo "💡 For Docker-based development (recommended):"
        echo "  ./scripts/dev-docker.sh setup"
        echo "  ./scripts/dev-docker.sh start"
        ;;
esac
