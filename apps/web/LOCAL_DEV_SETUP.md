# Local Development Setup Guide

This guide helps you set up a separate local development environment for fast iteration without affecting production.

## 🚨 Problem Solved

Your reset button was showing in production because `NODE_ENV` wasn't properly set. Now it only shows when:
- `NODE_ENV=development` AND
- Database URL contains `localhost` or `inbox_zero_local` OR
- Base URL contains `localhost`

## 🚀 Quick Setup

### 1. Set up local development environment
```bash
cd apps/web
chmod +x scripts/dev.sh
./scripts/dev.sh setup
```

### 2. Edit your local environment
```bash
# Edit the generated .env.local file
nano .env.local
```

**Important changes to make:**
- Update `DATABASE_URL` to use `inbox_zero_local` database
- Add your API keys (Anthropic, OpenAI, etc.)
- Set your email in `ADMINS` for admin access
- Keep `NEXT_PUBLIC_BASE_URL=http://localhost:3000`

### 3. Start local development
```bash
./scripts/dev.sh start
```

## 🔧 Manual Setup (Alternative)

If you prefer manual setup:

### 1. Create local environment file
```bash
cp env.local.template .env.local
```

### 2. Set up local database
```bash
# Start PostgreSQL
brew services start postgresql  # macOS
# or
sudo service postgresql start   # Linux

# Create local database
psql -h localhost -p 5432 -U postgres -d postgres -c "CREATE DATABASE inbox_zero_local;"

# Run migrations
npx prisma migrate deploy
```

### 3. Update .env.local
```bash
# Make sure these are set correctly:
DATABASE_URL="postgresql://postgres:password@localhost:5432/inbox_zero_local"
NEXT_PUBLIC_BASE_URL="http://localhost:3000"
NODE_ENV="development"
```

## 🎯 Environment Management

### Check current environment
```bash
./scripts/dev.sh status
```

### Switch between environments
- **Local Development**: Use `.env.local` with `inbox_zero_local` database
- **Production**: Use `.env.prod` with production database
- **Testing**: Use `.env.test` with test database

### Development Commands
```bash
./scripts/dev.sh setup    # First time setup
./scripts/dev.sh start    # Start dev server
./scripts/dev.sh status   # Check environment
./scripts/dev.sh db       # Setup database only
```

## 🛡️ Safety Features

### Reset Button Protection
The reset button now only appears when:
- Running in local development (`NODE_ENV=development`)
- Connected to local database (`localhost` or `inbox_zero_local`)
- OR you're an admin user

### Environment Isolation
- **Local**: `inbox_zero_local` database
- **Production**: `inboxzero` database (your current)
- **Test**: Separate test database

## 🔍 Troubleshooting

### PostgreSQL not running
```bash
# macOS
brew services start postgresql

# Linux
sudo service postgresql start

# Check if running
pg_isready -h localhost -p 5432
```

### Database connection issues
```bash
# Test connection
psql "postgresql://postgres:password@localhost:5432/inbox_zero_local" -c "SELECT 1;"
```

### Environment not loading
```bash
# Check which env file is being used
echo $NODE_ENV
echo $DATABASE_URL
```

## 📁 File Structure

```
apps/web/
├── .env                    # Your current environment (production)
├── .env.local             # Local development (create this)
├── .env.prod              # Production environment
├── .env.test              # Test environment
├── env.local.template      # Template for local setup
└── scripts/
    ├── dev.sh             # Development environment manager
    └── setup-local-db.sh  # Database setup script
```

## 🎉 Benefits

✅ **Safe Development**: Reset button only works locally  
✅ **Fast Iteration**: Separate local database  
✅ **Easy Switching**: Simple commands to manage environments  
✅ **Production Safety**: No accidental production resets  
✅ **Admin Override**: Admins can still use reset in production if needed  

## 🚀 Next Steps

1. Run `./scripts/dev.sh setup`
2. Edit `.env.local` with your settings
3. Run `./scripts/dev.sh start`
4. Your reset button will now only appear in local development!

The reset button will help you quickly test onboarding flows without affecting your production data.
