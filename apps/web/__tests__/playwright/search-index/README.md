# Persistent mail index checks

From the repository root, after `pnpm install`:

```sh
node apps/web/__tests__/playwright/search-index/run.mjs 10000
```

Pass `100000` or `250000` for larger synthetic corpora. Set `SEARCH_INDEX_REPORT` to a file path to save JSON results. The runner bundles the production index backend with esbuild, serves its worker and the installed SQLite WASM asset on an ephemeral localhost port, and runs real Chromium OPFS storage. It does not start the application, access email providers, or require account credentials. Temporary build files and browser storage are removed afterward.

The correctness suite compares indexed results to the existing local matcher, including short Unicode terms, phrases, field filters, date boundaries, NULs and cross-field newlines. It verifies account isolation, generation fencing, out-of-order work rejection, transaction rollback, deletion, thread replacement and replay, complete pagination, and reopening persisted data in a new worker. A 150-message replacement is interrupted by terminating its worker, resumed from persisted state, superseded, and completed while old pages/finalizers are rejected.

Reported p50/p95 timings measure synchronous worker queries returning message identities. They exclude app rendering, index-worker brokerage and conversation hydration. The synthetic corpus is repetitive and its message sizes are small; these measurements are regression evidence, not full product performance acceptance. WASM memory is linear memory, not total browser-process memory.

The production worker remains separate from this harness. Its owner must activate it only for adopted mail accounts, serialize ownership across windows, durably deliver index work and verify account generations before exposing results. Integrating the worker also requires checking the application's emitted WASM asset URL with its actual Next.js bundler.

## Replacement protocol

`applyBatch` accepts at most 100 combined upserts/deletes with an account generation, expected index revision, and new revision. Any mismatched generation or expected revision returns false and must not acknowledge source work, including a replay of an already applied revision. A revision does not identify a payload: two producers can propose different work at the same revision. After interruption, reread current index state and retry or resnapshot instead of treating a stale revision as success.

For a complete thread snapshot of any size, send `replacement: { threadId, token, phase: "start" }` with the first page, followed by bounded `continue` pages and a final `finish` page (which may contain no upserts). Use the source dirty-work token as the replacement token. The final transaction removes old members not stamped with that token. Starting a newer replacement supersedes the previous token; its pages and finalizer cannot mutate or advance the index. Ordinary writes to a thread undergoing replacement are rejected, so they cannot be accidentally pruned by its finalizer.

`getAccountState` and `getThreadReplacementState` expose persisted recovery state. An interrupted replacement remains pending after reopening. Search returns applied revision and `pendingReplacements`; it may contain the prior snapshot alongside partially updated members until finalization. The integration must reconcile dirty threads against the authoritative source before displaying hits, and must not claim indexing complete or acknowledge source work until finalization succeeds and the source work token still matches. This backend alone cannot know which authoritative messages disappeared during interrupted work.

Timestamps use signed64 chronological keys with 1,048,576 collision slots per millisecond. Unrepresentable timestamps, exhausted slots and oversized documents fail the whole batch without advancing its revision. Those failures must remain pending or surface an indexing error, never be silently acknowledged as complete coverage.

The worker exports `SearchIndexRequest`/`SearchIndexResponse` types, returns explicit capacity error codes, and exposes account/replacement state and paged account discovery. `deleteAccount` requires the current generation and removes its content, pending replacements and identity. `clearAll` closes the database and physically removes the OPFS directory; it also supports removing unopened storage without initializing SQLite. Subsequent commands on that worker are rejected. The owner must fence old clients and terminate the worker after cleanup. Per-account cleanup clears live SQLite data but does not promise physical-device forensic erasure; browser and filesystem behavior remains outside this API.

## Cross-window broker

Run `node apps/web/__tests__/playwright/search-index/client-run.mjs` for the real two-tab broker check. It creates the production broker in two Chromium tabs, verifies assistant-only use does not start workers, shares one persistent worker across activated requests, closes its owner tab, checks recovery from the surviving tab and verifies the maximum concurrent worker count stays one. It also checks source removal fences search and that account/global cleanup work.

The broker is inert until an authorized request or explicit cleanup. Web Locks establish exclusive ownership; BroadcastChannel carries bounded RPC requests and responses. A waiting client probes for ownership only while requests remain pending. It never steals a lock from a frozen owner; queries time out into the existing fallback instead. Account generation and activation are checked at admission, immediately before worker dispatch and before exposing results. New owners reconcile stored index accounts against current IndexedDB generations. Staged dirty-thread reconciliation remains the calling search integration's responsibility.

`request(scope, command)` handles only account-scoped worker commands. `cleanupAccount(scope)` requires that source generation to have been removed or replaced; `clearAll()` requires no source index accounts. `close()` terminates an owned worker before releasing its lock and resolves outstanding local requests. A pagehide event suspends transport; a later authorized request may establish it again. Tests do not establish Safari/Firefox/Electron compatibility or emitted Next.js asset URLs.

## Physical reclamation

The runner deletes the synthetic benchmark account and measures recursive OPFS file sizes before deletion, after deletion, and after bounded reclamation. The report includes the SQLite page size, reusable freelist bytes, reclaimed database bytes, and retained SAHPool overhead. Logical deletion can temporarily increase allocation; admission must use fresh origin usage rather than subtracting logical message bytes.

New empty indexes enable incremental vacuum before schema creation. Each reclamation call bounds the released page count and preserves other accounts. Existing nonincremental layouts report unsupported reclamation and reusable pages without attempting a full rebuild at quota. The browser checks also cover generation fencing and contention with the shared source-storage lock. These checks do not establish pressure recovery for the full retention coordinator.
