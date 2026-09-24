import { z } from "zod";
import {
  conversationIdSchema,
  draftKeySchema,
  localRevisionSchema,
  messageIdSchema,
  messageKeySchema,
} from "./identities";

export const draftContentSchema = z.object({
  to: z.array(z.string().max(4096)).max(100),
  cc: z.array(z.string().max(4096)).max(100),
  bcc: z.array(z.string().max(4096)).max(100),
  subject: z.string().max(16_384),
  editableHtml: z.string().max(1_000_000),
  quotedHtml: z.string().max(1_000_000),
  attachmentIds: z.array(z.string().min(1).max(128)).max(20),
  conversationId: conversationIdSchema.optional(),
  clientState: z.string().max(1_000_000).optional(),
  providerDraftId: messageIdSchema.optional(),
});
export type DraftContent = z.infer<typeof draftContentSchema>;

export const saveDraftSchema = z.object({
  key: draftKeySchema,
  expectedRevision: z.number().int().nonnegative().nullable(),
  content: draftContentSchema,
});
export type SaveDraft = z.infer<typeof saveDraftSchema>;

export const submitSendSchema = z.object({
  commandId: z.string().min(1).max(128),
  draft: draftKeySchema,
  draftRevision: z.number().int().nonnegative(),
  replyTo: messageKeySchema.nullable(),
  conversationId: conversationIdSchema.optional(),
  notBeforeMs: z.number().int().nonnegative().optional(),
});
export type SubmitSend = z.infer<typeof submitSendSchema>;

export const draftSaveResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("saved"),
    draftRevision: z.number().int().nonnegative(),
    revision: localRevisionSchema,
  }),
  z.object({
    status: z.literal("conflict"),
    currentDraftRevision: z.number().int().nonnegative().nullable(),
  }),
  z.object({
    status: z.literal("rejected"),
    code: z.enum(["invalid", "storage_unavailable"]),
  }),
]);
export type DraftSaveResult = z.infer<typeof draftSaveResultSchema>;

export const draftReadResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("found"),
    draftRevision: z.number().int().nonnegative(),
    content: draftContentSchema,
  }),
  z.object({ status: z.literal("missing") }),
]);
export type DraftReadResult = z.infer<typeof draftReadResultSchema>;
