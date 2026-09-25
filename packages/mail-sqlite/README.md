# @inboxzero/mail-sqlite

Shared mailbox SQL schema, parameterized queries, and transactional store.
Portable entry points do not import a platform driver. Node tests and the
desktop host use `@inboxzero/mail-sqlite/node`.

`SqliteDriver` in `./driver` is the interface those hosts implement.
`runSqliteDriverContract` checks commit, rollback, serialized writes,
transactional reads, blobs, savepoints, and close/reopen. It does not import
`node:sqlite`. Savepoints and `json_each` are required. If FTS5 is missing,
mailbox coverage reports `indexedContent: "not_requested"`. The search index is
a contentless FTS5 table (`contentless_delete`, SQLite 3.43+) that keeps no copy
of message text; `message_fts_keys` maps its rowids back to messages.

Message bodies are stored as raw-deflate BLOBs behind a one-byte format marker,
and HTML messages keep no separate text part. `MessageBodyCodec` is supplied
per runtime: the Compression Streams API by default, `nodeBodyCodec` (zlib) on
Node hosts. Bodies written before compression are converted in batched
transactions when the store opens (migration 0008).

`@inboxzero/mail-sqlite/node` and `@inboxzero/mail-sqlite/blob-store` use Node
file APIs.

The regular suite includes a 10k-conversation regression. Larger ingestion/query
checks are opt-in: `SCALE_TESTS=1 pnpm -F @inboxzero/mail-sqlite test src/store.test.ts`.
For isolated SQL query timings, run
`pnpm exec tsx packages/mail-sqlite/scripts/benchmark-queries.ts` from the repository root.
`packages/mail-sqlite/scripts/benchmark-body-compression.ts` measures body
storage, backfill batches, and conversation reads on a synthetic mailbox.
