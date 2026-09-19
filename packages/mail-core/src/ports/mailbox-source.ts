import type { MetadataChange } from "../commands";
import type { MailPredicate } from "../queries";
import type {
  AccountSession,
  ConversationKey,
  MessageKey,
} from "../identities";
import type {
  BodyObservation,
  ConversationMembershipPage,
  SyncPosition,
  ProviderChange,
} from "../sync";

export type ReadResult<T> =
  | { status: "ok"; value: T }
  | {
      status: "paused";
      retryAfterMs: number;
      reason: "throttled" | "unavailable";
    }
  | { status: "blocked_auth" };

export type SourceContext = {
  session: AccountSession;
  requestId: string;
  signal: AbortSignal;
};

export type ScopeDescriptor = {
  id: string;
  kind: "account" | "folder";
  folderId: string | null;
};

export type EnumerationPage = {
  bootstrapId: string;
  scopeId: string;
  changes: ProviderChange[];
  requiredHydration: MessageKey[];
  bodies: BodyObservation[];
} & (
  | { nextPage: string; catchUpFrom: null }
  | { nextPage: null; catchUpFrom: SyncPosition }
);

export type SyncReadResult =
  | { status: "page"; page: import("../sync").SyncPage }
  | { status: "reset_required"; scopeId: string }
  | {
      status: "paused";
      retryAfterMs: number;
      reason: "throttled" | "unavailable";
    }
  | { status: "blocked_auth" };

export interface MailboxSource {
  beginBootstrap(
    input: SourceContext & { scope: ScopeDescriptor; afterMs: number | null },
  ): Promise<
    ReadResult<{
      bootstrapId: string;
      enumerationToken: string;
      catchUpFrom: SyncPosition | null;
    }>
  >;
  describe(input: SourceContext): Promise<
    ReadResult<{
      strategy: "account_history" | "folder_delta";
      supportedChanges: MetadataChange["kind"][];
      maxPageSize: number;
      maxHydrationBatch: number;
    }>
  >;
  discoverScopes(
    input: SourceContext & { page: string | null },
  ): Promise<
    ReadResult<{ scopes: ScopeDescriptor[]; nextPage: string | null }>
  >;
  enumerate(
    input: SourceContext & {
      bootstrapId: string;
      page: string;
      pageSize: number;
    },
  ): Promise<
    ReadResult<EnumerationPage> | { status: "reset_required"; scopeId: string }
  >;
  hydrate(
    input: SourceContext & { keys: MessageKey[]; purpose: "metadata" | "body" },
  ): Promise<
    ReadResult<{
      changes: ProviderChange[];
      bodies: BodyObservation[];
      unresolved: Array<{
        key: MessageKey;
        reason: "not_found" | "unavailable";
      }>;
    }>
  >;
  readAttachment(
    input: SourceContext & { key: MessageKey; attachmentId: string },
  ): Promise<
    ReadResult<{ bytes: AsyncIterable<Uint8Array>; sizeBytes: number | null }>
  >;
  readChanges(input: {
    session: AccountSession;
    requestId: string;
    position: SyncPosition;
    pageSize: number;
    signal: AbortSignal;
  }): Promise<SyncReadResult>;
  readConversationMembership(
    input: SourceContext & {
      conversation: ConversationKey;
      resolutionId: string;
      page: string | null;
      pageSize: number;
    },
  ): Promise<
    ReadResult<
      | { status: "page"; page: ConversationMembershipPage }
      | { status: "not_found" }
      | { status: "restart_required" }
      | { status: "unsupported" }
    >
  >;
  search(
    input: SourceContext & {
      predicate: MailPredicate;
      page: string | null;
      pageSize: number;
    },
  ): Promise<
    | ReadResult<{
        matches: MessageKey[];
        nextPage: string | null;
        semantics: "exact" | "candidates_require_local_filter";
      }>
    | { status: "unsupported" }
  >;
}
