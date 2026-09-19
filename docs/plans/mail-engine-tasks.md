# Mail engine implementation task ledger

Status: implementation in progress. Shared packages, SQLite store, backend-mediated source/executor, browser/desktop hosts, dual-provider archive/catch-up/search/body/read, freeze/crash/reset, per-target outcomes, overlapping-command serialization, paginated membership, stale hydration, assistant catch-up, durable send receipts, attachment-backed durable send, snooze scheduler transfer, follower-tab subscriptions, local blob staging, coverage-gated UI cutover, child-process owner fork with Electron `utilityProcess.fork`/`parentPort` wiring, persisted `blocked_auth`/`offline` diagnostics, and 10k/100k/1M list smoke exist. IndexedDB mailbox cache, search index, mutation outbox, and importer are deleted. Full acceptance matrix is not green.

Read the [implementation plan](./mail-engine-plan.md), including its architecture, interfaces, implementation map, and review notes.

## Resume state

- Current milestone: Stage 3–4 engine owns MailShell lists, reader, EmailList/CommandK mutations, label counts (`observeMailbox`), and compose/send. IndexedDB mailbox cache, search index, outbox, and importer are deleted.
- Branch/worktree: `cursor/mail-engine-0b4f`
- Last implementation commit: `bc3de9fd5`
- Pull request: https://github.com/elie222/inbox-zero/pull/3793
- Current task: remaining matrix cells (offline web), simplifier/reviewer, and take PR 3793 to exact-head green.
- Next action: web offline-loading Playwright; remaining G matrix cells that are still Not run; watch CI on the exact head after this ledger commit.
- Blockers or decisions requiring user input: none for the authorized existing-login/backend-mediated route. CLA assistant still requires a human signature.
- Running processes/subagents: restart `pr-digest --watch 3793` on the exact head after push.
- Last validation:
  - `pnpm --filter @inboxzero/mail-sqlite test src/store.test.ts -t "10k-conversation|100k conversations"` — 2 passed, 19 skipped in 17.18s on `bc3de9fd5`; `readMailboxView` under 5s (E51)
  - `pnpm --filter @inboxzero/mail-sqlite test src/store.test.ts -t "1M conversations"` — 1 passed, 20 skipped in 161.77s on `bc3de9fd5`; 1M list/count under 5s query budget (E51)
  - `PLAYWRIGHT_MAIL_PROVIDER=microsoft DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres UPSTASH_REDIS_URL=http://127.0.0.1:8079 UPSTASH_REDIS_TOKEN=dev_token pnpm -F inbox-zero-ai test:playwright:emulated mail/hosted-electron-archive.spec.ts` — 8 passed in 2.4m on `53fd1b733`; assistant 10.8s; Archive Action Message gone; `assistantCursor` is `playwright-mail-assistant-archive-execution`; `assistantStateRequests` is 1 (E50)
  - `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres UPSTASH_REDIS_URL=http://127.0.0.1:8079 UPSTASH_REDIS_TOKEN=dev_token pnpm -F inbox-zero-ai test:playwright:emulated mail/hosted-electron-archive.spec.ts` — 8 passed in 2.6m on `f4fa3c096`; assistant 14.2s; Archive Action Message gone after reopen; `assistantCursor` is `playwright-mail-assistant-archive-execution`; native inbox does not contain the subject (E49)
  - `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres UPSTASH_REDIS_URL=http://127.0.0.1:8079 UPSTASH_REDIS_TOKEN=dev_token pnpm -F inbox-zero-ai test:playwright:emulated mail/hosted-electron-archive.spec.ts` — 6 passed, 1 failed in 3.2m on `8af2726da`; star 12.1s; `readerStarred`/`starSucceeded`/`nativeStarredHasSubject` true over Gmail `desktop-ipc` (E48). Search-then-archive timed out while Fast Refresh remounted; that path is already E36/E39.
  - `PLAYWRIGHT_MAIL_PROVIDER=microsoft DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres UPSTASH_REDIS_URL=http://127.0.0.1:8079 UPSTASH_REDIS_TOKEN=dev_token pnpm -F inbox-zero-ai test:playwright:emulated mail/hosted-electron-archive.spec.ts` — 7 passed in 2.1m on `332f90c9b`; star 6.4s; `readerStarred`/`starSucceeded`/`nativeStarredHasSubject` true over `desktop-ipc` (E47)
  - `PLAYWRIGHT_MAIL_PROVIDER=microsoft DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres UPSTASH_REDIS_URL=http://127.0.0.1:8079 UPSTASH_REDIS_TOKEN=dev_token pnpm -F inbox-zero-ai test:playwright:emulated mail/hosted-electron-archive.spec.ts` — 6 passed, 1 failed in 2.1m on `8ae2d6f1d`; discard 7.8s; send 14.3s; reconnect 6.8s; native draft gone after send; star failed on an empty conversation remount (E46)
  - `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres UPSTASH_REDIS_URL=http://127.0.0.1:8079 UPSTASH_REDIS_TOKEN=dev_token pnpm -F inbox-zero-ai test:playwright:emulated mail/hosted-electron-archive.spec.ts` — 6 passed in 2.1m on `cf5499b94`; discard 10.2s; send 14.9s; native SQLite draft gone after discard; inspect send succeeded; Sent lists Hosted desktop send example (E45)
  - `PLAYWRIGHT_MAIL_PROVIDER=microsoft DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres UPSTASH_REDIS_URL=http://127.0.0.1:8079 UPSTASH_REDIS_TOKEN=dev_token pnpm -F inbox-zero-ai test:playwright:emulated mail/starring.spec.ts` — 2 passed in 1.5m on `33155a553`; spec 46.2s; keyboard S, CommandK Unstar, reader S, and More actions Star/Unstar all succeed (E43)
  - `cd apps/web && RUN_INTEGRATION_TESTS=true pnpm exec vitest --run __tests__/integration/outlook-mailbox-flag.test.ts` — 1 file, 1 passed; Graph PATCH persists `flag.flagStatus` and maps to STARRED
  - `PLAYWRIGHT_MAIL_PROVIDER=microsoft DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres UPSTASH_REDIS_URL=http://127.0.0.1:8079 UPSTASH_REDIS_TOKEN=dev_token pnpm -F inbox-zero-ai test:playwright:emulated mail/hosted-electron-archive.spec.ts` — 3 passed in 1.7m on `28710681b`; archive 38.9s, compose 14.9s; Outlook Drafts shows Hosted desktop draft example and native SQLite has the subject (E42)
  - `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres UPSTASH_REDIS_URL=http://127.0.0.1:8079 UPSTASH_REDIS_TOKEN=dev_token pnpm -F inbox-zero-ai test:playwright:emulated mail/hosted-electron-archive.spec.ts` — 3 passed in 1.5m on `6ecae3253`; archive 31.2s, compose 12.6s; hosted Drafts shows Hosted desktop draft example and native SQLite has the subject (E41)
  - `PLAYWRIGHT_MAIL_PROVIDER=microsoft DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres UPSTASH_REDIS_URL=http://127.0.0.1:8079 UPSTASH_REDIS_TOKEN=dev_token pnpm -F inbox-zero-ai test:playwright:emulated mail/hosted-electron-archive.spec.ts` — 2 passed in 1.2m on `a2d980c79`; spec 25.6s; Outlook search hides Keyboard Navigation Message then archives (E40)
  - `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres UPSTASH_REDIS_URL=http://127.0.0.1:8079 UPSTASH_REDIS_TOKEN=dev_token pnpm -F inbox-zero-ai test:playwright:emulated mail/hosted-electron-archive.spec.ts` — 2 passed in 1.2m on `a2d980c79`; spec 24.8s; Gmail hosted search then archive (E39)
  - `PLAYWRIGHT_MAIL_PROVIDER=microsoft DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres UPSTASH_REDIS_URL=http://127.0.0.1:8079 UPSTASH_REDIS_TOKEN=dev_token pnpm -F inbox-zero-ai test:playwright:emulated mail/assistant-catch-up.spec.ts` — 2 passed in 1.4m on `4a52864aa`; spec 36.2s; Archive Action Message hidden after reopen; `GET /assistant-state` 200 (E38)
  - `pnpm --filter @inboxzero/mail-core test src/protocol/backend-adapter.test.ts` — 3 passed including inspect POST
  - `pnpm --filter @inboxzero/desktop exec vitest run src/mail-engine/request.test.ts` — 3 passed including PUT JSON body + cookies
  - `cd apps/web && pnpm exec vitest --run utils/mail-api/operations.test.ts` — 1 file, 7 passed
  - `PLAYWRIGHT_MAIL_PROVIDER=microsoft DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres UPSTASH_REDIS_URL=http://127.0.0.1:8079 UPSTASH_REDIS_TOKEN=dev_token pnpm -F inbox-zero-ai test:playwright:emulated mail/hosted-electron-archive.spec.ts` — 2 passed in 1.2m on `7b54d1856`; spec 26.2s; Microsoft emulator; Archive Action Message gone from hosted MailShell and native SQLite (E37)
  - `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres UPSTASH_REDIS_URL=http://127.0.0.1:8079 UPSTASH_REDIS_TOKEN=dev_token pnpm -F inbox-zero-ai test:playwright:emulated mail/hosted-electron-archive.spec.ts` — 2 passed in 1.1m on `9497a1c19`; spec 25.0s; `transport: desktop-ipc`; Archive Action Message gone from hosted MailShell and native SQLite (E36)
  - `cd apps/web && pnpm exec vitest --run utils/playwright/emulated-suite-selection.test.mjs` — 1 file, 32 passed on `8ce7a46f7` after declaring `assistant-catch-up.spec.ts` in mail `coverage.json`
  - Real Electron vitest files skip when `node_modules/electron/dist/electron` is missing so CI package tests do not fail for an undownloaded binary
  - Gmail history integration rewrite uses `hostname === "gmail.googleapis.com"` (CodeQL incomplete URL sanitization)
  - `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres UPSTASH_REDIS_URL=http://127.0.0.1:8079 UPSTASH_REDIS_TOKEN=dev_token pnpm -F inbox-zero-ai test:playwright:emulated mail/assistant-catch-up.spec.ts` — 2 passed in 1.5m on `46cde218b`; spec 38.6s; Archive Action Message hidden after reopen; `GET /assistant-state` 200 (E35)
  - `cd apps/web && pnpm exec vitest --run utils/mail-api/assistant-state.test.ts` — 1 file, 2 passed; partial pages persist last executed-rule id
  - `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres UPSTASH_REDIS_URL=http://127.0.0.1:8079 UPSTASH_REDIS_TOKEN=dev_token pnpm -F inbox-zero-ai test:playwright:emulated mail/mail-engine-inspect.spec.ts` — 6 passed in 2.0m on `4c764afc6`; second signed-in account stays without owner/follower inspect while the first remains owner (E34)
  - `cd apps/web && RUN_INTEGRATION_TESTS=true pnpm exec vitest --run __tests__/integration/gmail-mailbox-history.test.ts utils/gmail/mailbox-sync.test.ts` — 2 files, 11 passed; history 404 rebuilds and `readChanges` is `reset_required` (E33)
  - `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres UPSTASH_REDIS_URL=http://127.0.0.1:8079 UPSTASH_REDIS_TOKEN=dev_token pnpm -F inbox-zero-ai test:playwright:emulated mail/mail-queue.spec.ts` — 2 passed in 1.1m; `Pending actions` heading is unique from the status combobox
  - `cd apps/web && RUN_INTEGRATION_TESTS=true pnpm exec vitest --run __tests__/integration/outlook-mailbox-delta.test.ts` — 1 file, 2 passed on `7b518b6b0`; `$deltatoken=expired` rebuilds (`reset: true`) and `readChanges` is `reset_required` (E30)
  - `pnpm --filter @inboxzero/desktop exec vitest run __tests__/mail-engine/electron-local-renderer.test.ts` — 1 file, 2 passed on `10a177156`; returning-user offline reopen keeps Stay Local and hides Archive Local (E31)
  - `cd apps/web && pnpm exec vitest --run utils/mail-engine/worker-session.test.ts utils/mail-engine/worker-protocol.test.ts utils/mail-engine/tab-channel.test.ts utils/mail-engine/wasm-sqlite.test.ts` — 4 files, 13 passed including in-flight second-account `account_mismatch`, tab follower mismatch, and `archiveThenNewMailScenario` on sqlite-wasm (E28/E29)
  - `UPSTASH_REDIS_URL=http://127.0.0.1:8079 UPSTASH_REDIS_TOKEN=dev_token DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres pnpm -F inbox-zero-ai test:playwright:emulated mail/archive-reconciliation.spec.ts` — 3 passed in 1.7m on `0ad57446b`; queued archive stays hidden after OPFS reload (13.6s) (E29)
  - `PLAYWRIGHT_MAIL_PROVIDER=microsoft UPSTASH_REDIS_URL=http://127.0.0.1:8079 UPSTASH_REDIS_TOKEN=dev_token DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres pnpm -F inbox-zero-ai test:playwright:emulated mail/mail-engine-inspect.spec.ts` — 5 passed in 1.8m on `36e1ab9ec`, reconnect 12.8s; after coverage, `/changes` is intercepted and `/enumeration` stays 0 (E27)
  - `UPSTASH_REDIS_URL=http://127.0.0.1:8079 UPSTASH_REDIS_TOKEN=dev_token DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres pnpm -F inbox-zero-ai test:playwright:emulated mail/mail-engine-inspect.spec.ts` — 5 passed in 1.8m, Gmail reconnect 10.7s on the same `/changes`-only intercept
  - `cd apps/web && pnpm exec vitest --run utils/playwright/mail-inspect-command.test.ts` — 1 file, 4 passed: metadata `msg_*` ids match `thr_*` seeds; payload `{ read: false }` selects unread over an earlier mark-read
  - `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres UPSTASH_REDIS_URL=http://127.0.0.1:8079 UPSTASH_REDIS_TOKEN=dev_token pnpm -F inbox-zero-ai test:playwright:emulated mail/navigation-and-views.spec.ts` — 7 passed in 2.1m on `f271f69a4` plus the deep-link spec tweak (E26)
  - `cd apps/web && pnpm exec vitest --run utils/outlook/mailbox-sync.test.ts` — 1 file, 3 passed including archive folder mapping on delta pages
  - `cd apps/web && RUN_INTEGRATION_TESTS=true pnpm exec vitest --run __tests__/integration/outlook-mailbox-delta.test.ts` — 1 file, 1 passed: initial Graph deltaLink is `graph.microsoft.com` with `$deltatoken`; later pages keep that host; archived mail loses INBOX and gains ARCHIVE
  - `cd apps/web && RUN_INTEGRATION_TESTS=true pnpm exec vitest --run __tests__/integration/mail-engine/catch-up.test.ts __tests__/integration/google-emulator-oauth.test.ts` — 2 files, 4 passed including Outlook folder-move catch-up and Google RS256 OIDC
  - `pnpm --filter @inboxzero/desktop exec vitest run src/desktop.test.ts __tests__/mail-engine/electron-packaged-renderer.test.ts` — 2 files, 18 passed including linux-unpacked `file:` Compose smoke that ignores a restored hosted window (E23)
  - `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres UPSTASH_REDIS_URL=http://127.0.0.1:8079 UPSTASH_REDIS_TOKEN=dev_token pnpm -F inbox-zero-ai test:playwright:emulated mail/navigation-and-views.spec.ts` — 5 passed, 2 failed on `9ff948edb`: Drafts names Jordan Example, mixed threads show `Dana Example, me`, Promotions/label filters, engine reader without `/api/threads`; mark-unread inspect still returns the earlier mark-read (E24)
  - `pnpm --filter @inboxzero/desktop exec vitest run src/desktop.test.ts __tests__/mail-engine/owner.test.ts __tests__/mail-engine/electron-session.test.ts __tests__/mail-engine/electron-local-renderer.test.ts` — 4 files, 20 passed including local `file:` MailApp archive
  - `pnpm --filter @inboxzero/desktop build` — `apps/desktop/dist/renderer/index.html` + `main.js` (717062 bytes)
  - `pnpm --filter @inboxzero/desktop dist:linux` — `release/linux-unpacked/resources/app.asar` contains `/dist/renderer/index.html`
  - `PLAYWRIGHT_MAIL_PROVIDER=microsoft UPSTASH_REDIS_URL=http://127.0.0.1:8079 UPSTASH_REDIS_TOKEN=dev_token DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres pnpm -F inbox-zero-ai test:playwright:emulated mail/mail-engine-inspect.spec.ts` — 5 passed in 1.7m on `103154d78` (owner, reload, follower, reconnect)
  - `PLAYWRIGHT_MAIL_PROVIDER=microsoft ... pnpm -F inbox-zero-ai test:playwright:emulated mail/compose-drafts.spec.ts` — 3 passed in 2.0m on `d7e26a0ce`
  - `cd apps/web && pnpm exec vitest --run utils/outlook/draft.test.ts` — 1 file, 7 passed including changeKey and wildcard If-Match fallbacks
  - `PLAYWRIGHT_MAIL_PROVIDER=microsoft UPSTASH_REDIS_URL=http://127.0.0.1:8079 UPSTASH_REDIS_TOKEN=dev_token DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres pnpm -F inbox-zero-ai test:playwright:emulated mail/search.spec.ts` — 8 passed, 1 skipped (Gmail operators) in 2.1m
  - `PLAYWRIGHT_MAIL_PROVIDER=microsoft UPSTASH_REDIS_URL=http://127.0.0.1:8079 UPSTASH_REDIS_TOKEN=dev_token DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres pnpm -F inbox-zero-ai test:playwright:emulated mail/archive-reconciliation.spec.ts` — 2 passed in 1.4m; provider `microsoft`
  - `cd apps/web && pnpm exec vitest --run utils/mail-engine/threads-query.test.ts` — 1 file, 3 passed including subject/from/has:attachment operators
  - `cd apps/web && pnpm exec vitest --run utils/playwright/emulated-suite-selection.test.mjs` — 1 file, 32 passed
  - `UPSTASH_REDIS_URL=http://127.0.0.1:8079 UPSTASH_REDIS_TOKEN=dev_token DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres pnpm -F inbox-zero-ai test:playwright:emulated mail/compose-drafts.spec.ts` — 3 passed in 1.9m on `1f8a8b2e9`; log contains 0 `Invalid mailbox sync cursor` lines (was 33 on the previous compose-drafts run)
  - `cd apps/web && pnpm exec vitest --run utils/mail-api/source.test.ts` — 1 file, 8 passed including last-page provider history cursor
  - `cd apps/web && pnpm exec vitest --run utils/mail-api/operations.test.ts` — 1 file, 6 passed
  - `UPSTASH_REDIS_URL=http://127.0.0.1:8079 UPSTASH_REDIS_TOKEN=dev_token DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres pnpm -F inbox-zero-ai test:playwright:emulated mail/compose-drafts.spec.ts` — 3 passed in 1.9m; closed compose appears in Drafts, discard after reload removes it, send consumes the Gmail draft
  - `pnpm --filter @inboxzero/mail-sqlite test src/engine-bootstrap.test.ts src/store.test.ts src/engine-assistant.test.ts src/engine-search.test.ts` — 4 files, 25 passed including bootstrap tombstone of unseen messages
  - `cd apps/web && pnpm exec vitest --run utils/mail-engine/draft-content.test.ts utils/mail-api/operations.test.ts utils/mail-engine/reply-drafts.test.ts app/(app)/[emailAccountId]/compose/queued-reply.test.ts` — 4 files, 24 passed including frozen provider draft ids
  - `cd apps/web && pnpm exec vitest --run utils/mail-engine/worker-protocol.test.ts utils/mail-engine/wasm-sqlite.test.ts` — 2 files, 5 passed including account fence and wasm archive/new-mail
  - `pnpm --filter @inboxzero/desktop exec vitest run __tests__/mail-engine/electron-session.test.ts` — 1 file, 1 passed (real Electron + native SQLite)
  - `UPSTASH_REDIS_URL=http://127.0.0.1:8079 UPSTASH_REDIS_TOKEN=dev_token DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres pnpm -F inbox-zero-ai test:playwright:emulated mail/search.spec.ts` — 9 passed in 2.2m
  - `UPSTASH_REDIS_URL=http://127.0.0.1:8079 UPSTASH_REDIS_TOKEN=dev_token DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres pnpm -F inbox-zero-ai test:playwright:emulated mail/archive-reconciliation.spec.ts` — 2 passed in 1.4m; archived "Archive Action Message" stays hidden through succeeded
  - `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres pnpm -F inbox-zero-ai test:playwright:emulated mail/mail-engine-inspect.spec.ts` — 5 passed in 4.0m: live OPFS owner inspect, owner reload, follower second tab, blocked_auth reconnect click
  - `cd apps/web && pnpm exec vitest --run utils/mail-engine/tab-channel.test.ts utils/mail-engine/coverage.test.ts utils/mail-engine/stage-attachments.test.ts` — 3 files, 10 passed including closed-channel post, follower dispose, hung-coverage abort, and SHA-256 byte copy
  - `pnpm exec ultracite check` on tab-channel, MailEngineHost, coverage, and stage-attachments — pass
  - `cd apps/web && pnpm exec vitest --run utils/mail-engine/mutation-change.test.ts` — 1 file, 1 passed including unarchive/restore_from_trash
  - `pnpm exec ultracite check` on use-thread-actions and mutation-change test — pass
  - Previous checkpoint:
  - `pnpm exec ultracite check` on label-count cutover files — pass
  - `cd apps/web && pnpm exec vitest --run utils/mail-engine/label-count-targets.test.ts utils/swr-persistence.test.ts app/(app)/[emailAccountId]/mail/label-visibility.test.ts` — 3 files, 18 passed
  - Previous checkpoint:
  - `pnpm --filter @inboxzero/mail-sqlite test src/blob-store.test.ts` — 1 file, 3 passed including path-escaping blob ids
  - `cd apps/web && pnpm exec vitest --run utils/mail-engine/stage-attachments.test.ts` — 1 file, 3 passed
  - `pnpm --filter @inboxzero/mail-core --filter @inboxzero/mail-sqlite typecheck` — pass
  - `pnpm exec ultracite check` on blob-store, upload route, and blobId schema — pass
  - Previous checkpoint:
  - `cd apps/web && pnpm exec vitest --run store/sender-queue.test.ts store/archive-sender-queue.test.tsx app/(app)/[emailAccountId]/bulk-unsubscribe/hooks.test.ts utils/mail-engine/reply-drafts.test.ts utils/mail-engine/thread-mail-mutations.test.ts utils/attachments/opened-conversation.test.ts app/(app)/[emailAccountId]/compose/send-draft-reference.test.ts utils/email-send-operation-retention.test.ts hooks/useReplyDraftPersistence.test.ts utils/playwright/emulated-suite-targets.test.mjs utils/playwright/emulated-suite-selection.test.mjs` — 11 files, 79 passed
  - `pnpm exec ultracite check` on F5-changed files — pass
  - `pnpm --filter @inboxzero/mail-core --filter @inboxzero/mail-sqlite --filter @inboxzero/mail-ui --filter @inboxzero/desktop typecheck` — pass
  - `pnpm --filter @inboxzero/mail-core test` — 4 files, 11 passed
  - `pnpm --filter @inboxzero/mail-sqlite test` — 4 files, 22 passed including blocked_auth recover + missed/duplicate idle catch-up, blob metadata, and 10k/100k/1M list smoke (184s)
  - `pnpm --filter @inboxzero/desktop test` — 13 files, 60 passed including injected `postMessage` child and Electron `parentPort` transport
  - `pnpm --filter @inboxzero/mail-ui test` — 1 file, 1 passed
  - `cd apps/web && pnpm exec vitest --run utils/mail-api/operations.test.ts utils/mail-engine/coverage.test.ts utils/mail-engine/threads-query.test.ts utils/mail-engine/tab-channel.test.ts utils/mail-engine/worker-protocol.test.ts` — 5 files, 12 passed including staged-blob durable send
  - `cd apps/web && RUN_INTEGRATION_TESTS=true pnpm exec vitest --run __tests__/integration/mail-engine/http-archive.test.ts __tests__/integration/mail-engine/catch-up.test.ts __tests__/integration/mail-engine/search-body.test.ts` — 3 files, 6 passed
  - `pnpm exec biome check` on the files changed in this checkpoint — pass

