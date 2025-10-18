#!/bin/bash

# Local Development Database Setup Script
# This script sets up a local PostgreSQL database for development

set -e

echo "🚀 Setting up local development database..."

# Check if PostgreSQL is installed
if ! command -v psql &> /dev/null; then
    echo "❌ PostgreSQL is not installed. Please install PostgreSQL first."
    echo "   On macOS: brew install postgresql"
    echo "   On Ubuntu: sudo apt-get install postgresql postgresql-contrib"
    exit 1
fi

# Database configuration
DB_NAME="inbox_zero_local"
DB_USER="postgres"
DB_PASSWORD="password"
DB_HOST="localhost"
DB_PORT="5432"

echo "📊 Creating database: $DB_NAME"

# Create database if it doesn't exist
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres -c "CREATE DATABASE $DB_NAME;" 2>/dev/null || echo "Database $DB_NAME already exists"

echo "✅ Database $DB_NAME created successfully"

# Run Prisma migrations
echo "🔄 Running Prisma migrations..."
cd "$(dirname "$0")"
npx prisma migrate deploy

echo "🎉 Local development database setup complete!"
echo ""
echo "Next steps:"
echo "1. Copy env.local.template to .env.local"
echo "2. Update the DATABASE_URL in .env.local if needed"
echo "3. Run 'npm run dev' to start the development server"
echo ""
echo "Database connection:"
echo "  Host: $DB_HOST"
echo "  Port: $DB_PORT"
echo "  Database: $DB_NAME"
echo "  User: $DB_USER"
