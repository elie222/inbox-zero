# @inboxzero/mail-sqlite

Shared mailbox SQL schema, parameterized queries, and transactional store.
Portable entry points do not import a platform driver. Node tests and the
desktop host use `@inboxzero/mail-sqlite/node`.

`SqliteDriver` in `./driver` is the interface those hosts implement.
`runSqliteDriverContract` checks commit, rollback, serialized writes,
transactional reads, blobs, savepoints, and close/reopen. It does not import
`node:sqlite`. Savepoints and `json_each` are required. If FTS5 is missing,
mailbox coverage reports `indexedContent: "not_requested"`.

`@inboxzero/mail-sqlite/node` and `@inboxzero/mail-sqlite/blob-store` use Node
file APIs.

The regular suite includes a 10k-conversation regression. Larger ingestion/query
checks are opt-in: `SCALE_TESTS=1 pnpm -F @inboxzero/mail-sqlite test src/store.test.ts`.
For isolated SQL query timings, run
`pnpm exec tsx packages/mail-sqlite/scripts/benchmark-queries.ts` from the repository root.
