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
import {
  MAX_CHANGES_BATCH_READS,
  type MailboxSource,
  type SyncReadResult,
} from "./ports/mailbox-source";
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
  ContactSuggestion,
  ContactSuggestionQuery,
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

const MAX_BOOTSTRAP_PAGES_PER_RUN = 25;
const NON_ADVANCING_BOOTSTRAP_RETRY_MS = 60_000;
const IDLE_CATCH_UP_INTERVAL_MS = 60_000;
// A lane is abandoned after this long, so a request that never settles
// cannot keep its account from syncing again.
const SYNC_LANE_TIMEOUT_MS = 2 * 60_000;
// How long one bootstrap call may keep paging before the lane moves on to the
// account's other streams; the scan resumes on the lane's next pass.
const SYNC_LANE_BOOTSTRAP_SLICE_MS = 2000;
const SYNC_LANE_RETRY_MIN_MS = 1000;
const SYNC_LANE_RETRY_MAX_MS = 60_000;
// Folder discovery and low-priority streams (such as custom Outlook folders)
// change rarely and cost a provider call each, so they run on a slower clock.
const LOW_PRIORITY_CATCH_UP_INTERVAL_MS = 10 * 60_000;
// A sync request (a provider push, the tab coming back) refreshes them only
// when they have not run recently, so a burst of pushes stays cheap.
const LOW_PRIORITY_REQUESTED_MIN_INTERVAL_MS = 2 * 60_000;
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

