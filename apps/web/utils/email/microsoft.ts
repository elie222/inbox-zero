import type { Message } from "@microsoft/microsoft-graph-types";
import type { OutlookClient } from "@/utils/outlook/client";
import type { ParsedMessage } from "@/utils/types";
import {
  getMessage,
  getMessages,
  queryBatchMessages,
  getFolderIds,
  convertMessage,
} from "@/utils/outlook/message";
import {
  getLabels,
  getLabel,
  createLabel,
  getOrCreateInboxZeroLabel,
  getLabelById,
} from "@/utils/outlook/label";
import type { InboxZeroLabel } from "@/utils/label";
import type { ThreadsQuery } from "@/app/api/threads/validation";
import {
  draftEmail,
  forwardEmail,
  replyToEmail,
  sendEmailWithPlainText,
  sendEmailWithHtml,
} from "@/utils/outlook/mail";
import {
  archiveThread,
  labelMessage,
  markReadThread,
  removeThreadLabel,
} from "@/utils/outlook/label";
import { trashThread } from "@/utils/outlook/trash";
import { markSpam } from "@/utils/outlook/spam";
import { handlePreviousDraftDeletion } from "@/utils/ai/choose-rule/draft-management";
import { type Logger, createScopedLogger } from "@/utils/logger";
import {
  getThreadMessages,
  getThreadsFromSenderWithSubject,
} from "@/utils/outlook/thread";
import { getOutlookAttachment } from "@/utils/outlook/attachment";
import { getDraft, deleteDraft } from "@/utils/outlook/draft";
import {
  getFiltersList,
  createFilter,
  deleteFilter,
  createAutoArchiveFilter,
} from "@/utils/outlook/filter";
import { queryMessagesWithFilters } from "@/utils/outlook/message";
import { processHistoryForUser } from "@/app/api/outlook/webhook/process-history";
import type {
  EmailProvider,
  EmailThread,
  EmailLabel,
  EmailFilter,
  EmailSignature,
} from "@/utils/email/types";
import { unwatchOutlook, watchOutlook } from "@/utils/outlook/watch";
import { escapeODataString } from "@/utils/outlook/odata-escape";
import { extractEmailAddress } from "@/utils/email";
import {
  getOrCreateOutlookFolderIdByName,
  getOutlookFolderTree,
} from "@/utils/outlook/folders";
import { hasUnquotedParentFolderId } from "@/utils/outlook/message";
import { extractSignatureFromHtml } from "@/utils/email/signature-extraction";
import { moveMessagesForSenders } from "@/utils/outlook/move-sender-messages";

const logger = createScopedLogger("outlook-provider");

export class OutlookProvider implements EmailProvider {
  readonly name = "microsoft";
  private readonly client: OutlookClient;

  constructor(client: OutlookClient) {
    this.client = client;
  }

  toJSON() {
    return { name: this.name, type: "OutlookProvider" };
  }

