# @inboxzero/mail-core

Portable mailbox schemas, query semantics, command state, and the shared
engine API. This package has no React, DOM, SQL driver, or app-framework
dependencies.

Web and desktop construct the engine with a `MailStore`, a `MailboxSource`,
an `OperationExecutor`, and a `HostRuntime` (`nowMs`, `randomId`, `sha256`,
`storagePressure`). Pass a `BlobStore` when composing mail with local
attachments. The in-memory blob store is for tests and the in-tab web engine.
Desktop writes attachment bytes next to its SQLite database.

Screens read `observeMailbox`, `observeMailboxWindow`, `observeConversation`,
and `observeOperation`. They save and read one draft with `saveDraft` /
`readDraft`, stage its bytes with `stageDraftAttachment`, and queue a send
with `submitSend`. A queued send is watched with `observeOperation`.

Account lists, Outlook folders, and Gmail labels stay on their existing server
APIs.

Forbidden imports: React, DOM globals, IndexedDB, Electron, Expo, Next, Prisma,
Redis, and Node-only modules.
