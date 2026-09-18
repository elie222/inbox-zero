# Mail engine implementation task ledger

Status: implementation in progress. Shared packages, SQLite store, backend-mediated source/executor, browser/desktop hosts, and first dual-provider archive slice exist. Full acceptance matrix is not green.

Read the [implementation plan](./mail-engine-plan.md), including its architecture, interfaces, implementation map, and review notes.

## Resume state

- Current milestone: Stage 1 HTTP-mediated archive slice verified locally; freeze/crash/reset catch-up added. Stage 2–6 remaining. CI lint/build failures on the previous SHA are being fixed.
- Branch/worktree: `cursor/mail-engine-0b4f`
- Last implementation commit: pending this checkpoint (HTTP A6, freeze/crash, worker/desktop owner, expired-cursor rebuild, inspect GET, MailShell type fix).
- Pull request: https://github.com/elie222/inbox-zero/pull/3793 (draft)
- Current task: land CI type/lint fixes, then continue Stage 2–6 (replication faults, drafts/assistant, UI cutover, acceptance matrix, simplifier/reviewer, green PR).
- Next action: after this push, watch CI; if green enough, run Playwright mail archive and remaining provider fault matrix.
- Blockers or decisions requiring user input: none for the authorized existing-login/backend-mediated route.
- Running processes/subagents: `pr-digest --watch 3793` (last verdict: failures — Tests 1/2 lint, build:ci MailShell type error, CodeQL regex).
- Last validation:
  - `pnpm --filter @inboxzero/mail-core --filter @inboxzero/mail-sqlite --filter @inboxzero/mail-react --filter @inboxzero/mail-ui --filter @inboxzero/desktop test` — pass (mail-core 10, mail-sqlite 9, desktop 55)
  - `cd apps/web && RUN_INTEGRATION_TESTS=true pnpm exec vitest --run __tests__/integration/mail-engine/archive-reconciliation.test.ts __tests__/integration/mail-engine/http-archive.test.ts utils/mail-engine/worker-protocol.test.ts` — 3 files, 5 passed (Gmail+Outlook EmailProvider and HTTP `/api/mail/v1` archive)

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
- [ ] B4. Implement durable admission, paginated conversation-membership preparation, atomic target/hash freeze, per-target outcomes, dependencies, claims, reconciliation, and explicit uncertainty; verify arrivals and stale resolution across the freeze boundary.
- [x] B5. Prove reference-model parity and real SQLite rollback/reopen/crash behavior with reproducible seeds.

B4 now has freeze-boundary coverage (arrivals during preparation included, post-freeze arrivals excluded, delayed pages stale, cancel-during-prepare). Per-target bulk outcomes and command dependencies are still incomplete.
B5: reference archive-then-new-mail parity, write rollback, reopen of queued archive, and uncommitted SQLite crash recovery all pass on `node:sqlite`. See evidence E1/E3.

### C. Platform owners

- [ ] C1. Implement browser worker/OPFS ownership, cross-tab subscriptions, restart, capability handling, and account fencing.
- [ ] C2. Implement desktop native SQLite owner, authenticated transport, validated IPC, multiple windows, and process recovery.
- [ ] C3. Run shared contract scenarios on actual browser and desktop drivers; verify driver packaging on the declared runtime matrix.
- [ ] C4. Validate packed portable packages in a minimal Expo harness; do not migrate the existing mobile application.

Browser host currently uses OPFS SAHPool (or memory) on the owning tab with a Web Lock, not a dedicated worker. Desktop has a Node SQLite owner, recovery test, and validated IPC parser/dispatcher; local renderer is stubbed and not the boot path. Expo pack smoke script exists but has not been run to completion.

### D. Provider replication and repair

- [ ] D1. Implement Gmail bootstrap/history catch-up, expired-position recovery, and scoped coverage.
- [ ] D2. Implement Outlook folder discovery/delta, identity/move/removal semantics, repeated observations, and reset recovery.
- [ ] D3. Implement prioritized hydration/search/attachment ingestion, stale-response protection, and bounded backfill.
- [ ] D4. Implement wake/hint/periodic catch-up and repair; verify missing/duplicate notifications and auth/throttle recovery.
- [ ] D5. Pass the required dual-provider replication fault scenarios with independent provider/local-state inspection.

Source adapters try `getMailboxSyncPage` then fall back to pagination for emulator 401s. History/delta fault matrix is not evidenced.

### E. Complete operations, drafts, and assistant coexistence

