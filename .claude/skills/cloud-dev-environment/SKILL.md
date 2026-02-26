---
name: cloud-dev-environment
description: Cursor Cloud VM setup and service startup instructions for local development
---
# Cloud Development Environment

## Services overview
- **Main app** (`apps/web`): Next.js 16 app (Turbopack). Runs on port 3000.
- **PostgreSQL 16**: Primary database. Runs on port 5432 via `docker-compose.dev.yml`.
- **Redis 7 + serverless-redis-http**: Caching/rate-limiting. Redis on port 6380, HTTP proxy on port 8079.

## Starting services
1. Start Docker daemon: `sudo dockerd` (already running in snapshot).
2. Start databases: `docker compose -f docker-compose.dev.yml up -d` from repo root.
3. Run Prisma migrations: `cd apps/web && pnpm prisma:migrate:local` (uses `dotenv -e .env.local`; do NOT use bare `prisma migrate dev` — it won't load `.env.local`).
4. Start dev server: `pnpm dev` from repo root.

## Environment file
The app reads `apps/web/.env.local`. Required non-obvious env vars beyond `.env.example` defaults:
- `DEFAULT_LLM_PROVIDER` (e.g. `openai`) — app crashes at startup without this.
- `MICROSOFT_WEBHOOK_CLIENT_STATE` — required if `MICROSOFT_CLIENT_ID` is set.
- `UPSTASH_REDIS_TOKEN` must match the `SRH_TOKEN` in `docker-compose.dev.yml` (default: `dev_token`).

## Testing
- `pnpm test` runs Vitest unit/integration tests (no DB or external services required).
- `pnpm lint` runs Biome. Pre-existing lint warnings/errors in the repo are expected.
- AI tests (`pnpm test-ai`) require a real LLM API key and are skipped by default.

## Docker in this environment
The cloud VM is a Docker-in-Docker setup. Docker requires `fuse-overlayfs` storage driver and `iptables-legacy`. These are configured during initial setup. After snapshot restore, run `sudo dockerd &>/dev/null &` if Docker daemon is not running, then `sudo chmod 666 /var/run/docker.sock`.
