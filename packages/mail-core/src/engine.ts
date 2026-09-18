import type {
  Admission,
  SubmitConversationCommand,
  SubmitMetadataCommand,
} from "./commands";
import type { DraftSaveResult, SaveDraft, SubmitSend } from "./drafts";
import type {
  ConversationKey,
  LocalRevision,
  MessageKey,
  OperationKey,
} from "./identities";
import type { OperationState } from "./operations";
import type { MailboxSource } from "./ports/mailbox-source";
import type { MailStore } from "./ports/mail-store";
import type { OperationExecutor } from "./ports/operation-executor";
import type { AssistantStateSource } from "./ports/assistant-source";
import type { HostRuntime } from "./ports/runtime";
import { extractTextPredicates } from "./query-semantics";
import type { ConversationQuery, MailboxView, QueryHandle } from "./queries";
import { createQueryRegistry, mailboxQueryKey } from "./subscriptions";
import type { ConversationView } from "./ports/mail-store";
import type { ProviderChange } from "./sync";

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

export type MailClient = {
  observeMailbox(query: ConversationQuery): QueryHandle<MailboxView>;
  observeConversation(
    key: ConversationKey,
    page: { after: string | null; pageSize: number },
  ): QueryHandle<ConversationView>;
  observeOperation(key: OperationKey): QueryHandle<OperationState>;
  submitMetadata(input: SubmitMetadataCommand): Promise<Admission>;
  submitConversations(input: SubmitConversationCommand): Promise<Admission>;
  saveDraft(input: SaveDraft): Promise<DraftSaveResult>;
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
}): MailEngine {
  const { store, source, executor, runtime } = input;
  const ownerId = input.ownerId ?? "local-owner";
  const assistant = input.assistant;
  const queries = createQueryRegistry();
  const generations = new Map<string, string>();

  async function refreshViews() {
    await queries.refreshAll();
  }

  return {
    observeMailbox(query) {
      for (const accountId of query.accountIds) {
        for (const predicate of extractTextPredicates(query.predicate)) {
          store
            .enqueueSearch({ accountId, predicate, page: null })
            .catch(() => undefined);
        }
      }
      return queries.observe(mailboxQueryKey(query), () =>
        store.readMailboxView(query).then((result) => ({
          revision: result.revision,
          data: result.view,
        })),
      );
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
      return { status: "scheduled" };
    },
    async ensureMessageContent(key) {
      await store.enqueueHydration({ keys: [key], purpose: "body" });
      return { status: "scheduled" };
    },
    getDiagnostics(accountId) {
      return store.getDiagnostics(accountId);
    },
    inspect() {
      return store.inspect();
    },
    async runUntil(deadlineMs, signal) {
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
        if (work.kind === "prepare") {
          const generation =
            generations.get(work.accountId) ?? work.conversation.accountId;
          const membership = await source.readConversationMembership({
            session: { accountId: work.accountId, generation },
            requestId: work.resolutionId,
            signal: signal ?? new AbortController().signal,
            conversation: work.conversation,
            resolutionId: work.resolutionId,
            page: work.page,
            pageSize: 100,
          });
          if (membership.status !== "ok") continue;
          if (membership.value.status === "not_found") {
            await store.failOperation(
              { accountId: work.accountId, operationId: work.commandId },
              "conversation_not_found",
            );
            await refreshViews();
            continue;
          }
          if (
            membership.value.status === "unsupported" ||
            membership.value.status === "restart_required"
          ) {
            if (membership.value.status === "unsupported") {
              await store.failOperation(
                { accountId: work.accountId, operationId: work.commandId },
                "membership_unsupported",
              );
              await refreshViews();
            }
            continue;
          }
          if (membership.value.status === "page") {
            await store.applyPreparationPage({
              accountId: work.accountId,
              commandId: work.commandId,
              page: membership.value.page,
            });
            if (!membership.value.page.nextPage) {
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
          const accountId = work.keys[0]?.accountId;
          if (!accountId) {
            await store.completeJob(work.jobId);
            continue;
          }
          const hydrated = await source.hydrate({
            session: {
              accountId,
              generation: generations.get(accountId) ?? accountId,
            },
            requestId: work.jobId,
            signal: signal ?? new AbortController().signal,
            keys: work.keys,
            purpose: work.purpose,
          });
          if (hydrated.status === "ok") {
            await store.applyHydration({
              session: {
                accountId,
                generation: generations.get(accountId) ?? accountId,
              },
              requestId: work.jobId,
              changes: hydrated.value.changes,
              bodies: hydrated.value.bodies,
            });
            await refreshViews();
            await store.completeJob(work.jobId);
          }
          continue;
        }
        if (work.kind === "search") {
          const searched = await source.search({
            session: {
              accountId: work.accountId,
              generation: generations.get(work.accountId) ?? work.accountId,
            },
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
            await store.completeJob(work.jobId);
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
          generations.set(work.session.accountId, work.session.generation);
          await store.applySyncPage({ page: changes.page, ownerId });
          await refreshViews();
          await noteConnection(work.session.accountId, "ok");
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
  }) {
    const bootstrap = await source.beginBootstrap({
      session: input.session,
      requestId: input.requestId,
      signal: input.signal ?? new AbortController().signal,
      scope: {
        id: input.scopeId ?? "primary",
        kind: "account",
        folderId: null,
      },
      afterMs: null,
    });
    if (bootstrap.status !== "ok") {
      await noteConnection(input.session.accountId, bootstrap.status);
      return;
    }
    await noteConnection(input.session.accountId, "ok");
    let page: string | null = bootstrap.value.enumerationToken;
    // Coverage-gated first paint needs this round to finish. A slice
    // deadline that expires during beginBootstrap must not skip enumerate.
    while (page) {
      if (input.signal?.aborted) return;
      const enumerated = await source.enumerate({
        session: input.session,
        requestId: `${input.requestId}-enum`,
        signal: input.signal ?? new AbortController().signal,
        bootstrapId: bootstrap.value.bootstrapId,
        page,
        pageSize: 50,
      });
      if (enumerated.status !== "ok") {
        await noteConnection(input.session.accountId, enumerated.status);
        break;
      }
      await store.applySyncPage({
        page: {
          session: input.session,
          requestId: `${input.requestId}-enum`,
          from: input.from,
          to: enumerated.value.catchUpFrom ?? input.from,
          changes: enumerated.value.changes,
          requiredHydration: enumerated.value.requiredHydration,
          roundComplete: enumerated.value.nextPage === null,
        },
        ownerId,
      });
      page = enumerated.value.nextPage;
    }
    await refreshViews();
  }

  async function catchUpIdleAccounts(deadlineMs: number, signal?: AbortSignal) {
    const inspection = await store.inspect();
    for (const account of inspection.accounts) {
      if (runtime.nowMs() >= deadlineMs) return;
      const stream = inspection.streams.find(
        (item) => item.accountId === account.accountId,
      ) ?? {
        accountId: account.accountId,
        streamId: "primary",
        generation: account.generation,
        checkpoint: null,
      };
      const session = {
        accountId: account.accountId,
        generation: account.generation,
      };
      generations.set(account.accountId, account.generation);
      if (!stream.checkpoint) {
        await ingestBootstrap({
          session,
          from: stream,
          deadlineMs,
          signal,
          requestId: runtime.randomId(),
        });
        await catchUpAssistant(session, signal);
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
        await store.applySyncPage({ page: changes.page, ownerId });
        await refreshViews();
        await noteConnection(account.accountId, "ok");
      } else if (changes.status === "reset_required") {
        await ingestBootstrap({
          session,
          from: stream,
          deadlineMs,
          signal,
          requestId: runtime.randomId(),
          scopeId: changes.scopeId,
        });
      } else {
        await noteConnection(account.accountId, changes.status);
      }
      await catchUpAssistant(session, signal);
    }
  }

  async function catchUpAssistant(
    session: { accountId: string; generation: string },
    signal?: AbortSignal,
  ) {
    if (!assistant) return;
    const inspection = await store.inspect();
    const account = inspection.accounts.find(
      (item) => item.accountId === session.accountId,
    );
    const page = await assistant.read({
      session,
      cursor: account?.assistantCursor ?? null,
      signal: signal ?? new AbortController().signal,
    });
    if (page.status !== "ok") return;
    await store.applyAssistantEntries({
      accountId: session.accountId,
      cursor: page.page.nextCursor,
      entries: page.page.entries.map((entry) => ({
        cursor: entry.id,
        draftId:
          entry.kind === "draft_proposal" &&
          entry.payload &&
          typeof entry.payload === "object" &&
          "draftId" in entry.payload &&
          typeof entry.payload.draftId === "string"
            ? entry.payload.draftId
            : undefined,
        draftRevision:
          entry.kind === "draft_proposal" &&
          entry.payload &&
          typeof entry.payload === "object" &&
          "draftRevision" in entry.payload &&
          typeof entry.payload.draftRevision === "number"
            ? entry.payload.draftRevision
            : undefined,
        change: assistantEntryChange(session.accountId, entry),
      })),
    });
    await refreshViews();
  }

  async function noteConnection(accountId: string, status: string) {
    if (status === "blocked_auth") {
      await store.recordConnection({
        accountId,
        connection: "blocked_auth",
      });
      await refreshViews();
      return;
    }
    if (status === "paused") {
      await store.recordConnection({
        accountId,
        connection: "offline",
      });
      await refreshViews();
      return;
    }
    if (status === "ok" || status === "page") {
      await store.recordConnection({
        accountId,
        connection: "ready",
      });
      await refreshViews();
    }
  }
}

export function createHostRuntime(
  overrides?: Partial<HostRuntime>,
): HostRuntime {
  return {
    nowMs: overrides?.nowMs ?? (() => Date.now()),
    randomId: overrides?.randomId ?? (() => crypto.randomUUID()),
  };
}

function assistantEntryChange(
  accountId: string,
  entry: {
    id: string;
    messageId: string | null;
    conversationId: string | null;
    kind: string;
    payload: unknown;
  },
): ProviderChange | undefined {
  if (
    entry.payload &&
    typeof entry.payload === "object" &&
    "change" in entry.payload
  ) {
    return entry.payload.change as ProviderChange;
  }
  if (!entry.messageId || !entry.conversationId) return;
  if (entry.kind === "archive" || entry.kind === "ARCHIVE") {
    return {
      kind: "removed_from_scope",
      key: { accountId, messageId: entry.messageId },
      scopeId: "inbox",
    };
  }
  return;
}
