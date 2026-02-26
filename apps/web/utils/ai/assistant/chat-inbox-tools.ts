import { type InferUITool, tool } from "ai";
import { z } from "zod";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { posthogCaptureEvent } from "@/utils/posthog";
import { createEmailProvider } from "@/utils/email/provider";
import { extractEmailAddress, splitRecipientList } from "@/utils/email";
import { getRuleLabel } from "@/utils/rule/consts";
import { SystemType } from "@/generated/prisma/enums";
import type { ParsedMessage } from "@/utils/types";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import { getFormattedSenderAddress } from "@/utils/email/get-formatted-sender-address";
import { runWithBoundedConcurrency } from "@/utils/async";

const emptyInputSchema = z.object({}).describe("No parameters required");
const recipientListSchema = z
  .string()
  .trim()
  .min(1)
  .refine(
    (recipientList) => hasOnlyValidRecipients(recipientList),
    "must include valid email address(es)",
  );
const toRecipientFieldSchema = recipientListSchema.describe(
  'Recipient email list. Must include valid email addresses (for example "Name <person@domain.com>" or "person@domain.com"). If the user only gives a name, resolve the address first (for example using searchInbox).',
);
const ccRecipientFieldSchema = recipientListSchema
  .optional()
  .describe("Optional CC recipient email list with valid email addresses.");
const bccRecipientFieldSchema = recipientListSchema
  .optional()
  .describe("Optional BCC recipient email list with valid email addresses.");
const sendEmailToolInputSchema = z
  .object({
    to: toRecipientFieldSchema,
    cc: ccRecipientFieldSchema,
    bcc: bccRecipientFieldSchema,
    subject: z.string().trim().min(1).max(300),
    messageHtml: z.string().trim().min(1),
  })
  .strict();
const replyEmailToolInputSchema = z
  .object({
    messageId: z
      .string()
      .trim()
      .min(1)
      .describe(
        "Message ID to reply to. Use a messageId returned by searchInbox.",
      ),
    content: z.string().trim().min(1).max(10_000),
  })
  .strict();
const forwardEmailToolInputSchema = z
  .object({
    messageId: z.string().trim().min(1),
    to: toRecipientFieldSchema,
    cc: ccRecipientFieldSchema,
    bcc: bccRecipientFieldSchema,
    content: z.string().trim().max(5000).optional(),
  })
  .strict();

export const getAccountOverviewTool = ({
  email,
  emailAccountId,
  provider,
  logger,
}: {
  email: string;
  emailAccountId: string;
  provider: string;
  logger: Logger;
}) =>
  tool({
    description:
      "Get account context for inbox operations: provider, labels, meeting briefs settings, and auto-filing attachment settings.",
    inputSchema: emptyInputSchema,
    execute: async () => {
      trackToolCall({ tool: "get_account_overview", email, logger });

      const [emailAccount, labelNames] = await Promise.all([
        prisma.emailAccount.findUnique({
          where: { id: emailAccountId },
          select: {
            email: true,
            timezone: true,
            meetingBriefingsEnabled: true,
            meetingBriefingsMinutesBefore: true,
            meetingBriefsSendEmail: true,
            filingEnabled: true,
            filingPrompt: true,
            filingFolders: {
              select: {
                folderName: true,
                folderPath: true,
              },
              take: 50,
            },
            driveConnections: {
              select: {
                id: true,
              },
              take: 1,
            },
          },
        }),
        listLabelNames({
          emailAccountId,
          provider,
          logger,
        }),
      ]);

      if (!emailAccount) {
        return { error: "Email account not found" };
      }

      return {
        account: {
          email: emailAccount.email,
          provider,
          timezone: emailAccount.timezone,
        },
        meetingBriefs: {
          enabled: emailAccount.meetingBriefingsEnabled,
          minutesBefore: emailAccount.meetingBriefingsMinutesBefore,
          sendEmail: emailAccount.meetingBriefsSendEmail,
        },
        attachmentFiling: {
          enabled: emailAccount.filingEnabled,
          promptConfigured: Boolean(emailAccount.filingPrompt),
          driveConnected: emailAccount.driveConnections.length > 0,
          folders: emailAccount.filingFolders.map((folder) => ({
            name: folder.folderName,
            path: folder.folderPath,
          })),
        },
        labels: {
          count: labelNames.length,
          names: labelNames.slice(0, 200),
        },
      };
    },
  });

