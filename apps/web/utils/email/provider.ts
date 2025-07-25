import type { gmail_v1 } from "@googleapis/gmail";
import type { OutlookClient } from "@/utils/outlook/client";
import type { ParsedMessage } from "@/utils/types";
import { parseMessage } from "@/utils/gmail/message";
import {
  getMessage as getGmailMessage,
  getMessages as getGmailMessages,
  getSentMessages as getGmailSentMessages,
  hasPreviousCommunicationsWithSenderOrDomain,
} from "@/utils/gmail/message";
import {
  getMessage as getOutlookMessage,
  getMessages as getOutlookMessages,
  queryBatchMessages as getOutlookBatchMessages,
  getFolderIds,
} from "@/utils/outlook/message";
import {
  getLabels as getGmailLabels,
  getLabelById as getGmailLabelById,
  createLabel as createGmailLabel,
  getOrCreateInboxZeroLabel as getOrCreateGmailInboxZeroLabel,
  GmailLabel,
} from "@/utils/gmail/label";
import {
  getLabels as getOutlookLabels,
  createLabel as createOutlookLabel,
  getOrCreateInboxZeroLabel as getOrCreateOutlookInboxZeroLabel,
} from "@/utils/outlook/label";
import { labelVisibility, messageVisibility } from "@/utils/gmail/constants";
import {
  getGmailClientForEmail,
  getOutlookClientForEmail,
} from "@/utils/account";
import { inboxZeroLabels, type InboxZeroLabel } from "@/utils/label";
import type { ThreadsQuery } from "@/app/api/threads/validation";
import { getMessageByRfc822Id } from "@/utils/gmail/message";
import {
  draftEmail as gmailDraftEmail,
  forwardEmail as gmailForwardEmail,
  replyToEmail as gmailReplyToEmail,
  sendEmailWithPlainText as gmailSendEmailWithPlainText,
} from "@/utils/gmail/mail";
import {
  draftEmail as outlookDraftEmail,
  forwardEmail as outlookForwardEmail,
  replyToEmail as outlookReplyToEmail,
  sendEmailWithPlainText as outlookSendEmailWithPlainText,
} from "@/utils/outlook/mail";
import {
  archiveThread as gmailArchiveThread,
  getOrCreateLabel as gmailGetOrCreateLabel,
  labelMessage as gmailLabelMessage,
  markReadThread as gmailMarkReadThread,
  removeThreadLabel as gmailRemoveThreadLabel,
} from "@/utils/gmail/label";
import { trashThread as gmailTrashThread } from "@/utils/gmail/trash";
import {
  archiveThread as outlookArchiveThread,
  getOrCreateLabel as outlookGetOrCreateLabel,
  labelMessage as outlookLabelMessage,
  markReadThread as outlookMarkReadThread,
} from "@/utils/outlook/label";
import { trashThread as outlookTrashThread } from "@/utils/outlook/trash";
import { markSpam as gmailMarkSpam } from "@/utils/gmail/spam";
import { markSpam as outlookMarkSpam } from "@/utils/outlook/spam";
import { handlePreviousDraftDeletion } from "@/utils/ai/choose-rule/draft-management";
import { createScopedLogger } from "@/utils/logger";
import {
  getThreadMessages as getGmailThreadMessages,
  getThreadsFromSenderWithSubject as getGmailThreadsFromSenderWithSubject,
} from "@/utils/gmail/thread";
import {
  getThreadMessages as getOutlookThreadMessages,
  getThreadsFromSenderWithSubject as getOutlookThreadsFromSenderWithSubject,
} from "@/utils/outlook/thread";
import { getMessagesBatch } from "@/utils/gmail/message";
import { getAccessTokenFromClient } from "@/utils/gmail/client";
import { getGmailAttachment } from "@/utils/gmail/attachment";
import { getOutlookAttachment } from "@/utils/outlook/attachment";
import {
  getThreadsBatch,
  getThreadsWithNextPageToken,
} from "@/utils/gmail/thread";
import { decodeSnippet } from "@/utils/gmail/decode";
import {
  getAwaitingReplyLabel as getGmailAwaitingReplyLabel,
  getReplyTrackingLabels,
} from "@/utils/reply-tracker/label";
import { getOrCreateLabels as getOutlookOrCreateLabels } from "@/utils/outlook/label";
import {
  AWAITING_REPLY_LABEL_NAME,
  NEEDS_REPLY_LABEL_NAME,
} from "@/utils/reply-tracker/consts";
import {
  getDraft as getGmailDraft,
  deleteDraft as deleteGmailDraft,
} from "@/utils/gmail/draft";
import {
  getDraft as getOutlookDraft,
  deleteDraft as deleteOutlookDraft,
} from "@/utils/outlook/draft";
import {
  getFiltersList as getGmailFiltersList,
  createFilter as createGmailFilter,
  deleteFilter as deleteGmailFilter,
  createAutoArchiveFilter,
} from "@/utils/gmail/filter";
import {
  getFiltersList as getOutlookFiltersList,
  createFilter as createOutlookFilter,
  deleteFilter as deleteOutlookFilter,
  createAutoArchiveFilter as createOutlookAutoArchiveFilter,
} from "@/utils/outlook/filter";
import { processHistoryForUser as processGmailHistory } from "@/app/api/google/webhook/process-history";
import { processHistoryForUser as processOutlookHistory } from "@/app/api/outlook/webhook/process-history";
import { watchGmail, unwatchGmail } from "@/utils/gmail/watch";
import { watchOutlook, unwatchOutlook } from "@/utils/outlook/watch";

const logger = createScopedLogger("email-provider");

export interface EmailThread {
  id: string;
  messages: ParsedMessage[];
  snippet: string;
  historyId?: string;
}