export type MailClient = {
  queryContactSuggestions?(
    query: ContactSuggestionQuery,
  ): Promise<ContactSuggestion[]>;
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
  submitSend(input: SubmitSend): Promise<Admission>;
  cancelOperation(
    key: OperationKey,
  ): Promise<
    | { status: "cancelled"; revision: LocalRevision }
    | { status: "too_late" | "not_found" | "unavailable" }
  >;
  requestSync(accountIds: string[]): Promise<WorkAdmission>;
  ensureMessageContent(key: MessageKey): Promise<WorkAdmission>;
  getDiagnostics(accountId: string): Promise<MailDiagnostics>;
  purgeAccount(accountId: string): Promise<LocalRevision>;
  /** Purges every local account outside `accountIds`; an empty list is ignored. */
  retainAccounts(accountIds: string[]): Promise<void>;
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
  idleCatchUpIntervalMs?: number;
  syncLaneTimeoutMs?: number;
}): MailEngine {
  const { store, source, executor, runtime } = input;
  const idleCatchUpIntervalMs =
    input.idleCatchUpIntervalMs ?? IDLE_CATCH_UP_INTERVAL_MS;
  const syncLaneTimeoutMs = input.syncLaneTimeoutMs ?? SYNC_LANE_TIMEOUT_MS;
  const ownerId = input.ownerId ?? "local-owner";
  const assistant = input.assistant;
  const queries = createQueryRegistry();
  let evictedForCurrentPressure = false;
  const idleCatchUpGates = new Map<string, IdleCatchUpGate>();
  const syncLanes = new Map<string, SyncLane>();
  const syncLaneRetries = new Map<
    string,
    { retryAtMs: number; delayMs: number }
  >();
  const syncLaneErrors: unknown[] = [];
  let closed = false;
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
    queryContactSuggestions(query) {
      return store.readContactSuggestions(query);
    },
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
    async submitSend(send) {
      const admission = await store.admitSend(send);
      await refreshViews();
      return admission;
    },
    async cancelOperation(key) {
      const local = await store.cancelOperation(key);
      if (local.status !== "too_late") {
        await refreshViews();
        return local;
      }
      const held = await store.readHeldSend(key);
      if (!held || !executor.cancel) return local;
      const remote = await executor.cancel({
        operation: held,
        signal: new AbortController().signal,
      });
      if (remote.status !== "cancelled") return { status: remote.status };
      const result = await store.cancelHeldSend(key);
      await refreshViews();
      return result;
    },
    async requestSync(accountIds) {
      if (accountIds.length === 0) {
        return { status: "rejected", code: "invalid_account" };
      }
      for (const accountId of accountIds) {
        const gate = idleCatchUpGates.get(accountId);
        if (gate) requestCatchUp(gate);
      }
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
      stopSyncLane(accountId);
      idleCatchUpGates.delete(accountId);
      const revision = await store.purgeAccount(accountId);
      await refreshViews();
      return revision;
    },
    async retainAccounts(accountIds) {
      // An empty list is never a real account set, so it must not wipe the device.
      if (accountIds.length === 0) return;
      const retained = new Set(accountIds);
      const accounts = await store.readAccountSyncStates();
      let purged = false;
      for (const account of accounts) {
        if (retained.has(account.accountId)) continue;
        stopSyncLane(account.accountId);
        idleCatchUpGates.delete(account.accountId);
        await store.purgeAccount(account.accountId);
        purged = true;
      }
      if (purged) await refreshViews();
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
        await yieldToHost();
        if (signal?.aborted || runtime.nowMs() >= deadlineMs) return;
        const work = await store.claimWork({
          ownerId,
          nowMs: runtime.nowMs(),
          leaseMs: 30_000,
        });
        if (!work) {
          await startSyncLanes();
          if (signal?.aborted || runtime.nowMs() >= deadlineMs) return;
          // Batches stay short and claimable work is checked between them,
          // so a large backlog never delays commands or sync.
          const contacts = await store.indexContactBacklog();
          const { remaining } = await store.indexSearchBacklog();
          if (contacts.remaining || remaining) continue;
          await waitForSyncLanes(deadlineMs, signal);
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
      closed = true;
      const lanes = [...syncLanes.keys()].map((accountId) => {
        const done = syncLanes.get(accountId)?.done;
        stopSyncLane(accountId);
        return done;
      });
      await Promise.allSettled(lanes);
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
      if (processedPages > 0) await yieldToHost();
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
      if (
        enumerated.status === "paused" ||
        enumerated.status === "blocked_auth"
      ) {
        const paused = enumerated.status === "paused";
        await store.deferBootstrapScan({
          session: input.session,
          scopeId: scan.scopeId,
          bootstrapId: scan.bootstrapId,
          page: scan.page,
          nextAttemptAtMs:
            runtime.nowMs() +
            (paused ? enumerated.retryAfterMs : idleCatchUpIntervalMs),
          errorCode: paused ? enumerated.reason : "blocked_auth",
        });
      }
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

  // Each account syncs in its own lane, so a slow account or a slow request
  // never holds up another account or the command loop. A lane outlives the
  // runUntil call that started it; later calls skip accounts already running.
  async function startSyncLanes() {
    const accounts = await store.readAccountSyncStates();
    for (const account of accounts) {
      const { accountId } = account;
      if (closed || syncLanes.has(accountId)) continue;
      const retry = syncLaneRetries.get(accountId);
      if (retry && retry.retryAtMs > runtime.nowMs()) continue;
      const abort = new AbortController();
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        abort.abort();
      }, syncLaneTimeoutMs);
      // The lane settles on abort even if a request ignores the signal.
      const aborted = new Promise<void>((resolve) => {
        abort.signal.addEventListener("abort", () => resolve(), { once: true });
      });
      const lane: SyncLane = {
        abort,
        done: Promise.race([catchUpAccount(account, abort.signal), aborted])
          .then(() => {
            if (timedOut) {
              failSyncLane(accountId, new Error("Mail sync lane timed out"));
            } else {
              syncLaneRetries.delete(accountId);
            }
          })
          .catch((error: unknown) => {
            // A purge or close stopped the lane on purpose.
            if (abort.signal.aborted && !timedOut) return;
            failSyncLane(accountId, error);
          })
          .finally(() => {
            clearTimeout(timeout);
            if (syncLanes.get(accountId) === lane) syncLanes.delete(accountId);
          }),
      };
      syncLanes.set(accountId, lane);
    }
  }

  function failSyncLane(accountId: string, error: unknown) {
    const delayMs = Math.min(
      SYNC_LANE_RETRY_MAX_MS,
      (syncLaneRetries.get(accountId)?.delayMs ?? 0) * 2 ||
        SYNC_LANE_RETRY_MIN_MS,
    );
    syncLaneRetries.set(accountId, {
      retryAtMs: runtime.nowMs() + delayMs,
      delayMs,
    });
    syncLaneErrors.push(error);
  }

  function stopSyncLane(accountId: string) {
    syncLanes.get(accountId)?.abort.abort();
    syncLanes.delete(accountId);
    syncLaneRetries.delete(accountId);
  }

  async function waitForSyncLanes(deadlineMs: number, signal?: AbortSignal) {
    if (syncLanes.size > 0) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let onAbort: (() => void) | undefined;
      await Promise.race([
        Promise.allSettled([...syncLanes.values()].map((lane) => lane.done)),
        new Promise<void>((resolve) => {
          timer = setTimeout(
            resolve,
            Math.max(0, deadlineMs - runtime.nowMs()),
          );
          onAbort = resolve;
          signal?.addEventListener("abort", onAbort, { once: true });
        }),
      ]);
      clearTimeout(timer);
      if (onAbort) signal?.removeEventListener("abort", onAbort);
    }
    // Reports lane failures to the host loop. Each failing account already
    // backs off on its own, so this is for visibility, not retry pacing.
    const errors = syncLaneErrors.splice(0);
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) {
      throw new AggregateError(errors, "Mail sync lanes failed");
    }
  }

  async function catchUpAccount(
    account: AccountSyncState,
    signal: AbortSignal,
  ) {
    let visitedStreams = 0;
    const session = {
      accountId: account.accountId,
      generation: account.generation,
    };
    const idleGate = idleCatchUpGateFor(account.accountId, account.generation);
    const shouldDiscoverScopes =
      idleGateDue(
        idleGate.nextScopeDiscoveryAtMs,
        runtime.nowMs(),
        LOW_PRIORITY_CATCH_UP_INTERVAL_MS,
      ) ||
      requestedSince(
        idleGate,
        idleGate.scopesDiscoveredAt,
        LOW_PRIORITY_REQUESTED_MIN_INTERVAL_MS,
      );
    if (shouldDiscoverScopes) {
      idleGate.scopesDiscoveredAt = checkStamp(idleGate);
    }
    const discoveredScopes = shouldDiscoverScopes
      ? await discoverBootstrapScopes(session, signal)
      : undefined;
    if (shouldDiscoverScopes) {
      // A failed discovery retries on the normal clock; an account with no
      // streams cannot start syncing until it succeeds.
      idleGate.nextScopeDiscoveryAtMs =
        runtime.nowMs() +
        (discoveredScopes
          ? LOW_PRIORITY_CATCH_UP_INTERVAL_MS
          : idleCatchUpIntervalMs);
    }
    if (discoveredScopes) {
      idleGate.lowPriorityStreams = new Set(
        discoveredScopes
          .filter((scope) => scope.priority === "low")
          .map((scope) => scope.id),
      );
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
      return;
    }
    const streams = [...streamsById.values()];
    const dueStreams: typeof streams = [];
    for (const stream of streams) {
      if (visitedStreams > 0) await yieldToHost();
      visitedStreams += 1;
      if (signal.aborted) return;
      const catchUpDue =
        idleGateDue(
          idleGate.nextStreamCatchUpAtMs.get(stream.streamId) ?? 0,
          runtime.nowMs(),
          streamCatchUpInterval(idleGate, stream.streamId),
        ) ||
        requestedSince(
          idleGate,
          idleGate.streamCheckedAt.get(stream.streamId),
          idleGate.lowPriorityStreams.has(stream.streamId)
            ? LOW_PRIORITY_REQUESTED_MIN_INTERVAL_MS
            : 0,
        );
      if (
        !stream.checkpoint ||
        (await resumesBootstrap(idleGate, session, stream.streamId, catchUpDue))
      ) {
        await ingestBootstrap({
          session,
          from: stream,
          deadlineMs: runtime.nowMs() + SYNC_LANE_BOOTSTRAP_SLICE_MS,
          signal,
          requestId: runtime.randomId(),
          scopeId: stream.streamId,
          scope: idleGate.activeBootstrapScopes.get(stream.streamId),
        });
        await rememberBootstrapContinuation(idleGate, session, stream.streamId);
        continue;
      }
      if (!catchUpDue) continue;
      idleGate.streamCheckedAt.set(stream.streamId, checkStamp(idleGate));
      dueStreams.push(stream);
    }
    const readBatch = source.readChangesBatch;
    if (readBatch && dueStreams.length > 1) {
      // One request per chunk shares the provider connection and lookups
      // that a request per folder would repeat.
      for (
        let offset = 0;
        offset < dueStreams.length;
        offset += MAX_CHANGES_BATCH_READS
      ) {
        if (offset > 0) await yieldToHost();
        if (signal.aborted) return;
        const chunk = dueStreams.slice(
          offset,
          offset + MAX_CHANGES_BATCH_READS,
        );
        const results = await readBatch({
          session,
          reads: chunk.map((stream) => ({
            requestId: runtime.randomId(),
            position: stream,
          })),
          pageSize: 50,
          signal,
        });
        if (results.length !== chunk.length) {
          throw new Error("Changes batch returned the wrong number of results");
        }
        for (const [index, stream] of chunk.entries()) {
          const changes = results[index] as SyncReadResult;
          // Applying a page holds the store, so let host reads in between.
          if (index > 0) await yieldToHost();
          await applyStreamChanges({
            session,
            idleGate,
            stream,
            changes,
            signal,
          });
        }
      }
    } else {
      for (const [index, stream] of dueStreams.entries()) {
        if (index > 0) await yieldToHost();
        if (signal.aborted) return;
        const changes = await source.readChanges({
          session,
          requestId: runtime.randomId(),
          position: stream,
          pageSize: 50,
          signal,
        });
        await applyStreamChanges({
          session,
          idleGate,
          stream,
          changes,
          signal,
        });
      }
    }
    await catchUpAssistantIfDue(idleGate, account, signal);
  }

  async function applyStreamChanges({
    session,
    idleGate,
    stream,
    changes,
    signal,
  }: {
    session: { accountId: string; generation: string };
    idleGate: IdleCatchUpGate;
    stream: AccountSyncState["streams"][number];
    changes: SyncReadResult;
    signal: AbortSignal;
  }) {
    // A stopped lane may have been replaced, and its late result must not
    // move the shared catch-up schedule.
    if (signal.aborted) return;
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
            runtime.nowMs() + streamCatchUpInterval(idleGate, stream.streamId),
          );
        } else {
          idleGate.nextStreamCatchUpAtMs.delete(stream.streamId);
        }
        await refreshViews();
        await noteConnection(session.accountId, "ok");
      } else {
        idleGate.nextStreamCatchUpAtMs.delete(stream.streamId);
      }
    } else if (changes.status === "reset_required") {
      // Unfinished pages resume through resumesBootstrap, so the gate
      // only slows a provider that keeps asking for a resync.
      idleGate.nextStreamCatchUpAtMs.set(
        stream.streamId,
        runtime.nowMs() + streamCatchUpInterval(idleGate, stream.streamId),
      );
      const resetStream = { ...stream, streamId: changes.scopeId };
      await ingestBootstrap({
        session,
        from: resetStream,
        deadlineMs: runtime.nowMs() + SYNC_LANE_BOOTSTRAP_SLICE_MS,
        signal,
        requestId: runtime.randomId(),
        scopeId: changes.scopeId,
      });
      await rememberBootstrapContinuation(idleGate, session, changes.scopeId);
    } else {
      idleGate.nextStreamCatchUpAtMs.set(
        stream.streamId,
        runtime.nowMs() + streamCatchUpInterval(idleGate, stream.streamId),
      );
      await noteConnection(session.accountId, changes.status);
    }
  }

  function idleCatchUpGateFor(accountId: string, generation: string) {
    const existing = idleCatchUpGates.get(accountId);
    if (existing?.generation === generation) return existing;
    const created: IdleCatchUpGate = {
      activeBootstrapScopes: new Map(),
      generation,
      lowPriorityStreams: new Set(),
      nextAssistantCatchUpAtMs: 0,
      nextScopeDiscoveryAtMs: 0,
      nextStreamCatchUpAtMs: new Map(),
      requestCount: 0,
      scopesDiscoveredAt: null,
      streamCheckedAt: new Map(),
    };
    idleCatchUpGates.set(accountId, created);
    return created;
  }

  function streamCatchUpInterval(idleGate: IdleCatchUpGate, streamId: string) {
    return idleGate.lowPriorityStreams.has(streamId)
      ? LOW_PRIORITY_CATCH_UP_INTERVAL_MS
      : idleCatchUpIntervalMs;
  }

  // Requests are counted rather than applied to deadlines, so a request that
  // lands while a check is in flight survives that check finishing, and
  // repeated requests cannot pull a check in below its minimum interval.
  function requestCatchUp(idleGate: IdleCatchUpGate) {
    idleGate.requestCount += 1;
    idleGate.nextAssistantCatchUpAtMs = 0;
  }

  function checkStamp(idleGate: IdleCatchUpGate): CheckStamp {
    return { atMs: runtime.nowMs(), requestCount: idleGate.requestCount };
  }

  function requestedSince(
    idleGate: IdleCatchUpGate,
    checked: CheckStamp | null | undefined,
    minIntervalMs: number,
  ) {
    return (
      checked != null &&
      idleGate.requestCount > checked.requestCount &&
      runtime.nowMs() - checked.atMs >= minIntervalMs
    );
  }

  async function rememberBootstrapContinuation(
    idleGate: IdleCatchUpGate,
    session: { accountId: string; generation: string },
    scopeId: string,
  ) {
    const scan = await store.readBootstrapScan({ session, scopeId });
    // A deferred scan stays active so it resumes when its retry time comes,
    // not at the next scope discovery.
    if (scan?.page) {
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

  // A resync keeps the stream's old checkpoint until its bootstrap finishes,
  // so unfinished pages resume here instead of through another resync. A scan
  // this engine didn't start, such as one left by a restart, is picked up when
  // the stream's catch-up comes due.
  async function resumesBootstrap(
    idleGate: IdleCatchUpGate,
    session: { accountId: string; generation: string },
    scopeId: string,
    catchUpDue: boolean,
  ) {
    if (!catchUpDue && !idleGate.activeBootstrapScopes.has(scopeId)) {
      return false;
    }
    const scan = await store.readBootstrapScan({ session, scopeId });
    if (scan?.page) return true;
    idleGate.activeBootstrapScopes.delete(scopeId);
    return false;
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

type SyncLane = {
  abort: AbortController;
  done: Promise<void>;
};

type IdleCatchUpGate = {
  activeBootstrapScopes: Map<string, ScopeDescriptor>;
  generation: string;
  lowPriorityStreams: Set<string>;
  nextAssistantCatchUpAtMs: number;
  nextScopeDiscoveryAtMs: number;
  nextStreamCatchUpAtMs: Map<string, number>;
  requestCount: number;
  scopesDiscoveredAt: CheckStamp | null;
  streamCheckedAt: Map<string, CheckStamp>;
};

type CheckStamp = { atMs: number; requestCount: number };

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

/**
 * Lets queued host work run between store transactions. Synchronous SQLite
 * drivers otherwise keep every read (opening a conversation) waiting until a
 * whole run of sync pages and jobs finishes.
 */
function yieldToHost() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}
