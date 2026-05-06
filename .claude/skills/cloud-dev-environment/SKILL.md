---
name: cloud-dev-environment
description: Cursor Cloud VM setup and service startup instructions for local development
---
# Cloud Development Environment

Instructions for **Cursor Cloud agents** bringing up Postgres/Redis and the app in a disposable dev VM. They are not production hardening: a pinned Compose binary from GitHub is enough (same trust boundary as other `curl`/package installs in setup).

## Services overview
- **Main app** (`apps/web`): Next.js 16 app (Turbopack). Runs on port 3000.
- **PostgreSQL 16**: Primary database. Runs on port 5432 via `docker-compose.dev.yml`.
- **Redis 7 + serverless-redis-http**: Caching/rate-limiting. Redis on port 6380, HTTP proxy on port 8079.

## Starting services
Run these in order; each step must succeed before the next (commands are from repo root unless noted).

1. **Docker daemon is up**: `sudo docker info` must print a **Server** section (not only `Client:` followed by “Cannot connect to the Docker daemon”). If it cannot connect, run `sudo dockerd &>/dev/null &`, wait a few seconds, run `sudo docker info` again until it succeeds.
2. **Your user can talk to Docker**: `docker ps` must exit **0** (same user you use for `pnpm`). If you get “permission denied” on `/var/run/docker.sock`, do **not** use `chmod 666`. Prefer: `sudo apt-get update && sudo apt-get install -y acl` then `sudo setfacl -m "u:$(whoami):rw" /var/run/docker.sock`, then `docker ps` again. If ACLs are not an option, use `sudo docker compose ...` for Compose commands below instead of widening the socket to everyone.
3. **Compose v2 is available**: `docker compose version` must print a version. If the command is missing, install the plugin (see **Docker in this environment** below), then re-run `docker compose version`.
4. **Databases**: `docker compose -f docker-compose.dev.yml up -d` must exit **0**.
5. **Prisma**: `cd apps/web && pnpm prisma:migrate:local` (uses `dotenv -e .env.local`; do NOT use bare `prisma migrate dev` — it won't load `.env.local`).
6. **App**: `pnpm dev` from repo root.

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
The cloud VM is a Docker-in-Docker setup. Docker requires `fuse-overlayfs` storage driver and `iptables-legacy`. These are configured during initial setup. After snapshot restore, run `sudo dockerd &>/dev/null &` if Docker daemon is not running. If your user cannot access `/var/run/docker.sock`, use `sudo setfacl -m "u:$(whoami):rw" /var/run/docker.sock` as above—not a world-writable socket.

The VM may not have the Docker Compose v2 plugin pre-installed. If `docker compose version` does not work, install a **pinned** release (bump the version when you intentionally upgrade):
```bash
COMPOSE_VERSION=v2.29.2
TMP="$(mktemp)"
curl -fsSL "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-x86_64" -o "$TMP"
sudo mkdir -p /usr/local/lib/docker/cli-plugins
sudo install -m 0755 "$TMP" /usr/local/lib/docker/cli-plugins/docker-compose
rm -f "$TMP"
```

## Onboarding flow
After a fresh login via the Google emulator, the app forces an onboarding wizard. Some onboarding buttons require JavaScript `click()` calls rather than standard browser clicks (React event delegation quirk in headless/automation contexts).