## Checklist conventions

Check an item only after implementation and its required evidence exist. Link the evidence entry below. Mark blocked items in prose while leaving them unchecked. A partial implementation, mocked replacement of the boundary under test, skipped required test, or unavailable platform is not a pass. Explicitly approved scope changes must be recorded with their rationale; an agent cannot waive a requirement itself.

### A. Scope, contracts, and runnable ingestion

- [x] A1. Read applicable instructions/plan/skills; establish a dedicated `codex/` branch and preserve unrelated work.
- [x] A2. Inventory existing mail features and irreplaceable local user work; map each feature to a replacement contract and acceptance scenario.
- [x] A3. Record launch routing/session/authority decisions and resolve material product-semantic questions from the decision gates.
- [x] A4. Select provisional browser/desktop drivers and SQL feature profile; verify runtime feasibility without building speculative alternatives.
- [x] A5. Define shared Zod schemas, bounded HTTP resources, account authorization, protocol/version behavior, and operation identity.
- [x] A6. Demonstrate existing login -> backend -> Gmail/Outlook emulators -> real SQLite -> two subscribed queries; archive -> provider -> reconciliation.

A1 uses branch `cursor/mail-engine-0b4f` (cloud agent branch policy) rather than a `codex/` prefix. A6 uses the real `/api/mail/v1` route handlers and emulator providers; account auth is the integration test `withEmailProvider` harness rather than a browser cookie session. See evidence E2.