- [ ] E1. Implement the full agreed metadata/bulk/container command inventory with partial outcomes and cancellation/undo semantics.
- [ ] E2. Integrate backend durable operation receipts and existing send authority without duplicate execution paths.
- [ ] E3. Implement revisioned drafts, durable blobs/uploads, frozen sends, uncertain-send recovery, and protected cleanup.
- [ ] E4. Implement agreed snooze/scheduling/provider-draft behavior and explicit server ownership transfer.
- [ ] E5. Implement separate assistant metadata ingestion and protect newer draft edits.
- [ ] E6. Prove assistant processing with client stopped, later client catch-up, and no regression in affected live assistant flows.

Metadata commands and frozen-draft/uncertain-send store paths exist. Uploads return unsupported. Assistant HTTP is an empty page. No Prisma receipt ledger yet.

### F. Product UI and local desktop shell

- [ ] F1. Implement thin React bindings and shared DOM mail UI with explicit host responsibilities.
- [ ] F2. Replace mail lists/splits/counts/readers/search/composer paths with the shared facade; account for the feature inventory.
- [ ] F3. Package a locally bootable desktop mail renderer and verify returning-user offline behavior.
- [ ] F4. Extend existing browser harness to Outlook and add actual desktop UI/engine coverage; inspect screenshots, traces and errors.
- [ ] F5. Remove superseded mailbox caches, overlays, invalidation loops, and duplicate dispatchers for replaced flows.

Mail page mounts `MailEngineHost`; list/actions use the engine when the provider is present and keep the previous path otherwise. Shared `MailApp` has list/archive/read/search/reader. Old IndexedDB owners are not removed.

### G. Scale, preservation, and release readiness

- [ ] G1. Benchmark 10k/100k/1M metadata corpora, query plans, long threads, multiple accounts, and multilingual search against agreed budgets.
- [ ] G2. Verify quota fairness, bounded memory/storage/background work, retention, disk pressure, and corruption/user-work recovery.
- [ ] G3. Preserve irreplaceable beta user work through a focused restartable import if required; otherwise document why an importer is unnecessary.
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
| Login/bootstrap/body/search/reopen | Not run | Not run | Not run | Not run | Partial store reopen |
| Cross-view archive/counts/new mail | Not run | Not run | Not run | Not run | SQLite archive + reference parity |
| Metadata/bulk/container operations | Not run | Not run | Not run | Not run | Metadata change unit tests |
| Missed hints/reset/moves/stale reads | Not run | Not run | Not run | Not run | Not run |
| Before-dispatch failure/response loss/restart | Not run | Not run | Not run | Not run | Uncertain send reopen |
| Drafts/blobs/send uncertainty/late edits | Not run | Not run | Not run | Not run | Frozen draft conflict |
| Account/owner/session isolation | Not run | Not run | Not run | Not run | Not run |
| Assistant while client stopped/catch-up | Not run | Not run | Not run | Not run | Not run |
| Coverage/retention/storage pressure | Not run | Not run | Not run | Not run | Not run |
| Large-mailbox performance/offline boot | Not run | Not run | Not run | Not run | Not run |

## Evidence log

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
- Pending `mailMutations` and unsynced `replyDrafts` (plus their local attachments) are irreplaceable until acknowledged. Cutover must inventory and preserve them or document why a given installation has none. No importer yet.

## PR observation log

- PR: https://github.com/elie222/inbox-zero/pull/3793
- Observed SHA `c07a12588`: VERDICT failures. Tests 1/2 failed at `pnpm check` (repo-wide biome, including pre-existing `console.error` in desktop auto-update plus mail package script format). `build:ci` failed on `MailShell.tsx` calling `.commit()` on engine `optimisticallyUpdateThreads()` which returned `Promise<void>`. CodeQL flagged `extractEmail` regex in `query-semantics.ts`.
- Fix in this checkpoint: engine thread hook returns a synchronous `{ commit, rollback }` object; `extractEmail` no longer uses a regular expression; pack-smoke/check-imports formatted.
- Review comments awaiting reply: CodeQL polynomial regex (will reply after push); CLA assistant (cannot sign; draft PR).

## Feature inventory (A2)

Replacement contract is the shared `MailClient` facade unless noted.

| Current surface | Replacement |
| --- | --- |
| Thread lists / combined inbox / splits / counts | `observeMailbox` + split predicate compilation |
| Reader | `observeConversation` + `ensureMessageContent` |
| Search | query AST + provider `search` candidates through canonical ingestion |
| Archive/read/star/trash/spam/move/labels | `submitMetadata` / `submitConversations` |
| Compose / drafts / send / scheduled | `saveDraft` / `submitSend` + existing server send ledger |
| Snooze | later explicit command + server scheduler transfer (E4) |
| Desktop shell | engine utility process + local `mail-ui` renderer; current app currently hosts the web URL |
