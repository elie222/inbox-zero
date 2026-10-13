# Learned spam filtering

This server-side Bayesian gate runs before incoming-message AI processing, including webhooks, catch-up, and bulk rule runs. It uses a user-owned model across opted-in accounts. Explicit user Junk moves train the model; automatic moves do not. Each new training record stores its contribution so changing the label retracts that contribution first. Imported aggregate training remains a preserved baseline; missing historical feature vectors cannot be exactly untrained.

## Importing an existing corpus

Keep the source application and a private, consistent snapshot until migration and fresh-mail testing succeed. Never commit a corpus, exported bundle, source message, or personal account identifier.

1. Make a consistent offline SQLite snapshot containing `words.sqlite3`, `messages.sqlite3`, and the matching `messages-.Messages_SUPPORT` directory.
2. On macOS, export the snapshot with `python3 apps/web/scripts/spam/export-corpus.py --source PRIVATE_SNAPSHOT --output NEW_PRIVATE_BUNDLE`. The exporter decodes retained LZFSE message bodies using the public Compression framework. It preserves raw identifiers, labels, and source metadata. It does not add the archived legacy word-store counts to current counts.
3. Apply database migrations and run from `apps/web`: `NODE_ENV=production pnpm exec dotenv -e .env -- tsx scripts/spam/import-corpus.ts --source PRIVATE_BUNDLE --user-id OWNER_ID`. Use `--bias` only when the desired bias is known; the neutral default is zero.
4. The importer verifies source file hashes and reconciles token, message, class, occurrence, and retained-body counts before marking the model ready. Interrupted imports can resume against the same bundle; different bundles are rejected. Readiness does not enable any account.
5. Enable **Learned spam filter** in each desired account's Automation settings after deployment. Test fresh junk, ordinary mail, Junk rescue, and direct rescue into a category. Confirm the correction observer is running for changes made outside Inbox Zero.

The correction observer also sends newly observed Google and iCloud Inbox arrivals through the spam gate while bulk work is paused. Initial snapshots and resets establish a baseline without sweeping historical mail. The current correction observer handles Google and iCloud external folder moves. Inbox Zero's mail operations also record direct spam/not-spam corrections. External Outlook move observation is not implemented, so that provider still needs explicit Inbox Zero corrections.

The standalone observer uses `NEXT_PUBLIC_BASE_URL` and `INTERNAL_API_KEY` to call the authenticated `/api/spam-filter/observe` endpoint. Provider access and feature extraction run inside Next.js; the observer does not import the Next.js provider modules.

## Restricted extraction

On macOS, builds compile `scripts/spam/native/Extractor.swift` into `.native/spam-extractor` using Xcode command-line tools. The helper independently uses PDFKit/ImageIO for PDF text, metadata, and the first three thumbnails, and NaturalLanguage for word segmentation. It does not load the source application's binaries and does not perform OCR. For development or a custom build pipeline, run `node scripts/spam/build-native.mjs` from `apps/web` before starting the app.

On macOS, PDF parsing runs in a separate process with an OS sandbox, stripped environment, no network or child-process access, and a private temporary directory. Only required OS resources, the executable, and explicitly allowed dependencies are readable. Inputs and outputs are bounded, with a 30-second deadline, a 512 MiB resident-memory watchdog, and at most two concurrent workers per server instance. The native helper also sets a 20-second CPU limit. The watchdog samples memory, so it is not a kernel-enforced instantaneous memory ceiling. Failures stop processing before the LLM rather than treating incomplete extraction as a clean result. Malformed PDFs contribute a bad-PDF feature; locked and image-only PDFs retain the no-text signal.

The portable PDF worker includes local fonts, CMaps, and WASM assets. On Linux it requires Bubblewrap with user namespaces enabled; missing confinement fails closed. macOS can run the portable worker under the same sandbox for comparison. The deployed Mac path and its sandbox are covered by native integration tests; Linux confinement still needs testing on its deployment host.

## Compatibility

Feature prefixes and raw imported identities remain unchanged. New decisions and training record the extraction version (including the Darwin release for the Apple backend); historical training is never silently retokenized. The Apple layer is applied after the word-pattern matches, preserving single-character language tokens. The original `portable-1` baseline and all missing-body historical records remain stored.

Reference fixtures contain synthetic text only. The parser matches 133 cases. The native suite covers all 177 full HTML dictionaries, three complete PDF dictionaries, 28 Apple language-layer cases, confinement, and worker resource limits. These do not establish parity for every document, historical OS model, or complete MIME message, nor do they measure future spam accuracy. Use `RUN_NATIVE_SPAM_TESTS=true pnpm --filter inbox-zero-ai test --run utils/spam` on a Mac after compiling the helper. Without that flag, the native suite is skipped. Real transaction, correction, and lock tests require a migrated disposable database and `RUN_DB_TESTS=true`; see `__tests__/db/README.md`. `scripts/spam/check-compatibility.ts` reports full synthetic HTML comparisons and optionally accepts a private research directory containing image/PDF oracle fixtures.

Disable the account setting to stop new filtering. This retains the imported model, decisions, and training ledger. Re-enabling preserves explicit corrections; it does not replay old mail automatically. No source-app binary is loaded, executed, or needed by the implementation.
