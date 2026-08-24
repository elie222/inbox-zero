# @inboxzero/email-editor

Reusable email composition primitives for Inbox Zero. The package keeps the
provider interchange format as HTML while separating portable email correctness
rules from the React/Tiptap editing surface.

## Exports

- `@inboxzero/email-editor/core` — editable-email HTML normalization,
  unsupported-markup fallback detection, preserved quote/signature handling,
  inline Content-ID rewriting, attachment validation, and public contracts.
- `@inboxzero/email-editor/web` — the uncontrolled React/Tiptap editor and its
  web extensions.
- `@inboxzero/email-editor/fixtures` — anonymous Gmail- and Outlook-style HTML
  fixtures for provider round-trip tests.

The core profile supports paragraphs and hard breaks, bold, italic, underline,
strikethrough, links, ordered and unordered lists, blockquotes, inline images,
and block direction. Unsupported editable markup uses a warned fallback: an
untouched draft remains byte-for-byte intact, while editing its sanitized view
may simplify unsupported formatting. Complex quoted messages and signatures
remain protected HTML and are combined with the canonical editable reply only
when sending.

Inline images use temporary local preview URLs while editing. Before sending,
`finalizeEditableEmailHtml` converts matched previews to `cid:` references;
provider adapters must send the corresponding MIME/Graph attachment with the
same content ID.
