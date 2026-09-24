import type {
  Admission,
  SubmitConversationCommand,
  SubmitMetadataCommand,
} from "./commands";
import type {
  DraftReadResult,
  DraftSaveResult,
  SaveDraft,
  SubmitSend,
} from "./drafts";
import type {
  ConversationKey,
  DraftKey,
  LocalRevision,
  MessageKey,
  OperationKey,
} from "./identities";
import type { OperationState } from "./operations";
import type { MailboxSource } from "./ports/mailbox-source";
import type {
  AccountSyncState,
  MailStore,
  SyncStreamPosition,
} from "./ports/mail-store";
import type { OperationExecutor } from "./ports/operation-executor";
import type { AssistantStateSource } from "./ports/assistant-source";
import type { ScopeDescriptor } from "./ports/mailbox-source";
import type { HostRuntime } from "./ports/runtime";
import { webCryptoSha256 } from "./canonical";
import { extractTextPredicates } from "./query-semantics";
import type {
  ConversationQuery,
  MailboxCountsQuery,
  MailboxCountsView,
  MailboxView,
  QueryHandle,
} from "./queries";
import {
  createQueryRegistry,
  mailboxCountsQueryKey,
  mailboxQueryKey,
} from "./subscriptions";
import type { ConversationView } from "./ports/mail-store";
import type { BlobStore } from "./ports/blob-store";

const MAX_BOOTSTRAP_PAGES_PER_RUN = 25;
const NON_ADVANCING_BOOTSTRAP_RETRY_MS = 60_000;
const IDLE_CATCH_UP_INTERVAL_MS = 60_000;
const MAX_MAILBOX_WINDOW_PAGES = 40;

export type WorkAdmission =
  | { status: "scheduled" | "already_satisfied" }
  | { status: "rejected"; code: "invalid_account" | "storage_unavailable" };

export type MailDiagnostics = {
  accountId: string;
  revision: LocalRevision;
  connection: "ready" | "offline" | "blocked_auth";
  coverage: import("./queries").Coverage[];
  pendingOperations: number;
  uncertainOperations: number;
  pendingJobs: number;
  oldestPendingAtMs: number | null;
  commands: Array<{
    operationId: string;
    status: OperationState["status"];
    kind: string;
    changeKind: string | null;
    change: Record<string, unknown> | null;
    messageIds: string[];
    conversationIds: string[];
  }>;
};

export type MailboxWindowHandle = QueryHandle<MailboxView> & {
  loadMore(): Promise<void>;
};

export type MailboxWindowOptions = {
  pageCount?: number;
};

export type DraftAttachmentInput = {
  accountId: string;
  draftId: string | null;
  attachmentId: string;
  filename: string;
  contentType: string;
  checksum: string;
  sizeBytes: number;
  bytes: AsyncIterable<Uint8Array>;
  inline?: boolean;
};

export type MailClient = {
  observeMailbox(query: ConversationQuery): QueryHandle<MailboxView>;
  observeMailboxCounts(
    query: MailboxCountsQuery,
  ): QueryHandle<MailboxCountsView>;
  observeMailboxWindow?(
    query: ConversationQuery,
    options?: MailboxWindowOptions,
  ): MailboxWindowHandle;
  observeConversation(
    key: ConversationKey,
    page: { after: string | null; pageSize: number },
  ): QueryHandle<ConversationView>;
  observeOperation(key: OperationKey): QueryHandle<OperationState>;
  submitMetadata(input: SubmitMetadataCommand): Promise<Admission>;
  submitConversations(input: SubmitConversationCommand): Promise<Admission>;
  saveDraft(input: SaveDraft): Promise<DraftSaveResult>;
  readDraft(key: DraftKey): Promise<DraftReadResult>;
  stageDraftAttachment(
    input: DraftAttachmentInput,
  ): Promise<{ status: "staged" } | { status: "rejected"; code: string }>;
  submitSend(input: SubmitSend): Promise<Admission>;
  cancelOperation(
    key: OperationKey,
  ): Promise<
    | { status: "cancelled"; revision: LocalRevision }
    | { status: "too_late" | "not_found" }
  >;
  requestSync(accountIds: string[]): Promise<WorkAdmission>;
  ensureMessageContent(key: MessageKey): Promise<WorkAdmission>;
  getDiagnostics(accountId: string): Promise<MailDiagnostics>;
  purgeAccount(accountId: string): Promise<LocalRevision>;
  close?(): Promise<void>;
};