export interface EmailLabel {
  id: string;
  name: string;
  type: string;
  threadsTotal?: number;
  color?: {
    textColor?: string;
    backgroundColor?: string;
  };
  labelListVisibility?: string;
  messageListVisibility?: string;
}

export interface EmailFilter {
  id: string;
  criteria?: {
    from?: string;
  };
  action?: {
    addLabelIds?: string[];
    removeLabelIds?: string[];
  };
}

export interface EmailProvider {
  readonly name: "google" | "microsoft-entra-id";
  getThreads(folderId?: string): Promise<EmailThread[]>;
  getThread(threadId: string): Promise<EmailThread>;
  getLabels(): Promise<EmailLabel[]>;
  getLabelById(labelId: string): Promise<EmailLabel | null>;
  getMessage(messageId: string): Promise<ParsedMessage>;
  getMessages(query?: string, maxResults?: number): Promise<ParsedMessage[]>;
  getSentMessages(maxResults?: number): Promise<ParsedMessage[]>;
  getThreadMessages(threadId: string): Promise<ParsedMessage[]>;
  getPreviousConversationMessages(
    messageIds: string[],
  ): Promise<ParsedMessage[]>;
  archiveThread(threadId: string, ownerEmail: string): Promise<void>;
  archiveThreadWithLabel(
    threadId: string,
    ownerEmail: string,
    labelId?: string,
  ): Promise<void>;
  trashThread(
    threadId: string,
    ownerEmail: string,
    actionSource: "user" | "automation",
  ): Promise<void>;
  labelMessage(messageId: string, labelName: string): Promise<void>;
  removeThreadLabel(threadId: string, labelId: string): Promise<void>;
  getAwaitingReplyLabel(): Promise<string>;
  draftEmail(
    email: ParsedMessage,
    args: { to?: string; subject?: string; content: string },
    executedRule?: { id: string; threadId: string; emailAccountId: string },
  ): Promise<{ draftId: string }>;
  replyToEmail(email: ParsedMessage, content: string): Promise<void>;
  sendEmail(args: {
    to: string;
    cc?: string;
    bcc?: string;
    subject: string;
    messageText: string;
  }): Promise<void>;
  forwardEmail(
    email: ParsedMessage,
    args: { to: string; cc?: string; bcc?: string; content?: string },
  ): Promise<void>;
  markSpam(threadId: string): Promise<void>;
  markRead(threadId: string): Promise<void>;
  markReadThread(threadId: string, read: boolean): Promise<void>;
  getDraft(draftId: string): Promise<ParsedMessage | null>;
  deleteDraft(draftId: string): Promise<void>;
  createLabel(name: string, description?: string): Promise<EmailLabel>;
  getOrCreateInboxZeroLabel(key: InboxZeroLabel): Promise<EmailLabel>;
  getOriginalMessage(
    originalMessageId: string | undefined,
  ): Promise<ParsedMessage | null>;
  getFiltersList(): Promise<EmailFilter[]>;
  createFilter(options: {
    from: string;
    addLabelIds?: string[];
    removeLabelIds?: string[];
  }): Promise<any>;
  deleteFilter(id: string): Promise<any>;
  createAutoArchiveFilter(options: {
    from: string;
    gmailLabelId?: string;
    labelName?: string;
  }): Promise<any>;
  getMessagesWithPagination(options: {
    query?: string;
    maxResults?: number;
    pageToken?: string;
    before?: Date;
    after?: Date;
  }): Promise<{
    messages: ParsedMessage[];
    nextPageToken?: string;
  }>;
  getMessagesBatch(messageIds: string[]): Promise<ParsedMessage[]>;
  getAccessToken(): string;
  checkIfReplySent(senderEmail: string): Promise<boolean>;
  countReceivedMessages(
    senderEmail: string,
    threshold: number,
  ): Promise<number>;
  getAttachment(
    messageId: string,
    attachmentId: string,
  ): Promise<{ data: string; size: number }>;
  getThreadsWithQuery(options: {
    query?: ThreadsQuery;
    maxResults?: number;
    pageToken?: string;
  }): Promise<{
    threads: EmailThread[];
    nextPageToken?: string;
  }>;
  hasPreviousCommunicationsWithSenderOrDomain(options: {
    from: string;
    date: Date;
    messageId: string;
  }): Promise<boolean>;
  getThreadsFromSenderWithSubject(
    sender: string,
    limit: number,
  ): Promise<Array<{ id: string; snippet: string; subject: string }>>;
  getReplyTrackingLabels(): Promise<{
    awaitingReplyLabelId: string;
    needsReplyLabelId: string;
  }>;
  processHistory(options: {
    emailAddress: string;
    historyId?: number;
    startHistoryId?: number;
    subscriptionId?: string;
    resourceData?: {
      id: string;
      conversationId?: string;
    };
  }): Promise<void>;
  watchEmails(): Promise<{
    expirationDate: Date;
    subscriptionId?: string;
  } | null>;
  unwatchEmails(subscriptionId?: string): Promise<void>;
}

export class GmailProvider implements EmailProvider {
  readonly name = "google";
  private client: gmail_v1.Gmail;
  constructor(client: gmail_v1.Gmail) {
    this.client = client;
  }

  async getThreads(folderId?: string): Promise<EmailThread[]> {
    const response = await this.client.users.threads.list({
      userId: "me",
      q: folderId ? `in:${folderId}` : undefined,
    });

    const threads = response.data.threads || [];
    const threadPromises = threads.map((thread) => this.getThread(thread.id!));
    return Promise.all(threadPromises);
  }

  async getThread(threadId: string): Promise<EmailThread> {
    const response = await this.client.users.threads.get({
      userId: "me",
      id: threadId,
    });

    const messages = response.data.messages || [];
    const messagePromises = messages.map((message) =>
      this.getMessage(message.id!),
    );

    return {
      id: threadId,
      messages: await Promise.all(messagePromises),
      snippet: response.data.snippet || "",
      historyId: response.data.historyId || undefined,
    };
  }

