import { z } from "zod";
import {
  accountIdSchema,
  conversationKeySchema,
  localRevisionSchema,
} from "./identities";
import { inboxSectionSchema, mailboxRoleSchema } from "./messages";

export const mailPredicateSchema: z.ZodType<MailPredicate> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("all"),
      predicates: z.array(mailPredicateSchema).max(32),
    }),
    z.object({
      kind: z.literal("any"),
      predicates: z.array(mailPredicateSchema).max(32),
    }),
    z.object({ kind: z.literal("not"), predicate: mailPredicateSchema }),
    z.object({
      kind: z.literal("role"),
      role: z.enum(["inbox", "sent", "draft", "trash", "spam"]),
    }),
    z.object({ kind: z.literal("read"), value: z.boolean() }),
    z.object({ kind: z.literal("starred"), value: z.boolean() }),
    z.object({
      kind: z.literal("inbox_section"),
      section: inboxSectionSchema,
    }),
    z.object({
      kind: z.literal("membership"),
      membership: z.enum(["folder", "label", "category"]),
      id: z.string().min(1).max(256),
      accountId: accountIdSchema.optional(),
    }),
    z.object({
      kind: z.literal("address"),
      field: z.enum(["from", "to", "cc"]),
      value: z.string().min(1).max(4096),
      match: z.enum(["address", "domain"]),
    }),
    z.object({
      kind: z.literal("received"),
      afterMs: z.number().int().nullable(),
      beforeMs: z.number().int().nullable(),
    }),
    z.object({ kind: z.literal("has_attachment"), value: z.boolean() }),
    z.object({
      kind: z.literal("text"),
      field: z.enum(["any", "subject", "body"]),
      value: z.string().min(1).max(4096),
      match: z.enum(["term", "phrase"]),
    }),
  ]),
);

export type MailPredicate =
  | { kind: "all"; predicates: MailPredicate[] }
  | { kind: "any"; predicates: MailPredicate[] }
  | { kind: "not"; predicate: MailPredicate }
  | { kind: "role"; role: "inbox" | "sent" | "draft" | "trash" | "spam" }
  | { kind: "read"; value: boolean }
  | { kind: "starred"; value: boolean }
  | { kind: "inbox_section"; section: "focused" | "other" }
  | {
      kind: "membership";
      membership: "folder" | "label" | "category";
      id: string;
      accountId?: string;
    }
  | {
      kind: "address";
      field: "from" | "to" | "cc";
      value: string;
      match: "address" | "domain";
    }
  | { kind: "received"; afterMs: number | null; beforeMs: number | null }
  | { kind: "has_attachment"; value: boolean }
  | {
      kind: "text";
      field: "any" | "subject" | "body";
      value: string;
      match: "term" | "phrase";
    };

export const conversationQuerySchema = z.object({
  accountIds: z.array(accountIdSchema).min(1).max(50),
  predicate: mailPredicateSchema,
  order: z.literal("newest_first"),
  pageSize: z.number().int().min(1).max(100),
  after: z.string().max(512).nullable(),
});
export type ConversationQuery = z.infer<typeof conversationQuerySchema>;

export const coverageSchema = z.object({
  accountId: accountIdSchema,
  scopeId: z.string().min(1).max(256),
  metadata: z.enum(["partial", "complete"]),
  content: z.enum(["partial", "complete", "not_requested"]),
  indexedContent: z.enum(["partial", "complete", "not_requested"]),
  lastCompletedSyncAtMs: z.number().int().nullable(),
});
export type Coverage = z.infer<typeof coverageSchema>;

export const conversationSummarySchema = z.object({
  key: conversationKeySchema,
  subject: z.string(),
  preview: z.string(),
  from: z.string(),
  to: z.string(),
  senders: z.array(z.string()).max(500),
  latestMessageAtMs: z.number().int(),
  unread: z.boolean(),
  starred: z.boolean(),
  labelIds: z.array(z.string().max(256)).max(500),
  roles: z.array(mailboxRoleSchema).max(8),
  pendingOperationIds: z.array(z.string()),
});
export type ConversationSummary = z.infer<typeof conversationSummarySchema>;

export const mailboxViewSchema = z.object({
  conversations: z.array(conversationSummarySchema),
  counts: z.object({
    matchingConversations: z.number().int().nonnegative(),
    unreadConversations: z.number().int().nonnegative(),
    extent: z.enum(["local_coverage", "complete_scope"]),
  }),
  nextPage: z.string().nullable(),
  coverage: z.array(coverageSchema),
  connection: z.enum(["ready", "offline", "blocked_auth"]).optional(),
});
export type MailboxView = z.infer<typeof mailboxViewSchema>;

export const querySnapshotSchema = z.object({
  status: z.enum(["loading", "ready", "unavailable", "error"]),
  revision: localRevisionSchema.nullable(),
  data: z.unknown().nullable(),
  refreshing: z.boolean(),
  error: z
    .object({
      code: z.string(),
      retryable: z.boolean(),
    })
    .nullable(),
});
export type QuerySnapshot<T> = {
  status: "loading" | "ready" | "unavailable" | "error";
  revision: z.infer<typeof localRevisionSchema> | null;
  data: T | null;
  refreshing: boolean;
  error: { code: string; retryable: boolean } | null;
};

export type QueryHandle<T> = {
  getSnapshot(): QuerySnapshot<T>;
  subscribe(listener: () => void): () => void;
  close(): void;
};

export function canonicalizeQuery(query: ConversationQuery): string {
  return JSON.stringify({
    accountIds: [...query.accountIds].sort(),
    predicate: query.predicate,
    order: query.order,
    pageSize: query.pageSize,
    after: query.after,
  });
}
