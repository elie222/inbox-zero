# Disposable Redis regression tests

These opt-in tests execute the local mail quota Lua against an isolated `redis:7` Docker container. They do not use configured Redis URLs, credentials, or existing containers. The suite creates a uniquely named container without a published port and removes it in teardown.

Requirements: Docker running and `pnpm install` completed.

From the repository root:

```sh
RUN_INTEGRATION_TESTS=true pnpm --filter inbox-zero-ai exec vitest --run __tests__/redis/local-mail-sync-budget.test.ts
```

Run Vitest through the app filter directly: the root Turbo test task does not forward this opt-in flag. Normal unit runs skip these tests, and the emulator integration suite remains independent of Docker.

Coverage includes atomic token denial, reserved current-work headroom, app-level capacity, Redis-time refill, adaptive recovery, account/app concurrency, owned lease release, and persisted provider Retry-After read by another caller. Only the Redis transport is replaced; production Lua and shared cooldown parsing execute unchanged.

If the test runner is forcibly terminated before teardown, remove only the container named `local-mail-budget-test-<UUID>` printed by Docker inspection for that run.
