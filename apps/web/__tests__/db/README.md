# Database tests

Tests that run against a real Postgres instead of a mocked Prisma client.

Use this tier when the behaviour under test *is* the database: unique
constraints, conditional `updateMany` count guards, `onDelete` behaviour,
partial-index semantics. A mocked Prisma can only confirm that the mock matches
your mental model of Postgres, which is exactly the assumption these bugs hide
in.

Everything else belongs in a unit test (mocked) or an integration test
(emulator-backed). See `.claude/skills/testing/`.

## Running

These are skipped unless `RUN_DB_TESTS` is set, so they stay out of the default
suite and out of CI until someone wires up a Postgres service.

```bash
# One-time: create a throwaway database and apply migrations
createdb inboxzero_test
DATABASE_URL="postgresql://postgres:password@localhost:5432/inboxzero_test?schema=public" \
DIRECT_URL="postgresql://postgres:password@localhost:5432/inboxzero_test?schema=public" \
  pnpm exec prisma migrate deploy

# Run
DATABASE_URL="postgresql://postgres:password@localhost:5432/inboxzero_test?schema=public" \
  pnpm test-db
```

Point `DATABASE_URL` at a throwaway database. These tests delete rows in
`beforeEach`, so never aim them at a database you care about.

## Conventions

- Seed the rows the test needs in `beforeEach` and delete them again, rather
  than relying on a shared fixture. Each test should be able to run alone.
- Mock the outside world (bot providers, calendar APIs, queues) and leave the
  database real. `fake-bot-provider.ts` is the in-memory `MeetingBotProvider`.
- Assert on rows read back from the database, not on mock calls, wherever the
  point of the test is a persisted state transition.