export type MailEngine = MailClient & {
  runUntil(deadlineMs: number, signal?: AbortSignal): Promise<void>;
  inspect(): Promise<import("./ports/mail-store").MailStoreInspection>;
  close(): Promise<void>;
};

export function createMailEngine(input: {
  store: MailStore;
  source: MailboxSource;
  executor: OperationExecutor;
  runtime: HostRuntime;
  ownerId?: string;
  assistant?: AssistantStateSource;
  blobStore?: BlobStore;
  idleCatchUpIntervalMs?: number;
}): MailEngine {
  const { store, source, executor, runtime } = input;
  const idleCatchUpIntervalMs =
    input.idleCatchUpIntervalMs ?? IDLE_CATCH_UP_INTERVAL_MS;
  const ownerId = input.ownerId ?? "local-owner";
  const assistant = input.assistant;
  const blobStore = input.blobStore;
  const queries = createQueryRegistry();
  let evictedForCurrentPressure = false;
  const idleCatchUpGates = new Map<string, IdleCatchUpGate>();
  let refreshGate: Promise<void> | null = null;
  let refreshQueued = false;

  async function refreshViews() {
    refreshQueued = true;
    if (refreshGate) return refreshGate;
    refreshGate = drainRefreshes().finally(() => {
      refreshGate = null;
    });
    return refreshGate;
  }

  async function drainRefreshes() {
    while (refreshQueued) {
      refreshQueued = false;
      await queries.refreshAll();
    }
  }

  return {
    observeMailbox(query) {
      enqueueSearches(query);
      return queries.observe(mailboxQueryKey(query), () =>
        store.readMailboxView(query).then((result) => ({
          revision: result.revision,
          data: result.view,
        })),
      );
    },
    observeMailboxCounts(query) {
      return queries.observe(mailboxCountsQueryKey(query), () =>
        store.readMailboxCounts(query).then((result) => ({
          revision: result.revision,
          data: result.view,
        })),
      );
    },
    observeMailboxWindow(query, options) {
      enqueueSearches(query);
      let pageCount = normalizePageCount(options?.pageCount);
      const key = `mailbox-pages:${runtime.randomId()}`;
      const handle = queries.observe(key, () =>
        store.readMailboxWindow(query, pageCount).then((result) => ({
          revision: {
            databaseEpoch: `${result.revision.databaseEpoch}:pages:${pageCount}`,
            sequence: result.revision.sequence,
          },
          data: result.view,
        })),
      );
      return {
        ...handle,
        async loadMore() {
          pageCount += 1;
          await queries.refreshKey(key);
        },
      };
    },
    observeConversation(key, page) {
      return queries.observe(
        `conversation:${key.accountId}:${key.conversationId}:${page.after ?? ""}:${page.pageSize}`,
        () =>
          store.readConversation(key, page).then((result) => ({
            revision: result.revision,
            data: result.view,
          })),
      );
    },
    observeOperation(key) {
      return queries.observe(
        `operation:${key.accountId}:${key.operationId}`,
        async () => {
          const result = await store.readOperation(key);
          return {
            revision: result.revision,
            data: result.operation ?? {
              key,
              status: "failed",
              authority: "backend",
              attempts: 0,
              nextAttemptAtMs: null,
              error: { code: "not_found", retryable: false },
            },
          };
        },
      );
    },
    async submitMetadata(command) {
      const admission = await store.admitMetadata(command);
      await refreshViews();
      return admission;
    },
    async submitConversations(command) {
      const admission = await store.admitConversations(command);
      await refreshViews();
      return admission;
    },
    saveDraft(inputDraft) {
      return store.saveDraft(inputDraft);
    },
    readDraft(key) {
      return store.readDraft(key);
    },
    async stageDraftAttachment(input) {
      if (!blobStore) {
        return { status: "rejected", code: "storage_unavailable" };
      }
      const stagedLocal = await blobStore.stage({
        blobId: input.attachmentId,
        bytes: input.bytes,
        checksum: input.checksum,
        sizeBytes: input.sizeBytes,
      });
      if (stagedLocal.status !== "staged") {
        return { status: "rejected", code: stagedLocal.code };
      }
      const finalized = await blobStore.finalize(input.attachmentId);
      if (!finalized)
        return { status: "rejected", code: "storage_unavailable" };
      return store.stageDraftAttachment({
        accountId: input.accountId,
        draftId: input.draftId,
        attachmentId: input.attachmentId,
        filename: input.filename,
        contentType: input.contentType,
        checksum: input.checksum,
        sizeBytes: input.sizeBytes,
        inline: input.inline,
      });
    },
    async submitSend(send) {
      const admission = await store.admitSend(send);
      await refreshViews();
      return admission;
    },
    async cancelOperation(key) {
      const result = await store.cancelOperation(key);
      await refreshViews();
      return result;
    },
    async requestSync(accountIds) {
      if (accountIds.length === 0) {
        return { status: "rejected", code: "invalid_account" };
      }
      for (const accountId of accountIds) idleCatchUpGates.delete(accountId);
      await store.releaseDeferredOperations({
        accountIds,
        nowMs: runtime.nowMs(),
      });
      return { status: "scheduled" };
    },
    async ensureMessageContent(key) {
      await store.enqueueHydration({ keys: [key], purpose: "body" });
      return { status: "scheduled" };
    },
    getDiagnostics(accountId) {
      return store.getDiagnostics(accountId);
    },
    async purgeAccount(accountId) {
      idleCatchUpGates.delete(accountId);
      const revision = await store.purgeAccount(accountId);
      await refreshViews();
      return revision;
    },
    inspect() {
      return store.inspect();
    },
    async runUntil(deadlineMs, signal) {
      if (signal?.aborted || runtime.nowMs() >= deadlineMs) return;
      const pressure = await runtime.storagePressure();
      if (!pressure) {
        evictedForCurrentPressure = false;
      } else if (!evictedForCurrentPressure) {
        const { evictedBodies } = await store.evictReplaceableContent();
        evictedForCurrentPressure = true;
        if (evictedBodies > 0) await refreshViews();
      }
      while (runtime.nowMs() < deadlineMs) {
        if (signal?.aborted) return;
        const work = await store.claimWork({
          ownerId,
          nowMs: runtime.nowMs(),
          leaseMs: 30_000,
        });
        if (!work) {
          await catchUpIdleAccounts(deadlineMs, signal);
          return;
        }
        if (work.kind === "command") {
          const result = await executor.execute({
            operation: work.operation,
            attemptId: work.attemptId,
            signal: signal ?? new AbortController().signal,
          });
          await store.settleAttempt({
            attemptId: work.attemptId,
            operation: work.operation,
            result,
          });
          await refreshViews();
          continue;
        }
        if (work.kind === "inspect") {
          const result = await executor.inspect({
            operation: work.operation,
            receiptId: work.receiptId,
            signal: signal ?? new AbortController().signal,
          });
          await store.settleAttempt({
            attemptId: work.attemptId,
            operation: work.operation,
            result,
          });
          await refreshViews();
          continue;
        }
        if (work.kind === "upload") {
          await runAttachmentUpload({
            work,
            blobStore,
            executor,
            store,
            runtime,
            signal: signal ?? new AbortController().signal,
          });
          await refreshViews();
          continue;
        }
        if (work.kind === "prepare") {
          const membership = await source.readConversationMembership({
            session: work.session,
            requestId: work.resolutionId,
            signal: signal ?? new AbortController().signal,
            conversation: work.conversation,
            resolutionId: work.resolutionId,
            page: work.page,
            pageSize: 100,
          });
          if (membership.status !== "ok") {
            await store.deferPreparation({
              accountId: work.accountId,
              commandId: work.commandId,
              attemptId: work.attemptId,
              nextAttemptAtMs:
                membership.status === "paused"
                  ? runtime.nowMs() + membership.retryAfterMs
                  : runtime.nowMs() + 60_000,
            });
            await noteConnection(work.accountId, membership.status);
            continue;
          }
          if (membership.value.status === "not_found") {
            await store.failPreparation({
              accountId: work.accountId,
              commandId: work.commandId,
              attemptId: work.attemptId,
              session: work.session,
              code: "conversation_not_found",
            });
            await refreshViews();
            continue;
          }
          if (
            membership.value.status === "unsupported" ||
            membership.value.status === "restart_required"
          ) {
            if (membership.value.status === "unsupported") {
              await store.failPreparation({
                accountId: work.accountId,
                commandId: work.commandId,
                attemptId: work.attemptId,
                session: work.session,
                code: "membership_unsupported",
              });
              await refreshViews();
            } else {
              await store.deferPreparation({
                accountId: work.accountId,
                commandId: work.commandId,
                attemptId: work.attemptId,
                nextAttemptAtMs: runtime.nowMs() + 1000,
              });
            }
            continue;
          }
          if (membership.value.status === "page") {
            const prepared = await store.applyPreparationPage({
              accountId: work.accountId,
              commandId: work.commandId,
              attemptId: work.attemptId,
              session: work.session,
              previousPage: work.page,
              page: membership.value.page,
            });
            if (
              prepared.status !== "stale" &&
              !membership.value.page.nextPage
            ) {
              await store.finishPreparation({
                accountId: work.accountId,
                commandId: work.commandId,
              });
            }
          }
          await refreshViews();
          continue;
        }
        if (work.kind === "hydrate") {
          if (!work.keys[0]) {
            await store.completeJob({
              jobId: work.jobId,
              attemptId: work.attemptId,
            });
            continue;
          }
          const hydrated = await source.hydrate({
            session: work.session,
            requestId: work.jobId,
            signal: signal ?? new AbortController().signal,
            keys: work.keys,
            purpose: work.purpose,
          });
          if (hydrated.status === "ok") {
            await store.applyHydration({
              session: work.session,
              requestId: work.jobId,
              attemptId: work.attemptId,
              changes: hydrated.value.changes,
              bodies: hydrated.value.bodies,
            });
            await refreshViews();
            await store.completeJob({
              jobId: work.jobId,
              attemptId: work.attemptId,
            });
          }
          continue;
        }
        if (work.kind === "search") {
          const searched = await source.search({
            session: work.session,
            requestId: work.jobId,
            signal: signal ?? new AbortController().signal,
            predicate: work.predicate,
            page: work.page,
            pageSize: 50,
          });
          if (searched.status === "ok") {
            if (searched.value.matches.length > 0) {
              await store.enqueueHydration({
                keys: searched.value.matches,
                purpose: "body",
              });
            }
            if (searched.value.nextPage) {
              await store.enqueueSearch({
                accountId: work.accountId,
                predicate: work.predicate,
                page: searched.value.nextPage,
              });
            }
            await refreshViews();
          }
          if (
            searched.status !== "paused" &&
            searched.status !== "blocked_auth"
          ) {
            await store.completeJob({
              jobId: work.jobId,
              attemptId: work.attemptId,
            });
          }
          continue;
        }
        const changes = await source.readChanges({
          session: work.session,
          requestId: work.jobId,
          position: work.position,
          pageSize: 50,
          signal: signal ?? new AbortController().signal,
        });
        if (changes.status === "page") {
          const applied = await store.applySyncPage({
            page: changes.page,
            ownerId,
            bodies: changes.page.bodies,
          });
          if (applied.status === "committed") {
            await refreshViews();
            await noteConnection(work.session.accountId, "ok");
          }
        } else if (changes.status === "reset_required") {
          await ingestBootstrap({
            session: work.session,
            from: work.position,
            deadlineMs,
            signal,
            requestId: `${work.jobId}-reset`,
            scopeId: changes.scopeId,
          });
        } else {
          await noteConnection(work.session.accountId, changes.status);
        }
      }
    },
    async close() {
      queries.closeAll();
      await store.close();
    },
  };

  function enqueueSearches(query: ConversationQuery) {
    for (const accountId of query.accountIds) {
      for (const predicate of extractTextPredicates(query.predicate)) {
        store
          .enqueueSearch({ accountId, predicate, page: null })
          .catch(() => undefined);
      }
    }
  }

  async function ingestBootstrap(input: {
    session: { accountId: string; generation: string };
    from: {
      streamId: string;
      generation: string;
      checkpoint: string | null;
    };
    deadlineMs: number;
    signal?: AbortSignal;
    requestId: string;
    scopeId?: string;
    scope?: ScopeDescriptor;
  }) {
    const scopeId = input.scopeId ?? "primary";
    let scan = await store.readBootstrapScan({
      session: input.session,
      scopeId,
    });
    if (!scan) {
      const bootstrap = await source.beginBootstrap({
        session: input.session,
        requestId: input.requestId,
        signal: input.signal ?? new AbortController().signal,
        scope:
          input.scope ??
          (await resolveScope(input.session, scopeId, input.signal)),
        afterMs: null,
      });
      if (bootstrap.status !== "ok") {
        await noteConnection(input.session.accountId, bootstrap.status);
        return;
      }
      const started = await store.startBootstrapScan({
        session: input.session,
        scopeId,
        bootstrapId: bootstrap.value.bootstrapId,
        page: bootstrap.value.enumerationToken,
        from: input.from,
        catchUpFrom: bootstrap.value.catchUpFrom,
        nowMs: runtime.nowMs(),
      });
      if (started.status === "stale") return;
      await noteConnection(input.session.accountId, "ok");
      scan = {
        accountId: input.session.accountId,
        scopeId,
        bootstrapId: bootstrap.value.bootstrapId,
        page: bootstrap.value.enumerationToken,
        from: input.from,
        catchUpFrom: bootstrap.value.catchUpFrom,
        nextAttemptAtMs: null,
        errorCode: null,
      };
    }
    const nowMs = runtime.nowMs();
    if (scan.nextAttemptAtMs !== null && scan.nextAttemptAtMs > nowMs) {
      return;
    }
    let processedPages = 0;
    while (scan.page) {
      if (input.signal?.aborted) return;
      if (processedPages > 0 && runtime.nowMs() >= input.deadlineMs) return;
      if (processedPages >= MAX_BOOTSTRAP_PAGES_PER_RUN) return;
      const enumerated = await source.enumerate({
        session: input.session,
        requestId: `${input.requestId}-enum-${processedPages + 1}`,
        signal: input.signal ?? new AbortController().signal,
        bootstrapId: scan.bootstrapId,
        page: scan.page,
        pageSize: 50,
      });
      if (enumerated.status !== "ok") {
        await noteConnection(input.session.accountId, enumerated.status);
        break;
      }
      const catchUpFrom: SyncStreamPosition | null =
        enumerated.value.catchUpFrom ?? scan.catchUpFrom;
      const repeatedCursor = enumerated.value.nextPage === scan.page;
      const applied = await store.applyBootstrapPage({
        session: input.session,
        scopeId: enumerated.value.scopeId,
        bootstrapId: scan.bootstrapId,
        previousPage: scan.page,
        nextPage: enumerated.value.nextPage,
        from: scan.from,
        catchUpFrom,
        requestId: `${input.requestId}-enum-${processedPages + 1}`,
        changes: enumerated.value.changes,
        requiredHydration: enumerated.value.requiredHydration,
        bodies: enumerated.value.bodies,
        ownerId,
      });
      if (applied.status === "stale") break;
      processedPages += 1;
      if (repeatedCursor) {
        await store.deferBootstrapScan({
          session: input.session,
          scopeId: enumerated.value.scopeId,
          bootstrapId: scan.bootstrapId,
          page: scan.page,
          nextAttemptAtMs: runtime.nowMs() + NON_ADVANCING_BOOTSTRAP_RETRY_MS,
          errorCode: "non_advancing_cursor",
        });
        await noteConnection(input.session.accountId, "paused");
        break;
      }
      scan = {
        ...scan,
        scopeId: enumerated.value.scopeId,
        page: enumerated.value.nextPage,
        catchUpFrom,
        nextAttemptAtMs: null,
        errorCode: null,
      };
    }
    await refreshViews();
  }

  async function catchUpIdleAccounts(deadlineMs: number, signal?: AbortSignal) {
    const accounts = await store.readAccountSyncStates();
    for (const account of accounts) {
      if (runtime.nowMs() >= deadlineMs) return;
      const session = {
        accountId: account.accountId,
        generation: account.generation,
      };
      const idleGate = idleCatchUpGateFor(
        account.accountId,
        account.generation,
      );
      const shouldDiscoverScopes = idleGateDue(
        idleGate.nextScopeDiscoveryAtMs,
        runtime.nowMs(),
        idleCatchUpIntervalMs,
      );
      const discoveredScopes = shouldDiscoverScopes
        ? await discoverBootstrapScopes(session, signal)
        : undefined;
      if (shouldDiscoverScopes) {
        idleGate.nextScopeDiscoveryAtMs =
          runtime.nowMs() + idleCatchUpIntervalMs;
      }
      if (discoveredScopes) {
        const addedScopes = await store.registerSyncScopes({
          session,
          scopeIds: discoveredScopes.map((scope) => scope.id),
        });
        if (addedScopes) await refreshViews();
      }
      const streamsById = new Map(
        account.streams.map((stream) => [stream.streamId, stream]),
      );
      for (const scope of discoveredScopes ?? []) {
        if (!streamsById.has(scope.id)) {
          idleGate.activeBootstrapScopes.set(scope.id, scope);
          streamsById.set(scope.id, {
            accountId: account.accountId,
            streamId: scope.id,
            generation: account.generation,
            checkpoint: null,
          });
        }
      }
      if (!shouldDiscoverScopes) {
        for (const scopeId of idleGate.activeBootstrapScopes.keys()) {
          if (!streamsById.has(scopeId)) {
            streamsById.set(scopeId, {
              accountId: account.accountId,
              streamId: scopeId,
              generation: account.generation,
              checkpoint: null,
            });
          }
        }
      }
      if (streamsById.size === 0) {
        await catchUpAssistantIfDue(idleGate, account, signal);
        continue;
      }
      const streams = [...streamsById.values()];
      for (const stream of streams) {
        if (runtime.nowMs() >= deadlineMs) return;
        if (!stream.checkpoint) {
          await ingestBootstrap({
            session,
            from: stream,
            deadlineMs,
            signal,
            requestId: runtime.randomId(),
            scopeId: stream.streamId,
            scope: idleGate.activeBootstrapScopes.get(stream.streamId),
          });
          await rememberBootstrapContinuation(
            idleGate,
            session,
            stream.streamId,
          );
          continue;
        }
        const nextCatchUpAtMs =
          idleGate.nextStreamCatchUpAtMs.get(stream.streamId) ?? 0;
        if (
          !idleGateDue(nextCatchUpAtMs, runtime.nowMs(), idleCatchUpIntervalMs)
        ) {
          continue;
        }
        const changes = await source.readChanges({
          session,
          requestId: runtime.randomId(),
          position: stream,
          pageSize: 50,
          signal: signal ?? new AbortController().signal,
        });
        if (changes.status === "page") {
          const applied = await store.applySyncPage({
            page: changes.page,
            ownerId,
            bodies: changes.page.bodies,
          });
          if (applied.status === "committed") {
            if (changes.page.roundComplete) {
              idleGate.nextStreamCatchUpAtMs.set(
                stream.streamId,
                runtime.nowMs() + idleCatchUpIntervalMs,
              );
            } else {
              idleGate.nextStreamCatchUpAtMs.delete(stream.streamId);
            }
            await refreshViews();
            await noteConnection(account.accountId, "ok");
          } else {
            idleGate.nextStreamCatchUpAtMs.delete(stream.streamId);
          }
        } else if (changes.status === "reset_required") {
          idleGate.nextStreamCatchUpAtMs.delete(stream.streamId);
          const resetStream = { ...stream, streamId: changes.scopeId };
          await ingestBootstrap({
            session,
            from: resetStream,
            deadlineMs,
            signal,
            requestId: runtime.randomId(),
            scopeId: changes.scopeId,
          });
          await rememberBootstrapContinuation(
            idleGate,
            session,
            changes.scopeId,
          );
        } else {
          idleGate.nextStreamCatchUpAtMs.set(
            stream.streamId,
            runtime.nowMs() + idleCatchUpIntervalMs,
          );
          await noteConnection(account.accountId, changes.status);
        }
      }
      await catchUpAssistantIfDue(idleGate, account, signal);
    }
  }

  function idleCatchUpGateFor(accountId: string, generation: string) {
    const existing = idleCatchUpGates.get(accountId);
    if (existing?.generation === generation) return existing;
    const created: IdleCatchUpGate = {
      activeBootstrapScopes: new Map(),
      generation,
      nextAssistantCatchUpAtMs: 0,
      nextScopeDiscoveryAtMs: 0,
      nextStreamCatchUpAtMs: new Map(),
    };
    idleCatchUpGates.set(accountId, created);
    return created;
  }

  async function rememberBootstrapContinuation(
    idleGate: IdleCatchUpGate,
    session: { accountId: string; generation: string },
    scopeId: string,
  ) {
    const scan = await store.readBootstrapScan({ session, scopeId });
    if (
      scan?.page &&
      (scan.nextAttemptAtMs === null || scan.nextAttemptAtMs <= runtime.nowMs())
    ) {
      if (!idleGate.activeBootstrapScopes.has(scopeId)) {
        idleGate.activeBootstrapScopes.set(scopeId, {
          id: scopeId,
          kind: "account",
          folderId: null,
        });
      }
      return;
    }
    idleGate.activeBootstrapScopes.delete(scopeId);
  }

  async function discoverBootstrapScopes(
    session: { accountId: string; generation: string },
    signal?: AbortSignal,
  ): Promise<ScopeDescriptor[] | null> {
    const discovered = await source.discoverScopes({
      session,
      requestId: "bootstrap-scopes",
      signal: signal ?? new AbortController().signal,
      page: null,
    });
    if (discovered.status === "ok" && discovered.value.scopes.length > 0) {
      return discovered.value.scopes;
    }
    if (discovered.status !== "ok") {
      await noteConnection(session.accountId, discovered.status);
      return null;
    }
    return [{ id: "primary", kind: "account", folderId: null }];
  }

  async function catchUpAssistantIfDue(
    idleGate: IdleCatchUpGate,
    account: Pick<
      AccountSyncState,
      "accountId" | "generation" | "assistantCursor"
    >,
    signal?: AbortSignal,
  ) {
    if (
      !idleGateDue(
        idleGate.nextAssistantCatchUpAtMs,
        runtime.nowMs(),
        idleCatchUpIntervalMs,
      )
    ) {
      return;
    }
    const advanced = await catchUpAssistant(account, signal);
    idleGate.nextAssistantCatchUpAtMs = advanced
      ? 0
      : runtime.nowMs() + idleCatchUpIntervalMs;
  }

  async function catchUpAssistant(
    account: Pick<
      AccountSyncState,
      "accountId" | "generation" | "assistantCursor"
    >,
    signal?: AbortSignal,
  ) {
    if (!assistant) return false;
    const session = {
      accountId: account.accountId,
      generation: account.generation,
    };
    const page = await assistant.read({
      session,
      cursor: account?.assistantCursor ?? null,
      signal: signal ?? new AbortController().signal,
    });
    if (page.status !== "ok") return false;
    await store.applyAssistantEntries({
      accountId: session.accountId,
      cursor: page.page.nextCursor,
      entries: page.page.entries.map((entry) => ({
        id: entry.id,
        revision: entry.revision,
        messageId: entry.messageId,
        conversationId: entry.conversationId,
        kind: entry.kind,
        payload: entry.payload,
      })),
    });
    await refreshViews();
    return page.page.nextCursor !== (account.assistantCursor ?? null);
  }

  async function resolveScope(
    session: { accountId: string; generation: string },
    scopeId: string,
    signal?: AbortSignal,
  ): Promise<ScopeDescriptor> {
    const discovered = await source.discoverScopes({
      session,
      requestId: `scope-${scopeId}`,
      signal: signal ?? new AbortController().signal,
      page: null,
    });
    if (discovered.status === "ok") {
      const match = discovered.value.scopes.find(
        (scope) => scope.id === scopeId,
      );
      if (match) return match;
    }
    return {
      id: scopeId,
      kind: "account",
      folderId: null,
    };
  }

  async function noteConnection(accountId: string, status: string) {
    const connection = CONNECTION_BY_SOURCE_STATUS[status];
    if (!connection) return;
    if (await store.recordConnection({ accountId, connection })) {
      await refreshViews();
    }
  }
}

