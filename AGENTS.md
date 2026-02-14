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
