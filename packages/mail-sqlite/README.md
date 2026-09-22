# @inboxzero/mail-sqlite

Shared mailbox SQL schema, parameterized queries, and transactional store
operations. Portable entry points do not import platform-native driver
packages. Node tests and the desktop host use `@inboxzero/mail-sqlite/node`.

The regular suite includes a 10k-conversation regression. Larger ingestion/query
checks are opt-in: `SCALE_TESTS=1 pnpm -F @inboxzero/mail-sqlite test src/store.test.ts`.
For isolated SQL query timings, run
`pnpm exec tsx packages/mail-sqlite/scripts/benchmark-queries.ts` from the repository root.
