# Shared mail packages

`@inboxzero/mail-core`, `@inboxzero/mail-sqlite`, and `@inboxzero/mail-react`
are the mailbox engine used by web and desktop. `@inboxzero/mail-ui` is the
React DOM presentation and stays in this app. The Expo adapter stays in the
mobile app.

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

A push to `main` that changes `packages/mail-core`, `packages/mail-sqlite`,
or `packages/mail-react` publishes those packages to npm. They share one
version. The workflow builds each package and publishes its `dist` manifest,
core then sqlite then react, and skips a version that is already on npm.
Bump the version in every package that changed, and in the packages that
depend on it, before merging. Mobile depends on the published versions.

1. `pnpm -F @inboxzero/mail-core -F @inboxzero/mail-sqlite -F @inboxzero/mail-react run build`
2. `pnpm -F @inboxzero/mail-core pack:smoke`
3. Dist manifests rewrite `workspace:*` to that version and set `publishConfig.access` to `public`.

Do not import `@inboxzero/mail-sqlite/node` or `@inboxzero/mail-sqlite/blob-store`
from a non-Node host. Those entry points use Node file APIs.
