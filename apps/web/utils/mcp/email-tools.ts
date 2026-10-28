import { z } from "zod";
import { createEmailProvider } from "@/utils/email/provider";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import { resolveMcpEmailAccount } from "@/utils/mcp/account-selection";
import { textToHtmlParagraphs } from "@/utils/string";
import type { Logger } from "@/utils/logger";
import type { ParsedMessage } from "@/utils/types";

const SEARCH_INBOX_MAX_RESULTS = 20;
const READ_THREAD_MAX_MESSAGES = 20;
const READ_MESSAGE_MAX_LENGTH = 4000;

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
  emailAccountId,
  emailAddress,
  logger,
}: {
  userId: string;
  to: string;
  subject: string;
  body: string;
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
  });
  if (!draft.id) {
    throw new Error("Mailbox draft could not be created.");
  }

  return {
    emailAccount,
    draftId: draft.id,
    to,
    subject,
    sent: false,
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
