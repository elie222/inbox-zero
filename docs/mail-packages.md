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

Web keeps upload metadata in Postgres (`MailUpload`): account, filename, MIME
type, disposition/content ID, checksum, size, storage key, readiness, holds, and
cleanup timestamps. Attachment bytes never enter that table. The existing
streaming `BlobStore` port (`stage`, `finalize`, `read`, `delete`) has three web
adapters, selected with `MAIL_UPLOAD_STORAGE`:

- `filesystem` (default): single-server Docker/self-hosting. Set `MAIL_UPLOAD_DIR`
  to a mounted persistent volume, for example `/data/mail-uploads`. Without it,
  uploads use `tmpdir()/inbox-zero-mail-uploads`. Runtime paths are excluded from
  server tracing. This local default does not share bytes between servers.
- `s3`: set `MAIL_UPLOAD_S3_BUCKET` and `MAIL_UPLOAD_S3_REGION`. Use a private
  bucket with public access blocked. Set both `MAIL_UPLOAD_S3_ACCESS_KEY_ID` and
  `MAIL_UPLOAD_S3_SECRET_ACCESS_KEY`, or leave both unset for the default AWS
  credential chain; `MAIL_UPLOAD_S3_SESSION_TOKEN` is optional. For R2, use
  region `auto` and the account's S3 endpoint in `MAIL_UPLOAD_S3_ENDPOINT`. For
  MinIO, use its endpoint/region and `MAIL_UPLOAD_S3_FORCE_PATH_STYLE=true`.
  The adapter uses no ACLs, public URLs, or presigned client URLs.
- `vercel-blob`: on Vercel, set `MAIL_UPLOAD_STORAGE=vercel-blob` and connect a
  **private** Blob store to the project. Set `BLOB_READ_WRITE_TOKEN` for token
  authentication; connected Vercel projects also support SDK-managed OIDC with
  the automatically provided `BLOB_STORE_ID` and `VERCEL_OIDC_TOKEN`. The SDK
  uses private `put`/`get` only and fails if private storage is unavailable.

Storage keys combine a hashed account scope with a random ID; filenames and
client upload IDs do not determine object paths. Requests remain authenticated
and account-scoped; storage keys and provider URLs are never returned to the
browser. Uploads stream with checksum/size verification. Cloud finalization
publishes a small private record without copying the attachment; downloads
stream until the email provider's base64 conversion boundary.

Cancel, confirmed send, and the existing email-send-operation retention cron
remove stored objects and metadata. Deletion failures are logged and retain an
inactive metadata row for the cron to retry. Account/user deletion captures
keys before the cascade and attempts object deletion after the transaction
commits, without failing account deletion on storage errors.

Deploy the `20261008120000_add_mail_upload` migration **before** deploying this
code. Files staged before the storage cutover need reattaching. Configure a
shared S3/private Blob store for multiple server instances, using the same
configuration on each; the filesystem default is for a single server.

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
