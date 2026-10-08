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

Upload metadata (account, filename, type, checksum, size, readiness, holds)
lives in Postgres as `MailUpload`; attachment bytes live in private object
storage chosen by `MAIL_UPLOAD_STORAGE`:

- `filesystem` (default): single server only. Point `MAIL_UPLOAD_DIR` at a
  persistent volume; without it uploads use a temp directory.
- `s3`: private bucket via `MAIL_UPLOAD_S3_BUCKET` and `MAIL_UPLOAD_S3_REGION`.
  Set both access keys or neither (AWS credential chain). For R2 or MinIO set
  `MAIL_UPLOAD_S3_ENDPOINT`; MinIO also needs
  `MAIL_UPLOAD_S3_FORCE_PATH_STYLE=true`.
- `vercel-blob`: connect a **private** Blob store to the Vercel project. Outside
  Vercel, set `BLOB_READ_WRITE_TOKEN`.

Use `s3` or `vercel-blob` whenever more than one instance serves requests, with
the same configuration on each. Storage keys are random and never sent to the
browser. Content is verified against the admitted checksum when written and
again when read for sending.

Cancel and confirmed sends delete objects right away. A failed deletion keeps
its metadata row so the send-operation retention cron can retry it; the cron
also removes uploads a composer abandoned. Account deletion removes the
account's objects after the database transaction commits.

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
