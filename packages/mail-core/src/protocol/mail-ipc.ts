import { z } from "zod";
import {
  conversationQuerySchema,
  mailboxCountsQuerySchema,
  mailboxViewSchema,
} from "../queries";
import {
  submitConversationCommandSchema,
  submitMetadataCommandSchema,
  admissionSchema,
} from "../commands";
import {
  conversationKeySchema,
  draftKeySchema,
  messageKeySchema,
  operationKeySchema,
  accountIdSchema,
} from "../identities";
import { saveDraftSchema, submitSendSchema } from "../drafts";

export const MAIL_IPC_PROTOCOL_VERSION = 1;

export const mailIpcRequestSchema = z.discriminatedUnion("method", [
  z.object({
    protocolVersion: z.literal(MAIL_IPC_PROTOCOL_VERSION),
    requestId: z.string().min(1).max(128),
    method: z.literal("observeMailbox"),
    payload: conversationQuerySchema,
  }),
  z.object({
    protocolVersion: z.literal(MAIL_IPC_PROTOCOL_VERSION),
    requestId: z.string().min(1).max(128),
    method: z.literal("observeMailboxCounts"),
    payload: mailboxCountsQuerySchema,
  }),
  z.object({
    protocolVersion: z.literal(MAIL_IPC_PROTOCOL_VERSION),
    requestId: z.string().min(1).max(128),
    method: z.literal("observeMailboxWindow"),
    payload: z.object({
      query: conversationQuerySchema,
      pageCount: z.number().int().min(1).max(10_000),
    }),
  }),
  z.object({
    protocolVersion: z.literal(MAIL_IPC_PROTOCOL_VERSION),
    requestId: z.string().min(1).max(128),
    method: z.literal("submitMetadata"),
    payload: submitMetadataCommandSchema,
  }),
  z.object({
    protocolVersion: z.literal(MAIL_IPC_PROTOCOL_VERSION),
    requestId: z.string().min(1).max(128),
    method: z.literal("submitConversations"),
    payload: submitConversationCommandSchema,
  }),
  z.object({
    protocolVersion: z.literal(MAIL_IPC_PROTOCOL_VERSION),
    requestId: z.string().min(1).max(128),
    method: z.literal("saveDraft"),
    payload: saveDraftSchema,
  }),
  z.object({
    protocolVersion: z.literal(MAIL_IPC_PROTOCOL_VERSION),
    requestId: z.string().min(1).max(128),
    method: z.literal("readDraft"),
    payload: draftKeySchema,
  }),
  z.object({
    protocolVersion: z.literal(MAIL_IPC_PROTOCOL_VERSION),
    requestId: z.string().min(1).max(128),
    method: z.literal("submitSend"),
    payload: submitSendSchema,
  }),
  z.object({
    protocolVersion: z.literal(MAIL_IPC_PROTOCOL_VERSION),
    requestId: z.string().min(1).max(128),
    method: z.literal("cancelOperation"),
    payload: operationKeySchema,
  }),
  z.object({
    protocolVersion: z.literal(MAIL_IPC_PROTOCOL_VERSION),
    requestId: z.string().min(1).max(128),
    method: z.literal("requestSync"),
    payload: z.object({
      accountIds: z.array(accountIdSchema).min(1),
      provider: z.enum(["google", "microsoft"]).optional(),
    }),
  }),
  z.object({
    protocolVersion: z.literal(MAIL_IPC_PROTOCOL_VERSION),
    requestId: z.string().min(1).max(128),
    method: z.literal("ensureMessageContent"),
    payload: messageKeySchema,
  }),
  z.object({
    protocolVersion: z.literal(MAIL_IPC_PROTOCOL_VERSION),
    requestId: z.string().min(1).max(128),
    method: z.literal("stageDraftAttachment"),
    payload: z.object({
      accountId: accountIdSchema,
      draftId: z.string().min(1).max(128).nullable(),
      attachmentId: z.string().min(1).max(128),
      filename: z.string().max(1024),
      contentType: z.string().max(256),
      checksum: z.string().min(1).max(128),
      sizeBytes: z.number().int().nonnegative(),
      inline: z.boolean().optional(),
      contentBase64: z.string().min(1),
    }),
  }),
  z.object({
    protocolVersion: z.literal(MAIL_IPC_PROTOCOL_VERSION),
    requestId: z.string().min(1).max(128),
    method: z.literal("getDiagnostics"),
    payload: z.object({ accountId: accountIdSchema }),
  }),
  z.object({
    protocolVersion: z.literal(MAIL_IPC_PROTOCOL_VERSION),
    requestId: z.string().min(1).max(128),
    method: z.literal("purgeAccount"),
    payload: z.object({ accountId: accountIdSchema }),
  }),
  z.object({
    protocolVersion: z.literal(MAIL_IPC_PROTOCOL_VERSION),
    requestId: z.string().min(1).max(128),
    method: z.literal("inspect"),
    payload: z.object({}),
  }),
  z.object({
    protocolVersion: z.literal(MAIL_IPC_PROTOCOL_VERSION),
    requestId: z.string().min(1).max(128),
    method: z.literal("observeConversation"),
    payload: z.object({
      key: conversationKeySchema,
      after: z.string().nullable(),
      pageSize: z.number().int().min(1).max(100),
    }),
  }),
  z.object({
    protocolVersion: z.literal(MAIL_IPC_PROTOCOL_VERSION),
    requestId: z.string().min(1).max(128),
    method: z.literal("observeOperation"),
    payload: operationKeySchema,
  }),
  z.object({
    protocolVersion: z.literal(MAIL_IPC_PROTOCOL_VERSION),
    requestId: z.string().min(1).max(128),
    method: z.literal("cancel"),
    payload: z.object({ targetRequestId: z.string().min(1).max(128) }),
  }),
]);
export type MailIpcRequest = z.infer<typeof mailIpcRequestSchema>;

export const mailIpcMailboxSnapshotSchema = z.object({
  protocolVersion: z.literal(MAIL_IPC_PROTOCOL_VERSION),
  requestId: z.string(),
  queryId: z.string(),
  databaseEpoch: z.string(),
  sequence: z.number().int(),
  view: mailboxViewSchema,
});

export const mailIpcAdmissionSchema = z.object({
  protocolVersion: z.literal(MAIL_IPC_PROTOCOL_VERSION),
  requestId: z.string(),
  admission: admissionSchema,
});
