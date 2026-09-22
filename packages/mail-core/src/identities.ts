import { z } from "zod";

export const MAIL_PROTOCOL_VERSION = 1;

export const accountIdSchema = z.string().min(1).max(128);
export const messageIdSchema = z.string().min(1).max(256);
export const conversationIdSchema = z.string().min(1).max(256);
export const operationIdSchema = z.string().min(1).max(128);
export const draftIdSchema = z.string().min(1).max(128);
export const blobIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);

export const providerSchema = z.enum(["google", "microsoft"]);
export type Provider = z.infer<typeof providerSchema>;

export const messageKeySchema = z.object({
  accountId: accountIdSchema,
  messageId: messageIdSchema,
});
export type MessageKey = z.infer<typeof messageKeySchema>;

export const conversationKeySchema = z.object({
  accountId: accountIdSchema,
  conversationId: conversationIdSchema,
});
export type ConversationKey = z.infer<typeof conversationKeySchema>;

export const operationKeySchema = z.object({
  accountId: accountIdSchema,
  operationId: operationIdSchema,
});
export type OperationKey = z.infer<typeof operationKeySchema>;

export const draftKeySchema = z.object({
  accountId: accountIdSchema,
  draftId: draftIdSchema,
});
export type DraftKey = z.infer<typeof draftKeySchema>;

export const localRevisionSchema = z.object({
  databaseEpoch: z.string().min(1).max(128),
  sequence: z.number().int().nonnegative(),
});
export type LocalRevision = z.infer<typeof localRevisionSchema>;

export const accountSessionSchema = z.object({
  accountId: accountIdSchema,
  generation: z.string().min(1).max(128),
});
export type AccountSession = z.infer<typeof accountSessionSchema>;

export const providerReferenceSchema = z.object({
  provider: providerSchema,
  messageId: messageIdSchema,
  conversationId: conversationIdSchema,
  version: z.string().max(512).nullable(),
});
export type ProviderReference = z.infer<typeof providerReferenceSchema>;

export type AccountId = z.infer<typeof accountIdSchema>;

export function messageKeyEquals(left: MessageKey, right: MessageKey): boolean {
  return (
    left.accountId === right.accountId && left.messageId === right.messageId
  );
}

export function conversationKeyEquals(
  left: ConversationKey,
  right: ConversationKey,
): boolean {
  return (
    left.accountId === right.accountId &&
    left.conversationId === right.conversationId
  );
}

export function revisionEquals(
  left: LocalRevision,
  right: LocalRevision,
): boolean {
  return (
    left.databaseEpoch === right.databaseEpoch &&
    left.sequence === right.sequence
  );
}

export function isRevisionAtLeast(
  current: LocalRevision,
  observed: LocalRevision,
): boolean {
  if (current.databaseEpoch !== observed.databaseEpoch) return false;
  return current.sequence >= observed.sequence;
}