  async getLabels(): Promise<EmailLabel[]> {
    const labels = await getGmailLabels(this.client);
    return (labels || [])
      .filter(
        (label) =>
          label.type === "user" &&
          label.labelListVisibility !== labelVisibility.labelHide,
      )
      .map((label) => ({
        id: label.id!,
        name: label.name!,
        type: label.type!,
        threadsTotal: label.threadsTotal || undefined,
        labelListVisibility: label.labelListVisibility || undefined,
        messageListVisibility: label.messageListVisibility || undefined,
      }));
  }

  async getLabelById(labelId: string): Promise<EmailLabel | null> {
    try {
      const label = await getGmailLabelById({
        gmail: this.client,
        id: labelId,
      });
      return {
        id: label.id!,
        name: label.name!,
        type: label.type!,
        threadsTotal: label.threadsTotal || undefined,
      };
    } catch (error) {
      return null;
    }
  }

  async getMessage(messageId: string): Promise<ParsedMessage> {
    const message = await getGmailMessage(messageId, this.client, "full");
    return parseMessage(message);
  }

  async getMessages(query?: string, maxResults = 50): Promise<ParsedMessage[]> {
    const response = await getGmailMessages(this.client, {
      query,
      maxResults,
    });
    const messages = response.messages || [];
    return messages
      .filter((message) => message.payload)
      .map((message) => parseMessage(message as any));
  }

  async getSentMessages(maxResults = 20): Promise<ParsedMessage[]> {
    return getGmailSentMessages(this.client, maxResults);
  }

  async archiveThread(threadId: string, ownerEmail: string): Promise<void> {
    await gmailArchiveThread({
      gmail: this.client,
      threadId,
      ownerEmail,
      actionSource: "automation",
    });
  }

  async archiveThreadWithLabel(
    threadId: string,
    ownerEmail: string,
    labelId?: string,
  ): Promise<void> {
    await gmailArchiveThread({
      gmail: this.client,
      threadId,
      ownerEmail,
      actionSource: "user",
      labelId,
    });
  }

  async trashThread(
    threadId: string,
    ownerEmail: string,
    actionSource: "user" | "automation",
  ): Promise<void> {
    await gmailTrashThread({
      gmail: this.client,
      threadId,
      ownerEmail,
      actionSource,
    });
  }

  async labelMessage(messageId: string, labelName: string): Promise<void> {
    const label = await gmailGetOrCreateLabel({
      gmail: this.client,
      name: labelName,
    });
    if (!label.id)
      throw new Error("Label not found and unable to create label");
    await gmailLabelMessage({
      gmail: this.client,
      messageId,
      addLabelIds: [label.id],
    });
  }

  async getDraft(draftId: string): Promise<ParsedMessage | null> {
    return getGmailDraft(draftId, this.client);
  }

  async deleteDraft(draftId: string): Promise<void> {
    await deleteGmailDraft(this.client, draftId);
  }

  async draftEmail(
    email: ParsedMessage,
    args: { to?: string; subject?: string; content: string },
    executedRule?: { id: string; threadId: string; emailAccountId: string },
  ): Promise<{ draftId: string }> {
    if (executedRule) {
      // Run draft creation and previous draft deletion in parallel
      const [result] = await Promise.all([
        gmailDraftEmail(this.client, email, args),
        handlePreviousDraftDeletion({
          client: this,
          executedRule,
          logger,
        }),
      ]);
      return { draftId: result.data.message?.id || "" };
    } else {
      const result = await gmailDraftEmail(this.client, email, args);
      return { draftId: result.data.message?.id || "" };
    }
  }

  async replyToEmail(email: ParsedMessage, content: string): Promise<void> {
    await gmailReplyToEmail(this.client, email, content);
  }

  async sendEmail(args: {
    to: string;
    cc?: string;
    bcc?: string;
    subject: string;
    messageText: string;
  }): Promise<void> {
    await gmailSendEmailWithPlainText(this.client, args);
  }

  async forwardEmail(
    email: ParsedMessage,
    args: { to: string; cc?: string; bcc?: string; content?: string },
  ): Promise<void> {
    await gmailForwardEmail(this.client, { messageId: email.id, ...args });
  }

  async markSpam(threadId: string): Promise<void> {
    await gmailMarkSpam({ gmail: this.client, threadId });
  }

  async markRead(threadId: string): Promise<void> {
    await gmailMarkReadThread({
      gmail: this.client,
      threadId,
      read: true,
    });
  }

  async getThreadMessages(threadId: string): Promise<ParsedMessage[]> {
    return getGmailThreadMessages(threadId, this.client);
  }

  async getPreviousConversationMessages(
    messageIds: string[],
  ): Promise<ParsedMessage[]> {
    return getMessagesBatch({
      messageIds,
      accessToken: getAccessTokenFromClient(this.client),
    });
  }

  async removeThreadLabel(threadId: string, labelId: string): Promise<void> {
    await gmailRemoveThreadLabel(this.client, threadId, labelId);
  }

  async getAwaitingReplyLabel(): Promise<string> {
    return getGmailAwaitingReplyLabel(this.client);
  }

  async createLabel(name: string, description?: string): Promise<EmailLabel> {
    const label = await createGmailLabel({
      gmail: this.client,
      name,
      messageListVisibility: messageVisibility.show,
      labelListVisibility: labelVisibility.labelShow,
    });

    return {
      id: label.id!,
      name: label.name!,
      type: label.type!,
    };
  }

  async getOrCreateInboxZeroLabel(key: InboxZeroLabel): Promise<EmailLabel> {
    const label = await getOrCreateGmailInboxZeroLabel({
      gmail: this.client,
      key,
    });
    return {
      id: label.id!,
      name: label.name!,
      type: label.type!,
      threadsTotal: label.threadsTotal || undefined,
    };
  }

