# Shared mail packages for web, desktop, and native

The mailbox engine lives in `@inboxzero/mail-core`, `@inboxzero/mail-sqlite`,
and `@inboxzero/mail-react`. Web and desktop keep `@inboxzero/mail-ui`. A native
client should implement a SQLite driver, a durable `BlobStore`, and screens on
top of the engine. It should not copy web application code or keep a second
mailbox implementation.

## Construction

```ts
import { createMailEngine, createHostRuntime } from "@inboxzero/mail-core/engine";
import { createRoutedBackendAdapter } from "@inboxzero/mail-core/protocol/routed-backend-adapter";
import { MAIL_PROTOCOL_VERSION } from "@inboxzero/mail-core/identities";
import { createSqliteMailStore } from "@inboxzero/mail-sqlite/store";

const runtime = createHostRuntime({
  nowMs: () => Date.now(),
  randomId: () => crypto.randomUUID(),
  sha256,
  storagePressure,
});
const store = await createSqliteMailStore(driver, { runtime });
const ports = createRoutedBackendAdapter({
  requestFor: (accountId) => createAuthenticatedMailRequest(accountId),
});
const engine = createMailEngine({
  store,
  source: ports.source,
  executor: ports.executor,
  assistant: ports.assistant,
  runtime,
  blobStore,
  ownerId: "native-owner",
});

await store.ensureAccount({ accountId, provider, generation });
await engine.requestSync([accountId]);
const pump = setInterval(() => {
  void engine.runUntil(Date.now() + 2_000, abort.signal);
}, 250);
```

`createAuthenticatedMailRequest` must:

- Send the existing mobile session cookie.
- Set `X-Email-Account-ID` to the same account id as the URL.
- Put `protocolVersion: MAIL_PROTOCOL_VERSION` on JSON bodies and upload query strings.
- Keep `session.accountId` / `session.generation` consistent with `ensureAccount`.
- Honor abort signals, 401 `blocked_auth`, and `retryAfterMs` on `throttled` / `unavailable`.
- PUT attachment bytes as `application/octet-stream`.

On logout: stop the pump, `purgeAccount`, `close`. On reconnect: `ensureAccount`
with the new generation, then `requestSync`. Uncertain sends stay on
`observeOutbox` / `observeOperation`; do not submit a new command id.

`observeMailboxCatalog` returns system folders when the provider has no catalog
API. Gmail labels still come from `/api/labels`. Microsoft has no snoozed
system folder in the fallback catalog; snoozed mail is still queryable.

Local drafts, including standalone compositions, are `observeDrafts`. Provider
draft-role messages are `mailboxPredicate("drafts")`. Those are not the same
list.

Mailbox windows are bounded to 40 pages. Use `after` cursors for older mail.
Incoming mail and pending mutations keep newest-first order.

On Apple M2 Pro / Node 24, a 25-row inbox page over synthetic metadata was
~0.6ms warm at 10k conversations and ~3.9ms warm at 100k, with RSS ~104MB /
~154MB. That is query work on Node SQLite, not native frame time. Unchanged
revisions no longer republish; overlapping refreshes coalesce.

## Package release (do not publish from this change)

1. Land this branch.
2. `pnpm -F @inboxzero/mail-core -F @inboxzero/mail-sqlite -F @inboxzero/mail-react run build`
3. `pnpm -F @inboxzero/mail-core pack:smoke`
4. Set `"private": false` only at publish time if the registry still requires it.
   Dist `package.json` already has `publishConfig.access: public` and rewritten
   `workspace:*` versions.
5. Publish **core**, then **sqlite**, then **react**, same version (`0.1.0` for
   the first coordinated release).
6. Consume with `"@inboxzero/mail-core": "0.1.0"` (no `workspace:`).
7. Native apps import subpaths (`/engine`, `/store`, `/driver`). Do not import
   `@inboxzero/mail-sqlite/node` or `/blob-store`.

## Backend deployment order

1. Deploy the mail/v1 API that already serves sync, operations, and uploads.
2. Set `MAIL_UPLOAD_DIR` to a **durable shared volume** visible to every web
   instance. The previous default, `os.tmpdir()`, does not survive restarts or
   other machines; accepted uploads can vanish.
3. Retention: held blobs stay until send completes or the client deletes them.
   Cleanup must not delete ids returned by `engine.referencedBlobIds()`.
4. Multi-instance without a shared disk still needs object storage. That is a
   remaining release blocker; this change uses the existing file blob store
   plus `MAIL_UPLOAD_DIR`.

## Mobile integration checklist

- [ ] Implement `SqliteDriver` and pass `runSqliteDriverContract`.
- [ ] Open the store with the same `HostRuntime` as the engine (`randomId`, `sha256`, `nowMs`).
- [ ] Implement a durable `BlobStore` (not `createMemoryBlobStore` in production).
- [ ] Construct `createRoutedBackendAdapter` with cookie + `X-Email-Account-ID`.
- [ ] Pump `runUntil` with a deadline and abort signal.
- [ ] Render from engine projections; submit commands; do not query SQL from UI.
- [ ] Stage attachments with `stageDraftAttachment` then `saveDraft` / `submitSend`.
- [ ] Use `ensureConversation` for threads not yet downloaded.
- [ ] Treat `indexedContent: "not_requested"` as “search is not fully indexed”.
- [ ] Pin React >= 19.2 and consume packed 0.1.0 packages, not this monorepo’s `src`.

## Honest limits

- No Expo SQLite adapter ships here.
- Node tests plus packed-artifact smoke are not a native runtime.
- In-tab web still uses an in-memory blob store; reload can drop unsent local
  bytes. Desktop writes `{databasePath}.blobs`. Native must persist blobs.
- Catalog coverage is `system_only` unless `MailboxSource.readCatalog` is implemented.
- Search without FTS5 is local LIKE over downloaded bodies.
