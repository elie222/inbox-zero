# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## CRITICAL — do not run locally

**Never run `tsc`, `pnpm exec tsc`, `pnpm build`, or any full typecheck on the user's Windows machine.** They lock up the system. This includes scoped variants like `pnpm exec tsc --noEmit -p tsconfig.json` and `pnpm --filter inbox-zero-ai build:ci`. If you need to verify types, push and let CI run it, or ask the user to run it on a different machine. Reading errors from the editor / LSP `diagnostics` is fine; spawning a typecheck process is not.

`pnpm dev` and `pnpm build` are also not to be run unless the user explicitly asks (per AGENTS.md).

## Fork context

This is a self-hosted fork of [Inbox Zero](https://github.com/elie222/inbox-zero) running on AWS EC2 for a single user (rebekah@trueocean.com). The production server is at inbox.tdfurn.com. Signups are locked via `AUTH_ALLOWED_EMAIL_DOMAINS`. All secrets are stored in AWS Parameter Store under `/inbox-zero/` and loaded to `/opt/inbox-zero/.env` at boot via `deploy/load-secrets.sh`. The running image is `ghcr.io/rebekah-create/inbox-zero-rebekah:latest`, built by `.github/workflows/docker-build.yml` on every push to `main`.

## Commands

Run from the repo root unless noted.

```bash
pnpm dev              # start Next.js (turbopack) + worker
pnpm build            # build web app (runs prisma migrate deploy first)
pnpm test             # vitest unit tests (non-AI)
pnpm lint             # Biome linter across all workspaces
pnpm worker           # start BullMQ worker standalone

# From apps/web:
pnpm test -- path/to/file.test.ts        # single test file
pnpm test -- --grep "pattern"            # filter by name
pnpm test-ai                             # AI tests (slow, requires RUN_AI_TESTS=true)
pnpm test-integration                    # integration tests (requires live DB)
```

Linter is Biome (not ESLint). Run `pnpm lint` to check; Biome also formats.

Prisma commands run from `apps/web`:
```bash
pnpm prisma migrate dev    # create + apply a new migration
pnpm prisma generate       # regenerate client after schema changes
pnpm prisma studio         # GUI for the database
```

## Monorepo structure

```
apps/web          — main Next.js 16 app (App Router). All business logic lives here.
apps/worker       — BullMQ worker. Polls Redis, forwards jobs as HTTP POSTs to apps/web internal endpoints.
packages/resend   — React Email templates for digest/summary emails.
packages/tinybird — Analytics event tracking.
```

`apps/image-proxy*` and `packages/loops` are upstream SaaS concerns not used in this self-hosted fork.

## Key architectural flows

### Gmail webhook → rule execution
```
Google Pub/Sub → POST /api/google/webhook
  → verify token (GOOGLE_PUBSUB_VERIFICATION_TOKEN)
  → fetch message via Gmail API
  → utils/ai/choose-rule.ts  — LLM picks matching Rule
  → utils/ai/actions.ts      — LLM fills in action parameters
  → execute: label / archive / draft / reply / forward
  → write ExecutedRule + ExecutedAction to DB
  → queue delayed/scheduled actions via BullMQ
```

### Digest email
```
Cron → POST /api/cron/digest (Bearer CRON_SECRET)
  → query DigestItem records grouped by Rule
  → fetch message details from Gmail
  → render via packages/resend/emails/ (React Email)
  → send via Resend (from: RESEND_FROM_EMAIL)
  → mark Digest records as SENT
```

### Rule evaluation
Rules can be fully AI-evaluated (LLM reads the email, decides if conditions match) or static (regex/string match on from/to/subject/body). Both types use the same `Rule` → `Action` schema. `utils/rule/rule.ts` handles CRUD; `utils/ai/choose-rule.ts` handles LLM evaluation at runtime.

### Background jobs
The worker (`apps/worker`) is a separate process that reads BullMQ queues and POSTs jobs to `INTERNAL_API_URL` (defaults to `http://localhost:3000`). Queue endpoints live under `apps/web/app/api/` (e.g. `/api/resend/digest/queue`). In production, Upstash QStash can substitute for BullMQ — controlled by `QSTASH_TOKEN`.

## Auth

The app uses **Better Auth** (not NextAuth, despite `NEXTAUTH_SECRET` env var name which is kept for backwards compat). Config is in `apps/web/utils/auth.ts`. OAuth providers: Google, Microsoft. Signup restriction: `AUTH_ALLOWED_EMAILS` (comma-separated) or `AUTH_ALLOWED_EMAIL_DOMAINS`.

## Data model essentials

- `User` → `EmailAccount` (1:many — one user can connect multiple email accounts)
- `EmailAccount` → `Rule` → `Action` (rules belong to an account, each rule has ordered actions)
- `ExecutedRule` → `ExecutedAction` — immutable audit trail of everything the AI did
- `Schedule` — when to send digest emails (days of week bitmask, time of day)
- `Digest` / `DigestItem` — aggregated content waiting to be emailed; items are redacted after send
- `ThreadTracker` — tracks emails needing a reply or awaiting one (powers the weekly summary email)
- `Group` / `GroupItem` — learned sender patterns (e.g. "all @amazon.com emails go to Receipts")
- `Newsletter` — senders identified as newsletters/marketing

## LLM provider

`DEFAULT_LLM_PROVIDER=anthropic` in this fork. Model tiers are configured via env vars:
- `DEFAULT_LLM_*` — primary model (claude-sonnet-4-6)
- `ECONOMY_LLM_*` — cheaper model for bulk/less critical tasks
- `NANO_LLM_*` — cheapest, for high-voltage low-stakes tasks

**Important:** Do not run bulk email processing through the Inbox Zero UI — it processes emails through the LLM and costs ~$1.50/minute on a large backlog. Use Gmail search operators directly for bulk operations.

## Cron authentication

All cron endpoints (`/api/cron/*`, `/api/watch/*`) require `Authorization: Bearer <CRON_SECRET>`. Do not use `x-api-key` — that was the old pattern.

## Environment variables

Schema with all defaults is in `apps/web/env.ts` (Zod). Required at build time: `DATABASE_URL`, `AUTH_SECRET`/`NEXTAUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_PUBSUB_TOPIC_NAME`, `EMAIL_ENCRYPT_SECRET`, `EMAIL_ENCRYPT_SALT`, `DEFAULT_LLM_PROVIDER`, `INTERNAL_API_KEY`.

`EMAIL_ENCRYPT_SECRET` and `EMAIL_ENCRYPT_SALT` **must never be rotated** after initial setup — they encrypt stored OAuth tokens in the DB. Rotating them without a migration breaks all connected accounts.

## Production deployment

Push to `main` → GitHub Actions builds `linux/arm64 + linux/amd64` image → pushes to `ghcr.io/rebekah-create/inbox-zero-rebekah:latest` (tagged `latest` + short SHA). To deploy: `docker compose pull app && docker compose up -d app` on the server. The `deploy/` directory contains the systemd service, secret-loading script, and full rebuild runbook.

## GSD Workflow

This project uses [GSD](https://github.com/get-shit-done-cc/gsd) for planning and execution.

**Planning artifacts live in `.planning/`:**
- `PROJECT.md` — vision, requirements summary, key decisions
- `REQUIREMENTS.md` — 42 v1 requirements with REQ-IDs across 7 categories
- `ROADMAP.md` — 7 phases from Ops Fixes → Backlog Triage
- `STATE.md` — current project position and session context

**Phase sequence:**
1. Ops Fixes (OPS-01–04) — fix broken digest sender, lock signups, CI/CD
2. Inbox Zero Recon (RECON-01–06) — audit fork before building on it
3. Classification Engine (CLASS-01–08) — three-tier rules → Haiku → Sonnet
4. Daily Digest (DIGEST-01–07) — 6-7am email with feedback links
5. Rules Management UI (RULES-01–06) — inbox.tdfurn.com/rules
6. Feedback System (FEEDBACK-01–06) — signals feeding back into classification
7. Backlog Triage (BACKLOG-01–05) — 100k email backlog with batch approval

**Core constraint:** AI cost ≤ $10/mo additional. Three-tier architecture is non-negotiable — rules (free) → Haiku (~$1-2/mo) → Sonnet sparingly (digest narrative + true escalations only).

**To continue work:**
```bash
/gsd-progress          # see where you are
/gsd-plan-phase 1      # plan Phase 1 in detail
/gsd-discuss-phase N   # clarify approach before planning
```