const CONNECTION_BY_SOURCE_STATUS: Partial<
  Record<string, "ready" | "offline" | "blocked_auth">
> = {
  blocked_auth: "blocked_auth",
  paused: "offline",
  ok: "ready",
  page: "ready",
};

type IdleCatchUpGate = {
  activeBootstrapScopes: Map<string, ScopeDescriptor>;
  generation: string;
  nextAssistantCatchUpAtMs: number;
  nextScopeDiscoveryAtMs: number;
  nextStreamCatchUpAtMs: Map<string, number>;
};

function idleGateDue(nextAtMs: number, nowMs: number, intervalMs: number) {
  return nextAtMs <= nowMs || nextAtMs - nowMs > intervalMs;
}

function normalizePageCount(pageCount: number | undefined) {
  if (!pageCount || !Number.isFinite(pageCount)) return 1;
  return Math.min(MAX_MAILBOX_WINDOW_PAGES, Math.max(1, Math.floor(pageCount)));
}

export function createHostRuntime(
  overrides?: Partial<HostRuntime>,
): HostRuntime {
  return {
    nowMs: overrides?.nowMs ?? (() => Date.now()),
    randomId: overrides?.randomId ?? defaultRandomId,
    sha256: overrides?.sha256 ?? webCryptoSha256,
    storagePressure: overrides?.storagePressure ?? (() => false),
  };
}

