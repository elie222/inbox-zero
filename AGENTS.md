# Repository Guidelines

## Build & Test Commands
- Development: `pnpm dev`
- Build: `pnpm build`
- Lint: `pnpm lint`
- Run all tests: `pnpm test`
- Run AI tests: `pnpm test-ai`
- Run single test: `pnpm test __tests__/test-file.test.ts`
- Run specific AI test: `pnpm test-ai ai-categorize-senders`
- Type-check build (skips Prisma migrate): `pnpm --filter inbox-zero-ai exec next build`
- Do not run `dev` or `build` unless explicitly asked
- Before writing or updating tests, review `.claude/skills/testing/SKILL.md`.
- When adding a new workspace package, add its `package.json` COPY line to `docker/Dockerfile.prod` and `docker/Dockerfile.local`.

## Code Style
- TypeScript with strict null checks
- Path aliases: `@/` for imports from project root
- NextJS app router with (app) directory, tailwindcss
- Only add comments for "why", not "what". Prefer self-documenting code.
- Logging: avoid duplicating logger context fields from higher in the call chain. Use `logger.trace()` for PII fields (from, to, subject, etc.).
- Tests should use the real logger implementation (do not mock `@/utils/logger`).
- Helper functions go at the bottom of files, not the top
- All imports at the top of files, no mid-file dynamic imports
- Co-locate test files next to source files (e.g., `utils/example.test.ts`). Only E2E and AI tests go in `__tests__/`.
- Don't export types/interfaces only used within the same file
- No re-export patterns. Import from the original source.
- Infer types from Zod schemas using `z.infer<typeof schema>` instead of duplicating as separate interfaces
- Avoid premature abstraction. Duplicating 2-3 times is fine; extract when a stable pattern emerges.
- No barrel files. Import directly from source files.
- Colocate page components next to their `page.tsx`. No nested `components/` subfolders in route directories.
- Reusable components shared across pages go in `apps/web/components/`
- One resource per API route file
- Env vars: add to `.env.example`, `env.ts`, and `turbo.json`. Prefix client-side with `NEXT_PUBLIC_`.

## Change Philosophy
- Prefer the simplest, most readable change; only keep backwards compatibility when explicitly requested.
- Do not optimize for migration paths: refactor call sites directly, including larger coordinated changes when clarity improves.

## Component Guidelines
- Use shadcn/ui components when available
- Use `LoadingContent` component for async data: `<LoadingContent loading={isLoading} error={error}>{data && <YourComponent data={data} />}</LoadingContent>`

## Fullstack Workflow
See `.claude/skills/fullstack-workflow/SKILL.md` for full examples and templates.

- API route middleware: `withError` (public, no auth), `withAuth` (user-level), `withEmailAccount` (email-account-level). Export response type via `Awaited<ReturnType<typeof getData>>`.
- Mutations: use server actions with `next-safe-action`, NOT POST API routes.
- Validation: Zod schemas in `utils/actions/*.validation.ts`. Infer types with `z.infer`.
- Data fetching: SWR on the client. Call `mutate()` after mutations.
- Forms: React Hook Form + `useAction` hook. Use `getActionErrorMessage(error.error)` for errors.
- Loading states: use `LoadingContent` component.

## Sub-Agent Review Gate
- When a task is completed and ready for PR, invoke the `reviewer` sub-agent before opening the PR.

## Cursor Cloud specific instructions

### Services overview
- **Main app** (`apps/web`): Next.js 16 app (Turbopack). Runs on port 3000.
- **PostgreSQL 16**: Primary database. Runs on port 5432 via `docker-compose.dev.yml`.
- **Redis 7 + serverless-redis-http**: Caching/rate-limiting. Redis on port 6380, HTTP proxy on port 8079.

### Starting services
1. Start Docker daemon: `sudo dockerd` (already running in snapshot).
2. Start databases: `docker compose -f docker-compose.dev.yml up -d` from repo root.
3. Run Prisma migrations: `cd apps/web && pnpm prisma:migrate:local` (uses `dotenv -e .env.local`; do NOT use bare `prisma migrate dev` — it won't load `.env.local`).
4. Start dev server: `pnpm dev` from repo root.

### Environment file
The app reads `apps/web/.env.local`. Required non-obvious env vars beyond `.env.example` defaults:
- `DEFAULT_LLM_PROVIDER` (e.g. `openai`) — app crashes at startup without this.
- `MICROSOFT_WEBHOOK_CLIENT_STATE` — required if `MICROSOFT_CLIENT_ID` is set.
- `UPSTASH_REDIS_TOKEN` must match the `SRH_TOKEN` in `docker-compose.dev.yml` (default: `dev_token`).

### Testing
- `pnpm test` runs Vitest unit/integration tests (no DB or external services required).
- `pnpm lint` runs Biome. Pre-existing lint warnings/errors in the repo are expected.
- AI tests (`pnpm test-ai`) require a real LLM API key and are skipped by default.

### Docker in this environment
The cloud VM is a Docker-in-Docker setup. Docker requires `fuse-overlayfs` storage driver and `iptables-legacy`. These are configured during initial setup. After snapshot restore, run `sudo dockerd &>/dev/null &` if Docker daemon is not running, then `sudo chmod 666 /var/run/docker.sock`.
