# @inboxzero/mail-sqlite

Shared mailbox SQL schema, parameterized queries, and transactional store
operations. Portable entry points do not import platform-native driver
packages. Node tests and the desktop host use `@inboxzero/mail-sqlite/node`.

## Native driver

Implement `SqliteDriver` from `@inboxzero/mail-sqlite/driver` and prove it with
`runSqliteDriverContract` from `@inboxzero/mail-sqlite/test-support/driver-contract`.
That harness does not import `node:sqlite`. Savepoints and `json_each` are
required. If FTS5 is missing, mailbox coverage reports
`indexedContent: "not_requested"` instead of claiming complete search.

```ts
import { createSqliteMailStore } from "@inboxzero/mail-sqlite/store";
import { runSqliteDriverContract } from "@inboxzero/mail-sqlite/test-support/driver-contract";

await runSqliteDriverContract({ open: () => openExpoDriver(path) });
const store = await createSqliteMailStore(driver, { runtime: hostCrypto });
```

`@inboxzero/mail-sqlite/node` and `@inboxzero/mail-sqlite/blob-store` are Node
file helpers. Do not import them from React Native.

The regular suite includes a 10k-conversation regression. Larger ingestion/query
checks are opt-in: `SCALE_TESTS=1 pnpm -F @inboxzero/mail-sqlite test src/store.test.ts`.
For isolated SQL query timings, run
`pnpm exec tsx packages/mail-sqlite/scripts/benchmark-queries.ts` from the repository root.
