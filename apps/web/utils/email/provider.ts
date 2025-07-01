import type { gmail_v1 } from "@googleapis/gmail";
import type { OutlookClient } from "@/utils/outlook/client";
import type { ParsedMessage } from "@/utils/types";
import { parseMessage } from "@/utils/mail";
import {
  getMessage as getGmailMessage,
  getMessages as getGmailMessages,
  getSentMessages as getGmailSentMessages,
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
import { getThreadMessages as getGmailThreadMessages } from "@/utils/gmail/thread";
import { getThreadMessages as getOutlookThreadMessages } from "@/utils/outlook/thread";
import { getMessagesBatch } from "@/utils/gmail/message";
import { getAccessTokenFromClient } from "@/utils/gmail/client";
import { getAwaitingReplyLabel as getGmailAwaitingReplyLabel } from "@/utils/reply-tracker/label";
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
}

export class GmailProvider implements EmailProvider {
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

  async getMessages(
    query?: string,
    maxResults: number = 50,
  ): Promise<ParsedMessage[]> {
    const response = await getGmailMessages(this.client, {
      query,
      maxResults,
    });
    const messages = response.messages || [];
    return messages
      .filter((message) => message.payload)
      .map((message) => parseMessage(message as any));
  }

  async getSentMessages(maxResults: number = 20): Promise<ParsedMessage[]> {
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
}

export class OutlookProvider implements EmailProvider {
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

  async getMessages(
    query?: string,
    maxResults: number = 50,
  ): Promise<ParsedMessage[]> {
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

  async getSentMessages(maxResults: number = 20): Promise<ParsedMessage[]> {
    const folderIds = await getFolderIds(this.client);
    const sentItemsFolderId = folderIds.sentitems;

    if (!sentItemsFolderId) {
      throw new Error("Could not find sent items folder");
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

  async getAwaitingReplyLabel(): Promise<string> {
    // For Outlook, we don't need to do anything with labels at this point
    return Promise.resolve("");
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

      const mappedFilters = (response.value || []).map((filter: any) => {
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
      });

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

    const response = await getOutlookBatchMessages(this.client, {
      query: query.trim() || undefined,
      maxResults: options.maxResults || 20,
      pageToken: options.pageToken,
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
