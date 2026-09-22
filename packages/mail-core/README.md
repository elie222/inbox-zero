# @inboxzero/mail-core

Portable mailbox schemas, query semantics, command state, and the shared
engine API. This package has no React, DOM, SQL driver, or app-framework
dependencies.

Web and desktop construct the engine with a `MailStore`, a `MailboxSource`,
an `OperationExecutor`, and a `HostRuntime` (`nowMs`, `randomId`, `sha256`,
`storagePressure`). Pass a `BlobStore` only when the host can keep attachment
bytes across restarts. Desktop writes them next to its SQLite database. The
in-tab web engine does not pass one, so compose uploads through the existing
server path before queueing the send. The in-memory blob store is for tests.

Screens read `observeMailbox`, `observeMailboxWindow`, `observeConversation`,
and `observeOperation`. They save and read one draft with `saveDraft` /
`readDraft`, stage its bytes with `stageDraftAttachment`, and queue a send
with `submitSend`. A queued send is watched with `observeOperation`.

Account lists, Outlook folders, and Gmail labels stay on their existing server
APIs.

Forbidden imports: React, DOM globals, IndexedDB, Electron, Expo, Next, Prisma,
Redis, and Node-only modules.