  async getOriginalMessage(
    originalMessageId: string | undefined,
  ): Promise<ParsedMessage | null> {
    if (!originalMessageId) return null;
    const originalMessage = await getMessageByRfc822Id(
      originalMessageId,
      this.client,
    );
    if (!originalMessage) return null;
    return parseMessage(originalMessage);
  }

  async getFiltersList(): Promise<EmailFilter[]> {
    const response = await getGmailFiltersList({ gmail: this.client });
    return (response.data.filter || []).map((filter) => ({
      id: filter.id || "",
      criteria: {
        from: filter.criteria?.from || undefined,
      },
      action: {
        addLabelIds: filter.action?.addLabelIds || undefined,
        removeLabelIds: filter.action?.removeLabelIds || undefined,
      },
    }));
  }

  async createFilter(options: {
    from: string;
    addLabelIds?: string[];
    removeLabelIds?: string[];
  }): Promise<any> {
    return createGmailFilter({ gmail: this.client, ...options });
  }

  async createAutoArchiveFilter(options: {
    from: string;
    gmailLabelId?: string;
  }): Promise<any> {
    return createAutoArchiveFilter({
      gmail: this.client,
      from: options.from,
      gmailLabelId: options.gmailLabelId,
    });
  }

  async deleteFilter(id: string): Promise<any> {
    return deleteGmailFilter({ gmail: this.client, id });
  }

  async getMessagesWithPagination(options: {
    query?: string;
    maxResults?: number;
    pageToken?: string;
    before?: Date;
    after?: Date;
  }): Promise<{
    messages: ParsedMessage[];
    nextPageToken?: string;
  }> {
    // Build query string for date filtering
    let query = options.query || "";

    if (options.before) {
      query += ` before:${Math.floor(options.before.getTime() / 1000) + 1}`;
    }

    if (options.after) {
      query += ` after:${Math.floor(options.after.getTime() / 1000) - 1}`;
    }

    const response = await getGmailMessages(this.client, {
      query: query.trim() || undefined,
      maxResults: options.maxResults || 20,
      pageToken: options.pageToken || undefined,
    });

    const messages = response.messages || [];
    const messagePromises = messages.map((message) =>
      this.getMessage(message.id!),
    );

    return {
      messages: await Promise.all(messagePromises),
      nextPageToken: response.nextPageToken || undefined,
    };
  }

  async getMessagesBatch(messageIds: string[]): Promise<ParsedMessage[]> {
    return getMessagesBatch({
      messageIds,
      accessToken: getAccessTokenFromClient(this.client),
    });
  }

  getAccessToken(): string {
    return getAccessTokenFromClient(this.client);
  }

  async markReadThread(threadId: string, read: boolean): Promise<void> {
    await gmailMarkReadThread({
      gmail: this.client,
      threadId,
      read,
    });
  }

  async checkIfReplySent(senderEmail: string): Promise<boolean> {
    try {
      const query = `from:me to:${senderEmail} label:sent`;
      const response = await getGmailMessages(this.client, {
        query,
        maxResults: 1,
      });
      const sent = (response.messages?.length ?? 0) > 0;
      logger.info("Checked for sent reply", { senderEmail, sent });
      return sent;
    } catch (error) {
      logger.error("Error checking if reply was sent", {
        error,
        senderEmail,
      });
      return true; // Default to true on error (safer for TO_REPLY filtering)
    }
  }

  async countReceivedMessages(
    senderEmail: string,
    threshold: number,
  ): Promise<number> {
    try {
      const query = `from:${senderEmail}`;
      logger.info(`Checking received message count (up to ${threshold})`, {
        senderEmail,
        threshold,
      });

      // Fetch up to the threshold number of message IDs.
      const response = await getGmailMessages(this.client, {
        query,
        maxResults: threshold,
      });
      const count = response.messages?.length ?? 0;

      logger.info("Received message count check result", {
        senderEmail,
        count,
      });
      return count;
    } catch (error) {
      logger.error("Error counting received messages", {
        error,
        senderEmail,
      });
      return 0; // Default to 0 on error
    }
  }

  async getAttachment(
    messageId: string,
    attachmentId: string,
  ): Promise<{ data: string; size: number }> {
    const attachment = await getGmailAttachment(
      this.client,
      messageId,
      attachmentId,
    );
    return {
      data: attachment.data || "",
      size: attachment.size || 0,
    };
  }

  async getThreadsWithQuery(options: {
    query?: ThreadsQuery;
    maxResults?: number;
    pageToken?: string;
  }): Promise<{
    threads: EmailThread[];
    nextPageToken?: string;
  }> {
    const query = options.query;

    function getQuery() {
      if (query?.q) {
        return query.q;
      }
      if (query?.fromEmail) {
        return `from:${query.fromEmail}`;
      }
      if (query?.type === "archive") {
        return `-label:${GmailLabel.INBOX}`;
      }
      return undefined;
    }

    function getLabelIds(type?: string | null) {
      switch (type) {
        case "inbox":
          return [GmailLabel.INBOX];
        case "sent":
          return [GmailLabel.SENT];
        case "draft":
          return [GmailLabel.DRAFT];
        case "trash":
          return [GmailLabel.TRASH];
        case "spam":
          return [GmailLabel.SPAM];
        case "starred":
          return [GmailLabel.STARRED];
        case "important":
          return [GmailLabel.IMPORTANT];
        case "unread":
          return [GmailLabel.UNREAD];
        case "archive":
          return undefined;
        case "all":
          return undefined;
        default:
          if (!type || type === "undefined" || type === "null")
            return [GmailLabel.INBOX];
          return [type];
      }
    }

    const { threads: gmailThreads, nextPageToken } =
      await getThreadsWithNextPageToken({
        gmail: this.client,
        q: getQuery(),
        labelIds: query?.labelId
          ? [query.labelId]
          : getLabelIds(query?.type) || [],
        maxResults: options.maxResults || 50,
        pageToken: options.pageToken || undefined,
      });

    const threadIds =
      gmailThreads?.map((t) => t.id).filter((id): id is string => !!id) || [];
    const threads = await getThreadsBatch(
      threadIds,
      getAccessTokenFromClient(this.client),
    );

    const emailThreads: EmailThread[] = threads
      .map((thread) => {
        const id = thread.id;
        if (!id) return null;

        const emailThread: EmailThread = {
          id,
          messages:
            thread.messages?.map((message) => parseMessage(message as any)) ||
            [],
          snippet: decodeSnippet(thread.snippet),
          historyId: thread.historyId || undefined,
        };
        return emailThread;
      })
      .filter((thread): thread is EmailThread => thread !== null);

    return {
      threads: emailThreads,
      nextPageToken: nextPageToken || undefined,
    };
  }

