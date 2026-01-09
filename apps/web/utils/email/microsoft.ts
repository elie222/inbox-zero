import type { Message } from "@microsoft/microsoft-graph-types";
import type { OutlookClient } from "@/utils/outlook/client";
import type { ParsedMessage } from "@/utils/types";
import {
  getMessage,
  getMessages,
  queryBatchMessages,
  getFolderIds,
  convertMessage,
  MESSAGE_SELECT_FIELDS,
  sanitizeKqlValue,
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
import { extractEmailAddress, getSearchTermForSender } from "@/utils/email";
import {
  getOrCreateOutlookFolderIdByName,
  getOutlookFolderTree,
} from "@/utils/outlook/folders";
import { extractSignatureFromHtml } from "@/utils/email/signature-extraction";
import { moveMessagesForSenders } from "@/utils/outlook/batch";
import { withOutlookRetry } from "@/utils/outlook/retry";

export class OutlookProvider implements EmailProvider {
  readonly name = "microsoft";
  private readonly client: OutlookClient;
  private readonly logger: Logger;

  constructor(client: OutlookClient, logger?: Logger) {
    this.client = client;
    this.logger = (logger || createScopedLogger("outlook-provider")).with({
      provider: "microsoft",
    });
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
      this.logger.error("getThread failed", {
        threadId,
        error,
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
      const message = await getMessage(messageId, this.client, this.logger);
      return message;
    } catch (error) {
      const err = error as any;
      this.logger.error("getMessage failed", {
        messageId,
        error,
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

    const folderIds = await getFolderIds(this.client, this.logger);
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
      const response = await queryBatchMessages(
        this.client,
        {
          searchQuery,
          folderId,
          maxResults: Math.min(pageSize, maxResults - allMessages.length),
          pageToken,
        },
        this.logger,
      );

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
    const folderIds = await getFolderIds(this.client, this.logger);

    const response: { value: Message[] } = await withOutlookRetry(
      () =>
        this.client
          .getClient()
          .api("/me/mailFolders('sentitems')/messages")
          .select(MESSAGE_SELECT_FIELDS)
          .top(maxResults)
          .orderby("sentDateTime desc")
          .get(),
      this.logger,
    );

    return (response.value || [])
      .filter((message: Message) => !message.isDraft)
      .map((message: Message) => convertMessage(message, folderIds));
  }

  async getInboxMessages(maxResults = 20): Promise<ParsedMessage[]> {
    const folderIds = await getFolderIds(this.client, this.logger);

    const response: { value: Message[] } = await withOutlookRetry(
      () =>
        this.client
          .getClient()
          .api("/me/mailFolders('inbox')/messages")
          .select(MESSAGE_SELECT_FIELDS)
          .top(maxResults)
          .orderby("receivedDateTime desc")
          .get(),
      this.logger,
    );

    return (response.value || [])
      .filter((message: Message) => !message.isDraft)
      .map((message: Message) => convertMessage(message, folderIds));
  }

  async getSentMessageIds(options: {
    maxResults: number;
    after?: Date;
    before?: Date;
  }): Promise<{ id: string; threadId: string }[]> {
    const { maxResults, after, before } = options;

    const filters: string[] = [];
    if (after) {
      filters.push(`sentDateTime ge ${after.toISOString()}`);
    }
    if (before) {
      filters.push(`sentDateTime le ${before.toISOString()}`);
    }

    let request = this.client
      .getClient()
      .api("/me/mailFolders('sentitems')/messages")
      .select("id,conversationId")
      .top(maxResults)
      .orderby("sentDateTime desc");

    if (filters.length) {
      request = request.filter(filters.join(" and "));
    }

    const response = await withOutlookRetry(() => request.get(), this.logger);

    return (
      response.value
        ?.filter(
          (m: { id?: string; conversationId?: string }) =>
            m.id && m.conversationId,
        )
        .map((m: { id: string; conversationId: string }) => ({
          id: m.id,
          threadId: m.conversationId,
        })) || []
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
      .select(MESSAGE_SELECT_FIELDS)
      .top(maxResults)
      .orderby("sentDateTime desc");

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
      logger: this.logger,
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
      logger: this.logger,
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
      logger: this.logger,
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
      this.logger.warn("Category not found by ID, trying to get by name", {
        labelId,
        labelName,
      });
      category = await this.getLabelByName(labelName);
      usedFallback = true;
    }

    if (!category) {
      if (!labelName) {
        this.logger.warn(
          "Category was deleted but labelName is not available for recreation. Skipping label action.",
          { labelId },
        );
        return {};
      }
      this.logger.error("Category not found", { labelId });
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
        logger: this.logger,
      });
      this.logger.info("Label applied", { labelId: category.id });
    } else {
      this.logger.info("Label already present, skipped", {
        labelId: category.id,
      });
    }

    return {
      usedFallback,
      actualLabelId: category.id || undefined,
    };
  }

  async getDraft(draftId: string): Promise<ParsedMessage | null> {
    return getDraft({ client: this.client, draftId, logger: this.logger });
  }

  async deleteDraft(draftId: string): Promise<void> {
    await deleteDraft({ client: this.client, draftId, logger: this.logger });
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
    this.logger.info("Creating Outlook draft", {
      hasExecutedRule: Boolean(executedRule),
      contentLength: args.content?.length,
    });

    if (executedRule) {
      // Run draft creation and previous draft deletion in parallel
      const [result] = await Promise.all([
        draftEmail(this.client, email, args, userEmail, this.logger),
        handlePreviousDraftDeletion({
          client: this,
          executedRule,
          logger: this.logger,
        }),
      ]);

      this.logger.info("Outlook draft created successfully", {
        draftId: result.id,
      });
      return { draftId: result.id || "" };
    } else {
      const result = await draftEmail(
        this.client,
        email,
        args,
        userEmail,
        this.logger,
      );

      this.logger.info("Outlook draft created successfully", {
        draftId: result.id,
      });
      return { draftId: result.id || "" };
    }
  }

  async replyToEmail(email: ParsedMessage, content: string): Promise<void> {
    await replyToEmail(this.client, email, content, this.logger);
  }

  async sendEmail(args: {
    to: string;
    cc?: string;
    bcc?: string;
    subject: string;
    messageText: string;
  }): Promise<void> {
    await sendEmailWithPlainText(this.client, args, this.logger);
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
    const result = await sendEmailWithHtml(this.client, body, this.logger);
    return {
      messageId: result.id || "",
      threadId: result.conversationId || "",
    };
  }

  async forwardEmail(
    email: ParsedMessage,
    args: { to: string; cc?: string; bcc?: string; content?: string },
  ): Promise<void> {
    await forwardEmail(
      this.client,
      { messageId: email.id, ...args },
      this.logger,
    );
  }

  async markSpam(threadId: string): Promise<void> {
    await markSpam(this.client, threadId, this.logger);
  }

  async markRead(threadId: string): Promise<void> {
    await markReadThread({
      client: this.client,
      threadId,
      read: true,
      logger: this.logger,
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
      const messages = await getThreadMessages(
        threadId,
        this.client,
        this.logger,
      );
      return messages;
    } catch (error) {
      const err = error as any;
      this.logger.error("getThreadMessages failed", {
        threadId,
        error,
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
        .select(MESSAGE_SELECT_FIELDS)
        .get();

      // Convert to ParsedMessage format using existing helper
      const messages: ParsedMessage[] = [];

      for (const message of response.value) {
        try {
          // Use the existing getMessage function to properly parse each message
          const parsedMessage = await getMessage(
            message.id,
            this.client,
            this.logger,
          );
          messages.push(parsedMessage);
        } catch (error) {
          this.logger.warn("Failed to parse message in inbox thread", {
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
      this.logger.error("Error fetching inbox thread messages", {
        error,
        threadId,
      });
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
        logger: this.logger,
      });
    } catch (error) {
      // If label doesn't exist (404), that's okay - nothing to remove
      if (
        (error as { statusCode?: number; code?: string }).statusCode === 404 ||
        (error as { statusCode?: number; code?: string }).code ===
          "CategoryNotFound"
      ) {
        this.logger.info("Label not found, skipping removal", {
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
        logger: this.logger,
      });
    }
  }

  async createLabel(name: string): Promise<EmailLabel> {
    const label = await createLabel({
      client: this.client,
      name,
      logger: this.logger,
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
      logger: this.logger,
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
      const response = await getFiltersList({
        client: this.client,
        logger: this.logger,
      });

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
      this.logger.error("Error in Outlook getFiltersList", { error });
      throw error;
    }
  }

  async createFilter(options: {
    from: string;
    addLabelIds?: string[];
    removeLabelIds?: string[];
  }) {
    return createFilter({
      client: this.client,
      ...options,
      logger: this.logger,
    });
  }

  async createAutoArchiveFilter(options: { from: string; labelName?: string }) {
    return createAutoArchiveFilter({
      client: this.client,
      from: options.from,
      labelName: options.labelName,
      logger: this.logger,
    });
  }

  async deleteFilter(id: string) {
    return deleteFilter({ client: this.client, id, logger: this.logger });
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
    this.logger.info("getMessagesWithPagination called", {
      maxResults: options.maxResults,
      pageToken: options.pageToken,
      before: options.before?.toISOString(),
      after: options.after?.toISOString(),
    });
    this.logger.trace("getMessagesWithPagination query", {
      query: options.query,
    });

    // IMPORTANT: This is intentionally lossy!
    // Gmail-style prefixes like "subject:" can't be translated to Microsoft Graph because:
    // 1. $filter with contains(subject, ...) can't be combined with $search or date filters
    //    (causes "InefficientFilter" error)
    // 2. $search doesn't support field-specific syntax like "subject:term"
    //
    // We strip the prefixes and use plain $search which searches subject AND body.
    // This is broader than intended but still finds relevant messages.
    // If subject-specific search is needed in the future, add a dedicated method
    // that uses only $filter without $search or date filters.
    function stripGmailPrefixes(query: string): string {
      return query
        .replace(/\b(subject|from|to|label):(?:"[^"]*"|\S+)/gi, (match) => {
          // Extract the value without the prefix for searching
          const colonIndex = match.indexOf(":");
          const value = match.slice(colonIndex + 1);
          // Remove quotes if present
          return value.replace(/^"|"$/g, "");
        })
        .replace(/\s+/g, " ")
        .trim();
    }

    const searchQuery = stripGmailPrefixes(options.query || "");

    // Build date filter for Outlook (no quotes for DateTimeOffset comparison)
    const dateFilters: string[] = [];
    if (options.before) {
      dateFilters.push(`receivedDateTime lt ${options.before.toISOString()}`);
    }
    if (options.after) {
      dateFilters.push(`receivedDateTime gt ${options.after.toISOString()}`);
    }

    this.logger.info("Calling queryBatchMessages", {
      dateFilters,
      maxResults: options.maxResults || 20,
      pageToken: options.pageToken,
    });
    this.logger.trace("Search query", {
      searchQuery: searchQuery || undefined,
    });

    // Don't pass folderId - let the API return all folders except Junk/Deleted (auto-excluded)
    // Drafts are filtered out in convertMessages
    const response = await queryBatchMessages(
      this.client,
      {
        searchQuery: searchQuery || undefined,
        dateFilters,
        maxResults: options.maxResults || 20,
        pageToken: options.pageToken,
      },
      this.logger,
    );

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

    return queryMessagesWithFilters(
      this.client,
      {
        filters,
        dateFilters,
        maxResults: options.maxResults,
        pageToken: options.pageToken,
      },
      this.logger,
    );
  }

  async getThreadsWithParticipant(options: {
    participantEmail: string;
    maxThreads?: number;
  }): Promise<EmailThread[]> {
    const { participantEmail, maxThreads = 5 } = options;

    // IMPORTANT:
    // Microsoft Graph does not reliably support filtering Messages by recipient collections
    // (e.g. `toRecipients/any(...)`) and will error with:
    // "The query filter contains one or more invalid nodes."
    //
    const sanitizedEmail = sanitizeKqlValue(participantEmail);
    const searchQuery = `participants:${sanitizedEmail}`;

    const { messages } = await queryBatchMessages(
      this.client,
      {
        searchQuery,
        maxResults: Math.min(20, Math.max(10, maxThreads * 4)),
      },
      this.logger,
    );

    const participantLower = participantEmail.toLowerCase().trim();

    const relevant = messages.filter((m) => {
      const h = m.headers;

      const fromEmail = extractEmailAddress(h.from || "").toLowerCase();
      if (fromEmail === participantLower) return true;

      const toAddresses = (h.to || "")
        .split(",")
        .map((addr) => extractEmailAddress(addr.trim()).toLowerCase())
        .filter(Boolean);
      if (toAddresses.includes(participantLower)) return true;

      const ccAddresses = (h.cc || "")
        .split(",")
        .map((addr) => extractEmailAddress(addr.trim()).toLowerCase())
        .filter(Boolean);
      if (ccAddresses.includes(participantLower)) return true;

      return false;
    });

    // Extract unique conversationIds (thread IDs) from parsed messages
    const conversationIds = Array.from(
      new Set(relevant.map((m) => m.threadId).filter(Boolean)),
    ).slice(0, maxThreads);

    if (conversationIds.length === 0) {
      return [];
    }

    // Fetch full thread messages for each conversation
    const threads: EmailThread[] = [];
    for (const conversationId of conversationIds) {
      try {
        const messages = await this.getThreadMessages(conversationId);
        threads.push({
          id: conversationId,
          messages,
          snippet: messages[0]?.snippet || "",
        });
      } catch (error) {
        this.logger.warn("Failed to fetch thread messages for conversationId", {
          conversationId,
          participantEmail,
          error,
          errorCode: (error as any)?.code,
          errorStatusCode: (error as any)?.statusCode,
        });
      }
    }

    return threads;
  }

  async getDrafts(options?: { maxResults?: number }): Promise<ParsedMessage[]> {
    const response: { value: Message[] } = await this.client
      .getClient()
      .api("/me/mailFolders/drafts/messages")
      .select(MESSAGE_SELECT_FIELDS)
      .top(options?.maxResults || 50)
      .get();

    return response.value.map((msg) => convertMessage(msg));
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
      logger: this.logger,
    });
  }
  async checkIfReplySent(senderEmail: string): Promise<boolean> {
    try {
      const query = `from:me to:${senderEmail}`;
      const response = await getMessages(
        this.client,
        {
          query,
          maxResults: 1,
        },
        this.logger,
      );
      const sent = (response.messages?.length ?? 0) > 0;
      this.logger.info("Checked for sent reply", { senderEmail, sent });
      return sent;
    } catch (error) {
      this.logger.error("Error checking if reply was sent", {
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
      this.logger.info("Checking received message count", {
        senderEmail,
        threshold,
      });

      // Fetch up to the threshold number of messages
      const response = await getMessages(
        this.client,
        {
          query,
          maxResults: threshold,
        },
        this.logger,
      );
      const count = response.messages?.length ?? 0;

      this.logger.info("Received message count check result", {
        senderEmail,
        count,
      });
      return count;
    } catch (error) {
      this.logger.error("Error counting received messages", {
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

    type GraphMessage = {
      conversationId: string;
      conversationIndex?: string;
      id: string;
      bodyPreview: string;
      body: { content: string };
      from: { emailAddress: { address: string } };
      toRecipients: { emailAddress: { address: string } }[];
      receivedDateTime: string;
      subject: string;
    };

    let response: { value: GraphMessage[]; "@odata.nextLink"?: string };

    // If pageToken is a URL, fetch directly (per MS docs, don't extract $skiptoken)
    if (options.pageToken?.startsWith("http")) {
      response = await client.api(options.pageToken).get();
    } else {
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
        .select(MESSAGE_SELECT_FIELDS)
        .top(options.maxResults || 50);

      if (filter) {
        request = request.filter(filter);
      }

      // Only add ordering if we don't have a fromEmail filter to avoid complexity
      if (!fromEmail) {
        request = request.orderby("receivedDateTime DESC");
      }

      response = await request.get();
    }

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
          this.logger.warn("Message missing conversationId", {
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
      nextPageToken: response["@odata.nextLink"],
    };
  }

  async hasPreviousCommunicationsWithSenderOrDomain(options: {
    from: string;
    date: Date;
    messageId: string;
  }): Promise<boolean> {
    try {
      // Use shared logic: for public domains search by full email, for company domains search by domain
      const searchTerm = getSearchTermForSender(options.from);
      const isFullEmail = searchTerm.includes("@");

      const dateString = options.date.toISOString();

      // For domain matching, use $search instead of $filter since endsWith has limitations
      // For exact email matching, use $filter with eq (case-insensitive for email addresses)
      if (!isFullEmail) {
        // Domain-based search - use $search for both sent and received
        const escapedKqlDomain = searchTerm
          .replace(/\\/g, "\\\\")
          .replace(/"/g, '\\"');

        const [sentResponse, receivedResponse] = await Promise.all([
          this.client
            .getClient()
            .api("/me/messages")
            .search(`"to:@${escapedKqlDomain}"`)
            .top(5)
            .select("id,sentDateTime")
            .get()
            .catch((error) => {
              this.logger.error("Error checking sent messages (domain)", {
                error,
              });
              return { value: [] };
            }),

          this.client
            .getClient()
            .api("/me/messages")
            .search(`"from:@${escapedKqlDomain}"`)
            .top(5)
            .select("id,receivedDateTime")
            .get()
            .catch((error) => {
              this.logger.error("Error checking received messages (domain)", {
                error,
              });
              return { value: [] };
            }),
        ]);

        // Filter by date since $search doesn't support date filtering well
        const validSentMessages = (sentResponse.value || []).filter(
          (msg: Message) => {
            if (!msg.sentDateTime) return false;
            return new Date(msg.sentDateTime) < options.date;
          },
        );

        const validReceivedMessages = (receivedResponse.value || []).filter(
          (msg: Message) => {
            if (!msg.receivedDateTime) return false;
            return new Date(msg.receivedDateTime) < options.date;
          },
        );

        const messages = [...validSentMessages, ...validReceivedMessages];
        return messages.some((message) => message.id !== options.messageId);
      }

      // Full email search - use $filter for received, $search for sent
      const escapedSearchTerm = escapeODataString(searchTerm);
      const receivedFilter = `from/emailAddress/address eq '${escapedSearchTerm}' and receivedDateTime lt ${dateString}`;

      // Use $search for sent messages as $filter on toRecipients is unreliable
      const escapedKqlSearchTerm = searchTerm
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"');
      const sentSearch = `"to:${escapedKqlSearchTerm}"`;

      const [sentResponse, receivedResponse] = await Promise.all([
        this.client
          .getClient()
          .api("/me/messages")
          .search(sentSearch)
          .top(5) // Increase top to account for potential future messages we filter out
          .select("id,sentDateTime")
          .get()
          .catch((error) => {
            this.logger.error("Error checking sent messages", {
              error,
              search: sentSearch,
            });
            return { value: [] };
          }),

        this.client
          .getClient()
          .api("/me/messages")
          .filter(receivedFilter)
          .top(2)
          .select("id")
          .get()
          .catch((error) => {
            this.logger.error("Error checking received messages", {
              error,
              filter: receivedFilter,
            });
            return { value: [] };
          }),
      ]);

      // Filter sent messages by date since $search doesn't support date filtering well
      const validSentMessages = (sentResponse.value || []).filter(
        (msg: Message) => {
          if (!msg.sentDateTime) return false;
          return new Date(msg.sentDateTime) < options.date;
        },
      );

      const messages = [
        ...validSentMessages,
        ...(receivedResponse.value || []),
      ];

      return messages.some((message) => message.id !== options.messageId);
    } catch (error) {
      this.logger.error("Error checking previous communications", {
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
    return getThreadsFromSenderWithSubject(
      this.client,
      sender,
      limit,
      this.logger,
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
      logger: options.logger || this.logger,
    });
  }

  async watchEmails(): Promise<{
    expirationDate: Date;
    subscriptionId?: string;
  } | null> {
    const subscription = await watchOutlook(
      this.client.getClient(),
      this.logger,
    );

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
      this.logger.warn("No subscription ID provided for Outlook unwatch");
      return;
    }
    await unwatchOutlook(this.client.getClient(), subscriptionId, this.logger);
  }

  isReplyInThread(message: ParsedMessage): boolean {
    try {
      return atob(message.conversationIndex || "").length > 22;
    } catch (error) {
      this.logger.warn("Invalid conversationIndex base64", {
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
      logger: this.logger,
    });
  }

  async archiveMessage(messageId: string): Promise<void> {
    try {
      await this.client.getClient().api(`/me/messages/${messageId}/move`).post({
        destinationId: "archive",
      });

      this.logger.info("Message archived successfully", {
        messageId,
      });
    } catch (error) {
      this.logger.error("Failed to archive message", {
        messageId,
        error,
      });
      throw error;
    }
  }

  async bulkArchiveFromSenders(
    fromEmails: string[],
    ownerEmail: string,
    emailAccountId: string,
  ): Promise<void> {
    await moveMessagesForSenders({
      client: this.client,
      senders: fromEmails,
      destinationId: "archive",
      action: "archive",
      ownerEmail,
      emailAccountId,
      logger: this.logger,
    });
  }

  async bulkTrashFromSenders(
    fromEmails: string[],
    ownerEmail: string,
    emailAccountId: string,
  ): Promise<void> {
    await moveMessagesForSenders({
      client: this.client,
      senders: fromEmails,
      destinationId: "deleteditems",
      action: "trash",
      ownerEmail,
      emailAccountId,
      logger: this.logger,
    });
  }

  async getOrCreateFolderIdByName(folderName: string): Promise<string> {
    return await getOrCreateOutlookFolderIdByName(
      this.client,
      folderName,
      this.logger,
    );
  }

  async getFolders() {
    return await getOutlookFolderTree(this.client, undefined, this.logger);
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

      this.logger.info("No signature found in recent sent emails");
      return [];
    } catch (error) {
      this.logger.error("Failed to extract signature from sent emails", {
        error,
      });
      return [];
    }
  }
}
