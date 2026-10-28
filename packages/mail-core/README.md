# @inboxzero/mail-core

Portable mailbox schemas, query semantics, command state, and the shared
engine API. This package has no React, DOM, SQL driver, or app-framework
dependencies.

Web and desktop construct the engine with a `MailStore`, a `MailboxSource`,
an `OperationExecutor`, and a `HostRuntime` (`nowMs`, `randomId`, `sha256`,
`storagePressure`). Attachments live on the provider's mailbox draft, so the
engine never holds their bytes.

Screens read `observeMailbox`, `observeMailboxWindow`, `observeConversation`,
and `observeOperation`. They save and read one draft with `saveDraft` /
`readDraft`, and queue a send with `submitSend`. A queued send is watched with `observeOperation`.

Account lists, Outlook folders, and Gmail labels stay on their existing server
APIs.

Forbidden imports: React, DOM globals, IndexedDB, Electron, Expo, Next, Prisma,
Redis, and Node-only modules.
