import type { OutlookClient } from "@/utils/outlook/client";
import type { ParsedMessage } from "@/utils/types";
import {
  getMessage,
  getMessages,
  queryBatchMessages,
  getFolderIds,
} from "@/utils/outlook/message";
import {
  getLabels,
  createLabel,
  getOrCreateInboxZeroLabel,
} from "@/utils/outlook/label";
import type { InboxZeroLabel } from "@/utils/label";
import type { ThreadsQuery } from "@/app/api/threads/validation";
import {
  draftEmail,
  forwardEmail,
  replyToEmail,
  sendEmailWithPlainText,
} from "@/utils/outlook/mail";
import {
  archiveThread,
  getOrCreateLabel,
  labelMessage,
  markReadThread,
} from "@/utils/outlook/label";
import { trashThread } from "@/utils/outlook/trash";
import { markSpam } from "@/utils/outlook/spam";
import { handlePreviousDraftDeletion } from "@/utils/ai/choose-rule/draft-management";
import { createScopedLogger } from "@/utils/logger";
import {
  getThreadMessages,
  getThreadsFromSenderWithSubject,
} from "@/utils/outlook/thread";
import { getOutlookAttachment } from "@/utils/outlook/attachment";
import { getOrCreateLabels as getOutlookOrCreateLabels } from "@/utils/outlook/label";
import {
  AWAITING_REPLY_LABEL_NAME,
  NEEDS_REPLY_LABEL_NAME,
} from "@/utils/reply-tracker/consts";
import { getDraft, deleteDraft } from "@/utils/outlook/draft";
import {
  getFiltersList,
  createFilter,
  deleteFilter,
  createAutoArchiveFilter,
} from "@/utils/outlook/filter";
import { processHistoryForUser } from "@/app/api/outlook/webhook/process-history";
import { watchOutlook, unwatchOutlook } from "@/utils/outlook/watch";
import type {
  EmailProvider,
  EmailThread,
  EmailLabel,
  EmailFilter,
} from "@/utils/email/types";

const logger = createScopedLogger("outlook-provider");

export class OutlookProvider implements EmailProvider {
  readonly name = "microsoft";
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
    const labels = await getLabels(this.client);
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
    return getMessage(messageId, this.client);
  }

  async getMessages(query?: string, maxResults = 50): Promise<ParsedMessage[]> {
    const allMessages: ParsedMessage[] = [];
    let pageToken: string | undefined;
    const pageSize = 20; // Outlook API limit

    while (allMessages.length < maxResults) {
      const response = await queryBatchMessages(this.client, {
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

    const response = await queryBatchMessages(this.client, {
      maxResults,
      folderId: sentItemsFolderId,
    });

    return response.messages || [];
  }

  async archiveThread(threadId: string, ownerEmail: string): Promise<void> {
    await archiveThread({
      client: this.client,
      threadId,
      ownerEmail,
      actionSource: "automation",
      folderId: "archive",
    });
  }

  async archiveThreadWithLabel(
    threadId: string,
    ownerEmail: string,
  ): Promise<void> {
    await archiveThread({
      client: this.client,
      threadId,
      ownerEmail,
      actionSource: "user",
      folderId: "archive",
    });
  }

  async trashThread(
    threadId: string,
    ownerEmail: string,
    actionSource: "user" | "automation",
  ): Promise<void> {
    await trashThread({
      client: this.client,
      threadId,
      ownerEmail,
      actionSource,
    });
  }

  async labelMessage(messageId: string, labelName: string): Promise<void> {
    const label = await getOrCreateLabel({
      client: this.client,
      name: labelName,
    });
    await labelMessage({
      client: this.client,
      messageId,
      categories: [label.displayName || ""],
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
      return { draftId: result.id };
    } else {
      const result = await draftEmail(this.client, email, args);
      return { draftId: result.id };
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
    await markSpam(this.client, threadId);
  }

  async markRead(threadId: string): Promise<void> {
    await markReadThread({
      client: this.client,
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
    return this.getThreadMessages(messageIds[0]);
  }

  async removeThreadLabel(_threadId: string, _labelId: string): Promise<void> {
    // For Outlook, we don't need to do anything with labels at this point
    return Promise.resolve();
  }

  async createLabel(name: string): Promise<EmailLabel> {
    const label = await createLabel({
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
    const label = await getOrCreateInboxZeroLabel({
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
    } catch {
      return null;
    }
  }

  async getFiltersList(): Promise<EmailFilter[]> {
    try {
      const response = await getFiltersList({ client: this.client });

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
    return createFilter({ client: this.client, ...options });
  }

  async createAutoArchiveFilter(options: {
    from: string;
    labelName?: string;
  }): Promise<any> {
    return createAutoArchiveFilter({
      client: this.client,
      from: options.from,
      labelName: options.labelName,
    });
  }

  async deleteFilter(id: string): Promise<any> {
    return deleteFilter({ client: this.client, id });
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

    const response = await queryBatchMessages(this.client, {
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
    await markReadThread({
      client: this.client,
      threadId,
      read,
    });
  }
  async checkIfReplySent(senderEmail: string): Promise<boolean> {
    try {
      const query = `from:me to:${senderEmail}`;
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

      // Fetch up to the threshold number of messages
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
      .filter(([_threadId, messages]) => messages.length > 0) // Filter out empty threads
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
            conversationIndex: message.conversationIndex,
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
    return getThreadsFromSenderWithSubject(this.client, sender, limit);
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

    await processHistoryForUser({
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

  isReplyInThread(message: ParsedMessage): boolean {
    try {
      return atob(message.conversationIndex || "").length > 22;
    } catch (error) {
      logger.warn("Invalid conversationIndex base64", {
        conversationIndex: message.conversationIndex,
        error,
      });
      return false;
    }
  }

  async moveThreadToFolder(
    threadId: string,
    ownerEmail: string,
    folderId: string,
  ): Promise<void> {
    await archiveThread({
      client: this.client,
      threadId,
      ownerEmail,
      actionSource: "automation",
      folderId,
    });
  }
}
