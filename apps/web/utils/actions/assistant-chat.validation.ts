import { z } from "zod";
import {
  mailViewContextSchema,
  messageContextSchema,
} from "@/utils/ai/assistant/chat-context-validation";
import { inlineEmailActionSchema } from "@/utils/ai/assistant/inline-email-actions";
import {
  bulkInboxActionSearchSchema,
  bulkInboxActionTypes,
} from "@/utils/bulk-inbox-action/validation";

export const ASSISTANT_CHAT_MAX_TEXT_LENGTH = 20_000;
// How long a confirmation may stay "processing" before it counts as abandoned.
export const ASSISTANT_CONFIRMATION_PROCESSING_LEASE_MS = 5 * 60 * 1000;
export const ASSISTANT_CHAT_MAX_TEXT_LENGTH_MESSAGE =
  "Messages can be up to 20,000 characters.";

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
  externalUrl: z.string().nullish(),
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
  emailAccountId: z.string().min(1).optional(),
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
  emailAccountId: z.string().min(1).optional(),
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
  emailAccountId: z.string().min(1).optional(),
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
  chatMessageId: z.string().trim().min(1).optional(),
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

export const pendingSaveMemoryToolOutputSchema = z.object({
  success: z.literal(true),
  actionType: z.literal("save_memory"),
  requiresConfirmation: z.literal(true),
  confirmationState: z.enum(["pending", "processing", "confirmed"]),
  confirmationProcessingAt: z.string().optional(),
  content: z.string().trim().min(1),
  reason: z.string().trim().min(1).optional(),
  confirmationResult: z
    .object({
      content: z.string().trim().min(1),
      confirmedAt: z.string().min(1),
      deduplicated: z.boolean().optional(),
    })
    .optional(),
});
export type PendingSaveMemoryToolOutput = z.infer<
  typeof pendingSaveMemoryToolOutputSchema
>;

export const confirmAssistantSaveMemoryBody = confirmAssistantActionBaseBody;
export type ConfirmAssistantSaveMemoryBody = z.infer<
  typeof confirmAssistantSaveMemoryBody
>;

export const pendingBulkInboxActionToolOutputSchema = z.object({
  success: z.literal(true),
  actionType: z.literal("bulk_inbox_action"),
  requiresConfirmation: z.literal(true),
  confirmationState: z.enum([
    "pending",
    "processing",
    "confirmed",
    "cancelled",
  ]),
  confirmationProcessingAt: z.string().optional(),
  pendingAction: z.object({
    search: bulkInboxActionSearchSchema,
    action: z.enum(bulkInboxActionTypes),
    labelId: z.string().nullable(),
    labelName: z.string().nullable(),
    instruction: z.string().nullable(),
  }),
  estimate: z
    .object({
      threadCount: z.number(),
      isApproximate: z.boolean(),
      isLowerBound: z.boolean().optional(),
      searchThreadCount: z.number(),
    })
    .optional(),
  matchSummary: z.string().nullish(),
  samples: z
    .array(
      z.object({ from: z.string(), subject: z.string(), date: z.string() }),
    )
    .optional(),
  confirmationResult: z
    .object({
      jobId: z.string().min(1),
      confirmedAt: z.string().min(1),
    })
    .optional(),
});

export type PendingBulkInboxActionToolOutput = z.infer<
  typeof pendingBulkInboxActionToolOutputSchema
>;

export const confirmAssistantBulkInboxActionBody =
  confirmAssistantActionBaseBody;

export const dismissAssistantBulkInboxActionBody =
  confirmAssistantActionBaseBody;

export const pendingTrashThreadsToolOutputSchema = z.object({
  success: z.literal(true),
  actionType: z.literal("trash_threads"),
  requiresConfirmation: z.literal(true),
  confirmationState: z.enum(["pending", "processing", "confirmed"]),
  confirmationProcessingAt: z.string().optional(),
  pendingAction: z.object({
    threadIds: z.array(z.string().min(1)).min(1),
  }),
  confirmationResult: z
    .object({
      successCount: z.number(),
      failedThreadIds: z.array(z.string()),
      confirmedAt: z.string().min(1),
    })
    .optional(),
});
export type PendingTrashThreadsToolOutput = z.infer<
  typeof pendingTrashThreadsToolOutputSchema
>;

export const confirmAssistantTrashThreadsBody = confirmAssistantActionBaseBody;

export const cancelBulkInboxActionJobBody = z.object({
  jobId: z.string().min(1),
});

const assistantChatTextPartSchema = z.object({
  type: z.literal("text"),
  text: z.string().min(1).max(ASSISTANT_CHAT_MAX_TEXT_LENGTH),
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
  // Sent with every message from the mail screen; the server records it only
  // when it changes.
  mailView: mailViewContextSchema.optional(),
  inlineActions: z.array(inlineEmailActionSchema).max(20).optional(),
  // Clients that can't render the assistant's inline email card markup would
  // show it as raw XML, so cards are opt-in per client.
  supportsInlineEmailCards: z.boolean().optional().default(false),
});

export type AssistantInput = z.infer<typeof assistantInputSchema>;

export const stopAssistantChatSchema = z.object({
  activeStreamId: z.string().trim().min(1).optional(),
});
