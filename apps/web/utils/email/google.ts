import type { gmail_v1 } from "@googleapis/gmail";
import type { ParsedMessage } from "@/utils/types";
import { parseMessage } from "@/utils/gmail/message";
import {
  getMessage,
  getMessages,
  getSentMessages,
  hasPreviousCommunicationsWithSenderOrDomain,
} from "@/utils/gmail/message";
import {
  getLabels,
  getLabelById,
  createLabel,
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
} from "@/utils/gmail/mail";
import {
  archiveThread,
  getOrCreateLabel,
  labelMessage,
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
import {
  getAwaitingReplyLabel as getGmailAwaitingReplyLabel,
  getReplyTrackingLabels,
} from "@/utils/reply-tracker/label";
import { getDraft, deleteDraft } from "@/utils/gmail/draft";
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
} from "@/utils/email/types";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("gmail-provider");

export class GmailProvider implements EmailProvider {
  readonly name = "google";
  private client: gmail_v1.Gmail;
  constructor(client: gmail_v1.Gmail) {
    this.client = client;
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

  async getMessage(messageId: string): Promise<ParsedMessage> {
    const message = await getMessage(messageId, this.client, "full");
    return parseMessage(message);
  }

  async getMessages(query?: string, maxResults = 50): Promise<ParsedMessage[]> {
    const response = await getMessages(this.client, {
      query,
      maxResults,
    });
    const messages = response.messages || [];
    return messages
      .filter((message) => message.payload)
      .map((message) => parseMessage(message as any));
  }

  async getSentMessages(maxResults = 20): Promise<ParsedMessage[]> {
    return getSentMessages(this.client, maxResults);
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

  async trashThread(
    threadId: string,
    ownerEmail: string,
    actionSource: "user" | "automation",
  ): Promise<void> {
    await trashThread({
      gmail: this.client,
      threadId,
      ownerEmail,
      actionSource,
    });
  }

  async labelMessage(messageId: string, labelName: string): Promise<void> {
    const label = await getOrCreateLabel({
      gmail: this.client,
      name: labelName,
    });
    if (!label.id)
      throw new Error("Label not found and unable to create label");
    await labelMessage({
      gmail: this.client,
      messageId,
      addLabelIds: [label.id],
    });
  }

  async getDraft(draftId: string): Promise<ParsedMessage | null> {
    return getDraft(draftId, this.client);
  }

  async deleteDraft(draftId: string): Promise<void> {
    await deleteDraft(this.client, draftId);
  }

  async draftEmail(
    email: ParsedMessage,
    args: { to?: string; subject?: string; content: string },
    executedRule?: { id: string; threadId: string; emailAccountId: string },
  ): Promise<{ draftId: string }> {
    if (executedRule) {
      // Run draft creation and previous draft deletion in parallel
      const [result] = await Promise.all([
        draftEmail(this.client, email, args),
        handlePreviousDraftDeletion({
          client: this,
          executedRule,
          logger,
        }),
      ]);
      return { draftId: result.data.id || "" };
    } else {
      const result = await draftEmail(this.client, email, args);
      return { draftId: result.data.id || "" };
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

  async forwardEmail(
    email: ParsedMessage,
    args: { to: string; cc?: string; bcc?: string; content?: string },
  ): Promise<void> {
    await forwardEmail(this.client, { messageId: email.id, ...args });
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

  async getThreadMessages(threadId: string): Promise<ParsedMessage[]> {
    return getThreadMessages(threadId, this.client);
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

  async getAwaitingReplyLabel(): Promise<string> {
    return getGmailAwaitingReplyLabel(this.client);
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
  }): Promise<any> {
    return createFilter({ gmail: this.client, ...options });
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
    try {
      const query = `from:me to:${senderEmail} label:sent`;
      const response = await getMessages(this.client, {
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
      const response = await getMessages(this.client, {
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
    return hasPreviousCommunicationsWithSenderOrDomain(this, options);
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
    await processHistoryForUser(
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

  async unwatchEmails(): Promise<void> {
    await unwatchGmail(this.client);
  }

  // Gmail: The first message id in a thread is the threadId
  isReplyInThread(message: ParsedMessage): boolean {
    return !!(message.id && message.id !== message.threadId);
  }

  async moveThreadToFolder(
    _threadId: string,
    _ownerEmail: string,
    _folderName: string,
  ): Promise<void> {
    logger.warn("Moving thread to folder is not supported for Gmail");
  }
}