  async hasPreviousCommunicationsWithSenderOrDomain(options: {
    from: string;
    date: Date;
    messageId: string;
  }): Promise<boolean> {
    return hasPreviousCommunicationsWithSenderOrDomain(this.client, options);
  }

  async getThreadsFromSenderWithSubject(
    sender: string,
    limit: number,
  ): Promise<Array<{ id: string; snippet: string; subject: string }>> {
    return getGmailThreadsFromSenderWithSubject(
      this.client,
      this.getAccessToken(),
      sender,
      limit,
    );
  }

  async getReplyTrackingLabels(): Promise<{
    awaitingReplyLabelId: string;
    needsReplyLabelId: string;
  }> {
    return getReplyTrackingLabels(this.client);
  }

  async processHistory(options: {
    emailAddress: string;
    historyId?: number;
    startHistoryId?: number;
    subscriptionId?: string;
    resourceData?: {
      id: string;
      conversationId?: string;
    };
  }): Promise<void> {
    await processGmailHistory(
      {
        emailAddress: options.emailAddress,
        historyId: options.historyId || 0,
      },
      {
        startHistoryId: options.startHistoryId?.toString(),
      },
    );
  }

  async watchEmails(): Promise<{
    expirationDate: Date;
    subscriptionId?: string;
  } | null> {
    const res = await watchGmail(this.client);

    if (res.expiration) {
      const expirationDate = new Date(+res.expiration);
      return { expirationDate };
    }
    return null;
  }

  async unwatchEmails(subscriptionId?: string): Promise<void> {
    await unwatchGmail(this.client);
  }
}

export class OutlookProvider implements EmailProvider {
  readonly name = "microsoft-entra-id";
  private client: OutlookClient;

  constructor(client: OutlookClient) {
    this.client = client;
  }

  async getThreads(folderId?: string): Promise<EmailThread[]> {
    const messages = await this.getMessages(folderId);
    const threadMap = new Map<string, ParsedMessage[]>();

    messages.forEach((message) => {
      const threadId = message.threadId;
      if (!threadMap.has(threadId)) {
        threadMap.set(threadId, []);
      }
      threadMap.get(threadId)!.push(message);
    });

    return Array.from(threadMap.entries()).map(([id, messages]) => ({
      id,
      messages,
      snippet: messages[0]?.snippet || "",
    }));
  }

  async getThread(threadId: string): Promise<EmailThread> {
    const messages = await this.getMessages(`conversationId:${threadId}`);
    return {
      id: threadId,
      messages,
      snippet: messages[0]?.snippet || "",
    };
  }

  async getLabels(): Promise<EmailLabel[]> {
    const labels = await getOutlookLabels(this.client);
    return labels.map((label) => ({
      id: label.id || "",
      name: label.displayName || "",
      type: "user",
    }));
  }

  async getLabelById(labelId: string): Promise<EmailLabel | null> {
    const labels = await this.getLabels();
    return labels.find((label) => label.id === labelId) || null;
  }

  async getMessage(messageId: string): Promise<ParsedMessage> {
    return getOutlookMessage(messageId, this.client);
  }

  async getMessages(query?: string, maxResults = 50): Promise<ParsedMessage[]> {
    const allMessages: ParsedMessage[] = [];
    let pageToken: string | undefined = undefined;
    const pageSize = 20; // Outlook API limit

    while (allMessages.length < maxResults) {
      const response = await getOutlookBatchMessages(this.client, {
        query,
        maxResults: Math.min(pageSize, maxResults - allMessages.length),
        pageToken,
      });

      const messages = response.messages || [];
      allMessages.push(...messages);

      // If we got fewer messages than requested, we've reached the end
      if (messages.length < pageSize || !response.nextPageToken) {
        break;
      }

      pageToken = response.nextPageToken;
    }

    return allMessages;
  }

  async getSentMessages(maxResults = 20): Promise<ParsedMessage[]> {
    const folderIds = await getFolderIds(this.client);
    const sentItemsFolderId = folderIds.sentitems;

    if (!sentItemsFolderId) {
      logger.warn("Could not find sent items folder");
      return [];
    }

    const response = await getOutlookBatchMessages(this.client, {
      maxResults,
      folderId: sentItemsFolderId,
    });

    return response.messages || [];
  }

  async archiveThread(threadId: string, ownerEmail: string): Promise<void> {
    await outlookArchiveThread({
      client: this.client,
      threadId,
      ownerEmail,
      actionSource: "automation",
    });
  }

  async archiveThreadWithLabel(
    threadId: string,
    ownerEmail: string,
    labelId?: string,
  ): Promise<void> {
    await outlookArchiveThread({
      client: this.client,
      threadId,
      ownerEmail,
      actionSource: "user",
      labelId,
    });
  }

