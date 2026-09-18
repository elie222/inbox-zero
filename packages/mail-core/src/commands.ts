import { z } from "zod";
import {
  accountIdSchema,
  conversationKeySchema,
  localRevisionSchema,
  messageKeySchema,
  operationKeySchema,
} from "./identities";

export const metadataChangeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("archive") }),
  z.object({ kind: z.literal("unarchive") }),
  z.object({ kind: z.literal("set_read"), read: z.boolean() }),
  z.object({ kind: z.literal("set_starred"), starred: z.boolean() }),
  z.object({ kind: z.literal("trash") }),
  z.object({ kind: z.literal("restore_from_trash") }),
  z.object({ kind: z.literal("set_spam"), spam: z.boolean() }),
  z.object({ kind: z.literal("move"), folderId: z.string().min(1).max(256) }),
  z.object({
    kind: z.literal("set_membership"),
    membership: z.enum(["label", "category"]),
    id: z.string().min(1).max(256),
    present: z.boolean(),
  }),
]);
export type MetadataChange = z.infer<typeof metadataChangeSchema>;

export const submitMetadataCommandSchema = z.object({
  accountId: accountIdSchema,
  commandId: z.string().min(1).max(128),
  targets: z.array(messageKeySchema).min(1).max(10_000),
  change: metadataChangeSchema,
});
export type SubmitMetadataCommand = z.infer<typeof submitMetadataCommandSchema>;

export const submitConversationCommandSchema = z.object({
  accountId: accountIdSchema,
  commandId: z.string().min(1).max(128),
  conversations: z.array(conversationKeySchema).min(1).max(500),
  change: metadataChangeSchema,
  observedRevision: localRevisionSchema,
});
export type SubmitConversationCommand = z.infer<
  typeof submitConversationCommandSchema
>;

export const admissionSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.enum(["queued", "preparing", "already_recorded"]),
    operation: operationKeySchema,
    revision: localRevisionSchema,
  }),
  z.object({
    status: z.literal("rejected"),
    code: z.enum([
      "invalid",
      "unsupported",
      "storage_unavailable",
      "stale_selection",
      "queue_full",
    ]),
  }),
]);
export type Admission = z.infer<typeof admissionSchema>;

export const mailCommandSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("metadata"),
    command: submitMetadataCommandSchema,
  }),
  z.object({
    kind: z.literal("conversations"),
    command: submitConversationCommandSchema,
  }),
]);
export type MailCommand = z.infer<typeof mailCommandSchema>;
