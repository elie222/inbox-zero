# @inboxzero/email-editor

Reusable email composition primitives for Inbox Zero. The package keeps the
provider interchange format as HTML while separating portable email correctness
rules from the React editing surface, which is built on
[Squire](https://github.com/fastmail/Squire).

## Install

```sh
pnpm add @inboxzero/email-editor
```

The portable core is built JavaScript with TypeScript declarations and does not
load React or the editor:

```ts
import {
  finalizeEditableEmailHtml,
  prepareEmailDraft,
  validateEmailAttachments,
} from "@inboxzero/email-editor/core";
```

Consumers of `@inboxzero/email-editor/web` must also install the peer
dependencies declared by the package: React, `squire-rte` and `dompurify`.
Those peers are optional so native and backend consumers can install the core
without bringing in a web editor stack.

## Exports

- `@inboxzero/email-editor/core` — quote and signature splitting, the shared
  email-safe HTML sanitizer, inline Content-ID rewriting, attachment
  validation, and public contracts.
- `@inboxzero/email-editor/web` — the uncontrolled React editor.
- `@inboxzero/email-editor/fixtures` — anonymous Gmail- and Outlook-style HTML
  fixtures and sanitizer attack cases for tests.

The editor works on email-safe HTML: tables, styled blocks, fonts and hosted
images survive loading, editing and sending. One profile
(`core/email-profile.ts`) drives both the browser sanitizer (DOMPurify, on
load, paste, drop and insert) and the parse5 sanitizer that
`finalizeEditableEmailHtml` applies before sending. A draft that was never
edited is reported in `"original"` mode and sent exactly as it was loaded.

Signatures load as editable content in a single container that collapses
behind the "⋯" toggle; while collapsed it is detached from the editable DOM so
typing and deleting cannot change it unseen. Quoted messages stay protected
and are combined with the reply only when sending. Remote images are never
fetched from their host while composing: the `resolveRemoteImages` prop maps
them to proxied URLs, and the sent HTML keeps the original addresses.

Inline images use temporary local preview URLs while editing. Before sending,
`finalizeEditableEmailHtml` converts matched previews to `cid:` references;
provider adapters must send the corresponding MIME/Graph attachment with the
same content ID.

## Publishing

The workspace manifest points at source files for local development. `pnpm
pack:check` builds the public package into `dist` and verifies its tarball
contents. After tests and type checking pass, an authorized maintainer can
publish that generated package with:

```sh
cd dist
pnpm publish --access public --otp <one-time-password>
```
