import { z } from "zod";

export const assistantPendingEmailActionTypeSchema = z.enum([
  "send_email",
  "reply_email",
  "forward_email",
]);
export type AssistantPendingEmailActionType = z.infer<
  typeof assistantPendingEmailActionTypeSchema
>;

const confirmationResultSchema = z.object({
  actionType: assistantPendingEmailActionTypeSchema,
  messageId: z.string().nullish(),
  threadId: z.string().nullish(),
  to: z.string().nullish(),
  subject: z.string().nullish(),
  confirmedAt: z.string().min(1),
});
export type AssistantEmailConfirmationResult = z.infer<
  typeof confirmationResultSchema
>;

const pendingSendEmailToolOutputSchema = z.object({
  success: z.boolean().optional(),
  actionType: z.literal("send_email"),
  requiresConfirmation: z.literal(true),
  confirmationState: z.enum(["pending", "confirmed"]),
  provider: z.string().optional(),
  pendingAction: z.object({
    to: z.string().trim().min(1),
    cc: z.string().nullish(),
    bcc: z.string().nullish(),
    subject: z.string().trim().min(1),
    messageHtml: z.string().trim().min(1),
    from: z.string().nullish(),
  }),
  confirmationResult: confirmationResultSchema.optional(),
});

const pendingReplyEmailToolOutputSchema = z.object({
  success: z.boolean().optional(),
  actionType: z.literal("reply_email"),
  requiresConfirmation: z.literal(true),
  confirmationState: z.enum(["pending", "confirmed"]),
  pendingAction: z.object({
    messageId: z.string().trim().min(1),
    content: z.string().trim().min(1),
  }),
  reference: z
    .object({
      messageId: z.string().trim().min(1),
      threadId: z.string().trim().min(1),
      from: z.string().nullish(),
      subject: z.string().nullish(),
    })
    .optional(),
  confirmationResult: confirmationResultSchema.optional(),
});

const pendingForwardEmailToolOutputSchema = z.object({
  success: z.boolean().optional(),
  actionType: z.literal("forward_email"),
  requiresConfirmation: z.literal(true),
  confirmationState: z.enum(["pending", "confirmed"]),
  pendingAction: z.object({
    messageId: z.string().trim().min(1),
    to: z.string().trim().min(1),
    cc: z.string().nullish(),
    bcc: z.string().nullish(),
    content: z.string().nullish(),
  }),
  reference: z
    .object({
      messageId: z.string().trim().min(1),
      threadId: z.string().trim().min(1),
      from: z.string().nullish(),
      subject: z.string().nullish(),
    })
    .optional(),
  confirmationResult: confirmationResultSchema.optional(),
});

export const assistantPendingEmailToolOutputSchema = z.discriminatedUnion(
  "actionType",
  [
    pendingSendEmailToolOutputSchema,
    pendingReplyEmailToolOutputSchema,
    pendingForwardEmailToolOutputSchema,
  ],
);
export type AssistantPendingEmailToolOutput = z.infer<
  typeof assistantPendingEmailToolOutputSchema
>;

export const confirmAssistantEmailActionBody = z.object({
  chatMessageId: z.string().trim().min(1),
  toolCallId: z.string().trim().min(1),
  actionType: assistantPendingEmailActionTypeSchema,
});
export type ConfirmAssistantEmailActionBody = z.infer<
  typeof confirmAssistantEmailActionBody
>;