### B. Durable shared core

- [x] B1. Implement portable package boundaries, direct exports, package checks, and both Docker manifest entries.
- [x] B2. Implement normalized schema, migrations, atomic store methods, confirmed/effective state, and committed revisions.
- [x] B3. Implement query predicates, list/count consistency, coverage, deterministic pagination, and subscriptions.
- [x] B4. Implement durable admission, paginated conversation-membership preparation, atomic target/hash freeze, per-target outcomes, dependencies, claims, reconciliation, and explicit uncertainty; verify arrivals and stale resolution across the freeze boundary.
- [x] B5. Prove reference-model parity and real SQLite rollback/reopen/crash behavior with reproducible seeds.

B4: freeze-boundary coverage plus paginated membership (finish stays stale until the last page), mixed per-target applied/rejected outcomes (`needs_attention`), and overlapping-target command serialization. See evidence E1/E3/E4.
B5: reference archive-then-new-mail parity, write rollback, reopen of queued archive, and uncommitted SQLite crash recovery all pass on `node:sqlite`. See evidence E1/E3.

### C. Platform owners

- [ ] C1. Implement browser worker/OPFS ownership, cross-tab subscriptions, restart, capability handling, and account fencing.
- [ ] C2. Implement desktop native SQLite owner, authenticated transport, validated IPC, multiple windows, and process recovery.
- [ ] C3. Run shared contract scenarios on actual browser and desktop drivers; verify driver packaging on the declared runtime matrix.
- [ ] C4. Validate packed portable packages in a minimal Expo harness; do not migrate the existing mobile application.

Browser host uses a dedicated module worker when available, OPFS SAHPool when persistent, a Web Lock owner, account fencing in the worker (`createMailWorkerHost` serializes start and rejects a second accountId with `account_mismatch` even while the first engine is still creating), and a BroadcastChannel owner that serves follower-tab subscriptions. The inspect seam reports `role`, worker/locks/OPFS capabilities, and mailbox `connection`. Owner tabs ignore their own owner broadcast so they do not replace the live engine with a follower proxy. MailShell first-paints on the engine after metadata coverage; there is no IndexedDB mailbox list. Playwright inspect on a live Chromium session reports owner + OPFS + ready connection, a full reload stays `owner`, a second tab first-paints as `follower`, and `blocked_auth` shows a working Reconnect control. Closed BroadcastChannel posts no longer throw into the tab ErrorBoundary; disposing a follower rejects hung `getDiagnostics` calls. A follower bound to a different accountId is rejected with `account_mismatch`. Live Chromium with two signed-in accounts keeps the first tab as owner; the second account tab does not publish owner or follower inspect and does not first-paint the first account's mailbox (E34). Desktop has an in-process owner plus a utility-child runtime; a bundled `child_process.fork` of that entry now owns SQLite and deduplicates commands. Electron `utilityProcess.fork` is injected when present, the child speaks `parentPort`/`postMessage`, and an injected-fork unit test covers that shape. A real Electron binary now starts under Xvfb, admits archive through desktop IPC, and returns diagnostics from native `node:sqlite`. The owner pumps `runUntil` so conversation archive can leave preparing. Bundled `MailApp` boots from a `file:` renderer when `INBOX_ZERO_LOCAL_MAIL=1`; a live Electron session archived a seeded inbox conversation from that UI without loading Next. `electron-builder --linux dir` packages `/dist/renderer/index.html` into `app.asar`. The linux-unpacked product binary launches with `INBOX_ZERO_LOCAL_MAIL=1` and a restored hosted `windows.json`, boots bundled `MailApp` over `file:`, and shows Compose (E23). A second Electron process reopens the same native SQLite directory with the provider paused and keeps an archived conversation hidden (E31). Hosted Next over desktop IPC intercepts idle `/changes` with `blocked_auth` after coverage; `/enumeration` stays 0 and Reconnect follows the stubbed linking URL (E44). Real Electron vitest sessions skip when the downloaded binary is absent so GitHub package tests do not require it; local Xvfb evidence still stands. Packed portable packages have a Node pack-smoke script and an Expo/Metro-shaped import harness; a real Expo/Metro runtime was not launched. The shared `archiveThenNewMailScenario` now runs on sqlite-wasm as well as `node:sqlite`. A queued archive stays hidden after a live Chromium OPFS reload while provider execute is held (E29). `createWasmSqliteDriver({ persist: true })` cannot persist in Node: this runtime has no `navigator.storage.getDirectory` / SAHPool, so the driver opens `:memory:` and a close/reopen loses tables. Do not stub OPFS to fake that fixture; Chromium OPFS is the persist proof.

### D. Provider replication and repair

- [ ] D1. Implement Gmail bootstrap/history catch-up, expired-position recovery, and scoped coverage.
- [ ] D2. Implement Outlook folder discovery/delta, identity/move/removal semantics, repeated observations, and reset recovery.
- [ ] D3. Implement prioritized hydration/search/attachment ingestion, stale-response protection, and bounded backfill.
- [ ] D4. Implement wake/hint/periodic catch-up and repair; verify missing/duplicate notifications and auth/throttle recovery.
- [ ] D5. Pass the required dual-provider replication fault scenarios with independent provider/local-state inspection.

Source adapters try `getMailboxSyncPage` then fall back to pagination for emulator 401s. The last bootstrap enumeration page records the provider mailbox cursor (`getMailboxSyncPage` or the newest numeric Gmail `historyId`), not a list page token. Gmail history HTTP 404 rebuilds from snapshot (`reset: true`) (E32). Live emulator history.list 404 (injected; emulate lists empty history instead of 404) plus Gmail batch rewrite to the emulator maps `readChanges` to `reset_required` (E33). The Microsoft emulator now serves `GET /v1.0/me/mailFolders/:folderId/messages/delta` and returns a `https://graph.microsoft.com` `$deltatoken` cursor; later pages report folder moves with real well-known folder ids. After metadata coverage, Outlook idle catch-up posts `/changes` rather than re-enumerating (E27). `$deltatoken=expired` returns Graph `410 SyncStateNotFound`; `getMailboxSyncPage` rebuilds from snapshot and `readChanges` returns `reset_required` (E30). Expired/reset cursors rebuild from bootstrap. Membership is paginated. Stale hydration versions are rejected. Throttle maps to paused catch-up. Auth failures map to persisted `blocked_auth` diagnostics and recover to `ready`. Dual-provider integration inspects Gmail/Outlook archive, catch-up (including a duplicate idle pass), search, on-demand body, read, and SQLite reopen against provider state and committed SQLite. Shared-store idle catch-up applies a missed external archive and ignores a duplicate hint. Web `MailEngineConnectionBanner` renders reconnect/offline from mailbox `connection`. Live Playwright intercepts `/changes` with `blocked_auth`, shows the reconnect heading, and follows Reconnect to the stubbed linking URL. Hosted Electron wraps the Node mail request for the same intercept because Playwright `page.route` cannot see that fetch (E44).

### E. Complete operations, drafts, and assistant coexistence

- [ ] E1. Implement the full agreed metadata/bulk/container command inventory with partial outcomes and cancellation/undo semantics.
- [ ] E2. Integrate backend durable operation receipts and existing send authority without duplicate execution paths.
- [ ] E3. Implement revisioned drafts, durable blobs/uploads, frozen sends, uncertain-send recovery, and protected cleanup.
- [ ] E4. Implement agreed snooze/scheduling/provider-draft behavior and explicit server ownership transfer.
- [ ] E5. Implement separate assistant metadata ingestion and protect newer draft edits.
- [ ] E6. Prove assistant processing with client stopped, later client catch-up, and no regression in affected live assistant flows.

Metadata commands include snooze-as-archive with `prepareSnoozedThread` / `activatePreparedSnoozedThread` ownership transfer. Frozen send payloads include draft content; the executor calls `executeDurableEmailSend` and inspects `EmailSendOperation` receipts. Bulk execute records per-target applied/rejected outcomes. Local filesystem blob staging writes filename/content-type sidecars; blob ids must be a single `[A-Za-z0-9._-]` path segment and are resolved inside the account directory. HTTP uploads reject checksum mismatches and invalid blob ids; send execute loads those blobs into the durable send attachment payload. Assistant HTTP maps executed-rule actions; the engine applies catch-up archive metadata and refuses older draft proposals. Browser in-tab/worker and desktop hosts pass `createBackendAssistantSource`. Partial assistant pages persist the last executed-rule id. Gmail MailShell catch-up after a stopped client is proven (E35). Outlook MailShell catch-up after a stopped client is proven (E38). Outlook web starring through S, CommandK, and the reader menu is proven (E43). Desktop assistant UI and live assistant-flow regressions remain open.

### F. Product UI and local desktop shell

- [ ] F1. Implement thin React bindings and shared DOM mail UI with explicit host responsibilities.
- [ ] F2. Replace mail lists/splits/counts/readers/search/composer paths with the shared facade; account for the feature inventory.
- [ ] F3. Package a locally bootable desktop mail renderer and verify returning-user offline behavior.
- [ ] F4. Extend existing browser harness to Outlook and add actual desktop UI/engine coverage; inspect screenshots, traces and errors.
- [x] F5. Remove superseded mailbox caches, overlays, invalidation loops, and duplicate dispatchers for replaced flows.

Mail page waits for OPFS engine coverage, then first-paints MailShell inside `MailEngineProvider`. App layout starts `MailEngineRuntime` so CommandK, EmailViewer, and EmailList share the same client. Lists, search, archive/read/star/snooze, labels, reader, EmailList, CommandK, sidebar/desktop counts, and compose/send use the engine. IndexedDB mailbox cache, search index, mutation outbox, sync managers, and the user-work importer are deleted. Unsent compose persists through `saveDraft`/`readDraft`; send freezes `providerDraftId` and converts that provider draft. A completed bootstrap tombstones local messages the provider no longer returned. Gmail web compose-drafts Playwright is green (E18). Outlook web archive, search, compose-drafts, inspect, and starring Playwright are green via `PLAYWRIGHT_MAIL_PROVIDER=microsoft` (E20/E21/E43). Desktop MailApp boots from bundled `file:` assets and archives against native SQLite (E22); hosted Next is not required for that smoke. The linux-unpacked product binary launches with `INBOX_ZERO_LOCAL_MAIL=1` and ignores a restored hosted window (E23). A second Electron process reopens the same native SQLite file with the provider paused; an archived conversation stays hidden (E31). Hosted Next over desktop IPC searches and archives against Gmail and Outlook emulators (E36–E40). Hosted Gmail compose saves a draft into Drafts and native SQLite (E41). Hosted Outlook compose does the same (E42). Hosted Electron reconnects from `blocked_auth` catch-up without re-enumerating (E44). Hosted Electron discard removes the Drafts conversation from UI and native SQLite; send succeeds and appears in Sent (E45). Hosted Outlook discard, send, and `blocked_auth` reconnect through desktop IPC (E46). Hosted Outlook More actions Star writes native SQLite starred-inbox (E47). Hosted Gmail More actions Star does the same (E48). Hosted Gmail assistant catch-up after Electron stop hides Archive Action Message (E49). Hosted Outlook assistant catch-up does the same and counts GET `/assistant-state` (E50). Gmail web Drafts names Jordan Example; mixed threads show `Dana Example, me`; category filters use engine membership (E24). Navigation Playwright is green including KeyU unread inspect (E26).

### G. Scale, preservation, and release readiness

- [ ] G1. Benchmark 10k/100k/1M metadata corpora, query plans, long threads, multiple accounts, and multilingual search against agreed budgets.
- [ ] G2. Verify quota fairness, bounded memory/storage/background work, retention, disk pressure, and corruption/user-work recovery.
- [x] G3. Preserve irreplaceable beta user work through a focused restartable import if required; otherwise document why an importer is unnecessary.
- [ ] G4. Verify supported browser/desktop packaging, protocol upgrades, self-hosted behavior, and account/logout isolation.
- [ ] G5. Run the full required acceptance matrix; independently verify provider, committed local state, and visible UI for applicable scenarios.
- [ ] G6. Record emulator limitations and complete necessary bounded live-contract checks when authorized; no required gap silently waived.

