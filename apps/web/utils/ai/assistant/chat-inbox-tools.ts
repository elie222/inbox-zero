import { type InferUITool, tool } from "ai";
import { z } from "zod";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { posthogCaptureEvent } from "@/utils/posthog";
import { createEmailProvider } from "@/utils/email/provider";
import {
  extractEmailAddress,
  extractUniqueEmailAddresses,
  splitRecipientList,
} from "@/utils/email";
import { getRuleLabel } from "@/utils/rule/consts";
import { SystemType } from "@/generated/prisma/enums";
import type { EmailProvider } from "@/utils/email/types";
import type { ParsedMessage } from "@/utils/types";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import { getFormattedSenderAddress } from "@/utils/email/get-formatted-sender-address";
import { runWithBoundedConcurrency } from "@/utils/async";
import { resolveLabelNameAndId } from "@/utils/label/resolve-label";
import {
  buildOutlookSearchFallbackQuery,
  getOutlookComparisonFilters,
  getStandaloneOutlookStateTerms,
  sanitizeKqlTextQuery,
  stripStandaloneOutlookStateTerms,
  stripOutlookComparisonFilters,
} from "@/utils/outlook/message";
import { findUnsubscribeLink } from "@/utils/parse/parseHtml.server";
import { sleep } from "@/utils/sleep";
import { archiveCategory } from "@/utils/categorize/senders/archive-category";
import { getCategoryOverview } from "@/utils/categorize/senders/get-category-overview";
import { startBulkCategorization } from "@/utils/categorize/senders/start-bulk-categorization";
import {
  manageInboxActions,
  requiresSenderEmails,
  requiresThreadIds,
} from "@/utils/ai/assistant/manage-inbox-actions";
import { hideToolErrorFromUser } from "@/utils/ai/assistant/tool-error-visibility";
import {
  type AutomaticUnsubscribeResult,
  unsubscribeSenderAndMark,
} from "@/utils/senders/unsubscribe";
import { isMicrosoftProvider } from "@/utils/email/provider-types";
import {
  getCategorizationProgress,
  getCategorizationStatusSnapshot,
} from "@/utils/redis/categorization-progress";
import { extractErrorInfo, isRetryableError } from "@/utils/outlook/retry";
import { microsoftGraphPageTokenSchema } from "@/utils/outlook/page-token";

const SEARCH_INBOX_MAX_RESULTS = 20;
const MAX_SENDER_CATEGORIZATION_WAIT_MS = 1500;

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
  .nullish()
  .describe(
    "CC recipients. Only include if the user explicitly asks to CC someone. Do not add CC on your own.",
  );
const bccRecipientFieldSchema = recipientListSchema
  .nullish()
  .describe(
    "BCC recipients. Only include if the user explicitly asks to BCC someone. Do not add BCC on your own.",
  );
const recipientFieldsSchema = {
  to: toRecipientFieldSchema,
  cc: ccRecipientFieldSchema,
  bcc: bccRecipientFieldSchema,
};
const sendEmailToolInputSchema = z
  .object({
    ...recipientFieldsSchema,
    subject: z.string().trim().min(1).max(300).describe("Email subject line."),
    messageHtml: z
      .string()
      .trim()
      .min(1)
      .describe("HTML body content for the email draft."),
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
    content: z
      .string()
      .trim()
      .min(1)
      .max(10_000)
      .describe("Reply body content to include in the draft."),
  })
  .strict();
const forwardEmailToolInputSchema = z
  .object({
    messageId: z
      .string()
      .trim()
      .min(1)
      .describe(
        "Message ID to forward. Use a messageId returned by searchInbox.",
      ),
    ...recipientFieldsSchema,
    content: z
      .string()
      .trim()
      .max(5000)
      .nullish()
      .describe("Optional note to add above the forwarded message."),
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
      "Get account context for inbox operations such as provider details, label availability, meeting-brief settings, and attachment-filing settings.",
    inputSchema: z.object({}),
    execute: async () => {
      trackToolCall({ tool: "get_account_overview", email, logger });
      try {
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
      } catch (error) {
        logger.error("Failed to load account overview", { error });
        return {
          error: "Failed to load account overview",
        };
      }
    },
  });

export type GetAccountOverviewTool = InferUITool<
  ReturnType<typeof getAccountOverviewTool>
>;

const getSenderCategorizationStatusInputSchema = z.object({
  waitMs: z
    .number()
    .int()
    .min(0)
    .max(MAX_SENDER_CATEGORIZATION_WAIT_MS)
    .default(0)
    .describe(
      "Optional server-side wait before reading progress. Use for short bounded polling only.",
    ),
});

