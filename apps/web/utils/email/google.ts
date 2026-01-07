import type { gmail_v1 } from "@googleapis/gmail";
import type { MessageWithPayload, ParsedMessage } from "@/utils/types";
import { parseMessage } from "@/utils/gmail/message";
import {
  getMessage,
  getMessages,
  getSentMessages,
  queryBatchMessages,
  hasPreviousCommunicationsWithSenderOrDomain,
} from "@/utils/gmail/message";
import {
  publishBulkActionToTinybird,
  updateEmailMessagesForSender,
} from "@/utils/email/bulk-action-tracking";
import {
  getLabels,
  getLabel,
  getLabelById,
  createLabel,
  getOrCreateLabel,
  getOrCreateInboxZeroLabel,
  GmailLabel,
} from "@/utils/gmail/label";
import { labelVisibility, messageVisibility } from "@/utils/gmail/constants";
import type { InboxZeroLabel } from "@/utils/label";
import type { ThreadsQuery } from "@/app/api/threads/validation";
import { getMessageByRfc822Id } from "@/utils/gmail/message";
import {
  draftEmail,
  forwardEmail,
  replyToEmail,
  sendEmailWithPlainText,
  sendEmailWithHtml,
} from "@/utils/gmail/mail";
import {
  archiveThread,
  labelMessage,
  labelThread,
  markReadThread,
  removeThreadLabel,
} from "@/utils/gmail/label";
import { trashThread } from "@/utils/gmail/trash";
import { markSpam } from "@/utils/gmail/spam";
import { handlePreviousDraftDeletion } from "@/utils/ai/choose-rule/draft-management";
import {
  getThreadMessages,
  getThreadsFromSenderWithSubject,
} from "@/utils/gmail/thread";
import { getMessagesBatch } from "@/utils/gmail/message";
import { getAccessTokenFromClient } from "@/utils/gmail/client";
import { getGmailAttachment } from "@/utils/gmail/attachment";
import {
  getThreadsBatch,
  getThreadsWithNextPageToken,
} from "@/utils/gmail/thread";
import { decodeSnippet } from "@/utils/gmail/decode";
import { getDraft, deleteDraft } from "@/utils/gmail/draft";
import { extractErrorInfo } from "@/utils/gmail/retry";
import {
  getFiltersList,
  createFilter,
  deleteFilter,
  createAutoArchiveFilter,
} from "@/utils/gmail/filter";
import { processHistoryForUser } from "@/app/api/google/webhook/process-history";
import { watchGmail, unwatchGmail } from "@/utils/gmail/watch";
import type {
  EmailProvider,
  EmailThread,
  EmailLabel,
  EmailFilter,
  EmailSignature,
} from "@/utils/email/types";
import { createScopedLogger, type Logger } from "@/utils/logger";
import { getGmailSignatures } from "@/utils/gmail/signature-settings";

export class GmailProvider implements EmailProvider {
  readonly name = "google";
  private readonly client: gmail_v1.Gmail;
  private readonly logger: Logger;

  constructor(client: gmail_v1.Gmail, logger?: Logger) {
    this.client = client;
    this.logger = (logger || createScopedLogger("gmail-provider")).with({
      provider: "google",
    });
  }

  toJSON() {
    return { name: this.name, type: "GmailProvider" };
  }

