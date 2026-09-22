# Shared mail packages

`@inboxzero/mail-core`, `@inboxzero/mail-sqlite`, and `@inboxzero/mail-react`
are the mailbox engine used by web and desktop. `@inboxzero/mail-ui` is the
React DOM presentation and stays in this app.

Web and desktop pass `HostRuntime` into the store and the engine. Desktop
keeps attachment bytes in a file blob store and stages them before
`submitSend`. The in-tab web engine uploads attachments through the server
before queueing the send. Either way, the queued send is watched with
`observeOperation`.

## Staged uploads

`MAIL_UPLOAD_DIR` is the directory for accepted attachment uploads. Set it to
a durable directory shared by every web instance. When it is unset, uploads
use a temp directory and do not survive a restart or another machine.

## Release

These packages stay private until a publish is authorized.

1. `pnpm -F @inboxzero/mail-core -F @inboxzero/mail-sqlite -F @inboxzero/mail-react run build`
2. `pnpm -F @inboxzero/mail-core pack:smoke`
3. Publish core, then sqlite, then react, at the same version.
4. Dist manifests rewrite `workspace:*` to that version and set `publishConfig.access` to `public`.

Do not import `@inboxzero/mail-sqlite/node` or `@inboxzero/mail-sqlite/blob-store`
from a non-Node host. Those entry points use Node file APIs.