const manageSenderCategoryInputSchema = z
  .object({
    action: z
      .literal("archive_category")
      .describe("Category cleanup action. Only archive_category is supported."),
    categoryId: z
      .string()
      .trim()
      .min(1)
      .nullish()
      .describe(
        "Exact category ID from getSenderCategoryOverview. Prefer this when available.",
      ),
    categoryName: z
      .string()
      .trim()
      .min(1)
      .nullish()
      .describe(
        'Exact category name from getSenderCategoryOverview. Supports the special name "Uncategorized".',
      ),
  })
  .refine((value) => Boolean(value.categoryId || value.categoryName), {
    message: "categoryId or categoryName is required",
  });

export const getSenderCategoryOverviewTool = ({
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
      "Inspect sender categories for the current account. Returns exact category names, sender counts, sample senders, uncategorized sender count, and current categorization progress. Use this before any category-based cleanup, and prefer it over searchInbox when the user asks to clean up by category. If the user only wants the threads already shown or a small explicit set of emails, stay with searchInbox and manageInbox instead.",
    inputSchema: z.object({}),
    execute: async () => {
      trackToolCall({ tool: "get_sender_category_overview", email, logger });

      try {
        return await getCategoryOverview({ emailAccountId });
      } catch (error) {
        logger.error("Failed to load sender category overview", { error });
        return {
          error: "Failed to load sender category overview",
        };
      }
    },
  });

export type GetSenderCategoryOverviewTool = InferUITool<
  ReturnType<typeof getSenderCategoryOverviewTool>
>;

export const startSenderCategorizationTool = ({
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
      "Start sender categorization for the current account. This creates default categories if needed, enables automatic sender categorization, queues uncategorized senders for AI categorization, and returns current progress. Use this only when category cleanup is needed and getSenderCategoryOverview shows category coverage is not ready. After starting, poll getSenderCategorizationStatus only briefly before deciding whether cleanup can continue. Safe to call again: if a run is already active, it returns the existing run instead of starting a duplicate job.",
    inputSchema: z.object({}),
    execute: async () => {
      trackToolCall({ tool: "start_sender_categorization", email, logger });

      try {
        const emailProvider = await createEmailProvider({
          emailAccountId,
          provider,
          logger,
        });

        return await startBulkCategorization({
          emailAccountId,
          emailProvider,
          logger,
        });
      } catch (error) {
        logger.error("Failed to start sender categorization", { error });
        return {
          error: "Failed to start sender categorization",
        };
      }
    },
  });

export type StartSenderCategorizationTool = InferUITool<
  ReturnType<typeof startSenderCategorizationTool>
>;

export const getSenderCategorizationStatusTool = ({
  email,
  emailAccountId,
  logger,
}: {
  email: string;
  emailAccountId: string;
  logger: Logger;
}) =>
  tool({
    description: `Check sender categorization progress. Use this after startSenderCategorization to show progress in chat or to poll briefly before deciding whether category cleanup can continue. Keep polling bounded to short waits only, with at most 3 polls and waitMs no higher than ${MAX_SENDER_CATEGORIZATION_WAIT_MS} per poll. If categorization is still running after that bounded polling, stop and report the progress instead of falling back to manual searchInbox pagination. waitMs optionally delays the read server-side. This does not change inbox state.`,
    inputSchema: getSenderCategorizationStatusInputSchema,
    execute: async ({ waitMs }) => {
      trackToolCall({
        tool: "get_sender_categorization_status",
        email,
        logger,
      });

      try {
        const boundedWaitMs = Math.min(
          waitMs,
          MAX_SENDER_CATEGORIZATION_WAIT_MS,
        );

        if (boundedWaitMs > 0) {
          await sleep(boundedWaitMs);
        }

        const progress = await getCategorizationProgress({ emailAccountId });
        return getCategorizationStatusSnapshot(progress);
      } catch (error) {
        logger.error("Failed to load sender categorization status", { error });
        return {
          error: "Failed to load sender categorization status",
        };
      }
    },
  });

export type GetSenderCategorizationStatusTool = InferUITool<
  ReturnType<typeof getSenderCategorizationStatusTool>
>;

export const manageSenderCategoryTool = ({
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
      'Archive all mail from senders currently assigned to one sender category. Use this only after getSenderCategoryOverview confirmed the exact category ID or exact category name the user wants. Prefer categoryId when available. Supports the special category name "Uncategorized". If the requested category name does not exactly exist, do not guess; list the available category names and ask a brief clarification question instead. Do not use this for thread-level cleanup or arbitrary search results; use manageInbox instead.',
    inputSchema: manageSenderCategoryInputSchema,
    execute: async ({ categoryId, categoryName }) => {
      trackToolCall({ tool: "manage_sender_category", email, logger });

      try {
        const emailProvider = await createEmailProvider({
          emailAccountId,
          provider,
          logger,
        });

        return await archiveCategory({
          email,
          emailAccountId,
          emailProvider,
          logger,
          categoryId,
          categoryName,
        });
      } catch (error) {
        logger.error("Failed to manage sender category", { error });
        return {
          error: "Failed to manage sender category",
        };
      }
    },
  });

