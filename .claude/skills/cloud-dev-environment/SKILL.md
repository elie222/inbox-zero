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
1. Start Docker daemon: `sudo dockerd &>/dev/null &` then `sudo chmod 666 /var/run/docker.sock` if not already running (check `docker info`).
2. Start databases: `docker compose -f docker-compose.dev.yml up -d` from repo root.
3. Run Prisma migrations: `cd apps/web && pnpm prisma:migrate:local` (uses `dotenv -e .env.local`; do NOT use bare `prisma migrate dev` — it won't load `.env.local`).
4. Start dev server: `pnpm dev` from repo root.

## Environment file
The app reads `apps/web/.env.local`. Required non-obvious env vars beyond `.env.example` defaults:
- `DEFAULT_LLM_PROVIDER` (e.g. `openai`) — app crashes at startup without this.
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` — hard-required by `env.ts` validation. Use Google emulator credentials for local dev (see below).
- `UPSTASH_REDIS_TOKEN` must be set to `dev_token` to match the `SRH_TOKEN` default in `docker-compose.dev.yml`.
- `MICROSOFT_WEBHOOK_CLIENT_STATE` — required if `MICROSOFT_CLIENT_ID` is set.

## Google emulator for local dev
Use the Google emulator instead of real OAuth credentials:
```
GOOGLE_CLIENT_ID=emulate-google-client.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=emulate-google-secret
GOOGLE_BASE_URL=http://localhost:4002
```
Start the emulator: `docker compose -f docker-compose.dev.yml --profile google-emulator up -d`.

## Testing
- `pnpm test` runs Vitest unit/integration tests (no DB or external services required).
- `pnpm lint` runs Biome. Pre-existing lint warnings/errors in the repo are expected.
- AI tests (`pnpm test-ai`) require a real LLM API key and are skipped by default.

## Docker in this environment
The cloud VM is a Docker-in-Docker setup. Docker requires `fuse-overlayfs` storage driver and `iptables-legacy`. These are configured during initial setup. After snapshot restore, run `sudo dockerd &>/dev/null &` if Docker daemon is not running, then `sudo chmod 666 /var/run/docker.sock`.

The VM may not have the Docker Compose v2 plugin pre-installed. If `docker compose version` fails, install it:
```bash
sudo mkdir -p /usr/local/lib/docker/cli-plugins
sudo curl -SL https://github.com/docker/compose/releases/download/v2.29.2/docker-compose-linux-x86_64 -o /usr/local/lib/docker/cli-plugins/docker-compose
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
```

## Onboarding flow
After a fresh login via the Google emulator, the app forces an onboarding wizard. Some onboarding buttons require JavaScript `click()` calls rather than standard browser clicks (React event delegation quirk in headless/automation contexts).