### H. Simplification and independent review

- [ ] H1. Run a scoped simplifier subagent; integrate justified simplifications without changing behavior and rerun affected tests.
- [ ] H2. Run an independent reviewer subagent over the completed diff and requirements/evidence matrix.
- [ ] H3. Resolve valid correctness/security/data-loss/performance/test findings; document evidence for declined suggestions.
- [ ] H4. Validate the revised code and obtain follow-up review on substantive fixes; update plans and remove obsolete implementation notes.

### I. Pull request and green completion

- [ ] I1. Follow `create-pr`; stage only intended files, commit/push, create or update one implementation PR, and attach it to the task if supported.
- [ ] I2. Follow `pr-watch`; investigate/fix failing checks and answer every substantive review comment with evidence.
- [ ] I3. Complete the skill's exact-head green gate, including reviewer signals and a full observation after the final push/reply.
- [ ] I4. Deliver final PR URL, final verified head SHA, implementation/test evidence, performance results, addressed/declined feedback, and any unresolved thread status.

Do not merge or deploy as part of this ledger. The PR may be green while answered review threads remain formally unresolved; report that distinction and follow the skill's permission rule for resolving threads. A missing required approval/check is not green.

I1 may happen earlier as a draft when required CI-only platform validation needs a PR. Record incomplete gates and continue on that same PR; repeat final full-diff simplification/review before ready-for-review status. A draft, skipped required job, merge conflict, or unanswered actionable follow-up is not the final green gate.

The digest's green verdict is necessary but not sufficient: confirm required test jobs actually ran, inspect actionable follow-up replies and changes-requested reviews, and check mergeability and required approval/protection status. Do not bypass checks, dismiss reviews, or treat neutral/skipped jobs as acceptance evidence. Follow the skill's bounded watch and exact-head completion rules; a limit leaves a resumable incomplete checkpoint. Replies to comments on this PR are authorized by the implementation prompt; formal thread resolution, merging, and deployment require separate permission.

## Acceptance matrix

Expand this table from architecture section 13 before broad implementation. Link detailed results rather than filling cells with an unsupported checkmark. Each required provider/runtime cell needs a run result; `not applicable` needs a reason tied to actual scope.

| Scenario family | Gmail web | Outlook web | Gmail desktop | Outlook desktop | Shared/store evidence |
| --- | --- | --- | --- | --- | --- |
| Login/bootstrap/body/search/reopen | Partial: OPFS list after coverage (E13/E14); mailbox search (E16); category/label filters (E24) | Partial: Outlook search (E20); inspect coverage (E21) | Partial: hosted Next over desktop IPC lists and searches Archive Action Message (E36/E39) | Partial: hosted Next over desktop IPC lists and searches Outlook Archive Action Message (E37/E40) | Gmail+Outlook HTTP search/body/read/reopen (provider + SQLite) |
| Cross-view archive/counts/new mail | Partial: archive hide + succeeded (E15); queued archive survives OPFS reload (E29) | Partial: Outlook archive hide + succeeded (E20) | Partial: hosted Electron archive hide + native SQLite (E36/E39) | Partial: hosted Electron Outlook archive hide + native SQLite (E37/E40) | SQLite archive + reference parity; wasm `archiveThenNewMailScenario` (E29) |
| Metadata/bulk/container operations | Partial: KeyU unread inspect succeeded (E26) | Partial: Outlook starring S/CommandK/menu (E43) | Partial: hosted Electron More actions Star + native starred inbox (E48) | Partial: hosted Electron More actions Star + native starred inbox (E47) | Metadata change unit tests; Gmail/Outlook mark-read via HTTP; mixed bulk applied/rejected on SQLite |
| Missed hints/reset/moves/stale reads | Partial: idle catch-up `/changes` after coverage (E27); history 404 snapshot rebuild (E32) | Partial: Outlook idle catch-up `/changes` after folder-delta (E27); expired `$deltatoken` 410 rebuild (E30) | Not run | Not run | Gmail external archive + Outlook move catch-up (provider + SQLite); duplicate idle catch-up; expired/reset cursor + stale hydration; SQLite blocked_auth recover + missed archive hint |
| Before-dispatch failure/response loss/restart | Partial: owner reload (E14); queued archive hidden after OPFS reload (E29) | Partial: owner reload (E21) | Not run | Not run | Uncertain send reopen |
| Drafts/blobs/send uncertainty/late edits | Partial: compose Drafts restore/discard/send (E18) | Partial: compose Drafts restore/discard/send (E21) | Partial: hosted compose Drafts (E41); discard + send through desktop IPC (E45) | Partial: hosted Outlook compose Drafts (E42); discard + send through desktop IPC (E46) | Frozen send payload + provider draft id + durable send receipts + blob checksum reject + attachment sidecar send + assistant draft protection + bootstrap tombstone |
| Account/owner/session isolation | Partial: follower tab + owner reload (E14); worker in-flight fence + wrong-account follower (E28); two signed-in accounts in Chromium (E34) | Partial: follower tab + owner reload + reconnect (E21) | Partial: Electron process owns SQLite (E17); local MailApp `file:` boot (E22); linux-unpacked `INBOX_ZERO_LOCAL_MAIL=1` (E23); returning-user offline reopen (E31); hosted Electron `blocked_auth` reconnect (E44) | Partial: hosted Outlook `blocked_auth` reconnect without re-enumeration (E46) | Worker account fence + Web Lock owner + follower-tab channel + forked utility-child |
| Assistant while client stopped/catch-up | Partial: Gmail MailShell catch-up after stop (E35) | Partial: Outlook MailShell catch-up after stop (E38) | Partial: hosted Electron reopen after seeded ARCHIVE (E49) | Partial: hosted Electron reopen after seeded ARCHIVE (E50) | Engine assistant catch-up on SQLite |
| Coverage/retention/storage pressure | Partial: coverage-gated first paint (E13) | Partial: coverage-gated first paint (E21) | Not run | Not run | Coverage-gated UI cutover; G3 importer skipped (mail is not live) |
| Large-mailbox performance/offline boot | Not run | Not run | Partial: local MailApp `file:` archive without Next (E22); packaged binary ignores restored hosted URL (E23); returning-user native SQLite reopen (E31) | Not run | 10k/100k/1M conversation list/count smoke on `node:sqlite` (E51) |

## Evidence log

### E51. SQLite 10k/100k/1M list and count smoke (2026-09-19)

- Tasks: partial G1
- Tree: `cursor/mail-engine-0b4f` at `bc3de9fd5`
- Commands:
  - `pnpm --filter @inboxzero/mail-sqlite test src/store.test.ts -t "10k-conversation|100k conversations"` — 2 passed, 19 skipped in 17.18s
  - `pnpm --filter @inboxzero/mail-sqlite test src/store.test.ts -t "1M conversations"` — 1 passed, 20 skipped in 161.77s
- What it proved: `readMailboxView` lists 25 conversations and counts 10k, 100k, and 1M matching conversations in under 5s on `node:sqlite`.
- Limitations: no long-thread, multilingual, or multi-account corpora. Web/desktop UI offline cells remain Not run. Do not check G1.

### E50. Hosted Outlook assistant catch-up after Electron stop (2026-09-19)

- Tasks: partial C2/F3, partial E5/E6 desktop assistant
- Tree: `cursor/mail-engine-0b4f` at `53fd1b733`
- Commands:
  - `PLAYWRIGHT_MAIL_PROVIDER=microsoft DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres UPSTASH_REDIS_URL=http://127.0.0.1:8079 UPSTASH_REDIS_TOKEN=dev_token pnpm -F inbox-zero-ai test:playwright:emulated mail/hosted-electron-archive.spec.ts` — 8 passed in 2.4m; assistant 10.8s; star 6.4s; archive 30.9s
- What it proved: after the Outlook hosted owner closes, the spec seeds an APPLIED ARCHIVE ExecutedRule and archives via HTTP. A second launch with the same `ELECTRON_USER_DATA` hides Archive Action Message, native `role:inbox` does not contain the subject, inspect `assistantCursor` is `playwright-mail-assistant-archive-execution`, and GET `/assistant-state` ran once over `desktop-ipc`.
- Limitations: live LLM assistant chat/tool flows remain Not run. SQLite 10k/100k/1M list smoke is E51. Web offline remains Not run. Do not check C2/F3/E5/E6 boxes.

### E49. Hosted Gmail assistant catch-up after Electron stop (2026-09-19)

- Tasks: partial C2/F3, partial E5/E6 desktop assistant
- Tree: `cursor/mail-engine-0b4f` at `f4fa3c096`
- Commands:
  - `cd apps/web && pnpm exec vitest --run utils/playwright/emulated-suite-selection.test.mjs` — 1 file, 32 passed
  - `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres UPSTASH_REDIS_URL=http://127.0.0.1:8079 UPSTASH_REDIS_TOKEN=dev_token pnpm -F inbox-zero-ai test:playwright:emulated mail/hosted-electron-archive.spec.ts` — 8 passed in 2.6m; assistant 14.2s; star 9.4s; archive 28.4s
- What it proved: first hosted Electron launch sees Archive Action Message in the inbox and native SQLite. After the owner closes, the spec seeds an APPLIED ARCHIVE ExecutedRule and archives via HTTP. A second launch with the same `ELECTRON_USER_DATA` hides the conversation, native `role:inbox` does not contain the subject, and inspect `assistantCursor` is `playwright-mail-assistant-archive-execution` over `desktop-ipc`.
- Limitations: Outlook desktop assistant UI is E50. Live LLM assistant chat/tool flows remain Not run. Do not check C2/F3/E5/E6 boxes.

### E48. Hosted Gmail starring through desktop IPC (2026-09-19)

- Tasks: partial C2/F3, partial E1 Gmail-desktop metadata
- Tree: `cursor/mail-engine-0b4f` at `8af2726da`
- Commands:
  - `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres UPSTASH_REDIS_URL=http://127.0.0.1:8079 UPSTASH_REDIS_TOKEN=dev_token pnpm -F inbox-zero-ai test:playwright:emulated mail/hosted-electron-archive.spec.ts` — 6 passed, 1 failed in 3.2m; star 12.1s; discard 7.1s; send 18.3s; reconnect 6.6s; compose 11.2s
- What it proved: hosted Electron opens Second Unread Command Message over Gmail `desktop-ipc`, clicks More actions / Star with native `sendInputEvent` mouse events, the reader shows the starred marker, inspect `set_starred` succeeds, and native SQLite starred-inbox contains the subject.
- Limitations: the same run's search-then-archive timed out after Fast Refresh remounts (`Archive Action Message remained in the hosted inbox`); that archive path is already E36/E39. Desktop assistant UI is E49. Do not check C2/F3/E1 boxes.

### E47. Hosted Outlook starring through desktop IPC (2026-09-19)

- Tasks: partial C2/F3, partial E1 Outlook-desktop metadata
- Tree: `cursor/mail-engine-0b4f` at `332f90c9b`
- Commands:
  - `PLAYWRIGHT_MAIL_PROVIDER=microsoft DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres UPSTASH_REDIS_URL=http://127.0.0.1:8079 UPSTASH_REDIS_TOKEN=dev_token pnpm -F inbox-zero-ai test:playwright:emulated mail/hosted-electron-archive.spec.ts` — 7 passed in 2.1m; star 6.4s; discard 9.0s; send 16.8s; reconnect 7.5s
- What it proved: hosted Electron opens Second Unread Command Message over `desktop-ipc`, clicks More actions / Star with native `sendInputEvent` mouse events, the reader shows the starred marker, inspect `set_starred` succeeds, and native SQLite starred-inbox contains the subject.
- Limitations: Gmail desktop starring is E48. Desktop assistant UI remains Not run. Bulk/container UI remain Not run. Do not check C2/F3/E1 boxes.

### E46. Hosted Outlook discard, send, and reconnect through desktop IPC (2026-09-19)

- Tasks: partial C2/F3
- Tree: `cursor/mail-engine-0b4f` at `8ae2d6f1d`
- Commands:
  - `PLAYWRIGHT_MAIL_PROVIDER=microsoft DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres UPSTASH_REDIS_URL=http://127.0.0.1:8079 UPSTASH_REDIS_TOKEN=dev_token pnpm -F inbox-zero-ai test:playwright:emulated mail/hosted-electron-archive.spec.ts` — 6 passed, 1 failed in 2.1m; discard 7.8s; send 14.3s; reconnect 6.8s
