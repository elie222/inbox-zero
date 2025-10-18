# Local Development Setup

Quick guide to get started with local development using Docker.

## Quick Start

```bash
cd apps/web
chmod +x scripts/dev.sh
./scripts/dev.sh setup
```

This creates `.env.local` and starts Docker services (PostgreSQL + Redis).

## Edit Configuration

Open `.env.local` and add:
- Your API keys (Anthropic, OpenAI, Google)
- Your email in `ADMINS` for admin access
- OAuth credentials if testing auth flows

## Start Development

```bash
./scripts/dev.sh start
```

App runs at: http://localhost:3000

## Commands

```bash
./scripts/dev.sh setup         # First-time setup
./scripts/dev.sh start         # Start dev server
./scripts/dev.sh docker start  # Start Docker services only
./scripts/dev.sh docker stop   # Stop Docker services
./scripts/dev.sh db            # Run migrations
./scripts/dev.sh logs          # View Docker logs
```

## Docker Services

- **PostgreSQL**: `localhost:5432` (database: `inboxzero`)
- **Redis**: `localhost:6379`
- **Redis HTTP**: `localhost:8079` (Upstash-compatible)

## Without Docker

If you prefer local PostgreSQL:

1. Start PostgreSQL locally
2. Create database: `createdb inboxzero`
3. Update `DATABASE_URL` in `.env.local`
4. Run: `./scripts/dev.sh db`
5. Run: `./scripts/dev.sh start`

## Troubleshooting

**Docker not starting?**
```bash
docker info  # Check Docker is running
./scripts/dev.sh logs  # View service logs
```

**Database issues?**
```bash
docker exec inbox-zero-dev-db pg_isready -U postgres -d inboxzero
```

**Reset everything:**
```bash
./scripts/dev.sh docker stop
docker compose -f docker-compose.dev.yml down -v  # Remove volumes
./scripts/dev.sh setup  # Start fresh
```

## Files

- `apps/web/.env.local` - Your local config (git-ignored)
- `apps/web/env.local.template` - Template with defaults
- `docker-compose.dev.yml` - Docker services definition
- `apps/web/scripts/dev.sh` - Development helper script