  async getThreads(folderId?: string): Promise<EmailThread[]> {
    const messages = await this.getMessages({ folderId });
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
    try {
      const messages = await this.getThreadMessages(threadId);

      return {
        id: threadId,
        messages,
        snippet: messages[0]?.snippet || "",
      };
    } catch (error) {
      logger.error("getThread failed", {
        threadId,
        error: error instanceof Error ? error.message : error,
        errorCode: (error as any)?.code,
      });
      throw error;
    }
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

  async getLabelByName(name: string): Promise<EmailLabel | null> {
    const category = await getLabel({ client: this.client, name });
    if (!category) return null;
    return {
      id: category.id || "",
      name: category.displayName || "",
      type: "user",
    };
  }

  async getMessage(messageId: string): Promise<ParsedMessage> {
    try {
      const message = await getMessage(messageId, this.client);
      return message;
    } catch (error) {
      const err = error as any;
      logger.error("getMessage failed", {
        messageId,
        error: error instanceof Error ? error.message : error,
        errorCode: err?.code,
      });
      throw error;
    }
  }

  async getMessageByRfc822MessageId(
    rfc822MessageId: string,
  ): Promise<ParsedMessage | null> {
    const cleanMessageId = rfc822MessageId.trim().replace(/^<|>$/g, "");
    const messageIdWithBrackets = `<${cleanMessageId}>`;

    const response = await this.client
      .getClient()
      .api("/me/messages")
      .filter(
        `internetMessageId eq '${escapeODataString(messageIdWithBrackets)}'`,
      )
      .top(1)
      .get();

    const message = response.value?.[0];
    if (!message) {
      return null;
    }

    const folderIds = await getFolderIds(this.client);
    return convertMessage(message, folderIds);
  }

  private async getMessages({
    searchQuery,
    maxResults = 50,
    folderId,
  }: {
    searchQuery?: string;
    folderId?: string;
    maxResults?: number;
  }): Promise<ParsedMessage[]> {
    const allMessages: ParsedMessage[] = [];
    let pageToken: string | undefined;
    const pageSize = 20; // Outlook API limit

    while (allMessages.length < maxResults) {
      const response = await queryBatchMessages(this.client, {
        searchQuery,
        folderId,
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
    const client = this.client.getClient();

    // Build Microsoft Graph API filter (only exclusions here; folder is scoped via endpoint)
    const filters: string[] = [];

    // Add exclusion filters for TO emails
    for (const email of excludeToEmails) {
      const escapedEmail = escapeODataString(email);
      filters.push(
        `not (toRecipients/any(r: r/emailAddress/address eq '${escapedEmail}'))`,
      );
    }

    // Add exclusion filters for FROM emails
    for (const email of excludeFromEmails) {
      const escapedEmail = escapeODataString(email);
      filters.push(`not (from/emailAddress/address eq '${escapedEmail}')`);
    }

    const filter = filters.length ? filters.join(" and ") : undefined;

    // Get messages from Microsoft Graph API (well-known Sent Items folder)
    let request = client
      .api("/me/mailFolders('sentitems')/messages")
      .select(
        "id,conversationId,subject,bodyPreview,receivedDateTime,from,toRecipients",
      )
      .top(maxResults)
      .orderby("receivedDateTime desc");

    if (filter) {
      request = request.filter(filter);
    }

    const response = await request.get();

    // Group messages by conversationId to create minimal threads (like original Gmail implementation)
    const threadMap = new Map<string, string>();

    for (const message of response.value) {
      const conversationId = message.conversationId;
      if (!conversationId) continue;

      // Only keep the first snippet per thread (like Gmail's minimal thread approach)
      if (!threadMap.has(conversationId)) {
        threadMap.set(conversationId, message.bodyPreview || "");
      }
    }

    // Convert to EmailThread format (minimal, no messages - consumer will call getThreadMessages if needed)
    return Array.from(threadMap.entries()).map(([id, snippet]) => ({
      id,
      snippet,
      messages: [], // Empty - consumer will call getThreadMessages(id) if needed
    }));
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

  async labelMessage({
    messageId,
    labelId,
    labelName,
  }: {
    messageId: string;
    labelId: string;
    labelName: string | null;
  }): Promise<{ usedFallback?: boolean; actualLabelId?: string }> {
    let usedFallback = false;
    let category = await this.getLabelById(labelId);

    if (!category && labelName) {
      logger.warn("Category not found by ID, trying to get by name", {
        labelId,
        labelName,
      });
      category = await this.getLabelByName(labelName);
      usedFallback = true;
    }

    if (!category) {
      throw new Error(
        `Category with ID ${labelId}${labelName ? ` or name ${labelName}` : ""} not found`,
      );
    }

    // Get current message categories to avoid replacing them
    const message = await this.client
      .getClient()
      .api(`/me/messages/${messageId}`)
      .select("categories")
      .get();

    const currentCategories = message.categories || [];

    // Add the new category if it's not already present
    if (!currentCategories.includes(category.name)) {
      const updatedCategories = [...currentCategories, category.name];
      await labelMessage({
        client: this.client,
        messageId,
        categories: updatedCategories,
      });
    }

    return {
      usedFallback,
      actualLabelId: category.id || undefined,
    };
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
    userEmail: string,
    executedRule?: { id: string; threadId: string; emailAccountId: string },
  ): Promise<{ draftId: string }> {
    if (executedRule) {
      // Run draft creation and previous draft deletion in parallel
      const [result] = await Promise.all([
        draftEmail(this.client, email, args, userEmail),
        handlePreviousDraftDeletion({
          client: this,
          executedRule,
          logger,
        }),
      ]);
      return { draftId: result.id || "" };
    } else {
      const result = await draftEmail(this.client, email, args, userEmail);
      return { draftId: result.id || "" };
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
      messageId: result.id || "",
      threadId: result.conversationId || "",
    };
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

  async markReadMessage(messageId: string): Promise<void> {
    await this.client.getClient().api(`/me/messages/${messageId}`).patch({
      isRead: true,
    });
  }

  async blockUnsubscribedEmail(messageId: string): Promise<void> {
    await this.archiveMessage(messageId);
    await this.markReadMessage(messageId);
  }

  async getThreadMessages(threadId: string): Promise<ParsedMessage[]> {
    try {
      const messages = await getThreadMessages(threadId, this.client);
      return messages;
    } catch (error) {
      const err = error as any;
      logger.error("getThreadMessages failed", {
        threadId,
        error: error instanceof Error ? error.message : error,
        errorCode: err?.code,
      });
      throw error;
    }
  }

  async getThreadMessagesInInbox(threadId: string): Promise<ParsedMessage[]> {
    // Optimized: Direct API call filtering by inbox folder
    const client = this.client.getClient();

    try {
      const escapedThreadId = escapeODataString(threadId);
      const response = await client
        .api("/me/messages")
        .filter(
          `conversationId eq '${escapedThreadId}' and parentFolderId eq 'inbox'`,
        )
        .select(
          "id,conversationId,subject,bodyPreview,receivedDateTime,from,toRecipients,body,isDraft,categories,parentFolderId",
        )
        .get();

      // Convert to ParsedMessage format using existing helper
      const messages: ParsedMessage[] = [];

      for (const message of response.value) {
        try {
          // Use the existing getMessage function to properly parse each message
          const parsedMessage = await getMessage(message.id, this.client);
          messages.push(parsedMessage);
        } catch (error) {
          logger.warn("Failed to parse message in inbox thread", {
            error,
            messageId: message.id,
            threadId,
          });
        }
      }

      // Sort messages by receivedDateTime in ascending order (oldest first) to avoid "restriction or sort order is too complex" error
      return messages.sort((a, b) => {
        const dateA = new Date(a.date || 0).getTime();
        const dateB = new Date(b.date || 0).getTime();
        return dateA - dateB; // asc order (oldest first)
      });
    } catch (error) {
      logger.error("Error fetching inbox thread messages", { error, threadId });
      throw error;
    }
  }

  async getPreviousConversationMessages(
    messageIds: string[],
  ): Promise<ParsedMessage[]> {
    return this.getMessagesBatch(messageIds);
  }

  async removeThreadLabel(threadId: string, labelId: string): Promise<void> {
    // Get the label to convert ID to name (Outlook uses names)
    // NOTE: if we have name already, we can skip this step. But because we let users use custom ids and we're not storing the custom category name, we need to first fetch the name.
    try {
      const label = await getLabelById({ client: this.client, id: labelId });
      const categoryName = label.displayName || "";

      await removeThreadLabel({
        client: this.client,
        threadId,
        categoryName,
      });
    } catch (error) {
      // If label doesn't exist (404), that's okay - nothing to remove
      if (
        (error as { statusCode?: number; code?: string }).statusCode === 404 ||
        (error as { statusCode?: number; code?: string }).code ===
          "CategoryNotFound"
      ) {
        logger.info("Label not found, skipping removal", {
          threadId,
          labelId,
        });
        return;
      }
      throw error;
    }
  }

  async removeThreadLabels(
    threadId: string,
    labelIds: string[],
  ): Promise<void> {
    if (!labelIds.length) return;

    const [allLabels, messages] = await Promise.all([
      this.getLabels(),
      this.client
        .getClient()
        .api("/me/messages")
        .filter(`conversationId eq '${escapeODataString(threadId)}'`)
        .select("id,categories")
        .get() as Promise<{
        value: Array<{ id: string; categories?: string[] }>;
      }>,
    ]);

    const labelIdsSet = new Set(labelIds);
    const removeCategoryNames = allLabels
      .filter((label) => labelIdsSet.has(label.id))
      .map((label) => label.name);

    if (!removeCategoryNames.length) return;

    for (const message of messages.value) {
      const currentCategories = message.categories || [];

      // Remove specified categories
      const newCategories = currentCategories.filter(
        (cat) => !removeCategoryNames.includes(cat),
      );

      await labelMessage({
        client: this.client,
        messageId: message.id,
        categories: newCategories,
      });
    }
  }

  async createLabel(name: string): Promise<EmailLabel> {
    const label = await createLabel({
      client: this.client,
      name,
    });

    return {
      id: label.id || "",
      name: label.displayName || label.id || "",
      type: "user",
    };
  }

  async deleteLabel(labelId: string): Promise<void> {
    await this.client
      .getClient()
      .api(`/me/outlook/masterCategories/${labelId}`)
      .delete();
  }

  async getOrCreateInboxZeroLabel(key: InboxZeroLabel): Promise<EmailLabel> {
    const label = await getOrCreateInboxZeroLabel({
      client: this.client,
      key,
    });
    return {
      id: label.id || "",
      name: label.displayName || label.id || "",
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

      const mappedFilters = (response.value || []).map((filter) => {
        const mappedFilter = {
          id: filter.id || "",
          criteria: {
            from: filter.conditions?.senderContains?.[0] || undefined,
          },
          action: {
            addLabelIds: filter.actions?.assignCategories || undefined,
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
  }) {
    return createFilter({ client: this.client, ...options });
  }

  async createAutoArchiveFilter(options: { from: string; labelName?: string }) {
    return createAutoArchiveFilter({
      client: this.client,
      from: options.from,
      labelName: options.labelName,
    });
  }

  async deleteFilter(id: string) {
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
    logger.info("getMessagesWithPagination called", {
      query: options.query,
      maxResults: options.maxResults,
      pageToken: options.pageToken,
      before: options.before?.toISOString(),
      after: options.after?.toISOString(),
    });

    // For Outlook, separate search queries from date filters
    // Microsoft Graph API handles these differently
    const originalQuery = options.query || "";

    // Build date filter for Outlook (no quotes for DateTimeOffset comparison)
    const dateFilters: string[] = [];
    if (options.before) {
      dateFilters.push(`receivedDateTime lt ${options.before.toISOString()}`);
    }
    if (options.after) {
      dateFilters.push(`receivedDateTime gt ${options.after.toISOString()}`);
    }

    logger.info("Query parameters separated", {
      originalQuery,
      dateFilters,
      hasSearchQuery: !!originalQuery.trim(),
      hasDateFilters: dateFilters.length > 0,
    });

    // Check if the query already contains parentFolderId as an unquoted identifier
    // If it does, skip applying the default folder filter to avoid conflicts
    const queryHasParentFolderId =
      originalQuery && hasUnquotedParentFolderId(originalQuery);

    // Get folder IDs to get the inbox folder ID
    const folderIds = await getFolderIds(this.client);
    const inboxFolderId = folderIds.inbox;

    if (!queryHasParentFolderId && !inboxFolderId) {
      throw new Error("Could not find inbox folder ID");
    }

    // Only apply folder filtering if the query doesn't already specify parentFolderId
    const folderId = queryHasParentFolderId ? undefined : inboxFolderId;

    logger.info("Calling queryBatchMessages with separated parameters", {
      searchQuery: originalQuery.trim() || undefined,
      dateFilters,
      maxResults: options.maxResults || 20,
      pageToken: options.pageToken,
      folderId,
      queryHasParentFolderId,
    });

    const response = await queryBatchMessages(this.client, {
      searchQuery: originalQuery.trim() || undefined,
      dateFilters,
      maxResults: options.maxResults || 20,
      pageToken: options.pageToken,
      folderId,
    });

    return {
      messages: response.messages || [],
      nextPageToken: response.nextPageToken,
    };
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
    const filters: string[] = [
      `from/emailAddress/address eq '${escapeODataString(options.senderEmail)}'`,
    ];

    const dateFilters: string[] = [];
    if (options.before) {
      dateFilters.push(`receivedDateTime lt ${options.before.toISOString()}`);
    }
    if (options.after) {
      dateFilters.push(`receivedDateTime gt ${options.after.toISOString()}`);
    }

    return queryMessagesWithFilters(this.client, {
      filters,
      dateFilters,
      maxResults: options.maxResults,
      pageToken: options.pageToken,
    });
  }

  async getMessagesByFields(options: {
    froms?: string[];
    tos?: string[];
    subjects?: string[];
    before?: Date;
    after?: Date;
    type?: "inbox" | "sent" | "all";
    excludeSent?: boolean;
    excludeInbox?: boolean;
    maxResults?: number;
    pageToken?: string;
  }): Promise<{
    messages: ParsedMessage[];
    nextPageToken?: string;
  }> {
    const filters: string[] = [];

    // Scope by folder(s)
    if (options.type === "sent") {
      // Limit to sent folder
      filters.push("parentFolderId eq 'sentitems'");
    } else if (options.type === "inbox") {
      filters.push("parentFolderId eq 'inbox'");
    } else {
      // Default/all -> include inbox and archive
      filters.push(
        "(parentFolderId eq 'inbox' or parentFolderId eq 'archive')",
      );
    }

    if (options.excludeSent) {
      filters.push("parentFolderId ne 'sentitems'");
    }

    if (options.excludeInbox) {
      filters.push("parentFolderId ne 'inbox'");
    }

    const froms = (options.froms || [])
      .map((f) => extractEmailAddress(f) || f)
      .filter((f) => !!f);
    if (froms.length > 0) {
      const fromFilter = froms
        .map((f) => `from/emailAddress/address eq '${escapeODataString(f)}'`)
        .join(" or ");
      filters.push(`(${fromFilter})`);
    }

    const tos = (options.tos || [])
      .map((t) => extractEmailAddress(t) || t)
      .filter((t) => !!t);
    if (tos.length > 0) {
      const toFilter = tos
        .map(
          (t) =>
            `toRecipients/any(r: r/emailAddress/address eq '${escapeODataString(t)}')`,
        )
        .join(" or ");
      filters.push(`(${toFilter})`);
    }

    const subjects = (options.subjects || []).filter((s) => !!s);
    if (subjects.length > 0) {
      // Use contains to match subject substrings; exact eq would be too strict
      const subjectFilter = subjects
        .map((s) => `contains(subject,'${escapeODataString(s)}')`)
        .join(" or ");
      filters.push(`(${subjectFilter})`);
    }

    const query = filters.join(" and ") || undefined;

    return this.getMessagesWithPagination({
      query,
      maxResults: options.maxResults,
      pageToken: options.pageToken,
      before: options.before,
      after: options.after,
    });
  }

  async getDrafts(options?: { maxResults?: number }): Promise<ParsedMessage[]> {
    const response = await this.getMessagesWithPagination({
      query: "isDraft eq true",
      maxResults: options?.maxResults || 50,
    });
    return response.messages;
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
      logger.info("Checking received message count", {
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
    const {
      fromEmail,
      after,
      before,
      isUnread,
      type,
      labelId,
      // biome-ignore lint/correctness/noUnusedVariables: to do
      labelIds,
      // biome-ignore lint/correctness/noUnusedVariables: to do
      excludeLabelNames,
    } = options.query || {};

    const client = this.client.getClient();

    // Determine endpoint and build filters based on query type
    let endpoint = "/me/messages";
    const filters: string[] = [];

    // Route to appropriate endpoint based on type
    if (type === "sent") {
      endpoint = "/me/mailFolders('sentitems')/messages";
    } else if (type === "all") {
      // For "all" type, use default messages endpoint with folder filter
      filters.push(
        "(parentFolderId eq 'inbox' or parentFolderId eq 'archive')",
      );
    } else if (labelId) {
      // Use labelId as parentFolderId (should be lowercase for Outlook)
      filters.push(`parentFolderId eq '${labelId.toLowerCase()}'`);
    } else {
      // Default to inbox only
      filters.push("parentFolderId eq 'inbox'");
    }

    // Add other filters
    if (fromEmail) {
      // Escape single quotes in email address
      const escapedEmail = escapeODataString(fromEmail);
      filters.push(`from/emailAddress/address eq '${escapedEmail}'`);
    }

    // Handle structured date options
    if (after) {
      const afterISO = after.toISOString();
      filters.push(`receivedDateTime gt ${afterISO}`);
    }

    if (before) {
      const beforeISO = before.toISOString();
      filters.push(`receivedDateTime lt ${beforeISO}`);
    }

    if (isUnread) {
      filters.push("isRead eq false");
    }

    const filter = filters.length > 0 ? filters.join(" and ") : undefined;

    // Build the request
    let request = client
      .api(endpoint)
      .select(
        "id,conversationId,conversationIndex,subject,bodyPreview,from,toRecipients,receivedDateTime,isDraft,body,categories,parentFolderId",
      )
      .top(options.maxResults || 50);

    if (filter) {
      request = request.filter(filter);
    }

    // Only add ordering if we don't have a fromEmail filter to avoid complexity
    if (!fromEmail) {
      request = request.orderby("receivedDateTime DESC");
    }

    if (options.pageToken) {
      request = request.skipToken(options.pageToken);
    }

    const response = await request.get();

    // Sort messages by receivedDateTime if we filtered by fromEmail (since we couldn't use orderby)
    let sortedMessages = response.value;
    if (fromEmail) {
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
      const response: { value: Message[] } = await this.client
        .getClient()
        .api("/me/messages")
        .filter(
          `from/emailAddress/address eq '${escapeODataString(options.from)}' and receivedDateTime lt ${options.date.toISOString()}`,
        )
        .top(2)
        .select("id")
        .get();

      // Check if there are any messages from this sender before the current date
      // and exclude the current message
      const hasPreviousEmail = response.value.some(
        (message) => message.id !== options.messageId,
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
    if (!options.subscriptionId) {
      throw new Error(
        "subscriptionId is required for Outlook history processing",
      );
    }

    await processHistoryForUser({
      subscriptionId: options.subscriptionId,
      resourceData: options.resourceData || {
        id: options.historyId?.toString() || "0",
        conversationId: options.startHistoryId?.toString() || null,
      },
      logger: options.logger || logger,
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

  // we map this internally beforehand so that this works as expected
  isSentMessage(message: ParsedMessage): boolean {
    return message.labelIds?.includes("SENT") || false;
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

  async archiveMessage(messageId: string): Promise<void> {
    try {
      await this.client.getClient().api(`/me/messages/${messageId}/move`).post({
        destinationId: "archive",
      });

      logger.info("Message archived successfully", {
        messageId,
      });
    } catch (error) {
      logger.error("Failed to archive message", {
        messageId,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  async bulkArchiveFromSenders(
    fromEmails: string[],
    ownerEmail: string,
  ): Promise<void> {
    await moveMessagesForSenders({
      client: this.client,
      senders: fromEmails,
      destinationId: "archive",
      action: "archive",
      ownerEmail,
    });
  }

  async bulkTrashFromSenders(
    fromEmails: string[],
    ownerEmail: string,
  ): Promise<void> {
    await moveMessagesForSenders({
      client: this.client,
      senders: fromEmails,
      destinationId: "deleteditems",
      action: "trash",
      ownerEmail,
    });
  }

  async getOrCreateOutlookFolderIdByName(folderName: string): Promise<string> {
    return await getOrCreateOutlookFolderIdByName(this.client, folderName);
  }

  async getFolders() {
    return await getOutlookFolderTree(this.client);
  }

  async getSignatures(): Promise<EmailSignature[]> {
    // Microsoft Graph API does not currently support fetching signatures via API
    // https://learn.microsoft.com/en-my/answers/questions/1093518/user-email-signature-management-via-graph-api
    // So we extract from recent sent emails instead

    try {
      const sentMessages = await this.getSentMessages(5);

      for (const message of sentMessages) {
        if (!message.textHtml) continue;

        const signature = extractSignatureFromHtml(message.textHtml);
        if (signature) {
          // Return the first signature we find
          return [
            {
              email: message.headers.from,
              signature,
              isDefault: true,
              displayName: message.headers.from,
            },
          ];
        }
      }

      logger.info("No signature found in recent sent emails");
      return [];
    } catch (error) {
      logger.error("Failed to extract signature from sent emails", {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }
}