- What it proved: Outlook hosted Electron discard removes Hosted desktop discard example from Drafts and native SQLite `role:draft`. Send observes the provider sent message so SQLite drops the draft role; inspect `kind:send` succeeds and Sent lists Hosted desktop send example over `desktop-ipc`. Reconnect still hits `/changes` without `/enumeration`.
- Limitations: hosted Electron starring remounted an empty conversation list (options=0) before More actions; starring is E47. Desktop assistant UI remains Not run. Do not check C2/F3 boxes.

### E45. Hosted Electron discard and send through desktop IPC (2026-09-19)

- Tasks: partial C2/F3
- Tree: `cursor/mail-engine-0b4f` at `cf5499b94`
- Commands:
  - `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres UPSTASH_REDIS_URL=http://127.0.0.1:8079 UPSTASH_REDIS_TOKEN=dev_token pnpm -F inbox-zero-ai test:playwright:emulated mail/hosted-electron-archive.spec.ts` — 6 passed in 2.1m; discard 10.2s; send 14.9s; reconnect 5.0s
- What it proved: a saved Hosted desktop discard example appears in Drafts and native SQLite `role:draft`, then is gone after Discard draft. A separate Electron launch sends Hosted desktop send example; inspect `kind:send` succeeds, native `role:draft` does not contain the subject, and Sent lists it over `desktop-ipc`.
- Limitations: Outlook desktop send/discard is E46. Desktop metadata and desktop assistant UI remain Not run. Do not check C2/F3 boxes.

### E44. Hosted Electron blocked_auth reconnect through desktop IPC (2026-09-19)

- Tasks: partial C2/F3
- Tree: `cursor/mail-engine-0b4f` at `5d7f837e8`
- Commands:
  - `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres UPSTASH_REDIS_URL=http://127.0.0.1:8079 UPSTASH_REDIS_TOKEN=dev_token pnpm -F inbox-zero-ai test:playwright:emulated mail/hosted-electron-archive.spec.ts` — 4 passed in 1.7m; reconnect 11.3s; archive 25.6s; compose 19.4s
- What it proved: after Archive Action Message is listed, the hosted Electron owner wraps Node `/changes` with `blocked_auth`. MailShell shows the reconnect banner. Inspect `connection` is `blocked_auth`. `/changes` is hit 5 times and `/enumeration` stays 0. Reconnect follows the stubbed linking URL (`reconnect=blocked`) over `desktop-ipc`.
- Limitations: Gmail desktop send/discard is E45. Outlook desktop send/discard/reconnect is E46. Desktop metadata and desktop assistant UI remain Not run. Do not check C2/F3 boxes.

### E43. Outlook web starring through CommandK (2026-09-19)

- Tasks: partial E1/F4
- Tree: `cursor/mail-engine-0b4f` at `33155a553`
- Commands:
  - `cd apps/web && RUN_INTEGRATION_TESTS=true pnpm exec vitest --run __tests__/integration/outlook-mailbox-flag.test.ts` — 1 file, 1 passed
  - `PLAYWRIGHT_MAIL_PROVIDER=microsoft DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres UPSTASH_REDIS_URL=http://127.0.0.1:8079 UPSTASH_REDIS_TOKEN=dev_token pnpm -F inbox-zero-ai test:playwright:emulated mail/starring.spec.ts` — 2 passed in 1.5m; spec 46.2s
- What it proved: emulate now persists Graph `flag.flagStatus` on PATCH, so catch-up does not wipe a keyboard star. CommandK then offers Unstar. Keyboard S, CommandK Unstar, reader S, and More actions Star/Unstar all succeed while the conversation stays unread. Inspect matches `{ starred }` payload on `thr_playwright_3`.
- Limitations: desktop metadata cells and bulk/container UI remain Not run. Do not check E1/F4 boxes.

### E42. Hosted Electron Outlook compose draft (2026-09-19)

- Tasks: partial C2/F3
- Tree: `cursor/mail-engine-0b4f` at `28710681b`
- Commands:
  - `PLAYWRIGHT_MAIL_PROVIDER=microsoft DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres UPSTASH_REDIS_URL=http://127.0.0.1:8079 UPSTASH_REDIS_TOKEN=dev_token pnpm -F inbox-zero-ai test:playwright:emulated mail/hosted-electron-archive.spec.ts` — 3 passed in 1.7m; archive 38.9s; compose 14.9s
- What it proved: the same hosted compose path against the Microsoft emulator. Drafts shows Hosted desktop draft example to recipient@example.com. Native SQLite `role:draft` contains the subject. Search-then-archive still hides Archive Action Message.
- Limitations: Outlook desktop send/discard/reconnect is E46. Do not check C2/F3 boxes.

### E41. Hosted Electron Gmail compose draft (2026-09-19)

- Tasks: partial C2/F3
- Tree: `cursor/mail-engine-0b4f` at `6ecae3253`
- Commands:
  - `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres UPSTASH_REDIS_URL=http://127.0.0.1:8079 UPSTASH_REDIS_TOKEN=dev_token pnpm -F inbox-zero-ai test:playwright:emulated mail/hosted-electron-archive.spec.ts` — 3 passed in 1.5m; compose 12.6s; archive 31.2s
- What it proved: hosted Next over `desktop-ipc` opens Compose, saves "Hosted desktop draft example" to recipient@example.com, and shows that conversation in Drafts. Native SQLite `role:draft` contains the subject. Search-then-archive still hides Archive Action Message.
- Limitations: desktop send/discard/reconnect remain Not run. Outlook desktop compose is E42. Do not check C2/F3 boxes.

### E40. Hosted Electron Outlook search then archive (2026-09-19)

- Tasks: partial C2/F3
- Tree: `cursor/mail-engine-0b4f` at `a2d980c79`
- Commands:
  - `PLAYWRIGHT_MAIL_PROVIDER=microsoft DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres UPSTASH_REDIS_URL=http://127.0.0.1:8079 UPSTASH_REDIS_TOKEN=dev_token pnpm -F inbox-zero-ai test:playwright:emulated mail/hosted-electron-archive.spec.ts` — 2 passed in 1.2m; spec 25.6s
- What it proved: the same hosted search+archive path against the Microsoft emulator. Search `Archive Action` leaves only Archive Action Message (Focused/Other, Follow Up). Clear restores Keyboard Navigation Message. Archive then removes Archive Action Message from MailShell and native SQLite.
- Limitations: desktop compose/reconnect remain Not run. Do not check C2/F3 boxes.

### E39. Hosted Electron Gmail search then archive (2026-09-19)

- Tasks: partial C2/F3
- Tree: `cursor/mail-engine-0b4f` at `a2d980c79`
- Commands:
  - `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres UPSTASH_REDIS_URL=http://127.0.0.1:8079 UPSTASH_REDIS_TOKEN=dev_token pnpm -F inbox-zero-ai test:playwright:emulated mail/hosted-electron-archive.spec.ts` — 2 passed in 1.2m; spec 24.8s
- What it proved: hosted Next over `desktop-ipc` searches `Archive Action`, hides Keyboard Navigation Message, clears back to the full inbox, then archives Archive Action Message. Native SQLite inbox no longer contains the subject.
- Limitations: desktop compose/reconnect remain Not run. Do not check C2/F3 boxes.

### E38. Outlook assistant archive catch-up after a stopped MailShell (2026-09-19)

- Tasks: partial E5/E6
- Tree: `cursor/mail-engine-0b4f` at `4a52864aa`
- Commands:
  - `PLAYWRIGHT_MAIL_PROVIDER=microsoft DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres UPSTASH_REDIS_URL=http://127.0.0.1:8079 UPSTASH_REDIS_TOKEN=dev_token pnpm -F inbox-zero-ai test:playwright:emulated mail/assistant-catch-up.spec.ts` — 2 passed in 1.4m; spec 36.2s
- What it proved: the same MailShell assistant catch-up against the Microsoft emulator. After unmount, an APPLIED ARCHIVE executed rule plus provider archive is seeded. Reopen hides Archive Action Message and hits `GET /api/mail/v1/accounts/.../assistant-state` 200.
- Limitations: desktop assistant UI and live LLM assistant chat/tool flows are still Not run. Do not check E5/E6 boxes.

### E37. Hosted Electron archive against the Outlook emulator (2026-09-19)

- Tasks: partial C2/F3
- Tree: `cursor/mail-engine-0b4f` at `7b54d1856`
- Commands:
  - `PLAYWRIGHT_MAIL_PROVIDER=microsoft DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres UPSTASH_REDIS_URL=http://127.0.0.1:8079 UPSTASH_REDIS_TOKEN=dev_token pnpm -F inbox-zero-ai test:playwright:emulated mail/hosted-electron-archive.spec.ts` — 2 passed in 1.2m; spec 26.2s
- What it proved: the same hosted Electron path against the Microsoft emulator (`emulate v0.11.1`). `transport: desktop-ipc`. Archive Action Message is in the Outlook MailShell list (Focused/Other, Follow Up), then gone after ListToolbar Archive. Native SQLite inbox no longer contains the subject. Screenshot taken after `window.show()`.
- Limitations: desktop compose/search/reconnect and Outlook assistant UI are still Not run. The same empty-body operations PUT log appeared after archive. Do not check C2/F3 boxes.

### E36. Hosted Electron archive against the Gmail emulator (2026-09-19)

- Tasks: partial C2/F3
- Tree: `cursor/mail-engine-0b4f` at `9497a1c19`
- Commands:
  - `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres UPSTASH_REDIS_URL=http://127.0.0.1:8079 UPSTASH_REDIS_TOKEN=dev_token pnpm -F inbox-zero-ai test:playwright:emulated mail/hosted-electron-archive.spec.ts` — 2 passed in 1.1m; spec 25.0s
- What it proved: hosted Next in Electron uses `inboxZeroDesktop.mailEngine` (`transport: desktop-ipc`, http URL not `file:`). After coverage, Archive Action Message is in the MailShell list. Selecting the row and clicking ListToolbar Archive removes it from the hosted list and from native SQLite `observeMailbox` inbox. Screenshot taken after `window.show()`.
- Limitations: Outlook desktop UI is still Not run. Compose/search/reconnect were not exercised in this window. A PUT to `/operations/:id` logged `Unexpected end of JSON input` after archive (inspect GET with a body is dropped by Chromium fetch); archive still succeeded. CI skips the spec when the Electron binary is missing. Do not check C2/F3 boxes.

### E35. Assistant archive catch-up after a stopped MailShell (2026-09-19)

- Tasks: partial E5/E6
- Tree: `cursor/mail-engine-0b4f` at `46cde218b`
- Commands:
  - `cd apps/web && pnpm exec vitest --run utils/mail-api/assistant-state.test.ts` — 1 file, 2 passed
  - `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres UPSTASH_REDIS_URL=http://127.0.0.1:8079 UPSTASH_REDIS_TOKEN=dev_token pnpm -F inbox-zero-ai test:playwright:emulated mail/assistant-catch-up.spec.ts` — 2 passed in 1.5m; spec 38.6s
- What it proved: in-tab and worker engines now receive `createBackendAssistantSource`. Desktop routed ports include the same assistant adapter. After MailShell unmounts, an APPLIED ARCHIVE executed rule plus provider archive is seeded. Reopen hides Archive Action Message, stores a non-empty assistant cursor, and hits `GET /api/mail/v1/accounts/.../assistant-state`.
- Limitations: Outlook web is now proven in E38. Desktop assistant UI and live LLM assistant chat/tool flows remain Not run. Do not check E5/E6 boxes.

### E34. Two signed-in Chromium accounts keep one owner (2026-09-19)

- Tasks: partial C1
- Tree: `cursor/mail-engine-0b4f` at `4c764afc6`
- Commands:
  - `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres UPSTASH_REDIS_URL=http://127.0.0.1:8079 UPSTASH_REDIS_TOKEN=dev_token pnpm -F inbox-zero-ai test:playwright:emulated mail/mail-engine-inspect.spec.ts` — 6 passed in 2.0m; two-account spec 13.2s
- What it proved: after the first account is owner with metadata coverage, a second signed-in account opened in another tab does not become owner or follower of the first account. The first tab keeps its mailbox. The second tab stays on the coverage loading spinner (Web Lock owner).
- Limitations: isolation is the owner lock plus inspect, not an in-page `account_mismatch` string. DedicatedWorkers are per tab; the in-worker fence still applies to a second start on the same worker (E28).

### E33. Gmail emulator history 404 rebuild (2026-09-19)

- Tasks: partial D1
- Tree: `cursor/mail-engine-0b4f` at `4c764afc6`
- Commands:
  - `cd apps/web && RUN_INTEGRATION_TESTS=true pnpm exec vitest --run __tests__/integration/gmail-mailbox-history.test.ts utils/gmail/mailbox-sync.test.ts` — 2 files, 11 passed
