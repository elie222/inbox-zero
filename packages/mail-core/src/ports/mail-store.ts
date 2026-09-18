import type {
  Admission,
  SubmitConversationCommand,
  SubmitMetadataCommand,
} from "../commands";
import type { DraftSaveResult, SaveDraft, SubmitSend } from "../drafts";
import type {
  AccountSession,
  ConversationKey,
  LocalRevision,
  MessageKey,
  OperationKey,
} from "../identities";
import type {
  OperationState,
  PreparedOperation,
  TargetOutcome,
} from "../operations";
import type {
  ConversationQuery,
  Coverage,
  MailPredicate,
  MailboxView,
  QuerySnapshot,
} from "../queries";
import type {
  ConversationMembershipPage,
  ProviderChange,
  SyncPage,
} from "../sync";
import type { MessageMetadata } from "../messages";

export type ConversationView = {
  key: ConversationKey;
  messages: Array<{
    key: MessageKey;
    metadata: MessageMetadata;
    content:
      | { status: "not_requested" | "queued" | "unavailable" }
      | { status: "available"; html: string | null; text: string | null };
    pendingOperationIds: string[];
  }>;
  nextPage: string | null;
  coverage: Coverage[];
};

export type ClaimedWork =
  | {
      kind: "command";
      attemptId: string;
      operation: PreparedOperation;
    }
  | {
      kind: "sync";
      jobId: string;
      accountId: string;
      session: AccountSession;
      position: {
        streamId: string;
        generation: string;
        checkpoint: string | null;
      };
    }
  | {
      kind: "prepare";
      commandId: string;
      accountId: string;
      conversation: ConversationKey;
      resolutionId: string;
      page: string | null;
    }
  | {
      kind: "hydrate";
      jobId: string;
      keys: MessageKey[];
      purpose: "metadata" | "body";
    }
  | {
      kind: "search";
      jobId: string;
      accountId: string;
      predicate: MailPredicate;
      page: string | null;
    };

export type MailStoreInspection = {
  revision: LocalRevision;
  accounts: Array<{
    accountId: string;
    provider: "google" | "microsoft";
    generation: string;
    assistantCursor: string | null;
  }>;
  messages: Array<{
    accountId: string;
    messageId: string;
    conversationId: string;
    confirmed: MessageMetadata;
    effective: MessageMetadata & { pendingOperationIds: string[] };
    deleted: boolean;
  }>;
  operations: OperationState[];
  operationTargets: Array<{
    accountId: string;
    operationId: string;
    messageId: string;
    outcome: "applied" | "rejected" | "uncertain" | null;
    code: string | null;
  }>;
  coverage: Coverage[];
  streams: Array<{
    accountId: string;
    streamId: string;
    generation: string;
    checkpoint: string | null;
  }>;
};

export interface MailStore {
  admitConversations(input: SubmitConversationCommand): Promise<Admission>;
  admitMetadata(input: SubmitMetadataCommand): Promise<Admission>;
  admitSend(input: SubmitSend): Promise<Admission>;
  applyAssistantEntries(input: {
    accountId: string;
    cursor?: string | null;
    entries: Array<{
      cursor: string;
      draftId?: string;
      draftRevision?: number;
      change?: ProviderChange;
    }>;
  }): Promise<LocalRevision>;
  applyHydration(input: {
    session: AccountSession;
    requestId: string;
    changes: ProviderChange[];
    bodies: Array<{
      key: MessageKey;
      version: string | null;
      html: string | null;
      text: string | null;
    }>;
  }): Promise<
    { status: "committed"; revision: LocalRevision } | { status: "stale" }
  >;
  applyPreparationPage(input: {
    accountId: string;
    commandId: string;
    page: ConversationMembershipPage;
  }): Promise<Admission | { status: "stale" }>;
  applySyncPage(input: {
    page: SyncPage;
    ownerId: string;
  }): Promise<
    { status: "committed"; revision: LocalRevision } | { status: "stale" }
  >;
  cancelOperation(
    key: OperationKey,
  ): Promise<
    | { status: "cancelled"; revision: LocalRevision }
    | { status: "too_late" | "not_found" }
  >;
  claimWork(input: {
    ownerId: string;
    nowMs: number;
    leaseMs: number;
  }): Promise<ClaimedWork | null>;
  close(): Promise<void>;
  completeJob(jobId: string): Promise<void>;
  enqueueHydration(input: {
    keys: MessageKey[];
    purpose: "metadata" | "body";
  }): Promise<LocalRevision>;
  enqueueSearch(input: {
    accountId: string;
    predicate: MailPredicate;
    page: string | null;
  }): Promise<LocalRevision>;
  ensureAccount(input: {
    accountId: string;
    provider: "google" | "microsoft";
    generation: string;
  }): Promise<LocalRevision>;
  failOperation(
    key: OperationKey,
    code: string,
  ): Promise<
    { status: "committed"; revision: LocalRevision } | { status: "stale" }
  >;
  finishPreparation(input: {
    accountId: string;
    commandId: string;
  }): Promise<Admission | { status: "stale" }>;
  getDiagnostics(accountId: string): Promise<{
    accountId: string;
    revision: LocalRevision;
    connection: "ready" | "offline" | "blocked_auth";
    coverage: Coverage[];
    pendingOperations: number;
    uncertainOperations: number;
    pendingJobs: number;
    oldestPendingAtMs: number | null;
    commands: Array<{
      operationId: string;
      status: OperationState["status"];
      kind: string;
      changeKind: string | null;
      messageIds: string[];
      conversationIds: string[];
    }>;
  }>;
  inspect(): Promise<MailStoreInspection>;
  readConversation(
    key: ConversationKey,
    page: { after: string | null; pageSize: number },
  ): Promise<{ revision: LocalRevision; view: ConversationView }>;
  readMailboxView(query: ConversationQuery): Promise<{
    revision: LocalRevision;
    view: MailboxView;
  }>;
  readOperation(key: OperationKey): Promise<{
    revision: LocalRevision;
    operation: OperationState | null;
  }>;
  saveDraft(input: SaveDraft): Promise<DraftSaveResult>;
  settleAttempt(input: {
    attemptId: string;
    operation: PreparedOperation;
    result:
      | {
          status: "confirmed";
          receiptId: string | null;
          observations: ProviderChange[];
          targets: TargetOutcome[];
        }
      | { status: "accepted"; receiptId: string; retryAfterMs: number }
      | {
          status: "not_dispatched";
          reason: "throttled" | "blocked_auth" | "unavailable";
          retryAfterMs: number | null;
        }
      | { status: "rejected"; code: string; targets: TargetOutcome[] }
      | { status: "uncertain"; receiptId: string | null };
  }): Promise<
    { status: "committed"; revision: LocalRevision } | { status: "stale" }
  >;
}

export type { QuerySnapshot };
