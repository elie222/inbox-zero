# Server Action Clients

Three safe-action clients in `utils/actions/safe-action.ts`:

| Client | Context | Use when |
|--------|---------|----------|
| `actionClientUser` | `ctx.userId` | Only need authenticated user (e.g., updating user settings) |
| `actionClient` | `ctx.emailAccountId`, `ctx.userId` | Need user + email account (most mutations) |
| `adminActionClient` | `ctx.userId` | Admin-only actions |

`actionClient` requires `emailAccountId` to be bound from the client side.

## File structure

- Validation: `utils/actions/NAME.validation.ts` — Zod schemas + inferred types
- Actions: `utils/actions/NAME.ts` — starts with `"use server"`

## Key rules

- Mutations only — never use server actions for data fetching
- Always use `.metadata({ name: "actionName" })` for Sentry instrumentation
- Use `SafeError` for expected/handled errors
- Cache invalidation: use `revalidatePath`/`revalidateTag` if the mutation affects displayed data
