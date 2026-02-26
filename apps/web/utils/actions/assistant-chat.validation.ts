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

export const pendingSendEmailToolOutputSchema = z.object({
  success: z.boolean().optional(),
  actionType: z.literal("send_email"),
  requiresConfirmation: z.literal(true),
  confirmationState: z.enum(["pending", "processing", "confirmed"]),
  confirmationProcessingAt: z.string().optional(),
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
export type PendingSendEmailToolOutput = z.infer<
  typeof pendingSendEmailToolOutputSchema
>;

export const pendingReplyEmailToolOutputSchema = z.object({
  success: z.boolean().optional(),
  actionType: z.literal("reply_email"),
  requiresConfirmation: z.literal(true),
  confirmationState: z.enum(["pending", "processing", "confirmed"]),
  confirmationProcessingAt: z.string().optional(),
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
export type PendingReplyEmailToolOutput = z.infer<
  typeof pendingReplyEmailToolOutputSchema
>;

export const pendingForwardEmailToolOutputSchema = z.object({
  success: z.boolean().optional(),
  actionType: z.literal("forward_email"),
  requiresConfirmation: z.literal(true),
  confirmationState: z.enum(["pending", "processing", "confirmed"]),
  confirmationProcessingAt: z.string().optional(),
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
export type PendingForwardEmailToolOutput = z.infer<
  typeof pendingForwardEmailToolOutputSchema
>;

export type AssistantPendingEmailToolOutput =
  | PendingSendEmailToolOutput
  | PendingReplyEmailToolOutput
  | PendingForwardEmailToolOutput;

export const confirmAssistantEmailActionBody = z.object({
  chatId: z.string().trim().min(1),
  chatMessageId: z.string().trim().min(1),
  toolCallId: z.string().trim().min(1),
  actionType: assistantPendingEmailActionTypeSchema,
});
export type ConfirmAssistantEmailActionBody = z.infer<
  typeof confirmAssistantEmailActionBody
>;