export type GetAccountOverviewTool = InferUITool<
  ReturnType<typeof getAccountOverviewTool>
>;

const searchInboxInputSchema = z.object({
  query: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .optional()
    .describe(
      "Inbox search query. Use concise keywords by default. For Google accounts, Gmail syntax like from:, to:, subject:, and in: is supported.",
    ),
  after: z.coerce
    .date()
    .optional()
    .describe("Only include messages after this datetime (ISO format)."),
  before: z.coerce
    .date()
    .optional()
    .describe("Only include messages before this datetime (ISO format)."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(20)
    .describe("Maximum number of messages to return."),
  pageToken: z
    .string()
    .optional()
    .describe("Use the page token returned from a prior search to paginate."),
  inboxOnly: z
    .boolean()
    .default(true)
    .describe("If true, restrict results to inbox messages."),
  unreadOnly: z
    .boolean()
    .default(false)
    .describe("If true, only return unread messages."),
});

export const searchInboxTool = ({
  email,
  emailAccountId,
  provider,
  logger,
}: {
  email: string;
  emailAccountId: string;
  provider: string;
  logger: Logger;
}) =>
  tool({
    description:
      "Search inbox messages and return concise message metadata for triage and summarization.",
    inputSchema: searchInboxInputSchema,
    execute: async ({
      query,
      after,
      before,
      limit,
      pageToken,
      inboxOnly,
      unreadOnly,
    }) => {
      trackToolCall({ tool: "search_inbox", email, logger });

      try {
        const emailProvider = await createEmailProvider({
          emailAccountId,
          provider,
          logger,
        });

        const { messages, nextPageToken } =
          await emailProvider.getMessagesWithPagination({
            query: query?.trim(),
            maxResults: limit,
            pageToken,
            after,
            before,
            inboxOnly,
            unreadOnly,
          });

        let labels: Array<{ id: string; name: string }> = [];
        try {
          labels = await emailProvider.getLabels();
        } catch (error) {
          logger.warn("Failed to load labels for search results", { error });
        }

        const labelsById = createLabelLookupMap(labels);

        const filteredMessages = messages
          .filter((message) =>
            shouldIncludeMessage({
              message,
              inboxOnly,
              unreadOnly,
            }),
          )
          .slice(0, limit);

        const items = filteredMessages.map((message) =>
          mapMessageForSearchResult(message, labelsById),
        );

        return {
          queryUsed: query?.trim() || null,
          totalReturned: items.length,
          nextPageToken,
          summary: summarizeSearchResults(items),
          messages: items,
        };
      } catch (error) {
        logger.error("Failed to search inbox", { error });
        return { error: "Failed to search inbox" };
      }
    },
  });

export type SearchInboxTool = InferUITool<ReturnType<typeof searchInboxTool>>;

const readEmailInputSchema = z.object({
  messageId: z
    .string()
    .trim()
    .min(1)
    .describe(
      "The message ID to read. Use a messageId returned by searchInbox.",
    ),
});

export const readEmailTool = ({
  email,
  emailAccountId,
  provider,
  logger,
}: {
  email: string;
  emailAccountId: string;
  provider: string;
  logger: Logger;
}) =>
  tool({
    description:
      "Read the content of an email by message ID (up to 4000 characters, HTML converted to plain text). Use after searchInbox when you need more than the snippet.",
    inputSchema: readEmailInputSchema,
    execute: async ({ messageId }) => {
      trackToolCall({ tool: "read_email", email, logger });

      try {
        const emailProvider = await createEmailProvider({
          emailAccountId,
          provider,
          logger,
        });

        const message = await emailProvider.getMessage(messageId);
        const emailForLLM = getEmailForLLM(message, { maxLength: 4000 });

        return {
          messageId: message.id,
          threadId: message.threadId,
          from: emailForLLM.from,
          to: emailForLLM.to,
          cc: emailForLLM.cc,
          replyTo: emailForLLM.replyTo,
          subject: emailForLLM.subject,
          content: emailForLLM.content,
          date: emailForLLM.date?.toISOString() ?? message.date,
          attachments: emailForLLM.attachments,
        };
      } catch (error) {
        logger.error("Failed to read email", { error });
        return { error: "Failed to read email" };
      }
    },
  });

export type ReadEmailTool = InferUITool<ReturnType<typeof readEmailTool>>;

const threadIdsSchema = z
  .array(z.string())
  .min(1)
  .max(100)
  .transform((ids) => [...new Set(ids)]);

const senderEmailsSchema = z
  .array(z.string().trim().min(3))
  .min(1)
  .max(100)
  .transform((emails) => [...new Set(emails)]);

const manageInboxInputSchema = z.object({
  action: z
    .enum(["archive_threads", "mark_read_threads", "bulk_archive_senders"])
    .describe("Inbox action to run."),
  threadIds: threadIdsSchema
    .optional()
    .describe(
      "Thread IDs to archive or mark read/unread. Provide IDs from searchInbox results.",
    ),
  labelId: z
    .string()
    .optional()
    .describe(
      "Optional provider label/category ID to apply while archiving threads.",
    ),
  read: z
    .boolean()
    .optional()
    .describe("For mark_read_threads: true for read, false for unread."),
  fromEmails: senderEmailsSchema
    .optional()
    .describe("Sender email addresses to bulk archive by sender."),
});

export const manageInboxTool = ({
  email,
  emailAccountId,
  provider,
  logger,
}: {
  email: string;
  emailAccountId: string;
  provider: string;
  logger: Logger;
}) =>
  tool({
    description:
      "Run inbox actions: archive threads, mark threads read/unread, or bulk archive by sender.",
    inputSchema: manageInboxInputSchema,
    execute: async (input) => {
      trackToolCall({ tool: "manage_inbox", email, logger });

      const parsedInputResult = manageInboxInputSchema.safeParse(input);
      if (!parsedInputResult.success) {
        const errorMessage = getManageInboxValidationError(
          parsedInputResult.error,
        );
        logger.warn("Invalid manageInbox input", {
          issues: parsedInputResult.error.issues,
        });
        return { error: errorMessage };
      }

      const parsedInput = parsedInputResult.data;

      if (
        parsedInput.action === "bulk_archive_senders" &&
        !parsedInput.fromEmails?.length
      ) {
        return {
          error: "fromEmails is required when action is bulk_archive_senders",
        };
      }

      if (
        parsedInput.action !== "bulk_archive_senders" &&
        !parsedInput.threadIds?.length
      ) {
        return {
          error:
            "threadIds is required when action is archive_threads or mark_read_threads",
        };
      }

      try {
        const emailProvider = await createEmailProvider({
          emailAccountId,
          provider,
          logger,
        });

        if (parsedInput.action === "bulk_archive_senders") {
          const fromEmails = parsedInput.fromEmails;
          if (!fromEmails) {
            return {
              error:
                "fromEmails is required when action is bulk_archive_senders",
            };
          }

          await emailProvider.bulkArchiveFromSenders(
            fromEmails,
            email,
            emailAccountId,
          );

          return {
            success: true,
            action: parsedInput.action,
            sendersCount: fromEmails.length,
            senders: fromEmails,
          };
        }

        const threadIds = parsedInput.threadIds;
        if (!threadIds) {
          return {
            error:
              "threadIds is required when action is archive_threads or mark_read_threads",
          };
        }

        const threadActionResults = await runThreadActionsInParallel({
          threadIds,
          runAction: async (threadId) => {
            if (parsedInput.action === "archive_threads") {
              await emailProvider.archiveThreadWithLabel(
                threadId,
                email,
                parsedInput.labelId,
              );
            } else {
              await emailProvider.markReadThread(
                threadId,
                parsedInput.read ?? true,
              );
            }
          },
        });

        const failedThreadIds = threadActionResults
          .filter((result) => !result.success)
          .map((result) => result.threadId);
        const successCount =
          threadActionResults.length - failedThreadIds.length;

        return {
          success: failedThreadIds.length === 0,
          action: parsedInput.action,
          requestedCount: threadIds.length,
          successCount,
          failedCount: failedThreadIds.length,
          failedThreadIds,
        };
      } catch (error) {
        logger.error("Failed to run inbox action", { error });
        return { error: "Failed to update emails" };
      }
    },
  });

export type ManageInboxTool = InferUITool<ReturnType<typeof manageInboxTool>>;

const updateInboxFeaturesInputSchema = z
  .object({
    meetingBriefsEnabled: z
      .boolean()
      .optional()
      .describe("Enable or disable meeting briefs."),
    meetingBriefsMinutesBefore: z
      .number()
      .int()
      .min(1)
      .max(2880)
      .optional()
      .describe(
        "Minutes before a meeting to send a brief (1-2880). Applies when meeting briefs are enabled.",
      ),
    meetingBriefsSendEmail: z
      .boolean()
      .optional()
      .describe("Enable or disable email delivery for meeting briefs."),
    filingEnabled: z
      .boolean()
      .optional()
      .describe("Enable or disable auto-file attachments."),
    filingPrompt: z
      .string()
      .max(6000)
      .optional()
      .nullable()
      .describe(
        "Custom filing instructions. Set null to clear existing instructions.",
      ),
  })
  .refine(
    (value) =>
      value.meetingBriefsEnabled !== undefined ||
      value.meetingBriefsMinutesBefore !== undefined ||
      value.meetingBriefsSendEmail !== undefined ||
      value.filingEnabled !== undefined ||
      value.filingPrompt !== undefined,
    { message: "At least one field must be provided." },
  );

export const updateInboxFeaturesTool = ({
  email,
  emailAccountId,
  logger,
}: {
  email: string;
  emailAccountId: string;
  logger: Logger;
}) =>
  tool({
    description:
      "Update account-level inbox features, including meeting briefs and auto-file attachments.",
    inputSchema: updateInboxFeaturesInputSchema,
    execute: async ({
      meetingBriefsEnabled,
      meetingBriefsMinutesBefore,
      meetingBriefsSendEmail,
      filingEnabled,
      filingPrompt,
    }) => {
      trackToolCall({ tool: "update_inbox_features", email, logger });

      const existing = await prisma.emailAccount.findUnique({
        where: { id: emailAccountId },
        select: {
          meetingBriefingsEnabled: true,
          meetingBriefingsMinutesBefore: true,
          meetingBriefsSendEmail: true,
          filingEnabled: true,
          filingPrompt: true,
        },
      });

      if (!existing) return { error: "Email account not found" };

      await prisma.emailAccount.update({
        where: { id: emailAccountId },
        data: {
          ...(meetingBriefsEnabled !== undefined && {
            meetingBriefingsEnabled: meetingBriefsEnabled,
          }),
          ...(meetingBriefsMinutesBefore !== undefined && {
            meetingBriefingsMinutesBefore: meetingBriefsMinutesBefore,
          }),
          ...(meetingBriefsSendEmail !== undefined && {
            meetingBriefsSendEmail,
          }),
          ...(filingEnabled !== undefined && {
            filingEnabled,
          }),
          ...(filingPrompt !== undefined && {
            filingPrompt,
          }),
        },
      });

      return {
        success: true,
        previous: {
          meetingBriefsEnabled: existing.meetingBriefingsEnabled,
          meetingBriefsMinutesBefore: existing.meetingBriefingsMinutesBefore,
          meetingBriefsSendEmail: existing.meetingBriefsSendEmail,
          filingEnabled: existing.filingEnabled,
          filingPrompt: existing.filingPrompt,
        },
        updated: {
          meetingBriefsEnabled:
            meetingBriefsEnabled ?? existing.meetingBriefingsEnabled,
          meetingBriefsMinutesBefore:
            meetingBriefsMinutesBefore ??
            existing.meetingBriefingsMinutesBefore,
          meetingBriefsSendEmail:
            meetingBriefsSendEmail ?? existing.meetingBriefsSendEmail,
          filingEnabled: filingEnabled ?? existing.filingEnabled,
          filingPrompt:
            filingPrompt !== undefined ? filingPrompt : existing.filingPrompt,
        },
      };
    },
  });

export type UpdateInboxFeaturesTool = InferUITool<
  ReturnType<typeof updateInboxFeaturesTool>
>;

export const sendEmailTool = ({
  email,
  emailAccountId,
  provider,
  logger,
}: {
  email: string;
  emailAccountId: string;
  provider: string;
  logger: Logger;
}) =>
  tool({
    description:
      "Prepare a new email to send. This does NOT send immediately. It returns a confirmation payload that must be approved by the user in the UI.",
    inputSchema: sendEmailToolInputSchema,
    execute: async (input) => {
      trackToolCall({ tool: "send_email", email, logger });

      const parsedInput = sendEmailToolInputSchema.safeParse(input);
      if (!parsedInput.success) {
        return { error: getSendEmailValidationError(parsedInput.error) };
      }

      try {
        const from =
          (await getFormattedSenderAddress({
            emailAccountId,
            fallbackEmail: email,
          })) || email;
        return createPendingSendEmailOutput(
          parsedInput.data,
          from || null,
          provider,
        );
      } catch (error) {
        logger.error("Failed to prepare email from chat", { error });
        return { error: "Failed to prepare email" };
      }
    },
  });

export type SendEmailTool = InferUITool<ReturnType<typeof sendEmailTool>>;

export const replyEmailTool = ({
  email,
  emailAccountId,
  provider,
  logger,
}: {
  email: string;
  emailAccountId: string;
  provider: string;
  logger: Logger;
}) =>
  tool({
    description:
      "Prepare a reply to an existing email by message ID. This does NOT send immediately. It returns a confirmation payload that must be approved by the user in the UI.",
    inputSchema: replyEmailToolInputSchema,
    execute: async (input) => {
      trackToolCall({ tool: "reply_email", email, logger });

      const parsedInput = replyEmailToolInputSchema.safeParse(input);
      if (!parsedInput.success) {
        return { error: getReplyEmailValidationError(parsedInput.error) };
      }

      try {
        const emailProvider = await createEmailProvider({
          emailAccountId,
          provider,
          logger,
        });
        const message = await emailProvider.getMessage(
          parsedInput.data.messageId,
        );

        return createPendingReplyEmailOutput(parsedInput.data, message);
      } catch (error) {
        logger.error("Failed to prepare reply from chat", { error });
        return { error: "Failed to prepare reply" };
      }
    },
  });

export type ReplyEmailTool = InferUITool<ReturnType<typeof replyEmailTool>>;

export const forwardEmailTool = ({
  email,
  emailAccountId,
  provider,
  logger,
}: {
  email: string;
  emailAccountId: string;
  provider: string;
  logger: Logger;
}) =>
  tool({
    description:
      "Prepare a forward for an existing email by message ID. This does NOT send immediately. It returns a confirmation payload that must be approved by the user in the UI.",
    inputSchema: forwardEmailToolInputSchema,
    execute: async (input) => {
      trackToolCall({ tool: "forward_email", email, logger });

      const parsedInput = forwardEmailToolInputSchema.safeParse(input);
      if (!parsedInput.success) {
        return { error: getForwardEmailValidationError(parsedInput.error) };
      }

      try {
        const emailProvider = await createEmailProvider({
          emailAccountId,
          provider,
          logger,
        });
        const message = await emailProvider.getMessage(
          parsedInput.data.messageId,
        );
        return createPendingForwardEmailOutput(parsedInput.data, message);
      } catch (error) {
        logger.error("Failed to prepare email forward from chat", { error });
        return { error: "Failed to prepare email forward" };
      }
    },
  });

export type ForwardEmailTool = InferUITool<ReturnType<typeof forwardEmailTool>>;

async function trackToolCall({
  tool,
  email,
  logger,
}: {
  tool: string;
  email: string;
  logger: Logger;
}) {
  logger.info("Tracking tool call", { tool, email });
  return posthogCaptureEvent(email, "AI Assistant Chat Tool Call", { tool });
}

async function listLabelNames({
  emailAccountId,
  provider,
  logger,
}: {
  emailAccountId: string;
  provider: string;
  logger: Logger;
}) {
  try {
    const emailProvider = await createEmailProvider({
      emailAccountId,
      provider,
      logger,
    });
    const labels = await emailProvider.getLabels();
    return labels.map((label) => label.name).filter(Boolean);
  } catch (error) {
    logger.warn("Failed to load label names", { error });
    return [];
  }
}

type PendingEmailActionType = "send_email" | "reply_email" | "forward_email";

function createPendingSendEmailOutput(
  input: z.infer<typeof sendEmailToolInputSchema>,
  from: string | null,
  provider: string,
) {
  return {
    success: true,
    actionType: "send_email" as PendingEmailActionType,
    requiresConfirmation: true,
    confirmationState: "pending" as const,
    provider,
    pendingAction: {
      to: input.to,
      cc: input.cc || null,
      bcc: input.bcc || null,
      subject: input.subject,
      messageHtml: input.messageHtml,
      from,
    },
  };
}

function createPendingReplyEmailOutput(
  input: z.infer<typeof replyEmailToolInputSchema>,
  message: ParsedMessage,
) {
  return {
    success: true,
    actionType: "reply_email" as PendingEmailActionType,
    requiresConfirmation: true,
    confirmationState: "pending" as const,
    pendingAction: {
      messageId: input.messageId,
      content: input.content,
    },
    reference: {
      messageId: message.id,
      threadId: message.threadId,
      from: message.headers.from,
      subject: message.subject || message.headers.subject,
    },
  };
}

function createPendingForwardEmailOutput(
  input: z.infer<typeof forwardEmailToolInputSchema>,
  message: ParsedMessage,
) {
  return {
    success: true,
    actionType: "forward_email" as PendingEmailActionType,
    requiresConfirmation: true,
    confirmationState: "pending" as const,
    pendingAction: {
      messageId: input.messageId,
      to: input.to,
      cc: input.cc || null,
      bcc: input.bcc || null,
      content: input.content || null,
    },
    reference: {
      messageId: message.id,
      threadId: message.threadId,
      from: message.headers.from,
      subject: message.subject || message.headers.subject,
    },
  };
}

function shouldIncludeMessage({
  message,
  inboxOnly,
  unreadOnly,
}: {
  message: ParsedMessage;
  inboxOnly: boolean;
  unreadOnly: boolean;
}) {
  if (!message.labelIds?.length) return !unreadOnly;

  const labelIds =
    message.labelIds?.map((labelId) => labelId.toLowerCase()) || [];
  const isInInbox = labelIds.includes("inbox");
  const isUnread = labelIds.includes("unread");

  if (inboxOnly && !isInInbox) return false;
  if (unreadOnly && !isUnread) return false;

  return true;
}

function mapMessageForSearchResult(
  message: ParsedMessage,
  labelsById: Map<string, string>,
) {
  const labelIds = message.labelIds || [];
  const labelNames = labelIds.map(
    (labelId) => labelsById.get(labelId.toLowerCase()) || labelId,
  );
  const category = inferConversationCategory(labelNames);
  const isUnread = labelIds.some(
    (labelId) => labelId.toLowerCase() === "unread",
  );

  return {
    messageId: message.id,
    threadId: message.threadId,
    subject: message.subject,
    from: message.headers.from,
    to: message.headers.to,
    snippet: message.snippet,
    date: message.date,
    labelNames,
    category,
    isUnread,
    hasAttachments: Boolean(message.attachments?.length),
  };
}

type ConversationCategory =
  | "to_reply"
  | "awaiting_reply"
  | "fyi"
  | "actioned"
  | "uncategorized";

function inferConversationCategory(labelNames: string[]): ConversationCategory {
  const normalized = new Set(
    labelNames.map((labelName) => labelName.trim().toLowerCase()),
  );

  if (normalized.has(getRuleLabel(SystemType.TO_REPLY).toLowerCase()))
    return "to_reply";
  if (normalized.has(getRuleLabel(SystemType.AWAITING_REPLY).toLowerCase()))
    return "awaiting_reply";
  if (normalized.has(getRuleLabel(SystemType.FYI).toLowerCase())) return "fyi";
  if (normalized.has(getRuleLabel(SystemType.ACTIONED).toLowerCase()))
    return "actioned";
  return "uncategorized";
}

function summarizeSearchResults(
  items: Array<{
    category: ConversationCategory;
    isUnread: boolean;
  }>,
) {
  return items.reduce(
    (acc, item) => {
      acc.total += 1;
      if (item.isUnread) acc.unread += 1;
      acc.byCategory[item.category] += 1;
      return acc;
    },
    {
      total: 0,
      unread: 0,
      byCategory: {
        to_reply: 0,
        awaiting_reply: 0,
        fyi: 0,
        actioned: 0,
        uncategorized: 0,
      },
    },
  );
}

function createLabelLookupMap(labels: Array<{ id: string; name: string }>) {
  const labelsById = new Map(
    labels.map((label) => [label.id.toLowerCase(), label.name]),
  );

  if (labelsById.size > 0) return labelsById;

  const toReplyLabel = getRuleLabel(SystemType.TO_REPLY);
  const awaitingReplyLabel = getRuleLabel(SystemType.AWAITING_REPLY);
  const fyiLabel = getRuleLabel(SystemType.FYI);
  const actionedLabel = getRuleLabel(SystemType.ACTIONED);

  return new Map([
    [toReplyLabel.toLowerCase(), toReplyLabel],
    [awaitingReplyLabel.toLowerCase(), awaitingReplyLabel],
    [fyiLabel.toLowerCase(), fyiLabel],
    [actionedLabel.toLowerCase(), actionedLabel],
    ["to_reply", toReplyLabel],
    ["awaiting_reply", awaitingReplyLabel],
    ["fyi", fyiLabel],
    ["actioned", actionedLabel],
    ["inbox", "Inbox"],
    ["unread", "Unread"],
  ] as const);
}

async function runThreadActionsInParallel({
  threadIds,
  runAction,
}: {
  threadIds: string[];
  runAction: (threadId: string) => Promise<void>;
}) {
  const BATCH_SIZE = 10;
  const results = await runWithBoundedConcurrency({
    items: threadIds,
    concurrency: BATCH_SIZE,
    run: async (threadId) => {
      await runAction(threadId);
    },
  });

  return results.map(({ item: threadId, result }) => ({
    threadId,
    success: result.status === "fulfilled",
  }));
}

function getManageInboxValidationError(error: z.ZodError) {
  const firstIssue = error.issues[0];
  if (!firstIssue) return "Invalid manageInbox input";

  if (firstIssue.code === "too_small" && firstIssue.path[0] === "threadIds") {
    return "Invalid manageInbox input: threadIds must include at least one thread ID";
  }

  if (firstIssue.code === "too_small" && firstIssue.path[0] === "fromEmails") {
    return "Invalid manageInbox input: fromEmails must include at least one sender email";
  }

  const field = firstIssue.path.map(String).join(".");
  if (!field) return `Invalid manageInbox input: ${firstIssue.message}`;

  return `Invalid manageInbox input: ${field} ${firstIssue.message}`;
}

function getSendEmailValidationError(error: z.ZodError) {
  return getValidationErrorMessage("sendEmail", error);
}

function getForwardEmailValidationError(error: z.ZodError) {
  return getValidationErrorMessage("forwardEmail", error);
}

function getReplyEmailValidationError(error: z.ZodError) {
  return getValidationErrorMessage("replyEmail", error);
}

function hasOnlyValidRecipients(recipientList: string) {
  const recipients = splitRecipientList(recipientList);
  if (recipients.length === 0) return false;

  return recipients.every((recipient) =>
    Boolean(extractEmailAddress(recipient)),
  );
}

function getValidationErrorMessage(toolName: string, error: z.ZodError) {
  const firstIssue = error.issues[0];
  if (!firstIssue) return `Invalid ${toolName} input`;

  if (firstIssue.code === "unrecognized_keys") {
    const firstKey = firstIssue.keys[0];
    if (firstKey) {
      return `Invalid ${toolName} input: unsupported field "${firstKey}"`;
    }
    return `Invalid ${toolName} input: unsupported fields`;
  }

  const field = firstIssue.path.map(String).join(".");
  if (!field) return `Invalid ${toolName} input: ${firstIssue.message}`;

  return `Invalid ${toolName} input: ${field} ${firstIssue.message}`;
}
