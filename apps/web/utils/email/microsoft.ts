import type { Message } from "@microsoft/microsoft-graph-types";
import type { OutlookClient } from "@/utils/outlook/client";
import type { ParsedMessage } from "@/utils/types";
import type { Attachment as MailAttachment } from "nodemailer/lib/mailer";
import {
  getMessage,
  getMessages,
  queryBatchMessages,
  queryMessagesWithAttachments,
  getCategoryMap,
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
import type { ThreadsQuery } from "@/utils/threads/validation";
import { getLatestNonDraftMessage } from "@/utils/email/latest-message";
import { getMessageTimestamp } from "@/utils/email/message-timestamp";
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
  markStarredMessage,
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
import { getDraft, deleteDraft, sendDraft } from "@/utils/outlook/draft";
import {
  getFiltersList,
  createFilter,
  deleteFilter,
  createAutoArchiveFilter,
} from "@/utils/outlook/filter";
import { queryMessagesWithFilters } from "@/utils/outlook/message";
import { resolveMicrosoftGraphNextLink } from "@/utils/outlook/page-token";
import type {
  EmailProvider,
  EmailThread,
  EmailLabel,
  EmailFilter,
  EmailSignature,
  SentMessagePage,
} from "@/utils/email/types";
import { unwatchOutlook, watchOutlook } from "@/utils/outlook/watch";
import { escapeODataString } from "@/utils/outlook/odata-escape";
import {
  extractEmailAddress,
  getSearchTermForSender,
  splitRecipientList,
} from "@/utils/email";
import {
  getOrCreateOutlookFolderIdByName,
  getOutlookFolderTree,
} from "@/utils/outlook/folders";
import { extractSignatureFromHtml } from "@/utils/email/signature-extraction";
import { moveMessagesForSenders } from "@/utils/outlook/batch";
import { withOutlookRetry } from "@/utils/outlook/retry";
import { logErrorWithDedupe } from "@/utils/log-error-with-dedupe";
import { shouldSkipAutoDraft } from "@/utils/auto-draft";

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
        // biome-ignore lint/suspicious/noExplicitAny: existing loose external shape
        errorCode: (error as any)?.code,
      });
      throw error;
    }
  }

  async getLabels(_options?: {
    includeHidden?: boolean;
  }): Promise<EmailLabel[]> {
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

  private async resolveCategoryWithFallback(
    labelId: string,
    labelName: string | null,
  ): Promise<{ category: EmailLabel | null; usedFallback: boolean }> {
    let category = await this.getLabelById(labelId);
    let usedFallback = false;

    if (!category && labelName) {
      this.logger.warn("Category not found by ID, trying by name", {
        labelId,
        labelName,
      });
      category = await this.getLabelByName(labelName);
      usedFallback = true;
    }

    return { category, usedFallback };
  }

  async getMessage(messageId: string): Promise<ParsedMessage> {
    return getMessage(messageId, this.client, this.logger);
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

    const folderIds = await getFolderIds(this.client, this.logger, {
      includeDrafts: false,
    });
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
    const folderIds = await getFolderIds(this.client, this.logger, {
      includeDrafts: false,
    });

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
    const folderIds = await getFolderIds(this.client, this.logger, {
      includeDrafts: false,
    });

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
    pageToken?: string;
  }): Promise<SentMessagePage> {
    const { maxResults, after, before, pageToken } = options;

    const buildRequest = () => {
      // The nextLink already encodes top/skip/filter from the original request.
      const nextLink = resolveMicrosoftGraphNextLink(pageToken);
      if (nextLink) {
        return this.client.getClient().api(nextLink);
      }

      const filters: string[] = [];
      if (after) filters.push(`sentDateTime ge ${after.toISOString()}`);
      if (before) filters.push(`sentDateTime le ${before.toISOString()}`);

      let request = this.client
        .getClient()
        .api("/me/mailFolders('sentitems')/messages")
        .select("id,conversationId")
        .top(maxResults)
        .orderby("sentDateTime desc");

      if (filters.length) {
        request = request.filter(filters.join(" and "));
      }

      return request;
    };

    const response: {
      value?: { id?: string; conversationId?: string }[];
      "@odata.nextLink"?: string;
    } = await withOutlookRetry(() => buildRequest().get(), this.logger);

    return {
      messages: (response.value || []).flatMap((m) =>
        m.id && m.conversationId
          ? [{ id: m.id, threadId: m.conversationId }]
          : [],
      ),
      nextPageToken: response["@odata.nextLink"],
    };
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
    const { category, usedFallback } = await this.resolveCategoryWithFallback(
      labelId,
      labelName,
    );

    if (!category) {
      if (!labelName) {
        this.logger.warn(
          "Category was deleted but labelName is not available for recreation. Skipping label action.",
          { labelId },
        );
        return {};
      }
      await logErrorWithDedupe({
        logger: this.logger,
        message: "Category not found",
        error: new Error("Category not found while labeling message"),
        context: { labelId },
        dedupeKeyParts: {
          scope: "email/microsoft",
          operation: "label-message-category-lookup",
          labelId,
        },
        ttlSeconds: 15 * 60,
        summaryIntervalSeconds: 5 * 60,
      });
      throw new Error(
        `Category with ID ${labelId}${labelName ? ` or name ${labelName}` : ""} not found`,
      );
    }

    // Get current message categories to avoid replacing them
    const message = await withOutlookRetry(
      () =>
        this.client
          .getClient()
          .api(`/me/messages/${messageId}`)
          .select("categories")
          .get(),
      this.logger,
    );

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

  async starMessage(messageId: string): Promise<void> {
    await markStarredMessage({
      client: this.client,
      messageId,
      logger: this.logger,
    });
  }

  async getDraft(draftId: string): Promise<ParsedMessage | null> {
    return getDraft({ client: this.client, draftId, logger: this.logger });
  }

  async deleteDraft(draftId: string): Promise<void> {
    await deleteDraft({ client: this.client, draftId, logger: this.logger });
  }

  async sendDraft(
    draftId: string,
  ): Promise<{ messageId: string; threadId: string }> {
    return sendDraft({ client: this.client, draftId, logger: this.logger });
  }

  async createDraft(params: {
    to: string;
    subject: string;
    messageHtml: string;
    replyToMessageId?: string;
  }): Promise<{ id: string }> {
    this.logger.info("Creating draft", {
      replyToMessageId: params.replyToMessageId,
    });

    // For threading, use createReply on the replyToMessageId
    if (params.replyToMessageId) {
      const draft = await withOutlookRetry(
        () =>
          this.client
            .getClient()
            .api(`/me/messages/${params.replyToMessageId}/createReply`)
            .post({}),
        this.logger,
      );

      // Update the draft with our content
      await withOutlookRetry(
        () =>
          this.client
            .getClient()
            .api(`/me/messages/${draft.id}`)
            .patch({
              body: { contentType: "html", content: params.messageHtml },
              subject: params.subject,
              toRecipients: [{ emailAddress: { address: params.to } }],
            }),
        this.logger,
      );

      this.logger.info("Created threaded draft", { draftId: draft.id });
      return { id: draft.id };
    }

    // Otherwise create standalone draft
    const draft = await withOutlookRetry(
      () =>
        this.client
          .getClient()
          .api("/me/messages")
          .post({
            subject: params.subject,
            body: { contentType: "html", content: params.messageHtml },
            toRecipients: [{ emailAddress: { address: params.to } }],
          }),
      this.logger,
    );

    this.logger.info("Created standalone draft", { draftId: draft.id });
    return { id: draft.id };
  }

  async updateDraft(
    draftId: string,
    params: {
      messageHtml?: string;
      subject?: string;
    },
  ): Promise<void> {
    this.logger.info("Updating draft", { draftId });

    const body: Record<string, unknown> = {};
    if (params.messageHtml) {
      body.body = { contentType: "html", content: params.messageHtml };
    }
    if (params.subject) {
      body.subject = params.subject;
    }

    await withOutlookRetry(
      () => this.client.getClient().api(`/me/messages/${draftId}`).patch(body),
      this.logger,
    );

    this.logger.info("Draft updated", { draftId });
  }

  async draftEmail(
    email: ParsedMessage,
    args: {
      to?: string;
      subject?: string;
      content: string;
      cc?: string;
      bcc?: string;
      attachments?: MailAttachment[];
    },
    userEmail: string,
    executedRule?: { id: string; threadId: string; emailAccountId: string },
  ): Promise<{ draftId: string }> {
    if (shouldSkipAutoDraft({ logger: this.logger, source: "microsoft" })) {
      return { draftId: "" };
    }

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

  async replyToEmail(
    email: ParsedMessage,
    content: string,
    options?: {
      replyTo?: string;
      from?: string;
      attachments?: MailAttachment[];
    },
  ): Promise<void> {
    await replyToEmail(this.client, email, content, this.logger, options);
  }

  async sendEmail(args: {
    to: string;
    cc?: string;
    bcc?: string;
    subject: string;
    messageText: string;
    attachments?: MailAttachment[];
  }): Promise<void> {
    await sendEmailWithPlainText(this.client, args, this.logger);
  }

  async sendEmailWithHtml(body: {
    replyToEmail?: {
      threadId: string;
      headerMessageId: string;
      references?: string;
      messageId?: string;
    };
    to: string;
    from?: string;
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
    args: {
      to: string;
      cc?: string;
      bcc?: string;
      content?: string;
      from?: string;
    },
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
      // biome-ignore lint/suspicious/noExplicitAny: existing loose external shape
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
      const folderIds = await getFolderIds(this.client, this.logger, {
        includeDrafts: false,
      });
      const inboxFolderId = folderIds.inbox;

      if (!inboxFolderId) {
        throw new Error("Could not resolve inbox folder ID");
      }

      const escapedThreadId = escapeODataString(threadId);

      const response = await client
        .api("/me/messages")
        .filter(
          `conversationId eq '${escapedThreadId}' and parentFolderId eq '${escapeODataString(inboxFolderId)}'`,
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
    inboxOnly?: boolean;
    unreadOnly?: boolean;
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

    let inboxFolderId: string | undefined;
    if (options.inboxOnly) {
      const folderIds = await getFolderIds(this.client, this.logger, {
        includeDrafts: false,
      });
      inboxFolderId = folderIds.inbox;
    }

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
        folderId: inboxFolderId,
      },
      this.logger,
    );

    const filteredMessages = options.unreadOnly
      ? response.messages.filter((message) =>
          message.labelIds?.some(
            (labelId) => labelId.toLowerCase() === "unread",
          ),
        )
      : response.messages;

    return {
      messages: filteredMessages || [],
      nextPageToken: response.nextPageToken,
    };
  }

  async searchMessages(options: {
    query: string;
    maxResults?: number;
    pageToken?: string;
  }): Promise<{ messages: ParsedMessage[]; nextPageToken?: string }> {
    const response = await queryBatchMessages(
      this.client,
      {
        searchQuery: options.query,
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

  async getMessagesWithAttachments(options: {
    maxResults?: number;
    pageToken?: string;
  }): Promise<{ messages: ParsedMessage[]; nextPageToken?: string }> {
    return queryMessagesWithAttachments(
      this.client,
      {
        maxResults: options.maxResults,
        pageToken: options.pageToken,
      },
      this.logger,
    );
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
    const maxSearchResults = Math.min(20, Math.max(10, maxThreads * 4));

    // IMPORTANT:
    // Microsoft Graph does not reliably support filtering Messages by recipient collections
    // (e.g. `toRecipients/any(...)`) and will error with:
    // "The query filter contains one or more invalid nodes."
    //
    const sanitizedEmail = sanitizeKqlValue(participantEmail);
    const searchQuery = `participants:${sanitizedEmail}`;

    const { messages, nextPageToken } = await queryBatchMessages(
      this.client,
      {
        searchQuery,
        maxResults: maxSearchResults,
      },
      this.logger,
    );

    const participantLower = participantEmail.toLowerCase().trim();
    const relevant = filterMessagesForParticipant(messages, participantLower);

    // Extract unique conversationIds (thread IDs) from parsed messages
    const conversationIds = getUniqueThreadIds(relevant, maxThreads);

    this.logger.info("Outlook participant search completed", {
      rawMessageCount: messages.length,
      exactParticipantMessageCount: relevant.length,
      threadCount: conversationIds.length,
      hasMorePages: !!nextPageToken,
    });

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
          error,
          // biome-ignore lint/suspicious/noExplicitAny: existing loose external shape
          errorCode: (error as any)?.code,
          // biome-ignore lint/suspicious/noExplicitAny: existing loose external shape
          errorStatusCode: (error as any)?.statusCode,
        });
      }
    }

    return threads;
  }

  async getThreadsWithLabel(options: {
    labelId: string;
    maxResults?: number;
  }): Promise<EmailThread[]> {
    const { labelId, maxResults = 100 } = options;

    const category = await this.getLabelById(labelId);
    if (!category) {
      this.logger.warn("Category not found", { labelId });
      return [];
    }

    const categoryName = category.name;
    if (!categoryName) {
      this.logger.warn("Category has no name", { labelId });
      return [];
    }

    const escapedCategoryName = escapeODataString(categoryName);
    const filter = `categories/any(c:c eq '${escapedCategoryName}')`;

    const response = await this.client
      .getClient()
      .api("/me/messages")
      .filter(filter)
      .select(MESSAGE_SELECT_FIELDS)
      .top(maxResults)
      .orderby("receivedDateTime DESC")
      .get();

    const messagesByThread = new Map<string, ParsedMessage[]>();

    for (const message of response.value || []) {
      if (!message.conversationId) continue;
      if (message.isDraft) continue;

      const parsed = convertMessage(message);
      const existing = messagesByThread.get(message.conversationId) || [];
      existing.push(parsed);
      messagesByThread.set(message.conversationId, existing);
    }

    return Array.from(messagesByThread.entries()).map(
      ([threadId, messages]) => ({
        id: threadId,
        messages: messages.sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
        ),
        snippet: messages[0]?.snippet || "",
      }),
    );
  }

  async getLatestMessageFromThreadSnapshot(
    threadSnapshot: Pick<EmailThread, "id" | "messages">,
  ): Promise<ParsedMessage | null> {
    return this.getLatestMessageInThread(threadSnapshot.id);
  }

  async getLatestMessageInThread(
    threadId: string,
  ): Promise<ParsedMessage | null> {
    const escapedThreadId = escapeODataString(threadId);
    const response = await this.client
      .getClient()
      .api("/me/messages")
      .filter(`conversationId eq '${escapedThreadId}'`)
      .select(MESSAGE_SELECT_FIELDS)
      .get();

    const parsedMessages: ParsedMessage[] = (response.value || [])
      .filter((message: Message) => !message.isDraft)
      .map((message: Message) => convertMessage(message));
    if (parsedMessages.length === 0) return null;

    const latestMessage = getLatestNonDraftMessage({
      messages: parsedMessages,
      getTimestamp: getMessageTimestamp,
    });
    if (!latestMessage) return null;

    return latestMessage;
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
      this.logger.warn("Error checking if reply was sent", {
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
      this.logger.warn("Error counting received messages", {
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
      labelIds,
      excludeLabelNames,
    } = options.query || {};

    const client = this.client.getClient();
    const hasExplicitLabelFilters = Boolean(labelId || labelIds?.length);
    const requiredLabelIds = getRequiredOutlookThreadLabelIds({
      labelId,
      labelIds,
      type,
    });
    const requiredLabelIdsForLocalFiltering = hasExplicitLabelFilters
      ? requiredLabelIds
      : undefined;
    const resolvedFolderIds = await getFolderIds(this.client, this.logger, {
      includeDrafts: false,
    });
    const cachedCategoryMap = this.client.getCategoryMapCache() || undefined;
    const needsCategoryMapForFiltering = shouldFetchOutlookCategoryMap({
      excludeLabelNames,
      requiredLabelIds: requiredLabelIdsForLocalFiltering,
      folderIds: resolvedFolderIds,
    });
    let categoryMap = needsCategoryMapForFiltering
      ? await getCategoryMap(this.client, this.logger)
      : cachedCategoryMap;
    const { categoryMap: ensuredCategoryMap, unresolvedRequiredLabelIds } =
      await ensureOutlookRequiredCategoryMap({
        client: this.client,
        logger: this.logger,
        requiredLabelIds: requiredLabelIdsForLocalFiltering,
        folderIds: resolvedFolderIds,
        categoryMap,
      });
    categoryMap = ensuredCategoryMap;
    const effectiveRequiredLabelIdsForLocalFiltering =
      requiredLabelIdsForLocalFiltering?.filter(
        (labelId) => !unresolvedRequiredLabelIds.includes(labelId),
      );
    const excludedLabelIds = getExcludedOutlookThreadLabelIds(
      excludeLabelNames,
      categoryMap,
    );
    const requiresLocalLabelFiltering = Boolean(
      excludedLabelIds.size ||
        effectiveRequiredLabelIdsForLocalFiltering?.length,
    );
    const maxResults = options.maxResults || 50;

    const fetchThreadPage = async (pageToken?: string) => {
      const nextLink = resolveMicrosoftGraphNextLink(pageToken);
      if (nextLink) {
        return await client.api(nextLink).get();
      }

      // Determine endpoint and build filters based on query type
      let endpoint = "/me/messages";
      const filters: string[] = [];

      // Route to appropriate endpoint based on type
      // parentFolderId on messages is a GUID, not a well-known name — always resolve
      if (type === "sent" && !hasExplicitLabelFilters) {
        endpoint = "/me/mailFolders('sentitems')/messages";
      } else {
        if (labelId) {
          const labelFilter = await resolveOutlookThreadQueryFilter({
            client: this.client,
            folderIds: resolvedFolderIds,
            labelId,
            logger: this.logger,
          });
          if (labelFilter) filters.push(labelFilter);
        } else if (!hasExplicitLabelFilters) {
          const defaultFolderFilter = getDefaultOutlookThreadFolderFilter({
            folderIds: resolvedFolderIds,
            type,
          });
          if (defaultFolderFilter) filters.push(defaultFolderFilter);
        }
      }

      if (fromEmail) {
        const escapedEmail = escapeODataString(fromEmail);
        filters.push(`from/emailAddress/address eq '${escapedEmail}'`);
      }

      if (after) {
        filters.push(`receivedDateTime gt ${after.toISOString()}`);
      }

      if (before) {
        filters.push(`receivedDateTime lt ${before.toISOString()}`);
      }

      if (isUnread) {
        filters.push("isRead eq false");
      }

      const filter = filters.length > 0 ? filters.join(" and ") : undefined;

      let request = client
        .api(endpoint)
        .select(MESSAGE_SELECT_FIELDS)
        .top(maxResults);

      if (filter) {
        request = request.filter(filter);
      }

      if (!fromEmail) {
        request = request.orderby("receivedDateTime DESC");
      }

      return await request.get();
    };

    const localPageState = parseOutlookThreadPageToken(options.pageToken);
    let nextPageTokenToFetch =
      localPageState?.pageToken ?? (options.pageToken || undefined);
    let nextPageToken: string | undefined;
    const collectedMessages: Message[] = [];
    const fetchedPages: Array<{ pageToken?: string; nextPageToken?: string }> =
      [];
    const threadFirstPageIndex = new Map<string, number>();

    do {
      const response = await fetchThreadPage(nextPageTokenToFetch);
      const currentPageIndex = fetchedPages.length;
      fetchedPages.push({
        pageToken: nextPageTokenToFetch,
        nextPageToken: response["@odata.nextLink"],
      });

      for (const message of response.value) {
        if (
          message.conversationId &&
          !threadFirstPageIndex.has(message.conversationId)
        ) {
          threadFirstPageIndex.set(message.conversationId, currentPageIndex);
        }
      }

      collectedMessages.push(...response.value);
      nextPageToken = response["@odata.nextLink"];

      if (!requiresLocalLabelFiltering || !nextPageToken) break;

      const matchedThreads = buildOutlookThreadsFromMessages({
        messages: collectedMessages,
        fromEmail,
        folderIds: resolvedFolderIds,
        categoryMap,
        excludedLabelIds,
        requiredLabelIds: effectiveRequiredLabelIdsForLocalFiltering,
        logger: this.logger,
      });

      if (matchedThreads.length >= maxResults) break;

      nextPageTokenToFetch = nextPageToken;
    } while (nextPageTokenToFetch);

    let threads = buildOutlookThreadsFromMessages({
      messages: collectedMessages,
      fromEmail,
      folderIds: resolvedFolderIds,
      categoryMap,
      excludedLabelIds,
      requiredLabelIds: effectiveRequiredLabelIdsForLocalFiltering,
      logger: this.logger,
    });

    if (localPageState?.skipThreadIds.length) {
      const skippedThreadIds = new Set(localPageState.skipThreadIds);
      threads = threads.filter((thread) => {
        const firstPageIndex = threadFirstPageIndex.get(thread.id);
        return !(firstPageIndex === 0 && skippedThreadIds.has(thread.id));
      });
    }

    if (threads.length > maxResults && fetchedPages.length > 0) {
      const resumePageIndex =
        threadFirstPageIndex.get(threads[maxResults]!.id) ??
        fetchedPages.length - 1;
      const resumePage = fetchedPages[resumePageIndex];
      const skipThreadIds = threads
        .slice(0, maxResults)
        .filter(
          (thread) => threadFirstPageIndex.get(thread.id) === resumePageIndex,
        )
        .map((thread) => thread.id);

      nextPageToken = skipThreadIds.length
        ? encodeOutlookThreadPageToken({
            pageToken: resumePage?.pageToken,
            skipThreadIds,
          })
        : resumePage?.pageToken;
    }

    threads = threads.slice(0, maxResults);

    return {
      threads,
      nextPageToken,
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
              this.logger.warn("Error checking sent messages (domain)", {
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
              this.logger.warn("Error checking received messages (domain)", {
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
            this.logger.warn("Error checking sent messages", {
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
            this.logger.warn("Error checking received messages", {
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
      this.logger.warn("Error checking previous communications", {
        error,
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

  async bulkArchiveSenderOrThrow(
    fromEmail: string,
    ownerEmail: string,
    emailAccountId: string,
  ): Promise<number> {
    return moveMessagesForSenders({
      client: this.client,
      senders: [fromEmail],
      destinationId: "archive",
      action: "archive",
      ownerEmail,
      emailAccountId,
      logger: this.logger,
      continueOnError: false,
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

  async getInboxStats(): Promise<{ total: number; unread: number }> {
    const folder = await withOutlookRetry(
      () =>
        this.client
          .getClient()
          .api("/me/mailFolders('inbox')")
          .select("totalItemCount,unreadItemCount")
          .get(),
      this.logger,
    );
    return {
      total: folder.totalItemCount ?? 0,
      unread: folder.unreadItemCount ?? 0,
    };
  }
}

// Maps OutlookLabel names (e.g. "INBOX") to WELL_KNOWN_FOLDERS keys used in getFolderIds()
const LABEL_TO_FOLDER_KEY: Record<string, string> = {
  INBOX: "inbox",
  SENT: "sentitems",
  DRAFT: "drafts",
  ARCHIVE: "archive",
  TRASH: "deleteditems",
  SPAM: "junkemail",
};

function resolveOutlookFolderId(
  labelId: string,
  folderIds: Record<string, string>,
): string | undefined {
  const folderKey = LABEL_TO_FOLDER_KEY[labelId.toUpperCase()];
  return folderKey ? folderIds[folderKey] : undefined;
}

function filterMessagesForParticipant(
  messages: ParsedMessage[],
  participantLower: string,
): ParsedMessage[] {
  return messages.filter((message) => {
    const headers = message.headers;

    const fromEmail = extractEmailAddress(headers.from || "").toLowerCase();
    if (fromEmail === participantLower) return true;

    const toAddresses = splitRecipientList(headers.to || "")
      .map((addr) => extractEmailAddress(addr).toLowerCase())
      .filter(Boolean);
    if (toAddresses.includes(participantLower)) return true;

    const ccAddresses = splitRecipientList(headers.cc || "")
      .map((addr) => extractEmailAddress(addr).toLowerCase())
      .filter(Boolean);
    if (ccAddresses.includes(participantLower)) return true;

    return false;
  });
}

function getUniqueThreadIds(
  messages: ParsedMessage[],
  maxThreads: number,
): string[] {
  return Array.from(
    new Set(messages.map((message) => message.threadId).filter(Boolean)),
  ).slice(0, maxThreads);
}

function getRequiredOutlookThreadLabelIds({
  labelId,
  labelIds,
  type,
}: Pick<ThreadsQuery, "labelId" | "labelIds" | "type">): string[] | undefined {
  if (labelId) return [labelId];
  if (labelIds?.length) return labelIds;

  switch (type) {
    case "all":
      return;
    case "archive":
      return ["ARCHIVE"];
    case "draft":
      return ["DRAFT"];
    case "sent":
      return ["SENT"];
    case "spam":
      return ["SPAM"];
    case "trash":
      return ["TRASH"];
    case "unread":
      return ["UNREAD"];
    case "inbox":
    case undefined:
    case null:
    case "undefined":
    case "null":
      return ["INBOX"];
    default:
      return [type];
  }
}

function getDefaultOutlookThreadFolderFilter({
  folderIds,
  type,
}: {
  folderIds: Record<string, string>;
  type?: string | null;
}): string | undefined {
  switch (type) {
    case "all": {
      const folderClauses: string[] = [];
      if (folderIds.inbox) {
        folderClauses.push(
          `parentFolderId eq '${escapeODataString(folderIds.inbox)}'`,
        );
      }
      if (folderIds.archive) {
        folderClauses.push(
          `parentFolderId eq '${escapeODataString(folderIds.archive)}'`,
        );
      }
      return folderClauses.length > 0
        ? `(${folderClauses.join(" or ")})`
        : undefined;
    }
    case "archive":
      return folderIds.archive
        ? `parentFolderId eq '${escapeODataString(folderIds.archive)}'`
        : undefined;
    case "draft":
      return folderIds.drafts
        ? `parentFolderId eq '${escapeODataString(folderIds.drafts)}'`
        : undefined;
    case "spam":
      return folderIds.junkemail
        ? `parentFolderId eq '${escapeODataString(folderIds.junkemail)}'`
        : undefined;
    case "trash":
      return folderIds.deleteditems
        ? `parentFolderId eq '${escapeODataString(folderIds.deleteditems)}'`
        : undefined;
    case "unread":
    case "inbox":
    case undefined:
    case null:
    case "undefined":
    case "null":
      return folderIds.inbox
        ? `parentFolderId eq '${escapeODataString(folderIds.inbox)}'`
        : undefined;
    default:
      return;
  }
}

function getExcludedOutlookThreadLabelIds(
  excludeLabelNames: string[] | null | undefined,
  categoryMap?: Map<string, string>,
): Set<string> {
  const excludedLabels = new Set<string>();
  if (!excludeLabelNames?.length) return excludedLabels;

  const categoryEntries = Array.from(categoryMap?.entries() || []);

  for (const labelName of excludeLabelNames) {
    const trimmedLabelName = labelName.trim();
    if (!trimmedLabelName) continue;

    excludedLabels.add(trimmedLabelName);
    excludedLabels.add(trimmedLabelName.toUpperCase());

    for (const [categoryName, categoryId] of categoryEntries) {
      if (categoryName.toLowerCase() === trimmedLabelName.toLowerCase()) {
        excludedLabels.add(categoryId);
      }
    }
  }

  return excludedLabels;
}

function shouldFetchOutlookCategoryMap({
  excludeLabelNames,
  requiredLabelIds,
  folderIds,
}: {
  excludeLabelNames: string[] | null | undefined;
  requiredLabelIds: string[] | undefined;
  folderIds?: Record<string, string>;
}): boolean {
  if (excludeLabelNames?.length) return true;
  if (!requiredLabelIds?.length) return false;

  return requiredLabelIds.some(
    (labelId) => !isOutlookFolderBackedLabelId(labelId, folderIds),
  );
}

function doesOutlookThreadLabelRequireFolderIds(labelId: string): boolean {
  return (
    labelId === "INBOX" ||
    labelId === "SENT" ||
    labelId === "ARCHIVE" ||
    labelId === "TRASH" ||
    labelId === "SPAM"
  );
}

function isOutlookFolderBackedLabelId(
  labelId: string,
  folderIds?: Record<string, string>,
): boolean {
  if (doesOutlookThreadLabelRequireFolderIds(labelId)) return true;
  return folderIds ? Object.values(folderIds).includes(labelId) : false;
}

function messageHasAllThreadLabels(
  message: Pick<ParsedMessage, "labelIds">,
  requiredLabelIds: string[],
): boolean {
  if (!requiredLabelIds.length) return true;

  const messageLabelIds = new Set(message.labelIds || []);
  return requiredLabelIds.every((labelId) => messageLabelIds.has(labelId));
}

function messageHasAnyThreadLabel(
  message: Pick<ParsedMessage, "labelIds">,
  labelIds: Set<string>,
): boolean {
  if (!message.labelIds?.length || labelIds.size === 0) return false;
  return message.labelIds.some((labelId) => labelIds.has(labelId));
}

async function resolveOutlookThreadQueryFilter({
  client,
  folderIds,
  labelId,
  logger,
}: {
  client: OutlookClient;
  folderIds: Record<string, string>;
  labelId: string;
  logger: Logger;
}): Promise<string | undefined> {
  const resolvedFolderId = resolveOutlookFolderId(labelId, folderIds);
  if (resolvedFolderId) {
    return `parentFolderId eq '${escapeODataString(resolvedFolderId)}'`;
  }

  if (Object.values(folderIds).includes(labelId)) {
    return `parentFolderId eq '${escapeODataString(labelId)}'`;
  }

  try {
    const label = await getLabelById({ client, id: labelId });
    if (label.displayName) {
      return `categories/any(c:c eq '${escapeODataString(label.displayName)}')`;
    }
    logger.warn("Outlook label lookup returned no displayName", {
      labelId,
    });
    return;
  } catch (error) {
    logger.warn("Failed to resolve Outlook category filter", {
      labelId,
      error,
    });
    return;
  }
}

function buildOutlookThreadsFromMessages({
  messages,
  fromEmail,
  folderIds,
  categoryMap,
  excludedLabelIds,
  requiredLabelIds,
  logger,
}: {
  messages: Message[];
  fromEmail?: string | null;
  folderIds: Record<string, string>;
  categoryMap?: Map<string, string>;
  excludedLabelIds: Set<string>;
  requiredLabelIds?: string[];
  logger: Logger;
}): EmailThread[] {
  const sortedMessages = fromEmail
    ? [...messages].sort(
        (a, b) =>
          new Date(b.receivedDateTime || 0).getTime() -
          new Date(a.receivedDateTime || 0).getTime(),
      )
    : messages;

  const messagesByThread = new Map<string, Message[]>();

  for (const message of sortedMessages) {
    if (!message.conversationId) {
      logger.warn("Message missing conversationId", {
        messageId: message.id,
      });
      continue;
    }

    const threadMessages = messagesByThread.get(message.conversationId) || [];
    threadMessages.push(message);
    messagesByThread.set(message.conversationId, threadMessages);
  }

  return Array.from(messagesByThread.entries())
    .filter(([_threadId, threadMessages]) => threadMessages.length > 0)
    .map(([threadId, threadMessages]) => {
      const parsedMessages = threadMessages.map((message) =>
        convertMessage(message, folderIds, categoryMap, logger),
      );

      return {
        id: threadId,
        messages: parsedMessages,
        snippet: parsedMessages[0]?.snippet || "",
      };
    })
    .filter((thread) => {
      if (
        excludedLabelIds.size > 0 &&
        thread.messages.some((message) =>
          messageHasAnyThreadLabel(message, excludedLabelIds),
        )
      ) {
        return false;
      }

      if (!requiredLabelIds?.length) return true;

      return thread.messages.some((message) =>
        messageHasAllThreadLabels(message, requiredLabelIds),
      );
    });
}

async function ensureOutlookRequiredCategoryMap({
  client,
  logger,
  requiredLabelIds,
  folderIds,
  categoryMap,
}: {
  client: OutlookClient;
  logger: Logger;
  requiredLabelIds?: string[];
  folderIds: Record<string, string>;
  categoryMap?: Map<string, string>;
}): Promise<{
  categoryMap?: Map<string, string>;
  unresolvedRequiredLabelIds: string[];
}> {
  if (!requiredLabelIds?.length) {
    return {
      categoryMap,
      unresolvedRequiredLabelIds: [],
    };
  }

  const missingCategoryIds = requiredLabelIds.filter(
    (labelId) =>
      !isOutlookFolderBackedLabelId(labelId, folderIds) &&
      !Array.from(categoryMap?.values() || []).includes(labelId),
  );

  if (!missingCategoryIds.length) {
    return {
      categoryMap,
      unresolvedRequiredLabelIds: [],
    };
  }

  const resolvedCategoryMap = new Map(categoryMap?.entries() || []);
  const unresolvedRequiredLabelIds: string[] = [];

  for (const labelId of missingCategoryIds) {
    try {
      const label = await getLabelById({ client, id: labelId });
      if (label.displayName) {
        resolvedCategoryMap.set(label.displayName, labelId);
      } else {
        logger.warn("Outlook required category has no displayName", {
          labelId,
        });
        unresolvedRequiredLabelIds.push(labelId);
      }
    } catch (error) {
      logger.warn("Failed to resolve Outlook required category", {
        labelId,
        error,
      });
      unresolvedRequiredLabelIds.push(labelId);
    }
  }

  return {
    categoryMap:
      resolvedCategoryMap.size > 0 ? resolvedCategoryMap : categoryMap,
    unresolvedRequiredLabelIds,
  };
}

const OUTLOOK_THREAD_PAGE_TOKEN_PREFIX = "outlook-threads:";

type OutlookThreadPageToken = {
  pageToken?: string;
  skipThreadIds: string[];
};

function encodeOutlookThreadPageToken(token: OutlookThreadPageToken): string {
  return `${OUTLOOK_THREAD_PAGE_TOKEN_PREFIX}${Buffer.from(
    JSON.stringify(token),
  ).toString("base64url")}`;
}

function parseOutlookThreadPageToken(
  pageToken?: string,
): OutlookThreadPageToken | undefined {
  if (!pageToken?.startsWith(OUTLOOK_THREAD_PAGE_TOKEN_PREFIX)) {
    return;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(
        pageToken.slice(OUTLOOK_THREAD_PAGE_TOKEN_PREFIX.length),
        "base64url",
      ).toString("utf8"),
    ) as Partial<OutlookThreadPageToken>;

    return {
      pageToken: parsed.pageToken,
      skipThreadIds: Array.isArray(parsed.skipThreadIds)
        ? parsed.skipThreadIds.filter(
            (threadId): threadId is string => typeof threadId === "string",
          )
        : [],
    };
  } catch {
    return;
  }
}