  async getThreads(labelId?: string): Promise<EmailThread[]> {
    const response = await this.client.users.threads.list({
      userId: "me",
      q: labelId ? `in:${labelId}` : undefined,
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
    const labels = await getLabels(this.client);
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
      const label = await getLabelById({
        gmail: this.client,
        id: labelId,
      });
      return {
        id: label.id!,
        name: label.name!,
        type: label.type!,
        threadsTotal: label.threadsTotal || undefined,
      };
    } catch {
      return null;
    }
  }

  async getLabelByName(name: string): Promise<EmailLabel | null> {
    const label = await getLabel({ gmail: this.client, name });
    if (!label) return null;
    return {
      id: label.id!,
      name: label.name!,
      type: label.type!,
      threadsTotal: label.threadsTotal || undefined,
      labelListVisibility: label.labelListVisibility || undefined,
      messageListVisibility: label.messageListVisibility || undefined,
    };
  }

  async getMessage(messageId: string): Promise<ParsedMessage> {
    const message = await getMessage(messageId, this.client, "full");
    return parseMessage(message);
  }

  async getMessageByRfc822MessageId(
    rfc822MessageId: string,
  ): Promise<ParsedMessage | null> {
    const message = await getMessageByRfc822Id(rfc822MessageId, this.client);
    if (!message) return null;
    return parseMessage(message);
  }

  async getSentMessages(maxResults = 20): Promise<ParsedMessage[]> {
    return getSentMessages(this.client, maxResults);
  }

  async getInboxMessages(maxResults = 20): Promise<ParsedMessage[]> {
    const messages = await queryBatchMessages(this.client, {
      query: "in:inbox",
      maxResults,
    });
    return messages.messages;
  }

  async getSentMessageIds(options: {
    maxResults: number;
    after?: Date;
    before?: Date;
  }): Promise<{ id: string; threadId: string }[]> {
    const { maxResults, after, before } = options;

    let query = `label:${GmailLabel.SENT}`;
    if (after) {
      query += ` after:${Math.floor(after.getTime() / 1000) - 1}`;
    }
    if (before) {
      query += ` before:${Math.floor(before.getTime() / 1000) + 1}`;
    }

    const response = await getMessages(this.client, { query, maxResults });

    return (
      response.messages
        ?.filter((m) => m.id && m.threadId)
        .map((m) => ({ id: m.id!, threadId: m.threadId! })) || []
    );
  }

  async getSentThreadsExcluding(options: {
    excludeToEmails?: string[];
    excludeFromEmails?: string[];
    maxResults?: number;
  }): Promise<EmailThread[]> {
    const {
      excludeToEmails = [],
      excludeFromEmails = [],
      maxResults = 100,
    } = options;

    // Build Gmail query string
    const excludeFilters = [
      ...excludeToEmails.map((email) => `-to:${email}`),
      ...excludeFromEmails.map((email) => `-from:${email}`),
    ];

    const query = `in:sent ${excludeFilters.join(" ")}`.trim();

    // Use the existing Gmail thread functionality - this returns minimal threads
    const response = await getThreadsWithNextPageToken({
      gmail: this.client,
      q: query,
      labelIds: [GmailLabel.SENT],
      maxResults,
    });

    // Convert minimal threads to EmailThread format (just with id and snippet, no messages)
    return response.threads.map((thread) => ({
      id: thread.id || "",
      snippet: thread.snippet || "",
      messages: [], // Empty - consumer will call getThreadMessages(id) if needed
      historyId: thread.historyId || undefined,
    }));
  }

  async archiveThread(threadId: string, ownerEmail: string): Promise<void> {
    await archiveThread({
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
    await archiveThread({
      gmail: this.client,
      threadId,
      ownerEmail,
      actionSource: "user",
      labelId,
    });
  }

  async archiveMessage(messageId: string): Promise<void> {
    const log = this.logger.with({
      action: "archiveMessage",
      messageId,
    });

    try {
      await this.client.users.messages.modify({
        userId: "me",
        id: messageId,
        requestBody: {
          removeLabelIds: [GmailLabel.INBOX],
        },
      });

      log.info("Message archived successfully");
    } catch (error) {
      log.error("Failed to archive message", {
        error,
      });
      throw error;
    }
  }

  private async archiveMessagesBulk(messageIds: string[]): Promise<void> {
    const log = this.logger.with({
      action: "archiveMessagesBulk",
      messageIds: messageIds,
    });

    try {
      await this.client.users.messages.batchModify({
        userId: "me",
        requestBody: {
          ids: messageIds,
          removeLabelIds: [GmailLabel.INBOX],
        },
      });
    } catch (error) {
      log.error("Failed to archive messages bulk", { error });
      throw error;
    }
  }

  // We don't have permissions for Gmail bulkDelete, so we have to do it one thread at a time
  private async archiveMessagesFromSenders(
    senders: string[],
    ownerEmail: string,
    emailAccountId: string,
  ): Promise<void> {
    const log = this.logger.with({
      action: "archiveMessagesFromSenders",
      emailAccountId,
      email: ownerEmail,
      sendersCount: senders.length,
    });

    if (senders.length === 0) return;

    for (const sender of senders) {
      if (!sender) continue;

      const publishedThreadIds = new Set<string>();
      let nextPageToken: string | undefined;

      do {
        try {
          const { messages, nextPageToken: token } = await getMessages(
            this.client,
            {
              query: `from:${sender} in:inbox`,
              maxResults: 500,
              pageToken: nextPageToken,
            },
          );

          const batchThreadIds = new Set(messages.map((msg) => msg.threadId));
          const batchMessageIds = messages.map((msg) => msg.id);

          if (batchMessageIds.length > 0) {
            await this.archiveMessagesBulk(batchMessageIds);

            const newThreadIds = Array.from(batchThreadIds).filter(
              (threadId) => !publishedThreadIds.has(threadId),
            );

            const promises = [
              updateEmailMessagesForSender({
                sender,
                messageIds: batchMessageIds,
                emailAccountId,
                action: "archive",
              }),
            ];

            if (newThreadIds.length > 0) {
              promises.push(
                publishBulkActionToTinybird({
                  threadIds: newThreadIds,
                  action: "archive",
                  ownerEmail,
                }),
              );
            }

            await Promise.all(promises);

            newThreadIds.forEach((threadId) =>
              publishedThreadIds.add(threadId),
            );
          }

          nextPageToken = token;
        } catch (error) {
          log.error("Failed to archive messages from sender", {
            sender,
            error,
          });
          // continue processing remaining pages
          nextPageToken = undefined;
        }
      } while (nextPageToken);
    }

    log.info("Completed bulk archive from senders");
  }

  private async trashThreadsFromSenders(
    senders: string[],
    ownerEmail: string,
    emailAccountId: string,
  ): Promise<void> {
    const log = this.logger.with({
      action: "bulkTrashFromSenders",
      emailAccountId,
      email: ownerEmail,
      sendersCount: senders.length,
    });

    if (senders.length === 0) {
      return;
    }

    for (const sender of senders) {
      if (!sender) {
        continue;
      }

      const allThreadIds = new Set<string>();
      const threadToMessages = new Map<string, string[]>();
      let nextPageToken: string | undefined;

      do {
        try {
          const { messages, nextPageToken: token } = await getMessages(
            this.client,
            {
              query: `from:${sender}`,
              maxResults: 500,
              pageToken: nextPageToken,
            },
          );

          messages.forEach((msg) => {
            allThreadIds.add(msg.threadId);
            const existingMessages = threadToMessages.get(msg.threadId) || [];
            existingMessages.push(msg.id);
            threadToMessages.set(msg.threadId, existingMessages);
          });

          nextPageToken = token;
        } catch (error) {
          log.error("Failed to get messages from sender", {
            sender,
            error,
          });
          // continue processing remaining senders
          nextPageToken = undefined;
        }
      } while (nextPageToken);

      // Trash threads one by one (no bulk delete permission in Gmail)
      if (allThreadIds.size > 0) {
        const successfullyTrashedThreadIds = new Set<string>();

        for (const threadId of allThreadIds) {
          try {
            await this.trashThread(threadId, ownerEmail, "automation");
            successfullyTrashedThreadIds.add(threadId);
          } catch (error) {
            log.error("Failed to trash thread for sender", {
              sender,
              threadId,
              error,
            });
            // Continue processing remaining threads
          }
        }

        if (successfullyTrashedThreadIds.size > 0) {
          try {
            const successfulMessageIds: string[] = [];
            for (const threadId of successfullyTrashedThreadIds) {
              const messages = threadToMessages.get(threadId) || [];
              successfulMessageIds.push(...messages);
            }

            const promises = [
              publishBulkActionToTinybird({
                threadIds: Array.from(successfullyTrashedThreadIds),
                action: "trash",
                ownerEmail,
              }),
            ];

            if (successfulMessageIds.length > 0) {
              promises.push(
                updateEmailMessagesForSender({
                  sender,
                  messageIds: successfulMessageIds,
                  emailAccountId,
                  action: "trash",
                }),
              );
            }

            await Promise.all(promises);
          } catch (error) {
            log.error("Failed to track trash operation for sender", {
              sender,
              error,
            });
          }
        }
      }
    }

    log.info("Completed bulk trash from senders");
  }

  async bulkArchiveFromSenders(
    fromEmails: string[],
    ownerEmail: string,
    emailAccountId: string,
  ): Promise<void> {
    await this.archiveMessagesFromSenders(
      fromEmails,
      ownerEmail,
      emailAccountId,
    );
  }

  async bulkTrashFromSenders(
    fromEmails: string[],
    ownerEmail: string,
    emailAccountId: string,
  ): Promise<void> {
    await this.trashThreadsFromSenders(fromEmails, ownerEmail, emailAccountId);
  }

  async trashThread(
    threadId: string,
    ownerEmail: string,
    actionSource: "user" | "automation",
  ) {
    await trashThread({
      gmail: this.client,
      threadId,
      ownerEmail,
      actionSource,
    });
  }

  async labelMessage({
    messageId,
    labelId,
    labelName,
  }: {
    messageId: string;
    labelId: string;
    labelName: string | null;
  }): Promise<{ usedFallback?: boolean; actualLabelId?: string }> {
    const log = this.logger.with({
      action: "labelMessage",
      messageId,
      labelId,
      labelName,
    });

    try {
      await labelMessage({
        gmail: this.client,
        messageId,
        addLabelIds: [labelId],
      });

      return {};
    } catch (error) {
      const { errorMessage } = extractErrorInfo(error);

      const isLabelNotFound =
        errorMessage.includes("Requested entity was not found") ||
        errorMessage.includes("labelId not found");

      log.info("Label operation failed, checking fallback", {
        errorMessage,
        isLabelNotFound,
        hasLabelName: Boolean(labelName),
      });

      if (isLabelNotFound && labelName) {
        log.warn("Label not found by ID, trying to get or create by name");

        const label = await getOrCreateLabel({
          gmail: this.client,
          name: labelName,
        });
        await labelMessage({
          gmail: this.client,
          messageId,
          addLabelIds: [label.id!],
        });

        return {
          usedFallback: true,
          actualLabelId: label.id!,
        };
      }

      // Handle case where label was deleted but we don't have the name to recreate it
      if (isLabelNotFound && !labelName) {
        log.warn(
          "Label was deleted but labelName is not available for recreation. Skipping label action.",
        );
        return {};
      }

      // Re-throw if not a "not found" error
      throw error;
    }
  }

  async getDraft(draftId: string): Promise<ParsedMessage | null> {
    return getDraft(draftId, this.client);
  }

  async deleteDraft(draftId: string): Promise<void> {
    await deleteDraft(this.client, draftId);
  }

  async draftEmail(
    email: ParsedMessage,
    args: {
      to?: string;
      subject?: string;
      content: string;
      cc?: string;
      bcc?: string;
    },
    userEmail: string,
    executedRule?: { id: string; threadId: string; emailAccountId: string },
  ): Promise<{ draftId: string }> {
    this.logger.info("Creating Gmail draft", {
      hasExecutedRule: Boolean(executedRule),
      contentLength: args.content?.length,
    });

    if (executedRule) {
      // Run draft creation and previous draft deletion in parallel
      const [result] = await Promise.all([
        draftEmail(this.client, email, args, userEmail),
        handlePreviousDraftDeletion({
          client: this,
          executedRule,
          logger: this.logger,
        }),
      ]);

      const draftId = result.data.id || "";
      this.logger.info("Gmail draft created successfully", {
        draftId,
        gmailMessageId: result.data.message?.id,
      });

      return { draftId };
    } else {
      const result = await draftEmail(this.client, email, args, userEmail);

      const draftId = result.data.id || "";
      this.logger.info("Gmail draft created successfully", {
        draftId,
        gmailMessageId: result.data.message?.id,
      });

      return { draftId };
    }
  }

  async replyToEmail(email: ParsedMessage, content: string): Promise<void> {
    await replyToEmail(this.client, email, content);
  }

  async sendEmail(args: {
    to: string;
    cc?: string;
    bcc?: string;
    subject: string;
    messageText: string;
  }): Promise<void> {
    await sendEmailWithPlainText(this.client, args);
  }

  async sendEmailWithHtml(body: {
    replyToEmail?: {
      threadId: string;
      headerMessageId: string;
      references?: string;
    };
    to: string;
    cc?: string;
    bcc?: string;
    replyTo?: string;
    subject: string;
    messageHtml: string;
    attachments?: Array<{
      filename: string;
      content: string;
      contentType: string;
    }>;
  }) {
    const result = await sendEmailWithHtml(this.client, body);
    return {
      messageId: result.data.id || "",
      threadId: result.data.threadId || "",
    };
  }

  async forwardEmail(
    email: ParsedMessage,
    args: { to: string; cc?: string; bcc?: string; content?: string },
  ): Promise<void> {
    const parsedMessage = await this.getMessage(email.id);

    await forwardEmail(this.client, parsedMessage, args);
  }

  async markSpam(threadId: string): Promise<void> {
    await markSpam({ gmail: this.client, threadId });
  }

  async markRead(threadId: string): Promise<void> {
    await markReadThread({
      gmail: this.client,
      threadId,
      read: true,
    });
  }

  async blockUnsubscribedEmail(messageId: string): Promise<void> {
    const log = this.logger.with({
      action: "blockUnsubscribedEmail",
      messageId,
    });

    const unsubscribeLabel =
      await this.getOrCreateInboxZeroLabel("unsubscribed");

    if (unsubscribeLabel?.id) {
      log.warn("Unsubscribe label not found");
    }

    await labelMessage({
      gmail: this.client,
      messageId,
      addLabelIds: unsubscribeLabel?.id ? [unsubscribeLabel.id] : undefined,
      removeLabelIds: [GmailLabel.INBOX],
    });
  }

  async getThreadMessages(threadId: string): Promise<ParsedMessage[]> {
    return getThreadMessages(threadId, this.client);
  }

  async getThreadMessagesInInbox(threadId: string): Promise<ParsedMessage[]> {
    const messages = await getThreadMessages(threadId, this.client);
    return messages.filter((message) =>
      message.labelIds?.includes(GmailLabel.INBOX),
    );
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
    await removeThreadLabel(this.client, threadId, labelId);
  }

  async removeThreadLabels(
    threadId: string,
    labelIds: string[],
  ): Promise<void> {
    if (!labelIds.length) return;

    await labelThread({
      gmail: this.client,
      threadId,
      removeLabelIds: labelIds,
    });
  }

  async createLabel(name: string): Promise<EmailLabel> {
    const label = await createLabel({
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

  async deleteLabel(labelId: string): Promise<void> {
    await this.client.users.labels.delete({
      userId: "me",
      id: labelId,
    });
  }

  async getOrCreateInboxZeroLabel(key: InboxZeroLabel): Promise<EmailLabel> {
    const label = await getOrCreateInboxZeroLabel({
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
    const response = await getFiltersList({ gmail: this.client });
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
  }) {
    return createFilter({
      gmail: this.client,
      ...options,
      logger: this.logger,
    });
  }

  async createAutoArchiveFilter(options: {
    from: string;
    gmailLabelId?: string;
  }) {
    return createAutoArchiveFilter({
      gmail: this.client,
      from: options.from,
      gmailLabelId: options.gmailLabelId,
      logger: this.logger,
    });
  }

  async deleteFilter(id: string) {
    return deleteFilter({ gmail: this.client, id });
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

    query += ` -label:${GmailLabel.DRAFT}`;

    const response = await getMessages(this.client, {
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

  async getMessagesWithAttachments(options: {
    maxResults?: number;
    pageToken?: string;
  }): Promise<{ messages: ParsedMessage[]; nextPageToken?: string }> {
    return this.getMessagesWithPagination({
      query: "has:attachment",
      maxResults: options.maxResults,
      pageToken: options.pageToken,
    });
  }

  async getMessagesFromSender(options: {
    senderEmail: string;
    maxResults?: number;
    pageToken?: string;
    before?: Date;
    after?: Date;
  }): Promise<{
    messages: ParsedMessage[];
    nextPageToken?: string;
  }> {
    return this.getMessagesWithPagination({
      query: `from:${options.senderEmail}`,
      maxResults: options.maxResults,
      pageToken: options.pageToken,
      before: options.before,
      after: options.after,
    });
  }

  async getThreadsWithParticipant(options: {
    participantEmail: string;
    maxThreads?: number;
  }): Promise<EmailThread[]> {
    const { participantEmail, maxThreads = 5 } = options;

    const query = `from:${participantEmail} OR to:${participantEmail}`;
    const { threads: gmailThreads } = await getThreadsWithNextPageToken({
      gmail: this.client,
      q: query,
      maxResults: maxThreads,
    });

    const threadIds = gmailThreads
      .map((t) => t.id)
      .filter((id): id is string => !!id);

    if (threadIds.length === 0) {
      return [];
    }

    const threads = await getThreadsBatch(
      threadIds,
      getAccessTokenFromClient(this.client),
    );

    return threads
      .filter((thread) => !!thread.id)
      .map((thread) => ({
        id: thread.id!,
        messages:
          thread.messages?.map((message) =>
            parseMessage(message as MessageWithPayload),
          ) || [],
        snippet: decodeSnippet(thread.snippet),
      }));
  }

  async getDrafts(options?: { maxResults?: number }): Promise<ParsedMessage[]> {
    const response = await this.client.users.drafts.list({
      userId: "me",
      maxResults: options?.maxResults || 50,
    });

    const drafts = response.data.drafts || [];
    const messagePromises = drafts
      .filter((draft) => draft.message?.id)
      .map((draft) => this.getMessage(draft.message!.id!));

    return Promise.all(messagePromises);
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
    await markReadThread({
      gmail: this.client,
      threadId,
      read,
    });
  }

  async checkIfReplySent(senderEmail: string): Promise<boolean> {
    const log = this.logger.with({
      action: "checkIfReplySent",
      sender: senderEmail,
    });

    try {
      const query = `from:me to:${senderEmail} label:sent`;
      const response = await getMessages(this.client, {
        query,
        maxResults: 1,
      });
      const sent = (response.messages?.length ?? 0) > 0;
      log.info("Checked for sent reply", { sent });
      return sent;
    } catch (error) {
      log.error("Error checking if reply was sent", {
        error,
      });
      return true; // Default to true on error (safer for TO_REPLY filtering)
    }
  }

  async countReceivedMessages(
    senderEmail: string,
    threshold: number,
  ): Promise<number> {
    const log = this.logger.with({
      action: "countReceivedMessages",
      sender: senderEmail,
      threshold,
    });

    try {
      const query = `from:${senderEmail}`;
      log.info("Checking received message count");

      // Fetch up to the threshold number of message IDs.
      const response = await getMessages(this.client, {
        query,
        maxResults: threshold,
      });
      const count = response.messages?.length ?? 0;

      log.info("Received message count check result", { count });
      return count;
    } catch (error) {
      log.error("Error counting received messages", { error });
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
    const {
      fromEmail,
      after,
      before,
      isUnread,
      type,
      excludeLabelNames,
      labelIds,
      labelId,
    } = options.query || {};

    function getQuery() {
      const queryParts: string[] = [];

      if (fromEmail) {
        queryParts.push(`from:${fromEmail}`);
      }

      if (after) {
        const afterSeconds = Math.floor(after.getTime() / 1000);
        queryParts.push(`after:${afterSeconds}`);
      }

      if (before) {
        const beforeSeconds = Math.floor(before.getTime() / 1000);
        queryParts.push(`before:${beforeSeconds}`);
      }

      if (isUnread) {
        queryParts.push("is:unread");
      }

      if (type === "archive") {
        queryParts.push(`-in:${GmailLabel.INBOX}`);
      }

      if (excludeLabelNames) {
        for (const labelName of excludeLabelNames) {
          queryParts.push(`-label:"${labelName}"`);
        }
      }

      return queryParts.length > 0 ? queryParts.join(" ") : undefined;
    }

    function getLabelIds(type?: string | null) {
      if (labelIds) {
        return labelIds;
      }

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
        labelIds: labelId ? [labelId] : getLabelIds(type) || [],
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
            thread.messages?.map((message) =>
              parseMessage(message as MessageWithPayload),
            ) || [],
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
    return getThreadsFromSenderWithSubject(
      this.client,
      this.getAccessToken(),
      sender,
      limit,
    );
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
    logger?: Logger;
  }): Promise<void> {
    await processHistoryForUser(
      {
        emailAddress: options.emailAddress,
        historyId: options.historyId || 0,
      },
      {
        startHistoryId: options.startHistoryId?.toString(),
      },
      options.logger || this.logger,
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

  async unwatchEmails(): Promise<void> {
    await unwatchGmail(this.client);
  }

  // Gmail: The first message id in a thread is the threadId
  isReplyInThread(message: ParsedMessage): boolean {
    return !!(message.id && message.id !== message.threadId);
  }

  isSentMessage(message: ParsedMessage): boolean {
    return message.labelIds?.includes(GmailLabel.SENT) || false;
  }

  async getFolders() {
    this.logger.warn("Getting folders is not supported for Gmail");
    return [];
  }

  async moveThreadToFolder(
    _threadId: string,
    _ownerEmail: string,
    _folderName: string,
  ): Promise<void> {
    this.logger.warn("Moving thread to folder is not supported for Gmail");
  }

  async getOrCreateOutlookFolderIdByName(_folderName: string): Promise<string> {
    this.logger.warn("Moving thread to folder is not supported for Gmail");
    return "";
  }

  async getSignatures(): Promise<EmailSignature[]> {
    const gmailSignatures = await getGmailSignatures(this.client);
    return gmailSignatures.map((sig) => ({
      email: sig.email,
      signature: sig.signature,
      isDefault: sig.isDefault,
      displayName: sig.displayName,
    }));
  }
}
