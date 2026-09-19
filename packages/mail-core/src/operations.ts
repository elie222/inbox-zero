import { z } from "zod";
import { metadataChangeSchema } from "./commands";
import {
  accountSessionSchema,
  messageKeySchema,
  operationKeySchema,
} from "./identities";

export const operationStatusSchema = z.enum([
  "preparing",
  "queued",
  "executing",
  "verifying",
  "retry_wait",
  "blocked_auth",
  "uncertain",
  "needs_attention",
  "succeeded",
  "failed",
  "cancelled",
  "superseded",
]);
export type OperationStatus = z.infer<typeof operationStatusSchema>;

export const operationStateSchema = z.object({
  key: operationKeySchema,
  status: operationStatusSchema,
  authority: z.enum(["backend", "client"]),
  attempts: z.number().int().nonnegative(),
  nextAttemptAtMs: z.number().int().nullable(),
  error: z
    .object({
      code: z.string(),
      retryable: z.boolean(),
    })
    .nullable(),
});
export type OperationState = z.infer<typeof operationStateSchema>;

export const preparedOperationSchema = z.object({
  key: operationKeySchema,
  session: accountSessionSchema,
  authority: z.enum(["backend", "client"]),
  payloadHash: z.string().min(1),
  intent: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("metadata"),
      targets: z.array(messageKeySchema).min(1),
      change: metadataChangeSchema,
    }),
    z.object({
      kind: z.literal("send"),
      frozenDraftId: z.string().min(1),
      frozenDraftRevision: z.number().int().nonnegative(),
      to: z.array(z.string().max(4096)).max(100),
      cc: z.array(z.string().max(4096)).max(100),
      bcc: z.array(z.string().max(4096)).max(100),
      subject: z.string().max(16_384),
      html: z.string().max(1_000_000),
      quotedHtml: z.string().max(1_000_000),
      attachmentIds: z.array(z.string().min(1).max(128)).max(20),
      providerDraftId: z.string().min(1).max(256).optional(),
      replyToMessageId: z.string().max(256).nullable(),
      replyToConversationId: z.string().max(256).nullable(),
      queuedAtMs: z.number().int().nonnegative(),
    }),
  ]),
});
export type PreparedOperation = z.infer<typeof preparedOperationSchema>;

export const targetOutcomeSchema = z.object({
  key: messageKeySchema,
  outcome: z.enum(["applied", "rejected", "uncertain"]),
  code: z.string().nullable(),
});
export type TargetOutcome = z.infer<typeof targetOutcomeSchema>;

export const EXECUTABLE_OPERATION_STATUSES = [
  "queued",
  "executing",
  "verifying",
  "retry_wait",
  "blocked_auth",
  "uncertain",
] as const;

export const PENDING_EFFECT_STATUSES = [
  "queued",
  "executing",
  "verifying",
  "retry_wait",
  "blocked_auth",
  "uncertain",
  "needs_attention",
] as const;

export function canCancelOperation(status: OperationStatus): boolean {
  return status === "preparing" || status === "queued";
}

/** Undo/throttle delays stay below this; connectivity holds are much longer. */
export const DEFERRED_DISPATCH_MIN_HOLD_MS = 60 * 60 * 1000;
export const OFFLINE_DISPATCH_HOLD_MS = 365 * 24 * 60 * 60 * 1000;

export function isPendingEffectStatus(status: OperationStatus): boolean {
  return (PENDING_EFFECT_STATUSES as readonly string[]).includes(status);
}