- What it proved: injected Gmail history HTTP 404 rebuilds from snapshot (`reset: true`) with inbox messages. `createEmailProviderMailboxSource.readChanges` returns `{ status: "reset_required", scopeId: "primary" }`. Gmail batch is rewritten from `gmail.googleapis.com` to the emulator. An invalid cursor also returns `reset_required`.
- Limitations: emulate 0.11.1 does not 404 unknown `startHistoryId`; the test injects that status. Cursor validation was not relaxed.

### E32. Gmail expired-history 404 snapshot rebuild (2026-09-19)

- Tasks: partial D1
- Tree: `cursor/mail-engine-0b4f` at `b0c8f34fc`
- Commands:
  - `cd apps/web && pnpm exec vitest --run utils/gmail/mailbox-sync.test.ts` — 1 file, 9 passed
- What it proved: `getGmailMailboxSyncPage` treats Gmail history `{ status: 404 }` as expired position recovery. The page is a snapshot rebuild (`reset: true`) with current inbox messages.
- Limitations: unit-mocked `getHistory`/`getMessagesBatch`. Emulator HTTP 404 plus `readChanges` is E33.

### E31. Desktop returning-user offline SQLite reopen (2026-09-19)

- Tasks: partial C2, partial F3
- Tree: `cursor/mail-engine-0b4f` at `10a177156`
- Commands:
  - `pnpm --filter @inboxzero/desktop exec vitest run __tests__/mail-engine/electron-local-renderer.test.ts` — 1 file, 2 passed in 4.28s
- What it proved: the first Electron process seeds Stay Local + Archive Local, archives Archive Local, and leaves inbox count 1. A second process with `ELECTRON_SKIP_SEED`/`ELECTRON_SKIP_ARCHIVE` loads the same native SQLite directory while the mailbox source is paused. Stay Local remains; Archive Local does not return.
- Limitations: fixture SQLite, not Gmail/Outlook desktop UI against emulators. Multi-window recovery and packaged installer offline boot of a live mailbox remain.

### E30. Outlook expired-delta 410 rebuild (2026-09-19)

- Tasks: partial D2
- Tree: `cursor/mail-engine-0b4f` at `7b518b6b0`
- Commands:
  - `cd apps/web && RUN_INTEGRATION_TESTS=true pnpm exec vitest --run __tests__/integration/outlook-mailbox-delta.test.ts` — 1 file, 2 passed in 2.13s
- What it proved: the patched Microsoft emulator returns Graph `410 SyncStateNotFound` for `$deltatoken=expired`. `getOutlookMailboxSyncPage` rebuilds from snapshot (`reset: true`) with a fresh deltaLink that does not reuse `deltatoken=expired`. `createEmailProviderMailboxSource.readChanges` maps that page to `{ status: "reset_required", scopeId: "primary" }`. Folder-delta archive mapping from E25 still holds.
- Limitations: per-folder discovery UI remains unproven. Gmail expired-history 404 rebuild is E32/E33.

### E1. Package unit tests (2026-09-18)

- Tasks: A4, B1–B3, partial B4/B5, partial C2
- Tree: uncommitted `cursor/mail-engine-0b4f`
- Commands:
  - `pnpm --filter @inboxzero/mail-core typecheck` — pass
  - `pnpm --filter @inboxzero/mail-sqlite typecheck` — pass
  - `pnpm --filter @inboxzero/mail-react typecheck` — pass
  - `pnpm --filter @inboxzero/mail-ui typecheck` — pass
  - `pnpm --filter @inboxzero/mail-core test` — 3 files, 7 passed
  - `pnpm --filter @inboxzero/mail-sqlite test` — 1 file, 6 passed
  - `pnpm --filter @inboxzero/mail-react test` — 1 file, 1 passed
  - `pnpm --filter @inboxzero/mail-ui test` — 1 file, 1 passed
  - `pnpm --filter @inboxzero/mail-core check-imports` — pass
  - `pnpm --filter @inboxzero/mail-sqlite check-imports` — pass
  - `pnpm --filter @inboxzero/desktop test` — 9 files, 54 passed
  - `pnpm --filter inbox-zero-ai exec vitest run utils/mail-api/observations.test.ts utils/mail-engine/threads-query.test.ts` — 2 files, 4 passed
- Limitations: emulator integration and Playwright UI cells not recorded on this tree; `use-mail-threads.test.tsx` hung in this environment and was not used as evidence.

### E2. Dual-provider HTTP archive slice (2026-09-18)

- Tasks: A6
- Commands: `cd apps/web && RUN_INTEGRATION_TESTS=true pnpm exec vitest --run __tests__/integration/mail-engine/archive-reconciliation.test.ts __tests__/integration/mail-engine/http-archive.test.ts utils/mail-engine/worker-protocol.test.ts`
- Result: 3 files, 5 passed
- What it proved: Gmail and Outlook emulator providers ingest through `createEmailProviderMailboxSource` and through the real `/api/mail/v1` route handlers into `node:sqlite`. Two subscribed mailbox queries (inbox and unread-inbox) agree. Archive updates provider state (Gmail labelIds / Outlook parentFolderId) and local effective roles. Auth is the integration `withEmailProvider` harness, not a browser login cookie.
- Limitations: no Playwright UI cell; GET inspect of operations was later wired to `executor.inspect` and needs a dedicated HTTP inspect case.

### E3. Freeze, crash, and expired-cursor rebuild (2026-09-18)

- Tasks: B4 (partial), B5, partial D1
- Commands: `pnpm --filter @inboxzero/mail-core --filter @inboxzero/mail-sqlite test`
- Result: mail-core 4 files / 10 passed; mail-sqlite 1 file / 9 passed
- What it proved: conversation preparation includes arrivals observed before freeze and rejects delayed pages after freeze or cancel; uncommitted `node:sqlite` writes roll back after connection close; idle catch-up rebuilds from bootstrap when `readChanges` returns `reset_required`.

### E4. Per-target outcomes, dependencies, pagination, stale hydration, assistant, blobs (2026-09-18)

- Tasks: B4, partial C1/C2, partial D1/D2/D4, partial E1/E3/E4/E5/E6
- Commands:
  - `pnpm --filter @inboxzero/mail-core --filter @inboxzero/mail-sqlite --filter @inboxzero/desktop test` — mail-core 10, mail-sqlite 16, desktop 56
  - `pnpm --filter @inboxzero/mail-core --filter @inboxzero/mail-sqlite --filter @inboxzero/mail-react --filter @inboxzero/mail-ui typecheck` — pass
  - `cd apps/web && pnpm exec vitest --run utils/mail-api/operations.test.ts utils/mail-api/source.test.ts utils/mail-api/assistant-state.test.ts utils/mail-engine/worker-protocol.test.ts` — 4 files, 7 passed
  - `cd apps/web && RUN_INTEGRATION_TESTS=true pnpm exec vitest --run __tests__/integration/mail-engine/archive-reconciliation.test.ts __tests__/integration/mail-engine/http-archive.test.ts` — 2 files, 4 passed
- What it proved: mixed bulk archive keeps applied vs rejected targets; overlapping commands serialize; conversation membership pages before freeze; older hydration versions are stale; assistant catch-up archives while protecting newer drafts; filesystem blobs stage/finalize; Gmail/Outlook HTTP archive still converges; membership pagination and throttle/reset mapping on the EmailProvider source; desktop utility-child runtime deduplicates commands for multiple windows.
- Limitations: Playwright/UI cells still not run; Electron `utilityProcess.fork` is runtime-selected but not launched in this environment; Expo harness not run; send receipts and IndexedDB importer remain open.

### E5. Send receipts, catch-up, followers, import, wasm/expo (2026-09-18)

- Tasks: partial C1–C4, partial D1/D2/D4/D5, partial E2–E4, partial F3, partial G1/G3
- Commands:
  - `pnpm --filter @inboxzero/mail-core --filter @inboxzero/mail-sqlite --filter @inboxzero/desktop test` — mail-core 10, mail-sqlite 17, desktop 57
  - `pnpm --filter @inboxzero/mail-core --filter @inboxzero/mail-sqlite --filter @inboxzero/mail-react --filter @inboxzero/mail-ui typecheck` — pass
  - `pnpm --filter @inboxzero/mail-core pack:expo-smoke` — pass
  - `cd apps/web && pnpm exec vitest --run utils/mail-api/operations.test.ts utils/mail-api/source.test.ts utils/mail-api/assistant-state.test.ts utils/mail-engine/tab-channel.test.ts utils/mail-engine/indexeddb-import.test.ts utils/mail-engine/worker-protocol.test.ts utils/mail-engine/wasm-sqlite.test.ts` — 7 files, 17 passed
  - `cd apps/web && RUN_INTEGRATION_TESTS=true pnpm exec vitest --run __tests__/integration/mail-engine/archive-reconciliation.test.ts __tests__/integration/mail-engine/http-archive.test.ts __tests__/integration/mail-engine/catch-up.test.ts` — 3 files, 6 passed
- What it proved: send execute uses `executeDurableEmailSend` and inspect reads `EmailSendOperation`; snooze archives then transfers to the server scheduler; frozen send payloads include draft recipients/html; Gmail emulator external archive and Outlook archive/move catch-up update committed SQLite and match provider folder/label state; follower tabs receive owner snapshots over an in-memory bus; desktop IPC returns mailbox snapshots; IndexedDB draft/mutation import is restartable; in-memory sqlite-wasm runs the shared store; Expo harness checks portable packages for Node/Electron/Prisma imports.
- Limitations: no Playwright or packaged Electron session; sqlite-wasm test is Node memory, not OPFS; Expo harness is not a Metro runtime; 100k/1M budgets and live assistant UI flows not run; IndexedDB path still owns mail lists until coverage is complete.

### E6. Coverage-gated cutover, search/body/read, scale, child fork (2026-09-18)

- Tasks: partial C2, partial D1/D2/D3/D5, partial F2, G1
- Commands: see Resume state last validation.
- What it proved: lists/actions stay on the legacy path until metadata coverage is complete; engine list threads include `parentFolderId` for `build:ci`; provider search candidates hydrate into SQLite and become locally queryable; Gmail and Outlook HTTP search/body/mark-read/reopen inspect provider unread/read state and committed SQLite; diagnostics expose privacy-safe command summaries; a bundled `child_process.fork` of the desktop utility-child owns SQLite and deduplicates commands; 10k/100k/1M conversation list/count smokes stay under 5s query time on `node:sqlite`.
- Limitations: Playwright inspect spec is written but not run in this checkpoint; Electron `utilityProcess.fork` and live OPFS still unverified; IndexedDB owners remain until F5; live assistant UI and attachment-backed sends remain open.

### E7. Attachment send, connection diagnostics, Electron parentPort (2026-09-18)

- Tasks: partial C2, partial D4, partial E3, partial F1
- Commands: see Resume state last validation.
- What it proved: staged blob filename/content-type metadata is written beside bytes and loaded into `executeDurableEmailSend`; `accounts.connection` persists `blocked_auth` then recovers to `ready`; idle catch-up applies a missed archive and a duplicate hint without duplicating conversations; MailApp surfaces reconnect/offline from mailbox `connection`; desktop owner injects Electron-shaped `postMessage` children and the utility child replies on `parentPort`.
- Limitations: Playwright inspect spec and packaged Electron/OPFS sessions still unrun; live assistant UI remains open.

### E8. IndexedDB mailbox deletion and G3 skip (2026-09-18)

- Tasks: F5, G3
- Tree: `cursor/mail-engine-0b4f`
- Commands: see Resume state last validation and the F5 deletion commit `a12cdbab7`.
- What it proved: IndexedDB mailbox cache, search index, mutation outbox, sync managers, and the user-work importer are deleted. Unsent compose drafts stay in memory for the current session. G3 importer is skipped because the mail client is not live (decision D3). MailShell reader/list errors use the LoadingContent shape instead of a generic `Error`. There is no remaining TypeScript import of `email-cache`, `indexeddb-import`, `MailboxSyncManager`, or `MailMutationOutboxManager`.
- Limitations: Playwright inspect and packaged Electron/OPFS sessions still unrun; live assistant UI remains open; UI matrix cells remain Not run.

### E9. OPFS inspect contract and connection banner (2026-09-18)

- Tasks: partial C1, partial D4, partial C4
- Tree: `cursor/mail-engine-0b4f`
- Commands: see Resume state last validation.
- What it proved: `__inboxZeroMailInspect` now reports owner/follower role plus worker/locks/OPFS capabilities; owner tabs do not demote themselves to followers on their own owner broadcast; web UI surfaces `blocked_auth` reconnect and `offline` retry copy from mailbox `connection`; Expo pack-smoke still passes. Playwright inspect spec asserts owner+OPFS+ready connection on a live mail page (not run in this checkpoint).
- Limitations: Playwright inspect and packaged Electron sessions still unrun; Expo harness is not a Metro runtime.

