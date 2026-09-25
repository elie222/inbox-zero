import type {
  Admission,
  SubmitConversationCommand,
  SubmitMetadataCommand,
} from "../commands";
import type {
  DraftReadResult,
  DraftSaveResult,
  SaveDraft,
  SubmitSend,
} from "../drafts";
import type {
  AccountSession,
  ConversationKey,
  DraftKey,
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
  MailboxCountsQuery,
  MailboxCountsView,
  MailboxView,
  QuerySnapshot,
} from "../queries";
import type {
  BodyObservation,
  ConversationMembershipPage,
  ProviderChange,
  SyncPage,
} from "../sync";
import type { MessageAttachmentDescriptor, MessageMetadata } from "../messages";

export type ConversationView = {
  key: ConversationKey;
  messages: Array<{
    key: MessageKey;
    metadata: MessageMetadata;
    content:
      | { status: "not_requested" | "queued" | "unavailable" }
      | {
          status: "available";
          html: string | null;
          text: string | null;
          attachments: MessageAttachmentDescriptor[];
          isMeetingInvitation: boolean;
        };
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
      kind: "inspect";
      attemptId: string;
      receiptId: string | null;
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
      attemptId: string;
      commandId: string;
      accountId: string;
      session: AccountSession;
      conversation: ConversationKey;
      resolutionId: string;
      page: string | null;
    }
  | {
      kind: "hydrate";
      jobId: string;
      attemptId: string;
      session: AccountSession;
      keys: MessageKey[];
      purpose: "metadata" | "body";
    }
  | {
      kind: "search";
      jobId: string;
      attemptId: string;
      accountId: string;
      session: AccountSession;
      predicate: MailPredicate;
      page: string | null;
    }
  | {
      kind: "upload";
      attemptId: string;
      operation: PreparedOperation;
      attachmentId: string;
      checksum: string;
      sizeBytes: number;
      filename: string;
      contentType: string;
    };

export type SyncStreamPosition = {
  streamId: string;
  generation: string;
  checkpoint: string | null;
};

export type BootstrapScan = {
  accountId: string;
  scopeId: string;
  bootstrapId: string;
  page: string | null;
  from: SyncStreamPosition;
  catchUpFrom: SyncStreamPosition | null;
  nextAttemptAtMs: number | null;
  errorCode: string | null;
};

export type AccountSyncState = {
  accountId: string;
  generation: string;
  assistantCursor: string | null;
  streams: Array<SyncStreamPosition & { accountId: string }>;
  stream: (SyncStreamPosition & { accountId: string }) | null;
};

export type AssistantEntryRecord = {
  id: string;
  revision: string;
  messageId: string | null;
  conversationId: string | null;
  kind: string;
  payload: unknown;
};

export type MailStoreInspection = {
  revision: LocalRevision;
  accounts: Array<{
    accountId: string;
    provider: "google" | "microsoft";
    generation: string;
    assistantCursor: string | null;
    connection: "ready" | "offline" | "blocked_auth";
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
  assistantEntries: Array<AssistantEntryRecord & { accountId: string }>;
  coverage: Coverage[];
  streams: Array<{
    accountId: string;
    streamId: string;
    generation: string;
    checkpoint: string | null;
  }>;
};

export type MailStoreInspectionInput = {
  accountIds?: string[];
  limit?: number;
};

export interface MailStore {
  admitConversations(input: SubmitConversationCommand): Promise<Admission>;
  admitMetadata(input: SubmitMetadataCommand): Promise<Admission>;
  admitSend(input: SubmitSend): Promise<Admission>;
  applyAssistantEntries(input: {
    accountId: string;
    cursor?: string | null;
    entries: AssistantEntryRecord[];
  }): Promise<LocalRevision>;
  applyBootstrapPage(input: {
    session: AccountSession;
    scopeId: string;
    bootstrapId: string;
    previousPage: string | null;
    nextPage: string | null;
    from: SyncStreamPosition;
    catchUpFrom: SyncStreamPosition | null;
    requestId: string;
    changes: ProviderChange[];
    requiredHydration: MessageKey[];
    bodies: BodyObservation[];
    ownerId: string;
  }): Promise<
    { status: "committed"; revision: LocalRevision } | { status: "stale" }
  >;
  applyHydration(input: {
    session: AccountSession;
    requestId: string;
    attemptId?: string;
    changes: ProviderChange[];
    bodies: BodyObservation[];
  }): Promise<
    { status: "committed"; revision: LocalRevision } | { status: "stale" }
  >;
  applyPreparationPage(input: {
    accountId: string;
    commandId: string;
    attemptId: string;
    session: AccountSession;
    previousPage: string | null;
    page: ConversationMembershipPage;
  }): Promise<Admission | { status: "stale" }>;
  applySyncPage(input: {
    page: SyncPage;
    ownerId: string;
    bodies?: BodyObservation[];
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
  completeJob(input: { jobId: string; attemptId: string }): Promise<void>;
  deferBootstrapScan(input: {
    session: AccountSession;
    scopeId: string;
    bootstrapId: string;
    page: string;
    nextAttemptAtMs: number;
    errorCode: string;
  }): Promise<
    { status: "committed"; revision: LocalRevision } | { status: "stale" }
  >;
  deferPreparation(input: {
    accountId: string;
    commandId: string;
    attemptId: string;
    nextAttemptAtMs: number | null;
  }): Promise<
    { status: "committed"; revision: LocalRevision } | { status: "stale" }
  >;
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
  evictReplaceableContent(): Promise<{ evictedBodies: number }>;
  failOperation(
    key: OperationKey,
    code: string,
  ): Promise<
    { status: "committed"; revision: LocalRevision } | { status: "stale" }
  >;
  failPreparation(input: {
    accountId: string;
    commandId: string;
    attemptId: string;
    session: AccountSession;
    code: string;
  }): Promise<
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
      change: Record<string, unknown> | null;
      messageIds: string[];
      conversationIds: string[];
    }>;
  }>;
  /** Indexes one short batch of stored bodies missing from local search. */
  indexSearchBacklog(): Promise<{ remaining: boolean }>;
  inspect(input?: MailStoreInspectionInput): Promise<MailStoreInspection>;
  listReferencedBlobIds(): Promise<string[]>;
  purgeAccount(accountId: string): Promise<LocalRevision>;
  readAccountSyncStates(): Promise<AccountSyncState[]>;
  readBootstrapScan(input: {
    session: AccountSession;
    scopeId: string;
  }): Promise<BootstrapScan | null>;
  readConversation(
    key: ConversationKey,
    page: { after: string | null; pageSize: number },
  ): Promise<{ revision: LocalRevision; view: ConversationView }>;
  readDraft(key: DraftKey): Promise<DraftReadResult>;
  readMailboxCounts(query: MailboxCountsQuery): Promise<{
    revision: LocalRevision;
    view: MailboxCountsView;
  }>;
  readMailboxView(query: ConversationQuery): Promise<{
    revision: LocalRevision;
    view: MailboxView;
  }>;
  readMailboxWindow(
    query: ConversationQuery,
    pageCount: number,
  ): Promise<{
    revision: LocalRevision;
    view: MailboxView;
  }>;
  readOperation(key: OperationKey): Promise<{
    revision: LocalRevision;
    operation: OperationState | null;
  }>;
  recordAttachmentUpload(input: {
    operationId: string;
    accountId: string;
    attachmentId: string;
    remoteUploadId: string;
  }): Promise<LocalRevision>;
  /** Resolves `true` when the stored connection state changed. */
  recordConnection(input: {
    accountId: string;
    connection: "ready" | "offline" | "blocked_auth";
  }): Promise<boolean>;
  registerSyncScopes(input: {
    session: AccountSession;
    scopeIds: string[];
  }): Promise<boolean>;
  releaseDeferredOperations(input: {
    accountIds: string[];
    nowMs: number;
  }): Promise<void>;
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
  stageDraftAttachment(input: {
    accountId: string;
    draftId: string | null;
    attachmentId: string;
    filename: string;
    contentType: string;
    checksum: string;
    sizeBytes: number;
    inline?: boolean;
  }): Promise<{ status: "staged" } | { status: "rejected"; code: "invalid" }>;
  startBootstrapScan(input: {
    session: AccountSession;
    scopeId: string;
    bootstrapId: string;
    page: string | null;
    from: SyncStreamPosition;
    catchUpFrom: SyncStreamPosition | null;
    nowMs: number;
  }): Promise<
    { status: "committed"; revision: LocalRevision } | { status: "stale" }
  >;
  tombstoneUnseen(input: {
    session: AccountSession;
    scopeId: string;
    seenMessageIds: string[];
  }): Promise<LocalRevision>;
}

export type { QuerySnapshot };