  async trashThread(
    threadId: string,
    ownerEmail: string,
    actionSource: "user" | "automation",
  ): Promise<void> {
    await outlookTrashThread({
      client: this.client,
      threadId,
      ownerEmail,
      actionSource,
    });
  }

  async labelMessage(messageId: string, labelName: string): Promise<void> {
    const label = await outlookGetOrCreateLabel({
      client: this.client,
      name: labelName,
    });
    await outlookLabelMessage({
      client: this.client,
      messageId,
      categories: [label.displayName || ""],
    });
  }

  async getDraft(draftId: string): Promise<ParsedMessage | null> {
    return getOutlookDraft(draftId, this.client);
  }

  async deleteDraft(draftId: string): Promise<void> {
    await deleteOutlookDraft(this.client, draftId);
  }

  async draftEmail(
    email: ParsedMessage,
    args: { to?: string; subject?: string; content: string },
    executedRule?: { id: string; threadId: string; emailAccountId: string },
  ): Promise<{ draftId: string }> {
    if (executedRule) {
      // Run draft creation and previous draft deletion in parallel
      const [result] = await Promise.all([
        outlookDraftEmail(this.client, email, args),
        handlePreviousDraftDeletion({
          client: this,
          executedRule,
          logger,
        }),
      ]);
      return { draftId: result.id };
    } else {
      const result = await outlookDraftEmail(this.client, email, args);
      return { draftId: result.id };
    }
  }

  async replyToEmail(email: ParsedMessage, content: string): Promise<void> {
    await outlookReplyToEmail(this.client, email, content);
  }

  async sendEmail(args: {
    to: string;
    cc?: string;
    bcc?: string;
    subject: string;
    messageText: string;
  }): Promise<void> {
    await outlookSendEmailWithPlainText(this.client, args);
  }

  async forwardEmail(
    email: ParsedMessage,
    args: { to: string; cc?: string; bcc?: string; content?: string },
  ): Promise<void> {
    await outlookForwardEmail(this.client, { messageId: email.id, ...args });
  }

  async markSpam(threadId: string): Promise<void> {
    await outlookMarkSpam(this.client, threadId);
  }

  async markRead(threadId: string): Promise<void> {
    await outlookMarkReadThread({
      client: this.client,
      threadId,
      read: true,
    });
  }

  async getThreadMessages(threadId: string): Promise<ParsedMessage[]> {
    return getOutlookThreadMessages(threadId, this.client);
  }

  async getPreviousConversationMessages(
    messageIds: string[],
  ): Promise<ParsedMessage[]> {
    return this.getThreadMessages(messageIds[0]);
  }

  async removeThreadLabel(threadId: string, labelId: string): Promise<void> {
    // For Outlook, we don't need to do anything with labels at this point
    return Promise.resolve();
  }

  async createLabel(name: string, description?: string): Promise<EmailLabel> {
    const label = await createOutlookLabel({
      client: this.client,
      name,
    });

    return {
      id: label.id,
      name: label.displayName || label.id,
      type: "user",
    };
  }

  async getOrCreateInboxZeroLabel(key: InboxZeroLabel): Promise<EmailLabel> {
    const label = await getOrCreateOutlookInboxZeroLabel({
      client: this.client,
      key,
    });
    return {
      id: label.id,
      name: label.displayName || label.id,
      type: "user",
    };
  }

  async getOriginalMessage(
    originalMessageId: string | undefined,
  ): Promise<ParsedMessage | null> {
    if (!originalMessageId) return null;
    try {
      return await this.getMessage(originalMessageId);
    } catch (error) {
      return null;
    }
  }

  async getFiltersList(): Promise<EmailFilter[]> {
    try {
      const response = await getOutlookFiltersList({ client: this.client });

      const mappedFilters = (response.value || []).map(
        (filter: {
          id: string;
          conditions: { senderContains: string[] };
          actions: { applyCategories: string[]; moveToFolder: string };
        }) => {
          const mappedFilter = {
            id: filter.id || "",
            criteria: {
              from: filter.conditions?.senderContains?.[0] || undefined,
            },
            action: {
              addLabelIds: filter.actions?.applyCategories || undefined,
              removeLabelIds: filter.actions?.moveToFolder
                ? ["INBOX"]
                : undefined,
            },
          };
          return mappedFilter;
        },
      );

      return mappedFilters;
    } catch (error) {
      logger.error("Error in Outlook getFiltersList", { error });
      throw error;
    }
  }

  async createFilter(options: {
    from: string;
    addLabelIds?: string[];
    removeLabelIds?: string[];
  }): Promise<any> {
    return createOutlookFilter({ client: this.client, ...options });
  }

  async createAutoArchiveFilter(options: {
    from: string;
    labelName?: string;
  }): Promise<any> {
    return createOutlookAutoArchiveFilter({
      client: this.client,
      from: options.from,
      labelName: options.labelName,
    });
  }

  async deleteFilter(id: string): Promise<any> {
    return deleteOutlookFilter({ client: this.client, id });
  }

  async getMessagesWithPagination(options: {
    query?: string;
    maxResults?: number;
    pageToken?: string;
    before?: Date;
    after?: Date;
  }): Promise<{
    messages: ParsedMessage[];
    nextPageToken?: string;
  }> {
    // For Outlook, we need to handle date filtering differently
    // Microsoft Graph API uses different date filtering syntax
    let query = options.query || "";

    // Build date filter for Outlook
    const dateFilters: string[] = [];
    if (options.before) {
      dateFilters.push(`receivedDateTime lt ${options.before.toISOString()}`);
    }
    if (options.after) {
      dateFilters.push(`receivedDateTime gt ${options.after.toISOString()}`);
    }

    // Combine date filters with existing query
    if (dateFilters.length > 0) {
      const dateFilter = dateFilters.join(" and ");
      query = query ? `${query} and ${dateFilter}` : dateFilter;
    }

    // Get folder IDs to get the inbox folder ID
    const folderIds = await getFolderIds(this.client);
    const inboxFolderId = folderIds.inbox;

    if (!inboxFolderId) {
      throw new Error("Could not find inbox folder ID");
    }

    const response = await getOutlookBatchMessages(this.client, {
      query: query.trim() || undefined,
      maxResults: options.maxResults || 20,
      pageToken: options.pageToken,
      folderId: inboxFolderId, // Pass the inbox folder ID to match original behavior
    });

    return {
      messages: response.messages || [],
      nextPageToken: response.nextPageToken,
    };
  }