### E10. Blob id path containment (2026-09-18)

- Tasks: partial E3, partial H3
- Tree: `cursor/mail-engine-0b4f`
- Commands: see Resume state last validation.
- What it proved: filesystem blob ids must be a single `[A-Za-z0-9._-]` segment; paths are resolved and rejected if they leave the store directory; HTTP `uploadId` uses the same schema. Parameter’s path-traversal note on `createFileBlobStore` is addressed.
- Limitations: none for this finding.

### E11. Engine-owned sidebar and desktop counts (2026-09-18)

- Tasks: partial F2
- Tree: `cursor/mail-engine-0b4f`
- Commands: see Resume state last validation.
- What it proved: sidebar label/folder counts and the desktop unread badge subscribe to `observeMailbox` on the same effective predicates as the lists. Pending read/archive no longer patches a separate SWR `/api/labels/counts` overlay. That HTTP route remains for other clients; the mail UI does not fetch it.
- Limitations: Playwright inspect and packaged Electron sessions still unrun; composer restore is still in-memory.

### E12. MetadataChange build:ci fix (2026-09-18)

- Tasks: partial I2
- Tree: `cursor/mail-engine-0b4f`
- Commands: `cd apps/web && pnpm exec vitest --run utils/mail-engine/mutation-change.test.ts` — 1 file, 1 passed; `pnpm exec ultracite check` on `use-thread-actions.ts`.
- What it proved: undo compensation uses `mutationPayloadToChange` (`unarchive` / `restore_from_trash`) instead of an undeclared `MetadataChange` name that failed `build:ci`.
- Limitations: `build:ci` itself is not run locally (repo instruction).

### E13. Live OPFS inspect, hydration, and bootstrap coverage (2026-09-18)

- Tasks: partial C1
- Tree: `cursor/mail-engine-0b4f`
- Commands: see Resume state last validation.
- What it proved: MailCoverageGate hydrates with the shared loading shell instead of the SSR storage-error copy. A `runUntil` slice that expires during `beginBootstrap` still enumerates and writes metadata coverage. Playwright `mail-engine-inspect.spec.ts` first-paints the conversations listbox and asserts owner + OPFS + ready connection. Combined-mail `ThreadsQuery` identity is memoized so the list does not hit a React maximum-update-depth overlay.
- Limitations: packaged Electron remains unrun.

### E14. Follower tabs, blocked_auth reconnect, and closed-channel recovery (2026-09-18)

- Tasks: partial C1, partial D4
- Tree: `cursor/mail-engine-0b4f` at `c0646b685`
- Commands:
  - `cd apps/web && pnpm exec vitest --run utils/mail-engine/tab-channel.test.ts utils/mail-engine/coverage.test.ts utils/mail-engine/stage-attachments.test.ts` — 3 files, 10 passed
  - `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres pnpm -F inbox-zero-ai test:playwright:emulated mail/mail-engine-inspect.spec.ts` — 5 passed in 4.0m (reload added on `54b863172`)
- What it proved: a second Chromium tab first-paints the conversations list as `follower` while the original tab stays `owner`. A full reload first-paints again as `owner`. `BroadcastChannel.postMessage` after unmount no longer throws into the ErrorBoundary. Disposing a follower rejects in-flight `getDiagnostics`. Coverage wait aborts when diagnostics hang. Intercepted `/changes` `blocked_auth` shows Reconnect and navigates to the stubbed linking URL. SHA-256 hashing copies `Uint8Array` bytes so `build:ci` accepts `crypto.subtle.digest`.
- Limitations: live account-fencing and packaged Electron remain open.

### E15. Gmail web archive reconciliation (2026-09-18)

- Tasks: partial G5, partial F2
- Tree: `cursor/mail-engine-0b4f` at `9e57a7123`
- Commands: `UPSTASH_REDIS_URL=http://127.0.0.1:8079 UPSTASH_REDIS_TOKEN=dev_token DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres pnpm -F inbox-zero-ai test:playwright:emulated mail/archive-reconciliation.spec.ts` — 2 passed in 1.4m
- What it proved: selecting Archive Action Message and Archive hides it immediately; diagnostics reach `succeeded`; a later page still omits that conversation. A 20s succeeded poll was too short when mail/v1 membership/execute each paid Redis-less middleware; the spec now waits 60s. Local Redis on 8079 made this run finish in 86s.
- Limitations: Outlook web and both desktop archive cells are unrun; sidebar count/new-mail cells in the same family are unrun.

### E16. Gmail web mailbox search (2026-09-18)

- Tasks: partial G5, partial F2, partial D3
- Tree: `cursor/mail-engine-0b4f` at `ec90b86d7`
- Commands: `UPSTASH_REDIS_URL=http://127.0.0.1:8079 UPSTASH_REDIS_TOKEN=dev_token DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres pnpm -F inbox-zero-ai test:playwright:emulated mail/search.spec.ts` — 9 passed in 2.2m
- What it proved: single-account and all-account search filters the engine list and clears back to inbox; slash focuses search; advanced Gmail operators restore; Has the words still filters; contact and recent-search suggestions appear.
- Limitations: body/reopen UI cells and Outlook/desktop search remain unrun.

### E17. Worker account fence, wasm archive contract, Electron SQLite session (2026-09-18)

- Tasks: partial C1, partial C2, partial C3
- Tree: `cursor/mail-engine-0b4f` at `5e3704a65`
- Commands:
  - `cd apps/web && pnpm exec vitest --run utils/mail-engine/worker-protocol.test.ts utils/mail-engine/wasm-sqlite.test.ts` — 2 files, 5 passed
  - `pnpm --filter @inboxzero/desktop exec vitest run __tests__/mail-engine/electron-session.test.ts` — 1 file, 1 passed
- What it proved: `workerStartFence` allows the first account and the same account again, and returns `account_mismatch` for a second account. sqlite-wasm keeps inbox counts aligned across archive and a later inbound message. A real Electron 43 binary under Xvfb admits archive through desktop IPC and returns `getDiagnostics` from native `node:sqlite`.
- Limitations: packaged installer/offline desktop boot and live multi-account tab fencing remain unrun.

### E18. Gmail web compose drafts discard and send (2026-09-18)

- Tasks: partial F2, partial E3, partial G5
- Tree: `cursor/mail-engine-0b4f` at `a5a5d635c`
- Commands: `UPSTASH_REDIS_URL=http://127.0.0.1:8079 UPSTASH_REDIS_TOKEN=dev_token DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres pnpm -F inbox-zero-ai test:playwright:emulated mail/compose-drafts.spec.ts` — 3 passed in 1.9m
- What it proved: closing a new message with an attachment creates a Drafts row; reload restores the composer; discard deletes the Gmail draft and leaves Drafts without that conversation; send converts the provider draft so `/api/threads?type=draft` is empty for that subject.
- Limitations: Outlook web and both desktop compose cells remain unrun.

### E19. Bootstrap catch-up cursor (2026-09-18)

- Tasks: partial D1
- Tree: `cursor/mail-engine-0b4f` at `1f8a8b2e9`
- Commands:
  - `cd apps/web && pnpm exec vitest --run utils/mail-api/source.test.ts` — 1 file, 8 passed
  - `UPSTASH_REDIS_URL=http://127.0.0.1:8079 UPSTASH_REDIS_TOKEN=dev_token DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres pnpm -F inbox-zero-ai test:playwright:emulated mail/compose-drafts.spec.ts` — 3 passed in 1.9m; `Invalid mailbox sync cursor` count 0 (33 on the prior compose-drafts log)
- What it proved: finishing enumeration stores a decodeable Gmail history cursor from `getMailboxSyncPage`, or the newest numeric message `historyId` if that call fails. Live compose-drafts catch-up no longer logs invalid cursors.
- Limitations: Outlook folder-delta catch-up after bootstrap still uses a single primary stream; expired-history 404 still rebuilds via `reset_required`.

### E20. Outlook web archive and search Playwright (2026-09-18)

- Tasks: partial F4, partial G5
- Tree: `cursor/mail-engine-0b4f` at `2c2307742`
- Commands:
  - `PLAYWRIGHT_MAIL_PROVIDER=microsoft ... pnpm -F inbox-zero-ai test:playwright:emulated mail/archive-reconciliation.spec.ts` — 2 passed in 1.4m
  - `PLAYWRIGHT_MAIL_PROVIDER=microsoft ... pnpm -F inbox-zero-ai test:playwright:emulated mail/search.spec.ts` — 8 passed, 1 skipped in 2.1m
- What it proved: the browser harness starts the Microsoft emulator, signs in through `/oauth2/v2.0/authorize`, and first-paints MailShell from Outlook-shaped SQLite. Archiving "Archive Action Message" stays hidden through succeeded. Inbox search and Outlook Keywords advanced search keep that conversation and hide Keyboard Navigation Message. Gmail operator search remains skipped on Outlook.
- Limitations: Outlook compose-drafts and inspect Playwright not run in this checkpoint; desktop UI still unrun.

### E21. Outlook web compose-drafts and inspect Playwright (2026-09-18)

- Tasks: partial F4, partial G5, partial D4
- Tree: `cursor/mail-engine-0b4f` at `103154d78`
- Commands:
  - `cd apps/web && pnpm exec vitest --run utils/outlook/draft.test.ts` — 1 file, 7 passed
  - `PLAYWRIGHT_MAIL_PROVIDER=microsoft ... pnpm -F inbox-zero-ai test:playwright:emulated mail/compose-drafts.spec.ts` — 3 passed in 2.0m
  - `PLAYWRIGHT_MAIL_PROVIDER=microsoft ... pnpm -F inbox-zero-ai test:playwright:emulated mail/mail-engine-inspect.spec.ts` — 5 passed in 1.7m
- What it proved: Outlook compose updates a mailbox draft even when Graph omits `@odata.etag` (changeKey or unconditional If-Match). Closing a new message shows it in Drafts; discard and send leave the conversation gone. Inspect reports owner + OPFS + ready, reload stays owner, a second tab is follower, and blocked_auth reconnect works when idle catch-up hits `/enumeration` (Outlook has no folder-delta cursor on the emulator).
- Limitations: packaged installer/offline desktop boot still unrun; Outlook folder-delta after bootstrap 404s on the unpatched emulator. The local pnpm patch now serves folder-delta (E25).

### E22. Local desktop MailApp renderer (2026-09-18)

- Tasks: partial C2, partial F3
- Tree: `cursor/mail-engine-0b4f` at `c24b7d8ad`
- Commands:
  - `pnpm --filter @inboxzero/desktop exec vitest run src/desktop.test.ts __tests__/mail-engine/owner.test.ts __tests__/mail-engine/electron-session.test.ts __tests__/mail-engine/electron-local-renderer.test.ts` — 4 files, 20 passed
  - `pnpm --filter @inboxzero/desktop build` — `dist/renderer/index.html` and `dist/renderer/main.js`
  - `pnpm --filter @inboxzero/desktop dist:linux` — `release/linux-unpacked/resources/app.asar` contains `/dist/renderer/index.html`
- What it proved: Electron 43 under Xvfb loads bundled `MailApp` from a `file:` URL (not a hosted Next document), shows seeded "Local Mail Example", and Archive clears that inbox conversation in native SQLite. File-URL navigation is allowed only for the bundled renderer path. The desktop owner pumps `runUntil` so conversation membership/archive can finish. Linux dir packaging includes the renderer assets.
- Limitations: Gmail/Outlook desktop UI cells remain unrun; compose/search/reconnect desktop UI remain unrun.

### E23. Packaged linux-unpacked local MailApp (2026-09-18)

- Tasks: partial C2, partial F3
- Tree: `cursor/mail-engine-0b4f` at `a7ddd6963`
- Commands:
  - `pnpm --filter @inboxzero/desktop dist:linux`
  - `pnpm --filter @inboxzero/desktop exec vitest run src/desktop.test.ts __tests__/mail-engine/electron-packaged-renderer.test.ts` — 2 files, 18 passed in 1.59s
- What it proved: Product `main` and the linux-unpacked `@inboxzerodesktop` binary, given `INBOX_ZERO_LOCAL_MAIL=1` plus a restored `https://www.getinboxzero.com/.../mail` `windows.json`, load bundled `MailApp` from a `file:` renderer URL (not hosted Next) and show Compose. Smoke prints `ELECTRON_PACKAGED_LOCAL_MAIL` and exits.
- Limitations: Gmail/Outlook desktop UI cells remain unrun; this smoke does not exercise archive/search/compose against a live mailbox.