export type ManageSenderCategoryTool = InferUITool<
  ReturnType<typeof manageSenderCategoryTool>
>;

function getSearchQueryDescription(provider: string): string {
  if (isMicrosoftProvider(provider)) {
    return "Search query using Outlook search syntax. Supports: unread, read, subject:, keyword search, and plain sender email lookups. Prefer a plain sender email like sender@example.com when searching by sender. Keep Outlook retries to one simple clause at a time. If you use from:, keep it as a simple standalone filter. If the tool returns microsoftSearchFeedback.retryQueries after a failed search, prefer one suggested simpler retry query instead of repeating the same query shape. Do not use Gmail-specific operators like in:, is:, label:, or after:/before:.";
  }
  return "Search query using Gmail syntax. Supports: from:, to:, subject:, in:inbox, is:unread, has:attachment, after:YYYY/MM/DD, before:YYYY/MM/DD, label:, newer_than:, older_than:.";
}

function searchInboxInputSchema(provider: string) {
  return z.object({
    query: z
      .string()
      .trim()
      .min(1)
      .max(500)
      .describe(getSearchQueryDescription(provider)),
    limit: z
      .number()
      .int()
      .min(1)
      .max(SEARCH_INBOX_MAX_RESULTS)
      .default(SEARCH_INBOX_MAX_RESULTS)
      .describe("Maximum number of messages to return."),
    pageToken: microsoftGraphPageTokenSchema.describe(
      "Use the page token returned from a prior search to paginate.",
    ),
  });
}

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
      "Search inbox messages and return concise message metadata. Limit must be between 1 and 20 messages per call. If hasMore=true, more matches remain; for bulk or all-matching requests, keep calling searchInbox with nextPageToken until hasMore=false before reporting completion. totalReturned is only the number of messages returned by this call, so do not present it or a single search page as an exact mailbox, folder, or label count. If the tool returns an error or provider search feedback instead of messages, treat the lookup as inconclusive rather than evidence that the email is absent.",
    inputSchema: searchInboxInputSchema(provider),
    execute: async ({ query, limit, pageToken }) => {
      trackToolCall({ tool: "search_inbox", email, logger });

      try {
        const emailProvider = await createEmailProvider({
          emailAccountId,
          provider,
          logger,
        });

        const searchQueries = [query];
        if (isMicrosoftProvider(provider)) {
          const fallbackQuery = buildOutlookSearchFallbackQuery(query);
          if (fallbackQuery) searchQueries.push(fallbackQuery);
        }

        const labelsPromise = emailProvider.getLabels().catch((error) => {
          logger.warn("Failed to load labels for search results", { error });
          return [] as Array<{ id: string; name: string }>;
        });

        let searchResult:
          | Awaited<ReturnType<typeof emailProvider.searchMessages>>
          | undefined;
        let queryUsed = query;
        let lastError: unknown;
        const microsoftSearchFailures: Array<{
          query: string;
          error: unknown;
        }> = [];

        for (let i = 0; i < searchQueries.length; i++) {
          const candidateQuery = searchQueries[i];
          try {
            searchResult = await emailProvider.searchMessages({
              query: candidateQuery,
              maxResults: limit ?? SEARCH_INBOX_MAX_RESULTS,
              pageToken: pageToken ?? undefined,
            });
            queryUsed = candidateQuery;
            break;
          } catch (error) {
            lastError = error;
            if (isMicrosoftProvider(provider)) {
              microsoftSearchFailures.push({
                query: candidateQuery,
                error,
              });
            }
            if (i === searchQueries.length - 1) break;

            logger.warn("Search query failed; retrying with Outlook fallback", {
              query: candidateQuery,
              fallbackQuery: searchQueries[i + 1],
              error,
            });
          }
        }

        if (!searchResult) {
          logger.error("Failed to search inbox", { error: lastError, query });
          return isMicrosoftProvider(provider)
            ? buildMicrosoftSearchErrorResult({
                query,
                failures: microsoftSearchFailures,
              })
            : { queryUsed: query, error: "Failed to search inbox" };
        }

        const labels = await labelsPromise;

        const { messages, nextPageToken } = searchResult;
        const labelsById = createLabelLookupMap(labels);

        const items = messages.map((message) =>
          mapMessageForSearchResult(message, labelsById),
        );

        return {
          queryUsed,
          totalReturned: items.length,
          nextPageToken,
          hasMore: Boolean(nextPageToken),
          summary: summarizeSearchResults(items),
          messages: items,
        };
      } catch (error) {
        logger.error("Failed to search inbox", { error, query });
        return isMicrosoftProvider(provider)
          ? buildMicrosoftSearchErrorResult({
              query,
              failures: [{ query, error }],
            })
          : { queryUsed: query, error: "Failed to search inbox" };
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
      "Read the full content of an email by message ID, up to 4000 characters with HTML converted to plain text.",
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

const readAttachmentInputSchema = z.object({
  messageId: z
    .string()
    .describe(
      "The message ID containing the attachment (from readEmail results)",
    ),
  attachmentId: z
    .string()
    .describe("The attachment ID from readEmail attachment metadata"),
  mimeType: z
    .string()
    .optional()
    .describe("MIME type from readEmail attachment metadata"),
  filename: z
    .string()
    .optional()
    .describe("Filename from readEmail attachment metadata"),
});

export const readAttachmentTool = ({
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
      "Read the text content of an email attachment. First call readEmail for the message and use its attachment metadata; do not guess attachment IDs. Supports PDF, DOCX, plain text, CSV, and HTML. Returns metadata only for binary files (images, etc.).",
    inputSchema: readAttachmentInputSchema,
    execute: async ({
      messageId,
      attachmentId,
      mimeType: inputMimeType,
      filename: inputFilename,
    }) => {
      trackToolCall({ tool: "read_attachment", email, logger });

      try {
        const emailProvider = await createEmailProvider({
          emailAccountId,
          provider,
          logger,
        });

        let resolvedMimeType = inputMimeType;
        let resolvedFilename = inputFilename;

        if (!resolvedMimeType || !resolvedFilename) {
          try {
            const message = await emailProvider.getMessage(messageId);
            const matchedAttachment = message.attachments?.find(
              (attachment) => attachment.attachmentId === attachmentId,
            );

            resolvedMimeType ??= matchedAttachment?.mimeType ?? undefined;
            resolvedFilename ??= matchedAttachment?.filename ?? undefined;
          } catch (error) {
            logger.warn("Failed to load attachment metadata from message", {
              error,
            });
          }
        }

        resolvedMimeType ??= "application/octet-stream";
        resolvedFilename ??= "unknown";

        if (!isExtractableMimeType(resolvedMimeType)) {
          return {
            filename: resolvedFilename,
            mimeType: resolvedMimeType,
            contentAvailable: false,
            message:
              "This attachment type cannot be read as text. Only PDF, DOCX, plain text, CSV, and HTML are supported.",
          };
        }

        const attachment = await emailProvider.getAttachment(
          messageId,
          attachmentId,
        );

        const buffer = Buffer.from(attachment.data, "base64");

        const extracted = await extractAttachmentText(
          buffer,
          resolvedMimeType,
          logger,
        );

        if (!extracted) {
          return {
            filename: resolvedFilename,
            mimeType: resolvedMimeType,
            size: attachment.size,
            contentAvailable: false,
            message: "Failed to extract text from this attachment.",
          };
        }

        return {
          filename: resolvedFilename,
          mimeType: resolvedMimeType,
          size: attachment.size,
          contentAvailable: true,
          content: extracted.text,
          truncated: extracted.truncated,
        };
      } catch (error) {
        logger.error("Failed to read attachment", { error });
        return { error: "Failed to read attachment" };
      }
    },
  });

export type ReadAttachmentTool = InferUITool<
  ReturnType<typeof readAttachmentTool>
>;

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

function getManageInboxLabelDescription(provider: string) {
  return isMicrosoftProvider(provider)
    ? "Optional exact Outlook category name to apply while archiving threads."
    : "Optional exact Gmail label name to apply while archiving threads.";
}

function manageInboxInputSchema(provider: string) {
  return z.object({
    action: z
      .enum(manageInboxActions)
      .describe(
        "archive_threads: archive by ID (default unless user says delete/trash). trash_threads: move to trash. label_threads: apply a label (requires labelName). mark_read_threads: mark read/unread. bulk_archive_senders: archive ALL emails from senders server-wide after the user confirms that broad scope (never for trash/delete). unsubscribe_senders: unsubscribe and archive from senders (only for explicit unsubscribe requests).",
      ),
    threadIds: threadIdsSchema
      .nullish()
      .describe(
        "Required for archive_threads, trash_threads, label_threads, and mark_read_threads. Use IDs from searchInbox results or thread IDs the user already provided.",
      ),
    label: z
      .string()
      .nullish()
      .describe(getManageInboxLabelDescription(provider)),
    labelName: z
      .string()
      .trim()
      .min(1)
      .nullish()
      .describe(
        isMicrosoftProvider(provider)
          ? "Exact Outlook category name to apply to the selected threads."
          : "Exact Gmail label name to apply to the selected threads.",
      ),
    read: z
      .boolean()
      .nullish()
      .describe("For mark_read_threads: true for read, false for unread."),
    fromEmails: senderEmailsSchema
      .nullish()
      .describe(
        "Required for bulk_archive_senders and unsubscribe_senders. Sender email addresses to act on.",
      ),
  });
}

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
}) => {
  const inputSchema = manageInboxInputSchema(provider);

  return tool({
    description:
      "Run inbox actions on threads or senders. For emails already shown or found in this turn, prefer thread actions with threadIds. Do not widen a limited thread-level request into sender-wide cleanup. Only use sender-wide cleanup with fromEmails when the user clearly wants all mail from that sender, and get confirmation before doing broad sender-wide cleanup.",
    inputSchema,
    execute: async (input) => {
      trackToolCall({ tool: "manage_inbox", email, logger });

      const parsedInputResult = inputSchema.safeParse(input);
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
      const isSenderAction = requiresSenderEmails(parsedInput.action);

      if (isSenderAction && !parsedInput.fromEmails?.length) {
        return {
          error:
            'No sender-level action was taken. "fromEmails" is required for bulk_archive_senders and unsubscribe_senders. If you only meant the emails already shown, use archive_threads with threadIds instead.',
        };
      }

      if (
        requiresThreadIds(parsedInput.action) &&
        !parsedInput.threadIds?.length
      ) {
        return {
          error:
            "threadIds is required when action is archive_threads, label_threads, or mark_read_threads",
        };
      }

      if (parsedInput.action === "label_threads" && !parsedInput.labelName) {
        return {
          error: "labelName is required when action is label_threads",
        };
      }

      try {
        const emailProvider = await createEmailProvider({
          emailAccountId,
          provider,
          logger,
        });

        if (isSenderAction) {
          const normalizedFromEmails = normalizeSenderEmails(
            parsedInput.fromEmails ?? [],
          );
          if (!normalizedFromEmails.length) {
            return {
              error:
                'No sender-level action was taken. "fromEmails" is required for bulk_archive_senders and unsubscribe_senders. If you only meant the emails already shown, use archive_threads with threadIds instead.',
            };
          }

          if (parsedInput.action === "unsubscribe_senders") {
            const unsubscribeResults = await runSenderUnsubscribeActions({
              fromEmails: normalizedFromEmails,
              emailProvider,
              emailAccountId,
              logger,
            });
            const successfulSenders = unsubscribeResults
              .filter((result) => result.success)
              .map((result) => result.senderEmail);
            const failedSenders = unsubscribeResults
              .filter((result) => !result.success)
              .map((result) => result.senderEmail);
            const successCount = successfulSenders.length;
            const autoUnsubscribeCount = unsubscribeResults.filter(
              (result) => result.success && result.unsubscribe.success,
            ).length;
            const autoUnsubscribeAttemptedCount = unsubscribeResults.filter(
              (result) => result.unsubscribe.attempted,
            ).length;

            await emailProvider.bulkArchiveFromSenders(
              normalizedFromEmails,
              email,
              emailAccountId,
            );

            return {
              success: failedSenders.length === 0,
              action: parsedInput.action,
              sendersCount: normalizedFromEmails.length,
              senders: normalizedFromEmails,
              successCount,
              failedCount: failedSenders.length,
              failedSenders,
              autoUnsubscribeCount,
              autoUnsubscribeAttemptedCount,
            };
          }

          await emailProvider.bulkArchiveFromSenders(
            normalizedFromEmails,
            email,
            emailAccountId,
          );

          return {
            success: true,
            action: parsedInput.action,
            sendersCount: normalizedFromEmails.length,
            senders: normalizedFromEmails,
          };
        }

        const threadIds = parsedInput.threadIds;
        if (!threadIds) {
          return {
            error:
              "threadIds is required when action is archive_threads, label_threads, or mark_read_threads",
          };
        }

        const resolvedArchiveLabel =
          parsedInput.action === "archive_threads"
            ? await resolveLabelNameAndId({
                emailProvider,
                label: parsedInput.label,
              })
            : null;
        const resolvedArchiveLabelId =
          resolvedArchiveLabel?.labelId ?? undefined;
        let resolvedThreadLabel: Awaited<
          ReturnType<typeof resolveThreadLabel>
        > | null = null;

        if (parsedInput.action === "label_threads") {
          try {
            resolvedThreadLabel = await resolveThreadLabel({
              emailProvider,
              labelName: parsedInput.labelName!,
            });
          } catch (error) {
            logger.warn("Failed to resolve label for thread action", {
              error,
              labelName: parsedInput.labelName,
            });
            return hideToolErrorFromUser({
              error:
                error instanceof Error
                  ? error.message
                  : "Failed to resolve label",
            });
          }
        }

        const threadActionResults = await runThreadActionsInParallel({
          threadIds,
          concurrency: THREAD_ACTION_CONCURRENCY,
          runAction: async (threadId) => {
            if (parsedInput.action === "archive_threads") {
              await emailProvider.archiveThreadWithLabel(
                threadId,
                email,
                resolvedArchiveLabelId,
              );
            } else if (parsedInput.action === "trash_threads") {
              await emailProvider.trashThread(threadId, email, "user");
            } else if (parsedInput.action === "label_threads") {
              await applyLabelToThread({
                emailProvider,
                threadId,
                labelId: resolvedThreadLabel!.labelId,
                labelName: resolvedThreadLabel!.labelName,
              });
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
          ...(resolvedThreadLabel && {
            labelId: resolvedThreadLabel.labelId,
            labelName: resolvedThreadLabel.labelName,
          }),
        };
      } catch (error) {
        logger.error("Failed to run inbox action", { error });
        return { error: "Failed to update emails" };
      }
    },
  });
};

export type ManageInboxTool = InferUITool<ReturnType<typeof manageInboxTool>>;

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
      "Prepare a new email to send. This does NOT send immediately — it returns a confirmation payload for the user to approve.",
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
      "Prepare a reply to an existing email by message ID. This does NOT send immediately — it returns a confirmation payload for the user to approve. Do not recreate replies with sendEmail.",
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
      "Prepare a forward for an existing email by message ID. This does NOT send immediately — it returns a confirmation payload for the user to approve. Do not recreate forwards with sendEmail.",
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
  concurrency,
  runAction,
}: {
  threadIds: string[];
  concurrency: number;
  runAction: (threadId: string) => Promise<void>;
}) {
  const results = await runWithBoundedConcurrency({
    items: threadIds,
    concurrency,
    run: async (threadId) => {
      await runAction(threadId);
    },
  });

  return results.map(({ item: threadId, result }) => ({
    threadId,
    success: result.status === "fulfilled",
  }));
}

async function applyLabelToThread({
  emailProvider,
  threadId,
  labelId,
  labelName,
}: {
  emailProvider: EmailProvider;
  threadId: string;
  labelId: string;
  labelName: string | null;
}) {
  const messages = await emailProvider.getThreadMessages(threadId);
  const results = await runWithBoundedConcurrency({
    items: messages,
    concurrency: LABEL_MESSAGE_CONCURRENCY,
    run: async (message) => {
      await emailProvider.labelMessage({
        messageId: message.id,
        labelId,
        labelName,
      });
    },
  });

  const failedCount = results.filter(
    ({ result }) => result.status === "rejected",
  ).length;

  if (failedCount > 0) {
    throw new Error(`Failed to label ${failedCount} messages in thread`);
  }
}

async function resolveThreadLabel({
  emailProvider,
  labelName,
}: {
  emailProvider: EmailProvider;
  labelName: string;
}) {
  const existingLabel = await emailProvider.getLabelByName(labelName);

  if (!existingLabel) {
    throw new Error(
      `Label "${labelName}" does not exist. Use createOrGetLabel first if you want to create it.`,
    );
  }

  return {
    labelId: existingLabel.id,
    labelName: existingLabel.name,
  };
}

async function runSenderUnsubscribeActions({
  fromEmails,
  emailProvider,
  emailAccountId,
  logger,
}: {
  fromEmails: string[];
  emailProvider: EmailProvider;
  emailAccountId: string;
  logger: Logger;
}) {
  const BATCH_SIZE = 5;
  const results = await runWithBoundedConcurrency({
    items: fromEmails,
    concurrency: BATCH_SIZE,
    run: async (senderEmail) => {
      const { listUnsubscribeHeader, unsubscribeLink } =
        await getSenderUnsubscribeSource({
          senderEmail,
          emailProvider,
          logger,
        });

      return unsubscribeSenderAndMark({
        emailAccountId,
        newsletterEmail: senderEmail,
        listUnsubscribeHeader,
        unsubscribeLink,
        logger,
      });
    },
  });

  return results.map(({ item: senderEmail, result }) => {
    if (result.status === "fulfilled") {
      const unsubscribeSuccess = result.value.unsubscribe.success;
      return {
        senderEmail,
        success: unsubscribeSuccess,
        unsubscribe: result.value.unsubscribe,
      };
    }

    return {
      senderEmail,
      success: false,
      unsubscribe: {
        attempted: false,
        success: false,
        reason: "request_failed",
      } as AutomaticUnsubscribeResult,
    };
  });
}

async function getSenderUnsubscribeSource({
  senderEmail,
  emailProvider,
  logger,
}: {
  senderEmail: string;
  emailProvider: EmailProvider;
  logger: Logger;
}) {
  try {
    const { messages } = await emailProvider.getMessagesFromSender({
      senderEmail,
      maxResults: 5,
    });

    for (const message of messages) {
      const listUnsubscribeHeader = message.headers["list-unsubscribe"];
      const unsubscribeLink = findUnsubscribeLink(message.textHtml);

      if (listUnsubscribeHeader || unsubscribeLink) {
        return {
          listUnsubscribeHeader,
          unsubscribeLink,
        };
      }
    }
  } catch (error) {
    logger.warn("Failed to fetch sender messages for unsubscribe", { error });
    logger.trace("Sender lookup failed", { senderEmail });
  }

  return {};
}

const MICROSOFT_SEARCH_FAILURE_MESSAGES = {
  rate_limited: {
    summary: "Outlook rate-limited the search request.",
    suggestedNextStep:
      "Wait briefly, then retry once with a simpler Outlook query if needed.",
  },
  provider_unavailable: {
    summary: "Outlook search failed before returning results.",
    suggestedNextStep:
      "Retry once after the provider recovers instead of reusing the same query immediately.",
  },
  query_failed: {
    summary: "Outlook did not return results for the attempted search query.",
    suggestedNextStep:
      "Retry with a simpler Outlook query such as one bare sender email, one keyword, or one simple subject: term.",
  },
} as const;

type MicrosoftSearchFailureType =
  keyof typeof MICROSOFT_SEARCH_FAILURE_MESSAGES;

function buildMicrosoftSearchErrorResult({
  query,
  failures,
}: {
  query: string;
  failures: Array<{
    query: string;
    error: unknown;
  }>;
}) {
  const errorInfos = failures.map(({ error }) => extractErrorInfo(error));

  const attempts = failures.map(({ query }, i) => ({
    query,
    status: errorInfos[i].status,
    code: errorInfos[i].code,
    message: errorInfos[i].errorMessage || "Microsoft search request failed",
  }));

  const failureType = getMicrosoftSearchFailureType(errorInfos);
  const retryGuidance = getMicrosoftSearchRetryGuidance({
    query,
    failureType,
    attemptedQueries: attempts.map((attempt) => attempt.query),
  });

  return {
    queryUsed: query,
    error: "Failed to search inbox",
    provider: "microsoft" as const,
    microsoftSearchFeedback: {
      failureType,
      summary: getMicrosoftSearchFailureSummary(failureType, retryGuidance),
      suggestedNextStep: getMicrosoftSearchSuggestedNextStep(
        failureType,
        retryGuidance,
      ),
      fallbackAttempted: failures.length > 1,
      attempts,
      likelyCause: retryGuidance.likelyCause,
      removedTerms: retryGuidance.removedTerms,
      retryQueries: retryGuidance.retryQueries,
    },
  };
}

function getMicrosoftSearchFailureType(
  errorInfos: Array<ReturnType<typeof extractErrorInfo>>,
): MicrosoftSearchFailureType {
  if (errorInfos.some((errorInfo) => isRetryableError(errorInfo).isRateLimit)) {
    return "rate_limited";
  }

  if (
    errorInfos.some((errorInfo) => {
      const retryability = isRetryableError(errorInfo);
      return retryability.isServerError || retryability.retryable;
    })
  ) {
    return "provider_unavailable";
  }

  return "query_failed";
}

function getMicrosoftSearchFailureSummary(
  failureType: MicrosoftSearchFailureType,
  retryGuidance: ReturnType<typeof getMicrosoftSearchRetryGuidance>,
) {
  const baseSummary = MICROSOFT_SEARCH_FAILURE_MESSAGES[failureType].summary;
  if (
    failureType !== "query_failed" ||
    !retryGuidance.likelyCause ||
    retryGuidance.likelyCause === baseSummary
  ) {
    return baseSummary;
  }

  return `${baseSummary} ${retryGuidance.likelyCause}`;
}

function getMicrosoftSearchSuggestedNextStep(
  failureType: MicrosoftSearchFailureType,
  retryGuidance: ReturnType<typeof getMicrosoftSearchRetryGuidance>,
) {
  if (failureType !== "query_failed") {
    return MICROSOFT_SEARCH_FAILURE_MESSAGES[failureType].suggestedNextStep;
  }

  if (retryGuidance.retryQueries.length === 0) {
    return MICROSOFT_SEARCH_FAILURE_MESSAGES.query_failed.suggestedNextStep;
  }

  return `Retry with one simpler Outlook query. Start with ${JSON.stringify(
    retryGuidance.retryQueries[0],
  )} and keep it to a single clause.`;
}

function getMicrosoftSearchRetryGuidance({
  query,
  failureType,
  attemptedQueries,
}: {
  query: string;
  failureType: MicrosoftSearchFailureType;
  attemptedQueries: string[];
}) {
  if (failureType !== "query_failed") {
    return {
      likelyCause: undefined,
      removedTerms: [] as string[],
      retryQueries: [] as string[],
    };
  }

  const stateTerms = getStandaloneOutlookStateTerms(query);
  const comparisonTerms = getOutlookComparisonFilters(query);
  const senderEmails = extractEmailAddressesFromMicrosoftSearchQuery(query);
  const subjectTerms = extractMicrosoftSubjectTerms(query);
  const attemptedQuerySet = new Set(
    attemptedQueries.map((attempt) => normalizeMicrosoftRetryQuery(attempt)),
  );
  const retryQueries = [
    ...senderEmails,
    ...subjectTerms.map(formatMicrosoftSubjectRetryQuery),
    ...getMicrosoftKeywordRetryQueries(query),
  ].filter((candidate, index, candidates) => {
    const normalized = normalizeMicrosoftRetryQuery(candidate);

    return (
      normalized.length > 0 &&
      !attemptedQuerySet.has(normalized) &&
      candidates.findIndex(
        (queryCandidate) =>
          normalizeMicrosoftRetryQuery(queryCandidate) === normalized,
      ) === index
    );
  });

  return {
    likelyCause: getMicrosoftSearchLikelyCause({
      query,
      stateTerms,
      comparisonTerms,
      senderEmails,
      subjectTerms,
    }),
    removedTerms: [...new Set([...stateTerms, ...comparisonTerms])],
    retryQueries: retryQueries.slice(0, 3),
  };
}

function getMicrosoftSearchLikelyCause({
  query,
  stateTerms,
  comparisonTerms,
  senderEmails,
  subjectTerms,
}: {
  query: string;
  stateTerms: string[];
  comparisonTerms: string[];
  senderEmails: string[];
  subjectTerms: string[];
}) {
  if (comparisonTerms.length > 0) {
    return "The failed query used comparison filters, which Outlook search often rejects.";
  }

  if (
    stateTerms.length > 0 &&
    (senderEmails.length > 0 || subjectTerms.length > 0)
  ) {
    return "The failed query mixed a read-state term with other filters. Retry with one simpler clause.";
  }

  if (senderEmails.length > 0 && subjectTerms.length > 0) {
    return "The failed query mixed sender and subject filters. Retry with one simpler clause.";
  }

  if (query.trim().split(/\s+/).length > 3) {
    return "The failed query was too complex for Outlook search. Retry with one simpler clause.";
  }

  return "Retry with one simpler Outlook clause at a time.";
}

function extractMicrosoftSubjectTerms(query: string) {
  return Array.from(
    query.matchAll(/\bsubject:(?:"([^"]+)"|(\S+))/gi),
    (match) => (match[1] ?? match[2] ?? "").trim(),
  ).filter(Boolean);
}

function formatMicrosoftSubjectRetryQuery(subject: string) {
  const escapedSubject = subject.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return subject.includes(" ")
    ? `subject:"${escapedSubject}"`
    : `subject:${escapedSubject}`;
}

function getMicrosoftKeywordRetryQueries(query: string) {
  const subjectTerms = extractMicrosoftSubjectTerms(query);
  if (subjectTerms.length > 0) {
    return subjectTerms.map((subject) => sanitizeKqlTextQuery(subject));
  }

  const cleanedQuery = stripOutlookComparisonFilters(
    stripStandaloneOutlookStateTerms(query),
  )
    .replace(/\bsubject:(?:"[^"]+"|\S+)/gi, " ")
    .replace(/[()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleanedQuery.length > 0 ? [cleanedQuery] : [];
}

function normalizeMicrosoftRetryQuery(query: string) {
  return query.trim().replace(/\s+/g, " ").toLowerCase();
}

function extractEmailAddressesFromMicrosoftSearchQuery(query: string) {
  return [
    ...new Set(query.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []),
  ];
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

function normalizeSenderEmails(fromEmails: string[]) {
  return extractUniqueEmailAddresses(fromEmails);
}

const LABEL_MESSAGE_CONCURRENCY = 1;
const THREAD_ACTION_CONCURRENCY = 3;

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

const MAX_ATTACHMENT_TEXT_LENGTH = 8000;

const EXTRACTABLE_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/csv",
  "text/html",
]);

function isExtractableMimeType(mimeType: string): boolean {
  return EXTRACTABLE_MIME_TYPES.has(mimeType);
}

async function extractAttachmentText(
  buffer: Buffer,
  mimeType: string,
  logger: Logger,
): Promise<{ text: string; truncated: boolean } | null> {
  if (
    mimeType === "application/pdf" ||
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "text/plain"
  ) {
    const { extractTextFromDocument } = await import(
      "@/utils/drive/document-extraction"
    );
    const result = await extractTextFromDocument(buffer, mimeType, {
      maxLength: MAX_ATTACHMENT_TEXT_LENGTH,
      logger,
    });
    if (!result) return null;
    return { text: result.text, truncated: result.truncated };
  }

  if (mimeType === "text/csv") {
    const text = buffer.toString("utf-8");
    const truncated = text.length > MAX_ATTACHMENT_TEXT_LENGTH;
    return {
      text: truncated
        ? `${text.slice(0, MAX_ATTACHMENT_TEXT_LENGTH)}... (truncated)`
        : text,
      truncated,
    };
  }

  if (mimeType === "text/html") {
    const { htmlToText } = await import("html-to-text");
    const text = htmlToText(buffer.toString("utf-8"), {
      wordwrap: false,
      selectors: [{ selector: "img", format: "skip" }],
    });
    const truncated = text.length > MAX_ATTACHMENT_TEXT_LENGTH;
    return {
      text: truncated
        ? `${text.slice(0, MAX_ATTACHMENT_TEXT_LENGTH)}... (truncated)`
        : text,
      truncated,
    };
  }

  return { text: "", truncated: false };
}
