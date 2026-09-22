# @inboxzero/mail-core

Portable mailbox schemas, query semantics, command state, and the shared
engine API. This package has no React, DOM, SQL driver, or app-framework
dependencies.

## Construction

```ts
import { createMailEngine, createHostRuntime } from "@inboxzero/mail-core/engine";
import { createMemoryBlobStore } from "@inboxzero/mail-core/memory-blob-store";
import { createRoutedBackendAdapter } from "@inboxzero/mail-core/protocol/routed-backend-adapter";
import { MAIL_PROTOCOL_VERSION } from "@inboxzero/mail-core/identities";

const runtime = createHostRuntime({
  nowMs: () => Date.now(),
  randomId: () => crypto.randomUUID(),
  sha256: async (bytes) => new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
  storagePressure: () => false,
});
const ports = createRoutedBackendAdapter({ requestFor });
const engine = createMailEngine({
  store,
  source: ports.source,
  executor: ports.executor,
  assistant: ports.assistant,
  runtime,
  blobStore: durableBlobStore, // native file store; memory is a test/web stopgap
  ownerId: "mobile-owner",
});
```

`requestFor(accountId)` must send the existing session cookie, set
`X-Email-Account-ID` to that account, include `protocolVersion`, and keep URL,
header, and body `session.accountId` identical. Call `engine.runUntil(now + budgetMs, signal)`
on a bounded timer. On logout call `purgeAccount` then `close`. After reconnect,
`ensureAccount` with the new generation and `requestSync`.

UI reads `observeMailbox`, `observeMailboxWindow`, `observeConversation`,
`observeAccounts`, `observeDrafts`, `observeOutbox`, `observeMailboxCatalog`,
and `observeOperation`, and submits commands. Local drafts are
`observeDrafts`; provider draft-role messages are `mailbox: "drafts"`.
`ensureConversation` downloads a thread that is not yet local.

Forbidden imports: React, DOM globals, IndexedDB, Electron, Expo, Next, Prisma,
Redis, and Node-only modules.