### E24. Drafts names, mixed-thread senders, and category filters (2026-09-18)

- Tasks: partial F2, partial F4
- Tree: `cursor/mail-engine-0b4f` at `9ff948edb`
- Commands:
  - `cd apps/web && pnpm exec vitest --run utils/mail-engine/list-thread.test.ts utils/mail-engine/threads-query.test.ts` — 2 files, 14 passed
  - `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres UPSTASH_REDIS_URL=http://127.0.0.1:8079 UPSTASH_REDIS_TOKEN=dev_token pnpm -F inbox-zero-ai test:playwright:emulated mail/navigation-and-views.spec.ts` — 5 passed, 2 failed in 4.3m
- What it proved: Drafts shows Jordan Example next to the Draft marker. Mixed inbox threads show `Dana Example, me`. Promotions/category and Project Alpha label filters return the matching conversation. Opening a thread uses the engine reader (`/api/threads` count stays 0).
- Limitations: mark-unread Keyboard U still leaves inspect's latest `set_read` as `read: true` (open-thread mark-read); deep-link mark-read did not appear as pending. Not used as unread-command evidence.

### E25. Outlook emulator folder-delta catch-up (2026-09-18)

- Tasks: partial D2
- Tree: `cursor/mail-engine-0b4f` at `2b9aaaa1e`
- Commands:
  - `cd apps/web && pnpm exec vitest --run utils/outlook/mailbox-sync.test.ts` — 1 file, 3 passed
  - `cd apps/web && RUN_INTEGRATION_TESTS=true pnpm exec vitest --run __tests__/integration/outlook-mailbox-delta.test.ts` — 1 file, 1 passed
  - `cd apps/web && RUN_INTEGRATION_TESTS=true pnpm exec vitest --run __tests__/integration/mail-engine/catch-up.test.ts __tests__/integration/google-emulator-oauth.test.ts` — 2 files, 4 passed
- What it proved: the patched Microsoft emulator serves `GET /v1.0/me/mailFolders/:folderId/messages/delta`. The first page returns a `https://graph.microsoft.com` `$deltatoken` cursor. Later pages keep that host. Archiving a message is visible on the next delta as ARCHIVE, not INBOX. Engine catch-up still applies Outlook folder moves. Google RS256 identity tokens still verify.
- Limitations: still a single primary inbox stream; per-folder discovery UI remains unproven. Live Outlook inspect Playwright was not rerun on this head. Expired-delta 410 rebuild is E30.

### E29. Queued archive survives OPFS reload (2026-09-19)

- Tasks: partial C3
- Tree: `cursor/mail-engine-0b4f` at `0ad57446b`
- Commands:
  - `cd apps/web && pnpm exec vitest --run utils/mail-engine/wasm-sqlite.test.ts` — included in the 13-pass C1/C3 vitest run; `archiveThenNewMailScenario` matches the reference mailbox on sqlite-wasm
  - `UPSTASH_REDIS_URL=http://127.0.0.1:8079 UPSTASH_REDIS_TOKEN=dev_token DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres pnpm -F inbox-zero-ai test:playwright:emulated mail/archive-reconciliation.spec.ts` — 3 passed in 1.7m; OPFS reload 13.6s
- What it proved: sqlite-wasm replays the same archive-then-new-mail fixture as `node:sqlite`. On live Chromium OPFS, holding provider execute keeps a queued archive hidden after reload; the conversation does not return from bootstrap while the command is still local.
- Limitations: the OPFS proof is the product engine path, not `persist: true` of `createWasmSqliteDriver` inside Node. Desktop UI archive cells and crash rollback on OPFS remain.

### E28. Worker start fence during in-flight create (2026-09-19)

- Tasks: partial C1
- Tree: `cursor/mail-engine-0b4f` at `c58624b50`
- Commands:
  - `cd apps/web && pnpm exec vitest --run utils/mail-engine/worker-session.test.ts utils/mail-engine/worker-protocol.test.ts utils/mail-engine/tab-channel.test.ts utils/mail-engine/wasm-sqlite.test.ts` — 4 files, 13 passed
- What it proved: `createMailWorkerHost` serializes DedicatedWorker `start`. A second account is `account_mismatch` while the first `createEngine` is still gated. The same account reuses the running engine. Close clears the claim so another account can start. A follower bound to a different accountId is rejected with `account_mismatch`.
- Limitations: live multi-account Chromium fencing (two signed-in accounts in one browser) is still unrun.

### E27. Outlook idle catch-up hits `/changes` after folder-delta (2026-09-19)

- Tasks: partial D2, partial D4
- Tree: `cursor/mail-engine-0b4f` at `36e1ab9ec`
- Commands:
  - `cd apps/web && pnpm exec vitest --run utils/playwright/mail-inspect-command.test.ts` — 1 file, 4 passed
  - `PLAYWRIGHT_MAIL_PROVIDER=microsoft UPSTASH_REDIS_URL=http://127.0.0.1:8079 UPSTASH_REDIS_TOKEN=dev_token DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres pnpm -F inbox-zero-ai test:playwright:emulated mail/mail-engine-inspect.spec.ts` — 5 passed in 1.8m; reconnect 12.8s
  - `UPSTASH_REDIS_URL=http://127.0.0.1:8079 UPSTASH_REDIS_TOKEN=dev_token DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres pnpm -F inbox-zero-ai test:playwright:emulated mail/mail-engine-inspect.spec.ts` — 5 passed in 1.8m; Gmail reconnect 10.7s
- What it proved: after metadata coverage, Outlook idle catch-up uses the stored folder-delta cursor and POSTs `/changes`. Reconnect intercepts only that path with `blocked_auth`; `/enumeration` stays 0. Gmail reconnect stays on `/changes` with the same spec. `build:ci` inspect payload matching no longer indexes a union with `string`.
- Limitations: still a single primary inbox stream; per-folder discovery UI remains unproven. Expired-delta 410 rebuild is E30.

### E26. Navigation inspect matches metadata message ids (2026-09-18)

- Tasks: partial F2, partial F4, partial E1 Gmail-web metadata
- Tree: `cursor/mail-engine-0b4f` at `f271f69a4`
- Commands:
  - `cd apps/web && pnpm exec vitest --run utils/playwright/mail-inspect-command.test.ts` — 1 file, 4 passed
  - `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres UPSTASH_REDIS_URL=http://127.0.0.1:8079 UPSTASH_REDIS_TOKEN=dev_token pnpm -F inbox-zero-ai test:playwright:emulated mail/navigation-and-views.spec.ts` — 7 passed in 2.1m
- What it proved: after prepare finishes, KeyU unread is an `admitExact` metadata command with `msg_*` ids and empty `conversationIds`. Inspect helpers map `thr_playwright_reader` onto those members and filter `{ read: false }`, so the toast path records succeeded unread. Deep-link reader waits for a settled snapshot and the Mark as unread control; auto mark-read is not required when the snapshot is already read. Engine in-flight statuses map to reconciling, not pending.
- Limitations: starring, label, undo, and partial-bulk UI remain unrecorded. Outlook web and desktop metadata cells remain Not run.

## Decision and deviation log

### D0. Launch ingestion/command route

- Requirement: select production ingestion before broad implementation.
- Alternatives: existing login + backend-mediated Gmail/Graph; direct native provider fetches; full server mailbox replica.
- Chosen: existing product login and connected-account grants, with backend-mediated mail access for web and Electron. Direct-native reads and a server replica are out of scope.
- Rationale: authorized by the implementation goal. Source/executor ports remain the replacement seam.
- Approval: implementation prompt / user goal.
- Affected contracts: `MailboxSource`, `OperationExecutor`, `/api/mail/v1/accounts/[accountId]/*`.

### D1. Conversation matching, ordering, and counts

- Conversation inclusion: at least one effective message satisfies the entire predicate. `inbox AND unread` cannot be satisfied by two different messages.
- Counts: distinct account-qualified conversations for the same predicate. Unread count uses matching unread messages.
- Ordering: newest matching message timestamp, then stable account/conversation identity.
- Action target boundary: freeze commit. Arrivals discovered during membership preparation may be included; arrivals after freeze cannot widen the executable payload. Preparation is observable and is not presented as a completed archive.
- These are the plan's proposed defaults, adopted so implementation can proceed. They are product-visible; change them only with an explicit product decision.

### D2. SQLite drivers and SQL profile

- Browser: `@sqlite.org/sqlite-wasm` with OPFS SAHPool, following the existing search-index owner/lock pattern. No IndexedDB mailbox fallback.
- Desktop and Node tests: `node:sqlite` (`DatabaseSync`) so native code stays out of the web/Docker install graph. Electron utility-process ownership is still required before host cutover.
- SQL profile: parameterized statements, foreign keys, WAL on durable files, FTS5 when available, integer booleans, integer timestamps, JSON only for immutable payloads and membership id arrays.

### D3. Irreplaceable local user work

- Provider message caches and the search index are disposable and can be resynced.
- The mail client is not live. There is no irreplaceable IndexedDB user work to import. Skip the importer (G3) and resync from providers into SQLite.

### D5. MailShell list provider cutover

- Requirement: replace MailShell lists after metadata coverage without a mid-session swap. Do not keep an IndexedDB mailbox fallback.
- Chosen: `MailEngineRuntime` starts in the authenticated app layout and provides the client as soon as the engine starts. The mail page still waits for metadata coverage before first-painting MailShell. Reader, EmailList, CommandK, sender-queue batches, label counts via `observeMailbox`, and compose/send use the engine. IndexedDB mailbox cache, search index, mutation outbox, sync managers, and the user-work importer are deleted. Unsent compose persists through `saveDraft`/`readDraft`.
- Rationale: the original plan builds the engine as if the IndexedDB cache did not exist (opening line, browser “no IndexedDB mailbox fallback”, F2/F5, Stage 6 “no indefinite dual-write layer”). The previous `MAIL_ENGINE_LISTS_ENABLED = false` path was a CI workaround, not a product decision.
- Approval: implementation prompt; product owner confirmed IndexedDB should not remain.
- Affected contracts: `MailEngineHost`, `MailEngineRuntime`, `useThread`, `useMailThreads`, `EmailList`, `CommandK`, `useLabelCounts`, `layout.tsx`, `queueReaderEmail`, `submitSend`.

## PR observation log

- PR: https://github.com/elie222/inbox-zero/pull/3793
- Observed SHA `c07a12588`: VERDICT failures. Tests 1/2 failed at `pnpm check` (repo-wide biome, including pre-existing `console.error` in desktop auto-update plus mail package script format). `build:ci` failed on `MailShell.tsx` calling `.commit()` on engine `optimisticallyUpdateThreads()` which returned `Promise<void>`. CodeQL flagged `extractEmail` regex in `query-semantics.ts`.
- Fix in this checkpoint: engine thread hook returns a synchronous `{ commit, rollback }` object; `extractEmail` no longer uses a regular expression; pack-smoke/check-imports formatted.
- Observed SHA `c3a6e438b`: VERDICT failures. `inbox-zero-ai#build:ci` TypeScript error in `apps/web/utils/mail-api/assistant-state.ts` (`kind` union of `ActionType` vs `ExecutedRuleStatus`). CLA conversation still open.
- Fix in this checkpoint: assistant-state `kind` is `string`; send/snooze/catch-up/follower/import work lands on the same draft PR.
- Observed SHA `d1e3d74cf`: VERDICT failures. `inbox-zero-ai#build:ci` TypeScript error in `apps/web/utils/mail-engine/list-thread.ts` (`parentFolderId` missing on engine list messages). CLA conversation still open.
- Fix in this checkpoint: engine list messages include `parentFolderId`; coverage-gated UI cutover, search/body/read, 100k/1M scale, and child-process fork land on the same draft PR.

## Feature inventory (A2)

Replacement contract is the shared `MailClient` facade unless noted.

| Current surface | Replacement |
| --- | --- |
| Thread lists / combined inbox / splits / counts | `observeMailbox` + split predicate compilation |
| Reader | `observeConversation` + `ensureMessageContent` |
| Search | query AST + provider `search` candidates through canonical ingestion |
| Archive/read/star/trash/spam/move/labels | `submitMetadata` / `submitConversations` |
| Compose / drafts / send / scheduled | `saveDraft` / `submitSend` + existing server send ledger |
| Snooze | `submitMetadata` snooze + server `prepareSnoozedThread` / `activatePreparedSnoozedThread` |
| Desktop shell | engine utility process + local `mail-ui` renderer (`INBOX_ZERO_LOCAL_MAIL=1`); default windows still host the web URL for login/settings |