  async getMessagesBatch(messageIds: string[]): Promise<ParsedMessage[]> {
    // For Outlook, we need to fetch messages individually since there's no batch endpoint
    const messagePromises = messageIds.map((messageId) =>
      this.getMessage(messageId),
    );
    return Promise.all(messagePromises);
  }

  getAccessToken(): string {
    return this.client.getAccessToken();
  }

  async markReadThread(threadId: string, read: boolean): Promise<void> {
    await outlookMarkReadThread({
      client: this.client,
      threadId,
      read,
    });
  }
  async checkIfReplySent(senderEmail: string): Promise<boolean> {
    try {
      const query = `from:me to:${senderEmail}`;
      const response = await getOutlookMessages(this.client, {
        query,
        maxResults: 1,
      });
      const sent = (response.messages?.length ?? 0) > 0;
      logger.info("Checked for sent reply", { senderEmail, sent });
      return sent;
    } catch (error) {
      logger.error("Error checking if reply was sent", {
        error,
        senderEmail,
      });
      return true; // Default to true on error (safer for TO_REPLY filtering)
    }
  }

  async countReceivedMessages(
    senderEmail: string,
    threshold: number,
  ): Promise<number> {
    try {
      const query = `from:${senderEmail}`;
      logger.info(`Checking received message count (up to ${threshold})`, {
        senderEmail,
        threshold,
      });

      // Fetch up to the threshold number of messages
      const response = await getOutlookMessages(this.client, {
        query,
        maxResults: threshold,
      });
      const count = response.messages?.length ?? 0;

      logger.info("Received message count check result", {
        senderEmail,
        count,
      });
      return count;
    } catch (error) {
      logger.error("Error counting received messages", {
        error,
        senderEmail,
      });
      return 0; // Default to 0 on error
    }
  }

  async getAttachment(
    messageId: string,
    attachmentId: string,
  ): Promise<{ data: string; size: number }> {
    const attachment = await getOutlookAttachment(
      this.client,
      messageId,
      attachmentId,
    );

    // Outlook attachments return the data directly, not base64 encoded
    // We need to convert it to base64 for consistency with Gmail
    const data = attachment.contentBytes
      ? Buffer.from(attachment.contentBytes, "base64").toString("base64")
      : "";

    return {
      data,
      size: attachment.size || 0,
    };
  }

