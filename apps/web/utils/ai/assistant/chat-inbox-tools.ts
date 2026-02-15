import { type InferUITool, tool } from "ai";
import { z } from "zod";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { posthogCaptureEvent } from "@/utils/posthog";
import { createEmailProvider } from "@/utils/email/provider";
import { sendEmailBody } from "@/utils/gmail/mail";
import { getRuleLabel } from "@/utils/rule/consts";
import { SystemType } from "@/generated/prisma/enums";
import type { ParsedMessage } from "@/utils/types";
import { getEmailForLLM } from "@/utils/get-email-from-message";

const emptyInputSchema = z.object({}).describe("No parameters required");

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

const manageInboxInputSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("archive_threads"),
    threadIds: threadIdsSchema.describe(
      "Thread IDs to archive. Provide IDs from searchInbox results.",
    ),
    labelId: z
      .string()
      .optional()
      .describe(
        "Optional provider label/category ID to apply while archiving.",
      ),
  }),
  z.object({
    action: z.literal("mark_read_threads"),
    threadIds: threadIdsSchema.describe(
      "Thread IDs to mark read or unread. Provide IDs from searchInbox results.",
    ),
    read: z
      .boolean()
      .default(true)
      .describe("True to mark as read; false to mark as unread."),
  }),
  z.object({
    action: z.literal("bulk_archive_senders"),
    fromEmails: senderEmailsSchema.describe(
      "Sender email addresses to bulk archive by sender.",
    ),
  }),
]);

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

      try {
        const emailProvider = await createEmailProvider({
          emailAccountId,
          provider,
          logger,
        });

        if (input.action === "bulk_archive_senders") {
          await emailProvider.bulkArchiveFromSenders(
            input.fromEmails,
            email,
            emailAccountId,
          );

          return {
            success: true,
            action: input.action,
            sendersCount: input.fromEmails.length,
            senders: input.fromEmails,
          };
        }

        const threadActionResults = await runThreadActionsInParallel({
          threadIds: input.threadIds,
          runAction: async (threadId) => {
            if (input.action === "archive_threads") {
              await emailProvider.archiveThreadWithLabel(
                threadId,
                email,
                input.labelId,
              );
            } else {
              await emailProvider.markReadThread(threadId, input.read);
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
          action: input.action,
          requestedCount: input.threadIds.length,
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
      "Send an email immediately from the connected mailbox. Use only when the user clearly asks to send now.",
    inputSchema: sendEmailBody,
    execute: async (input) => {
      trackToolCall({ tool: "send_email", email, logger });

      try {
        const emailProvider = await createEmailProvider({
          emailAccountId,
          provider,
          logger,
        });
        const result = await emailProvider.sendEmailWithHtml(input);
        return {
          success: true,
          messageId: result.messageId,
          threadId: result.threadId,
          to: input.to,
          subject: input.subject,
        };
      } catch (error) {
        logger.error("Failed to send email from chat", { error });
        return { error: "Failed to send email" };
      }
    },
  });

export type SendEmailTool = InferUITool<ReturnType<typeof sendEmailTool>>;

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
  const results: Array<{ threadId: string; success: boolean }> = [];

  for (let i = 0; i < threadIds.length; i += BATCH_SIZE) {
    const batch = threadIds.slice(i, i + BATCH_SIZE);

    const batchResults = await Promise.allSettled(
      batch.map(async (threadId) => {
        await runAction(threadId);
        return threadId;
      }),
    );

    for (const [index, result] of batchResults.entries()) {
      results.push({
        threadId: batch[index],
        success: result.status === "fulfilled",
      });
    }
  }

  return results;
}
