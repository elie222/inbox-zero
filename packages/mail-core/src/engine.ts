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
import type { HostRuntime } from "./ports/runtime";
import type { ConversationQuery, MailboxView, QueryHandle } from "./queries";
import { createQueryRegistry, mailboxQueryKey } from "./subscriptions";
import type { ConversationView } from "./ports/mail-store";

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
  close(): Promise<void>;
};

export function createMailEngine(input: {
  store: MailStore;
  source: MailboxSource;
  executor: OperationExecutor;
  runtime: HostRuntime;
  ownerId?: string;
}): MailEngine {
  const { store, source, executor, runtime } = input;
  const ownerId = input.ownerId ?? "local-owner";
  const queries = createQueryRegistry();
  const generations = new Map<string, string>();

  async function refreshViews() {
    await queries.refreshAll();
  }

  return {
    observeMailbox(query) {
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
          if (!accountId) continue;
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
        } else if (changes.status === "reset_required") {
          const bootstrap = await source.beginBootstrap({
            session: work.session,
            requestId: `${work.jobId}-reset`,
            signal: signal ?? new AbortController().signal,
            scope: { id: changes.scopeId, kind: "account", folderId: null },
            afterMs: null,
          });
          if (bootstrap.status !== "ok") continue;
          let page = bootstrap.value.enumerationToken;
          while (page) {
            const enumerated = await source.enumerate({
              session: work.session,
              requestId: `${work.jobId}-enum`,
              signal: signal ?? new AbortController().signal,
              bootstrapId: bootstrap.value.bootstrapId,
              page,
              pageSize: 50,
            });
            if (enumerated.status !== "ok") break;
            await store.applySyncPage({
              page: {
                session: work.session,
                requestId: `${work.jobId}-enum`,
                from: work.position,
                to: enumerated.value.catchUpFrom ?? work.position,
                changes: enumerated.value.changes,
                requiredHydration: enumerated.value.requiredHydration,
                roundComplete: enumerated.value.nextPage === null,
              },
              ownerId,
            });
            page = enumerated.value.nextPage ?? "";
            if (!enumerated.value.nextPage) break;
          }
          await refreshViews();
        }
      }
    },
    async close() {
      queries.closeAll();
      await store.close();
    },
  };

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
        const bootstrap = await source.beginBootstrap({
          session,
          requestId: runtime.randomId(),
          signal: signal ?? new AbortController().signal,
          scope: { id: "primary", kind: "account", folderId: null },
          afterMs: null,
        });
        if (bootstrap.status !== "ok") continue;
        let page: string | null = bootstrap.value.enumerationToken;
        while (page && runtime.nowMs() < deadlineMs) {
          const enumerated = await source.enumerate({
            session,
            requestId: runtime.randomId(),
            signal: signal ?? new AbortController().signal,
            bootstrapId: bootstrap.value.bootstrapId,
            page,
            pageSize: 50,
          });
          if (enumerated.status !== "ok") break;
          await store.applySyncPage({
            page: {
              session,
              requestId: runtime.randomId(),
              from: stream,
              to: enumerated.value.catchUpFrom ?? stream,
              changes: enumerated.value.changes,
              requiredHydration: enumerated.value.requiredHydration,
              roundComplete: enumerated.value.nextPage === null,
            },
            ownerId,
          });
          page = enumerated.value.nextPage;
        }
        await refreshViews();
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
      }
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