  async getThreadsWithQuery(options: {
    query?: ThreadsQuery;
    maxResults?: number;
    pageToken?: string;
  }): Promise<{
    threads: EmailThread[];
    nextPageToken?: string;
  }> {
    const query = options.query;
    const client = this.client.getClient();

    // Build the filter query for Microsoft Graph API
    function getFilter() {
      const filters: string[] = [];

      // Add folder filter based on type or labelId
      if (query?.labelId) {
        // Use labelId as parentFolderId (should be lowercase for Outlook)
        filters.push(`parentFolderId eq '${query.labelId.toLowerCase()}'`);
      } else if (query?.type === "all") {
        // For "all" type, include both inbox and archive
        filters.push(
          "(parentFolderId eq 'inbox' or parentFolderId eq 'archive')",
        );
      } else {
        // Default to inbox only
        filters.push("parentFolderId eq 'inbox'");
      }

      // Add other filters
      if (query?.fromEmail) {
        // Escape single quotes in email address
        const escapedEmail = query.fromEmail.replace(/'/g, "''");
        filters.push(`from/emailAddress/address eq '${escapedEmail}'`);
      }

      if (query?.q) {
        // Escape single quotes in search query
        const escapedQuery = query.q.replace(/'/g, "''");
        filters.push(
          `(contains(subject,'${escapedQuery}') or contains(bodyPreview,'${escapedQuery}'))`,
        );
      }

      return filters.length > 0 ? filters.join(" and ") : undefined;
    }

    // Get messages from Microsoft Graph API
    const endpoint = "/me/messages";

    // Build the request
    let request = client
      .api(endpoint)
      .select(
        "id,conversationId,conversationIndex,subject,bodyPreview,from,toRecipients,receivedDateTime,isDraft,body,categories,parentFolderId",
      )
      .top(options.maxResults || 50);

    // Add filter if present
    const filter = getFilter();
    if (filter) {
      request = request.filter(filter);
    }

    // Only add ordering if we don't have a fromEmail filter to avoid complexity
    if (!query?.fromEmail) {
      request = request.orderby("receivedDateTime DESC");
    }

    // Handle pagination
    if (options.pageToken) {
      request = request.skipToken(options.pageToken);
    }

    const response = await request.get();

    // Sort messages by receivedDateTime if we filtered by fromEmail (since we couldn't use orderby)
    let sortedMessages = response.value;
    if (query?.fromEmail) {
      sortedMessages = response.value.sort(
        (a: { receivedDateTime: string }, b: { receivedDateTime: string }) =>
          new Date(b.receivedDateTime).getTime() -
          new Date(a.receivedDateTime).getTime(),
      );
    }

    // Group messages by conversationId to create threads
    const messagesByThread = new Map<
      string,
      {
        conversationId: string;
        conversationIndex?: string;
        id: string;
        bodyPreview: string;
        body: { content: string };
        from: { emailAddress: { address: string } };
        toRecipients: { emailAddress: { address: string } }[];
        receivedDateTime: string;
        subject: string;
      }[]
    >();
    sortedMessages.forEach(
      (message: {
        conversationId: string;
        id: string;
        bodyPreview: string;
        body: { content: string };
        from: { emailAddress: { address: string } };
        toRecipients: { emailAddress: { address: string } }[];
        receivedDateTime: string;
        subject: string;
      }) => {
        // Skip messages without conversationId
        if (!message.conversationId) {
          logger.warn("Message missing conversationId", {
            messageId: message.id,
          });
          return;
        }

        const messages = messagesByThread.get(message.conversationId) || [];
        messages.push(message);
        messagesByThread.set(message.conversationId, messages);
      },
    );

    // Convert to EmailThread format
    const threads: EmailThread[] = Array.from(messagesByThread.entries())
      .filter(([threadId, messages]) => messages.length > 0) // Filter out empty threads
      .map(([threadId, messages]) => {
        // Convert messages to ParsedMessage format
        const parsedMessages: ParsedMessage[] = messages.map((message) => {
          const subject = message.subject || "";
          const date = message.receivedDateTime || new Date().toISOString();

          // Add proper null checks for from and toRecipients
          const fromAddress = message.from?.emailAddress?.address || "";
          const toAddress =
            message.toRecipients?.[0]?.emailAddress?.address || "";

          return {
            id: message.id || "",
            threadId: message.conversationId || "",
            snippet: message.bodyPreview || "",
            textPlain: message.body?.content || "",
            textHtml: message.body?.content || "",
            headers: {
              from: fromAddress,
              to: toAddress,
              subject,
              date,
            },
            subject,
            date,
            labelIds: [],
            internalDate: date,
            historyId: "",
            inline: [],
            conversationIndex: message.conversationIndex || "",
            metadata: {
              provider: "microsoft-entra-id" as const,
            },
          };
        });

        return {
          id: threadId,
          messages: parsedMessages,
          snippet: messages[0]?.bodyPreview || "",
        };
      });

    return {
      threads,
      nextPageToken: response["@odata.nextLink"]
        ? new URL(response["@odata.nextLink"]).searchParams.get("$skiptoken") ||
          undefined
        : undefined,
    };
  }

  async hasPreviousCommunicationsWithSenderOrDomain(options: {
    from: string;
    date: Date;
    messageId: string;
  }): Promise<boolean> {
    try {
      const response = await this.client
        .getClient()
        .api("/me/messages")
        .filter(
          `from/emailAddress/address eq '${options.from}' and receivedDateTime lt ${options.date.toISOString()}`,
        )
        .top(2)
        .select("id")
        .get();

      // Check if there are any messages from this sender before the current date
      // and exclude the current message
      const hasPreviousEmail = response.value.some(
        (message: { id: string }) => message.id !== options.messageId,
      );

      return hasPreviousEmail;
    } catch (error) {
      logger.error("Error checking previous communications", {
        error,
        options,
      });
      return false;
    }
  }

  async getThreadsFromSenderWithSubject(
    sender: string,
    limit: number,
  ): Promise<Array<{ id: string; snippet: string; subject: string }>> {
    return getOutlookThreadsFromSenderWithSubject(this.client, sender, limit);
  }

  async getAwaitingReplyLabel(): Promise<string> {
    const [awaitingReplyLabel] = await getOutlookOrCreateLabels({
      client: this.client,
      names: [AWAITING_REPLY_LABEL_NAME],
    });

    return awaitingReplyLabel.id || "";
  }

  async getReplyTrackingLabels(): Promise<{
    awaitingReplyLabelId: string;
    needsReplyLabelId: string;
  }> {
    const [awaitingReplyLabel, needsReplyLabel] =
      await getOutlookOrCreateLabels({
        client: this.client,
        names: [AWAITING_REPLY_LABEL_NAME, NEEDS_REPLY_LABEL_NAME],
      });

    return {
      awaitingReplyLabelId: awaitingReplyLabel.id || "",
      needsReplyLabelId: needsReplyLabel.id || "",
    };
  }

  async processHistory(options: {
    emailAddress: string;
    historyId?: number;
    startHistoryId?: number;
    subscriptionId?: string;
    resourceData?: {
      id: string;
      conversationId?: string;
    };
  }): Promise<void> {
    if (!options.subscriptionId) {
      throw new Error(
        "subscriptionId is required for Outlook history processing",
      );
    }

    await processOutlookHistory({
      subscriptionId: options.subscriptionId,
      resourceData: options.resourceData || {
        id: options.historyId?.toString() || "0",
        conversationId: options.startHistoryId?.toString(),
      },
    });
  }

  async watchEmails(): Promise<{
    expirationDate: Date;
    subscriptionId?: string;
  } | null> {
    const subscription = await watchOutlook(this.client.getClient());

    if (subscription.expirationDateTime) {
      const expirationDate = new Date(subscription.expirationDateTime);
      return {
        expirationDate,
        subscriptionId: subscription.id,
      };
    }
    return null;
  }

  async unwatchEmails(subscriptionId?: string): Promise<void> {
    if (!subscriptionId) {
      logger.warn("No subscription ID provided for Outlook unwatch");
      return;
    }
    await unwatchOutlook(this.client.getClient(), subscriptionId);
  }
}

export async function createEmailProvider({
  emailAccountId,
  provider,
}: {
  emailAccountId: string;
  provider: string | null;
}): Promise<EmailProvider> {
  if (provider === "google") {
    const client = await getGmailClientForEmail({ emailAccountId });
    return new GmailProvider(client);
  } else if (provider === "microsoft-entra-id") {
    const client = await getOutlookClientForEmail({ emailAccountId });
    return new OutlookProvider(client);
  }
  throw new Error(`Unsupported provider: ${provider}`);
}
