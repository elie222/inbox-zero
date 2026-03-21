import { z } from "zod";
import { messageContextSchema } from "@/app/api/chat/validation";
import { inlineEmailActionSchema } from "@/utils/ai/assistant/inline-email-actions";

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

const confirmAssistantActionBaseBody = z.object({
  chatId: z.string().trim().min(1),
  chatMessageId: z.string().trim().min(1),
  toolCallId: z.string().trim().min(1),
});

export const confirmAssistantEmailActionBody =
  confirmAssistantActionBaseBody.extend({
    actionType: assistantPendingEmailActionTypeSchema,
    contentOverride: z.string().trim().min(1).optional(),
  });
export type ConfirmAssistantEmailActionBody = z.infer<
  typeof confirmAssistantEmailActionBody
>;

export const pendingCreateRuleToolOutputSchema = z.object({
  success: z.literal(true),
  actionType: z.literal("create_rule"),
  requiresConfirmation: z.literal(true),
  confirmationState: z.enum(["pending", "processing", "confirmed"]),
  confirmationProcessingAt: z.string().optional(),
  riskMessages: z.array(z.string()),
  ruleId: z.string().trim().min(1).optional(),
  confirmationResult: z
    .object({
      ruleId: z.string().trim().min(1),
      confirmedAt: z.string().min(1),
    })
    .optional(),
});
export type PendingCreateRuleToolOutput = z.infer<
  typeof pendingCreateRuleToolOutputSchema
>;

export const confirmAssistantCreateRuleBody = confirmAssistantActionBaseBody;
export type ConfirmAssistantCreateRuleBody = z.infer<
  typeof confirmAssistantCreateRuleBody
>;

const assistantChatTextPartSchema = z.object({
  type: z.literal("text"),
  text: z.string().min(1).max(3000),
});

const assistantChatFilePartSchema = z.object({
  type: z.literal("file"),
  url: z
    .string()
    .max(6_000_000)
    .refine((url) => /^data:image\/(jpeg|png|webp|gif);base64,/.test(url), {
      message: "URL must be a base64 data URL with an allowed image MIME type",
    }),
  filename: z.string().optional(),
  mediaType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
});

const assistantChatMessagePartSchema = z.discriminatedUnion("type", [
  assistantChatTextPartSchema,
  assistantChatFilePartSchema,
]);

export const assistantInputSchema = z.object({
  id: z.string().trim().min(1),
  message: z.object({
    id: z.string().trim().min(1),
    role: z.enum(["user"]),
    parts: z
      .array(assistantChatMessagePartSchema)
      .refine((parts) => parts.filter((p) => p.type === "file").length <= 5, {
        message: "Maximum 5 file attachments per message",
      }),
  }),
  context: messageContextSchema.optional(),
  inlineActions: z.array(inlineEmailActionSchema).max(20).optional(),
});

export type AssistantInput = z.infer<typeof assistantInputSchema>;
