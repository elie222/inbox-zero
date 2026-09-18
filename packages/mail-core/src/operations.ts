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

export function isPendingEffectStatus(status: OperationStatus): boolean {
  return (PENDING_EFFECT_STATUSES as readonly string[]).includes(status);
}
