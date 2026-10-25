import { z } from "zod";
import { runRulesOnMessage } from "@/utils/ai/choose-rule/run-rules-on-message";
import { createEmailProvider } from "@/utils/email/provider";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import { resolveMcpEmailAccount } from "@/utils/mcp/account-selection";
import { textToHtmlParagraphs } from "@/utils/string";
import type { Logger } from "@/utils/logger";
import type { ParsedMessage } from "@/utils/types";

const SEARCH_INBOX_MAX_RESULTS = 20;
const READ_THREAD_MAX_MESSAGES = 20;
const READ_MESSAGE_MAX_LENGTH = 4000;
const LABEL_NAMES_IN_ERROR = 50;

export const mcpAccountSelectorShape = {
  emailAccountId: z.string().optional(),
  emailAddress: z.string().email().optional(),
};

export const searchInboxInputShape = {
  ...mcpAccountSelectorShape,
  query: z
    .string()
    .trim()
    .min(1)
    .describe(
      "Search query using the mailbox provider's search syntax (Gmail or Outlook).",
    ),
  maxResults: z.number().int().min(1).max(SEARCH_INBOX_MAX_RESULTS).optional(),
  pageToken: z.string().optional(),
};

export const readThreadInputShape = {
  ...mcpAccountSelectorShape,
  threadId: z.string().trim().min(1).describe("Thread ID from search_inbox."),
  maxMessages: z.number().int().min(1).max(READ_THREAD_MAX_MESSAGES).optional(),
};

export const createDraftInputShape = {
  ...mcpAccountSelectorShape,
  to: z
    .string()
    .trim()
    .min(1)
    .describe("Recipient email address or comma-separated addresses."),
  subject: z.string().trim().min(1).max(300),
  body: z
    .string()
    .trim()
    .min(1)
    .describe(
      "Draft body. Plain text is converted to HTML. This creates a mailbox draft and does not send.",
    ),
  replyToMessageId: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe(
      "messageId from search_inbox or read_thread. Set it to save the draft as a reply in that message's thread; omit it for a new message.",
    ),
};

export const updateThreadInputShape = {
  ...mcpAccountSelectorShape,
  threadId: z
    .string()
    .trim()
    .min(1)
    .describe("threadId from search_inbox or read_thread."),
  action: z
    .enum(["archive", "unarchive", "mark_read", "mark_unread"])
    .describe(
      "archive moves the thread out of the inbox (nothing is deleted); unarchive moves it back; mark_read and mark_unread set its read state.",
    ),
};

export const labelThreadInputShape = {
  ...mcpAccountSelectorShape,
  threadId: z
    .string()
    .trim()
    .min(1)
    .describe("threadId from search_inbox or read_thread."),
  labelName: z
    .string()
    .trim()
    .min(1)
    .describe(
      "Name of an existing label (Outlook category or Gmail label), matched exactly.",
    ),
  remove: z
    .boolean()
    .optional()
    .describe("true removes the label from the thread; omit to add it."),
};

export const runRulesInputShape = {
  ...mcpAccountSelectorShape,
  messageId: z
    .string()
    .trim()
    .min(1)
    .describe("messageId from search_inbox or read_thread."),
  apply: z
    .boolean()
    .describe(
      "false previews which rule would match and its actions without changing anything. true runs the matched rule's actions.",
    ),
};

export async function searchInboxForMcp({
  userId,
  query,
  maxResults,
  pageToken,
  emailAccountId,
  emailAddress,
  logger,
}: {
  userId: string;
  query: string;
  maxResults?: number;
  pageToken?: string;
  emailAccountId?: string;
  emailAddress?: string;
  logger: Logger;
}) {
  const emailAccount = await resolveMcpEmailAccount({
    userId,
    emailAccountId,
    emailAddress,
  });
  const emailProvider = await createEmailProvider({
    emailAccountId: emailAccount.id,
    provider: emailAccount.provider,
    logger,
  });
  const searchResult = await emailProvider.searchMessages({
    query,
    maxResults: maxResults ?? 10,
    pageToken,
  });

  return {
    emailAccount,
    query,
    nextPageToken: searchResult.nextPageToken,
    hasMore: Boolean(searchResult.nextPageToken),
    messages: searchResult.messages.map(toSearchResultMessage),
  };
}

export async function readThreadForMcp({
  userId,
  threadId,
  maxMessages,
  emailAccountId,
  emailAddress,
  logger,
}: {
  userId: string;
  threadId: string;
  maxMessages?: number;
  emailAccountId?: string;
  emailAddress?: string;
  logger: Logger;
}) {
  const emailAccount = await resolveMcpEmailAccount({
    userId,
    emailAccountId,
    emailAddress,
  });
  const emailProvider = await createEmailProvider({
    emailAccountId: emailAccount.id,
    provider: emailAccount.provider,
    logger,
  });
  const messages = await emailProvider.getThreadMessages(threadId);
  const limit = maxMessages ?? 10;
  const selected = messages.slice(-limit);

  return {
    emailAccount,
    threadId,
    truncated: messages.length > selected.length,
    messages: selected.map(toThreadMessage),
  };
}