function defaultRandomId(): string {
  const cryptoObj = globalThis.crypto;
  if (typeof cryptoObj?.randomUUID === "function") {
    return cryptoObj.randomUUID();
  }
  throw new Error(
    "HostRuntime.randomId is required when crypto.randomUUID is unavailable",
  );
}

async function runAttachmentUpload(input: {
  work: Extract<import("./ports/mail-store").ClaimedWork, { kind: "upload" }>;
  blobStore?: BlobStore;
  executor: OperationExecutor;
  store: MailStore;
  runtime: HostRuntime;
  signal: AbortSignal;
}) {
  const { work, blobStore, executor, store } = input;
  if (!blobStore || !executor.stageUpload) {
    await store.failOperation(work.operation.key, "missing_attachment");
    return;
  }
  const bytes = await blobStore.read(work.attachmentId);
  if (!bytes) {
    await store.failOperation(work.operation.key, "missing_attachment");
    return;
  }
  const staged = await executor.stageUpload({
    session: work.operation.session,
    uploadId: work.attachmentId,
    checksum: work.checksum,
    sizeBytes: work.sizeBytes,
    filename: work.filename,
    contentType: work.contentType,
    bytes,
    signal: input.signal,
  });
  if (staged.status !== "staged") {
    if (
      staged.status === "rejected" &&
      (staged.code === "missing" || staged.code === "too_large")
    ) {
      await store.failOperation(
        work.operation.key,
        staged.code === "too_large" ? "too_large" : "missing_attachment",
      );
    }
    return;
  }
  await store.recordAttachmentUpload({
    accountId: work.operation.key.accountId,
    operationId: work.operation.key.operationId,
    attachmentId: work.attachmentId,
    remoteUploadId: staged.blobId,
  });
}