export async function createDraftForMcp({
  userId,
  to,
  subject,
  body,
  replyToMessageId,
  emailAccountId,
  emailAddress,
  logger,
}: {
  userId: string;
  to: string;
  subject: string;
  body: string;
  replyToMessageId?: string;
  emailAccountId?: string;
  emailAddress?: string;
  logger: Logger;
}) {
  const emailAccount = await resolveMcpEmailAccount({
    userId,
    emailAccountId,
    emailAddress,
  });
  const emailProvider = await createEmailProvider({
    emailAccountId: emailAccount.id,
    provider: emailAccount.provider,
    logger,
  });
  const draft = await emailProvider.createDraft({
    to,
    subject,
    messageHtml: bodyToHtml(body),
    replyToMessageId,
  });
  if (!draft.id) {
    throw new Error("Mailbox draft could not be created.");
  }

  return {
    emailAccount,
    draftId: draft.id,
    to,
    subject,
    replyToMessageId: replyToMessageId ?? null,
    sent: false,
  };
}

export async function updateThreadForMcp({
  userId,
  threadId,
  action,
  emailAccountId,
  emailAddress,
  logger,
}: {
  userId: string;
  threadId: string;
  action: "archive" | "unarchive" | "mark_read" | "mark_unread";
  emailAccountId?: string;
  emailAddress?: string;
  logger: Logger;
}) {
  const emailAccount = await resolveMcpEmailAccount({
    userId,
    emailAccountId,
    emailAddress,
  });
  const emailProvider = await createEmailProvider({
    emailAccountId: emailAccount.id,
    provider: emailAccount.provider,
    logger,
  });

  if (action === "archive")
    await emailProvider.archiveThread(threadId, emailAccount.email);
  else if (action === "unarchive")
    await emailProvider.unarchiveThread(threadId);
  else await emailProvider.markReadThread(threadId, action === "mark_read");

  return { emailAccount, threadId, action, applied: true };
}

export async function labelThreadForMcp({
  userId,
  threadId,
  labelName,
  remove,
  emailAccountId,
  emailAddress,
  logger,
}: {
  userId: string;
  threadId: string;
  labelName: string;
  remove?: boolean;
  emailAccountId?: string;
  emailAddress?: string;
  logger: Logger;
}) {
  const emailAccount = await resolveMcpEmailAccount({
    userId,
    emailAccountId,
    emailAddress,
  });
  const emailProvider = await createEmailProvider({
    emailAccountId: emailAccount.id,
    provider: emailAccount.provider,
    logger,
  });

  const label = await emailProvider.getLabelByName(labelName);
  if (!label) {
    const labels = await emailProvider.getLabels();
    const names = labels.map((l) => l.name).slice(0, LABEL_NAMES_IN_ERROR);
    throw new Error(
      `Label "${labelName}" not found. Existing labels: ${names.join(", ") || "none"}.`,
    );
  }

  if (remove) {
    await emailProvider.removeThreadLabel(threadId, label.id);
  } else {
    const messages = await emailProvider.getThreadMessages(threadId);
    for (const message of messages) {
      await emailProvider.labelMessage({
        messageId: message.id,
        labelId: label.id,
        labelName: label.name,
      });
    }
  }

  return {
    emailAccount,
    threadId,
    labelName: label.name,
    removed: Boolean(remove),
    applied: true,
  };
}

export async function runRulesForMcp({
  userId,
  messageId,
  apply,
  emailAccountId,
  emailAddress,
  logger,
}: {
  userId: string;
  messageId: string;
  apply: boolean;
  emailAccountId?: string;
  emailAddress?: string;
  logger: Logger;
}) {
  const emailAccount = await resolveMcpEmailAccount({
    userId,
    emailAccountId,
    emailAddress,
  });
  const results = await runRulesOnMessage({
    emailAccountId: emailAccount.id,
    provider: emailAccount.provider,
    messageId,
    isTest: !apply,
    logger: logger.with({ messageId }),
  });

  return {
    emailAccount,
    messageId,
    preview: !apply,
    results: results.map((result) => ({
      ruleName: result.rule?.name ?? null,
      reason: result.reason ?? null,
      status: result.status,
      alreadyProcessed: result.existing ?? false,
      actions: (result.actionItems ?? []).map((item) => ({
        type: item.type,
        label: item.label ?? null,
        folderName: item.folderName ?? null,
      })),
    })),
  };
}

function toSearchResultMessage(message: ParsedMessage) {
  return {
    messageId: message.id,
    threadId: message.threadId,
    subject: message.subject,
    from: message.headers.from,
    to: message.headers.to,
    date: message.date,
    snippet: message.snippet,
  };
}

function toThreadMessage(message: ParsedMessage) {
  const email = getEmailForLLM(message, { maxLength: READ_MESSAGE_MAX_LENGTH });
  return {
    messageId: message.id,
    threadId: message.threadId,
    from: email.from,
    to: email.to,
    cc: email.cc,
    subject: email.subject,
    date: email.date?.toISOString() ?? message.date,
    content: email.content,
    attachments: email.attachments,
  };
}

function bodyToHtml(body: string) {
  if (/<[a-z][\s\S]*>/i.test(body)) return body;
  return textToHtmlParagraphs(body);
}
