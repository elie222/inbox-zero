import { randomUUID } from "node:crypto";
import type { Attachment as MailAttachment } from "nodemailer/lib/mailer";
import type { InboxZeroLabel } from "@/utils/label";
import type { Logger } from "@/utils/logger";
import type { OutlookFolder } from "@/utils/outlook/folders";
import type { ThreadsQuery } from "@/utils/threads/validation";
import type { ParsedMessage } from "@/utils/types";
import type {
  EmailFilter,
  EmailLabel,
  EmailProvider,
  EmailSignature,
  EmailThread,
  SentMessagePage,
} from "@/utils/email/types";
import {
  enqueueThunderbirdAction,
  getOrCreateThunderbirdLabelId,
  getThunderbirdLabelName,
  getThunderbirdMessageRef,
} from "@/utils/redis/thunderbird-actions";
import prisma from "@/utils/prisma";
import { extractEmailAddress } from "@/utils/email";
import {
  countThunderbirdStoredMessages,
  listThunderbirdStoredMessages,
  loadThunderbirdStoredMessage,
  searchThunderbirdStoredMessages,
} from "@/utils/thunderbird/load-stored-message";

/**
 * EmailProvider backed by a Thunderbird MailExtension.
 * Mutating calls enqueue actions for the add-on to apply locally.
 */
export class ThunderbirdProvider implements EmailProvider {
  readonly name = "thunderbird" as const;

  private readonly emailAccountId: string;
  private readonly logger: Logger;
  private readonly messageCache = new Map<string, ParsedMessage>();
  private readonly labelCache = new Map<string, EmailLabel>();

  constructor({
    emailAccountId,
    logger,
  }: {
    emailAccountId: string;
    logger: Logger;
  }) {
    this.emailAccountId = emailAccountId;
    this.logger = logger.with({
      module: "thunderbird-provider",
      emailAccountId,
    });
  }

  seedMessage(message: ParsedMessage) {
    this.messageCache.set(message.id, message);
  }

  async getMessage(messageId: string): Promise<ParsedMessage> {
    const cached = this.messageCache.get(messageId);
    if (cached) return cached;

    const stored = await loadThunderbirdStoredMessage({
      emailAccountId: this.emailAccountId,
      messageId,
    });
    if (stored) {
      this.messageCache.set(messageId, stored);
      return stored;
    }

    throw new Error(`Thunderbird message not in cache: ${messageId}`);
  }

  async getMessagesBatch(messageIds: string[]): Promise<ParsedMessage[]> {
    return Promise.all(messageIds.map((id) => this.getMessage(id)));
  }

  async getThread(threadId: string): Promise<EmailThread> {
    const cached = [...this.messageCache.values()].filter(
      (message) => message.threadId === threadId,
    );
    if (cached.length > 0) {
      return {
        id: threadId,
        messages: cached,
        snippet: cached[0]?.snippet || "",
      };
    }

    const stored = await listThunderbirdStoredMessages({
      emailAccountId: this.emailAccountId,
      maxResults: 50,
    });
    const messages = stored.filter((message) => message.threadId === threadId);
    for (const message of messages) {
      this.messageCache.set(message.id, message);
    }
    return {
      id: threadId,
      messages,
      snippet: messages[0]?.snippet || "",
    };
  }

  async getThreadMessages(threadId: string): Promise<ParsedMessage[]> {
    return (await this.getThread(threadId)).messages;
  }

  async getThreadMessagesInInbox(threadId: string): Promise<ParsedMessage[]> {
    return this.getThreadMessages(threadId);
  }

  async getLatestMessageInThread(
    threadId: string,
  ): Promise<ParsedMessage | null> {
    const messages = await this.getThreadMessages(threadId);
    return messages.at(-1) ?? null;
  }

  async getLatestMessageFromThreadSnapshot(
    thread: Pick<EmailThread, "id" | "messages">,
  ): Promise<ParsedMessage | null> {
    return thread.messages.at(-1) ?? null;
  }

  isSentMessage(message: ParsedMessage): boolean {
    return (
      message.labelIds?.includes("SENT") === true ||
      message.labelIds?.includes("sent") === true
    );
  }

  isReplyInThread(message: ParsedMessage): boolean {
    return Boolean(
      message.headers["in-reply-to"] || message.headers.references,
    );
  }

  getAccessToken(): string {
    return "thunderbird-local";
  }

  toJSON() {
    return { name: this.name, type: "ThunderbirdProvider" };
  }

  async archiveThread(threadId: string, _ownerEmail: string): Promise<void> {
    await this.enqueueForThread(threadId, "archive");
  }

  async archiveMessage(messageId: string): Promise<void> {
    const ref = await this.resolveRef(messageId);
    await enqueueThunderbirdAction(this.emailAccountId, {
      type: "archive",
      id: randomUUID(),
      messageId,
      threadId: ref?.threadId || messageId,
      thunderbirdMessageId: ref?.thunderbirdMessageId,
      thunderbirdAccountId: ref?.thunderbirdAccountId,
      folderPath: ref?.folderPath,
    });
  }

  async archiveThreadWithLabel(
    threadId: string,
    ownerEmail: string,
    labelId?: string,
  ): Promise<void> {
    await this.archiveThread(threadId, ownerEmail);
    if (!labelId) return;
    const labelName = await getThunderbirdLabelName(
      this.emailAccountId,
      labelId,
    );
    if (!labelName) return;
    const messages = await this.getThreadMessages(threadId);
    for (const message of messages) {
      await this.labelMessage({
        messageId: message.id,
        labelId,
        labelName,
      });
    }
  }

  async trashThread(
    threadId: string,
    _ownerEmail: string,
    _actionSource: "user" | "automation",
  ): Promise<void> {
    await this.enqueueForThread(threadId, "trash");
  }

  async markRead(threadId: string): Promise<void> {
    await this.markReadThread(threadId, true);
  }

  async markReadThread(threadId: string, read: boolean): Promise<void> {
    const messages = await this.getThreadMessages(threadId);
    for (const message of messages) {
      const ref = await this.resolveRef(message.id);
      await enqueueThunderbirdAction(this.emailAccountId, {
        type: "mark_read",
        id: randomUUID(),
        messageId: message.id,
        threadId,
        read,
        thunderbirdMessageId: ref?.thunderbirdMessageId,
        thunderbirdAccountId: ref?.thunderbirdAccountId,
      });
    }
  }

  async markSpam(threadId: string): Promise<void> {
    await this.enqueueForThread(threadId, "mark_spam");
  }

  async starMessage(messageId: string): Promise<void> {
    const ref = await this.resolveRef(messageId);
    await enqueueThunderbirdAction(this.emailAccountId, {
      type: "star",
      id: randomUUID(),
      messageId,
      thunderbirdMessageId: ref?.thunderbirdMessageId,
      thunderbirdAccountId: ref?.thunderbirdAccountId,
    });
  }

  async labelMessage(options: {
    messageId: string;
    labelId: string;
    labelName: string | null;
  }): Promise<{ usedFallback?: boolean; actualLabelId?: string }> {
    const labelName =
      options.labelName ||
      (await getThunderbirdLabelName(this.emailAccountId, options.labelId)) ||
      options.labelId;
    const ref = await this.resolveRef(options.messageId);
    await enqueueThunderbirdAction(this.emailAccountId, {
      type: "label",
      id: randomUUID(),
      messageId: options.messageId,
      labelName,
      thunderbirdMessageId: ref?.thunderbirdMessageId,
      thunderbirdAccountId: ref?.thunderbirdAccountId,
    });
    return { actualLabelId: options.labelId };
  }

  async createLabel(name: string, _description?: string): Promise<EmailLabel> {
    const { id } = await getOrCreateThunderbirdLabelId(
      this.emailAccountId,
      name,
    );
    const label: EmailLabel = {
      id,
      name,
      type: "user",
    };
    this.labelCache.set(name.toLowerCase(), label);
    return label;
  }

  async getLabelByName(name: string): Promise<EmailLabel | null> {
    const cached = this.labelCache.get(name.toLowerCase());
    if (cached) return cached;
    const { id } = await getOrCreateThunderbirdLabelId(
      this.emailAccountId,
      name,
    );
    const label: EmailLabel = { id, name, type: "user" };
    this.labelCache.set(name.toLowerCase(), label);
    return label;
  }

  async getLabelById(labelId: string): Promise<EmailLabel | null> {
    const name = await getThunderbirdLabelName(this.emailAccountId, labelId);
    if (!name) return null;
    return { id: labelId, name, type: "user" };
  }

  async getLabels(_options?: {
    includeHidden?: boolean;
  }): Promise<EmailLabel[]> {
    return [...this.labelCache.values()];
  }

  async getOrCreateInboxZeroLabel(key: InboxZeroLabel): Promise<EmailLabel> {
    return this.createLabel(`Inbox Zero/${key}`);
  }

  async deleteLabel(_labelId: string): Promise<void> {
    // Tags are managed in Thunderbird; no-op on server.
  }

  async removeThreadLabel(_threadId: string, _labelId: string): Promise<void> {}

  async removeThreadLabels(
    _threadId: string,
    _labelIds: string[],
  ): Promise<void> {}

  async moveThreadToFolder(
    threadId: string,
    _ownerEmail: string,
    folderName: string,
  ): Promise<void> {
    const messages = await this.getThreadMessages(threadId);
    for (const message of messages) {
      const ref = await this.resolveRef(message.id);
      await enqueueThunderbirdAction(this.emailAccountId, {
        type: "move_folder",
        id: randomUUID(),
        messageId: message.id,
        threadId,
        folderName,
        thunderbirdMessageId: ref?.thunderbirdMessageId,
        thunderbirdAccountId: ref?.thunderbirdAccountId,
        folderPath: ref?.folderPath,
      });
    }
  }

  async getOrCreateFolderIdByName(folderName: string): Promise<string> {
    return `tb-folder-${Buffer.from(folderName).toString("base64url")}`;
  }

  async getFolders(): Promise<OutlookFolder[]> {
    return [];
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
    _userEmail: string,
    _executedRule?: { id: string; threadId: string; emailAccountId: string },
  ): Promise<{ draftId: string }> {
    const draftId = `tb-draft-${randomUUID()}`;
    const ref = await this.resolveRef(email.id);
    await enqueueThunderbirdAction(this.emailAccountId, {
      type: "draft",
      id: draftId,
      messageId: email.id,
      threadId: email.threadId,
      to: args.to,
      subject: args.subject,
      content: args.content,
      cc: args.cc,
      bcc: args.bcc,
      thunderbirdMessageId: ref?.thunderbirdMessageId,
      thunderbirdAccountId: ref?.thunderbirdAccountId,
    });
    return { draftId };
  }

  async createDraft(params: {
    to: string;
    subject: string;
    messageHtml: string;
    replyToMessageId?: string;
  }): Promise<{ id: string }> {
    const draftId = `tb-draft-${randomUUID()}`;
    const ref = params.replyToMessageId
      ? await this.resolveRef(params.replyToMessageId)
      : null;
    await enqueueThunderbirdAction(this.emailAccountId, {
      type: "draft",
      id: draftId,
      messageId: params.replyToMessageId || draftId,
      threadId: ref?.threadId || draftId,
      to: params.to,
      subject: params.subject,
      content: params.messageHtml,
      thunderbirdMessageId: ref?.thunderbirdMessageId,
      thunderbirdAccountId: ref?.thunderbirdAccountId,
    });
    return { id: draftId };
  }

  async replyToEmail(
    email: ParsedMessage,
    content: string,
    _options?: {
      replyTo?: string;
      from?: string;
      attachments?: MailAttachment[];
    },
  ): Promise<void> {
    const ref = await this.resolveRef(email.id);
    await enqueueThunderbirdAction(this.emailAccountId, {
      type: "reply",
      id: randomUUID(),
      messageId: email.id,
      threadId: email.threadId,
      content,
      thunderbirdMessageId: ref?.thunderbirdMessageId,
      thunderbirdAccountId: ref?.thunderbirdAccountId,
    });
  }

  async sendEmail(args: {
    to: string;
    cc?: string;
    bcc?: string;
    subject: string;
    messageText: string;
    attachments?: MailAttachment[];
  }): Promise<void> {
    await enqueueThunderbirdAction(this.emailAccountId, {
      type: "send",
      id: randomUUID(),
      to: args.to,
      subject: args.subject,
      content: args.messageText,
      cc: args.cc,
      bcc: args.bcc,
    });
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
  }): Promise<{ messageId: string; threadId: string }> {
    const messageId = `tb-sent-${randomUUID()}`;
    if (body.replyToEmail?.messageId) {
      await this.replyToEmail(
        await this.getMessage(body.replyToEmail.messageId).catch(() => ({
          id: body.replyToEmail!.messageId!,
          threadId: body.replyToEmail!.threadId,
          headers: {
            from: "",
            to: body.to,
            subject: body.subject,
            date: new Date().toISOString(),
          },
          snippet: "",
          historyId: "",
          inline: [],
          date: new Date().toISOString(),
          subject: body.subject,
        })),
        body.messageHtml,
      );
    } else {
      await enqueueThunderbirdAction(this.emailAccountId, {
        type: "send",
        id: randomUUID(),
        to: body.to,
        subject: body.subject,
        content: body.messageHtml,
        cc: body.cc,
        bcc: body.bcc,
      });
    }
    return {
      messageId,
      threadId: body.replyToEmail?.threadId || messageId,
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
    const ref = await this.resolveRef(email.id);
    await enqueueThunderbirdAction(this.emailAccountId, {
      type: "forward",
      id: randomUUID(),
      messageId: email.id,
      to: args.to,
      content: args.content,
      thunderbirdMessageId: ref?.thunderbirdMessageId,
      thunderbirdAccountId: ref?.thunderbirdAccountId,
    });
  }

  async getDraft(_draftId: string): Promise<ParsedMessage | null> {
    return null;
  }

  async getDrafts(_options?: {
    maxResults?: number;
  }): Promise<ParsedMessage[]> {
    return [];
  }

  async deleteDraft(_draftId: string): Promise<void> {}

  async updateDraft(
    _draftId: string,
    _params: { messageHtml?: string; subject?: string },
  ): Promise<void> {}

  async sendDraft(
    draftId: string,
  ): Promise<{ messageId: string; threadId: string }> {
    return { messageId: draftId, threadId: draftId };
  }

  async getInboxMessages(maxResults = 20): Promise<ParsedMessage[]> {
    const cached = [...this.messageCache.values()].slice(0, maxResults);
    if (cached.length > 0) return cached;
    return listThunderbirdStoredMessages({
      emailAccountId: this.emailAccountId,
      maxResults,
    });
  }

  async getInboxStats(): Promise<{ total: number; unread: number }> {
    const cached = [...this.messageCache.values()];
    if (cached.length > 0) {
      return {
        total: cached.length,
        unread: cached.filter((m) => !m.labelIds?.includes("READ")).length,
      };
    }
    return countThunderbirdStoredMessages(this.emailAccountId);
  }

  async getMessagesWithPagination(options: {
    query?: string;
    maxResults?: number;
    pageToken?: string;
    before?: Date;
    after?: Date;
    inboxOnly?: boolean;
    unreadOnly?: boolean;
  }): Promise<{ messages: ParsedMessage[]; nextPageToken?: string }> {
    const maxResults = options.maxResults ?? 20;
    if (options.query) {
      const messages = await searchThunderbirdStoredMessages({
        emailAccountId: this.emailAccountId,
        query: options.query,
        maxResults,
      });
      return { messages };
    }

    const messages = await listThunderbirdStoredMessages({
      emailAccountId: this.emailAccountId,
      maxResults,
      after: options.after,
      before: options.before,
    });
    return { messages };
  }

  async getMessagesFromSender(options: {
    senderEmail: string;
    maxResults?: number;
  }): Promise<{ messages: ParsedMessage[]; nextPageToken?: string }> {
    const messages = await listThunderbirdStoredMessages({
      emailAccountId: this.emailAccountId,
      maxResults: options.maxResults ?? 20,
      senderEmail: options.senderEmail,
    });
    return { messages };
  }

  async getMessagesWithAttachments(_options: {
    maxResults?: number;
    pageToken?: string;
  }): Promise<{ messages: ParsedMessage[]; nextPageToken?: string }> {
    return { messages: [] };
  }

  async searchMessages(options: {
    query: string;
    maxResults?: number;
  }): Promise<{ messages: ParsedMessage[]; nextPageToken?: string }> {
    const messages = await searchThunderbirdStoredMessages({
      emailAccountId: this.emailAccountId,
      query: options.query,
      maxResults: options.maxResults ?? 20,
    });
    return { messages };
  }

  async getMessageByRfc822MessageId(
    rfc822MessageId: string,
  ): Promise<ParsedMessage | null> {
    return (
      [...this.messageCache.values()].find(
        (message) => message.headers["message-id"] === rfc822MessageId,
      ) ?? null
    );
  }

  async getOriginalMessage(
    originalMessageId: string | undefined,
  ): Promise<ParsedMessage | null> {
    if (!originalMessageId) return null;
    return this.getMessage(originalMessageId).catch(() => null);
  }

  async getPreviousConversationMessages(
    messageIds: string[],
  ): Promise<ParsedMessage[]> {
    return this.getMessagesBatch(messageIds).catch(() => []);
  }

  async getSentMessages(maxResults = 20): Promise<ParsedMessage[]> {
    return [...this.messageCache.values()]
      .filter((message) => this.isSentMessage(message))
      .slice(0, maxResults);
  }

  async getSentMessageIds(_options: {
    maxResults: number;
    after?: Date;
    before?: Date;
    pageToken?: string;
  }): Promise<SentMessagePage> {
    return { messages: [] };
  }

  async getSentThreadsExcluding(_options: {
    excludeToEmails?: string[];
    excludeFromEmails?: string[];
    maxResults?: number;
  }): Promise<EmailThread[]> {
    return [];
  }

  async getThreads(_folderId?: string): Promise<EmailThread[]> {
    const byThread = new Map<string, ParsedMessage[]>();
    for (const message of this.messageCache.values()) {
      const list = byThread.get(message.threadId) || [];
      list.push(message);
      byThread.set(message.threadId, list);
    }
    return [...byThread.entries()].map(([id, messages]) => ({
      id,
      messages,
      snippet: messages[0]?.snippet || "",
    }));
  }

  async getThreadsWithQuery(_options: {
    query?: ThreadsQuery;
    maxResults?: number;
    pageToken?: string;
  }): Promise<{ threads: EmailThread[]; nextPageToken?: string }> {
    return { threads: await this.getThreads() };
  }

  async getThreadsWithLabel(_options: {
    labelId: string;
    maxResults?: number;
  }): Promise<EmailThread[]> {
    return [];
  }

  async getThreadsWithParticipant(_options: {
    participantEmail: string;
    maxThreads?: number;
  }): Promise<EmailThread[]> {
    return [];
  }

  async getThreadsFromSenderWithSubject(
    sender: string,
    limit: number,
  ): Promise<Array<{ id: string; snippet: string; subject: string }>> {
    return [...this.messageCache.values()]
      .filter((message) =>
        message.headers.from.toLowerCase().includes(sender.toLowerCase()),
      )
      .slice(0, limit)
      .map((message) => ({
        id: message.threadId,
        snippet: message.snippet,
        subject: message.subject,
      }));
  }

  async hasPreviousCommunicationsWithSenderOrDomain(_options: {
    from: string;
    date: Date;
    messageId: string;
  }): Promise<boolean> {
    return false;
  }

  async countReceivedMessages(
    _senderEmail: string,
    _threshold: number,
  ): Promise<number> {
    return 0;
  }

  async checkIfReplySent(_senderEmail: string): Promise<boolean> {
    return false;
  }

  async getAttachment(
    _messageId: string,
    _attachmentId: string,
  ): Promise<{ data: string; size: number }> {
    return { data: "", size: 0 };
  }

  async getSignatures(): Promise<EmailSignature[]> {
    return [];
  }

  async getFiltersList(): Promise<EmailFilter[]> {
    return [];
  }

  async createFilter(_options: {
    from: string;
    addLabelIds?: string[];
    removeLabelIds?: string[];
  }): Promise<{ status: number }> {
    return { status: 200 };
  }

  async createAutoArchiveFilter(options: {
    from: string;
    gmailLabelId?: string;
    labelName?: string;
  }): Promise<{ status: number }> {
    // Thunderbird has no Gmail-style filters; archive existing mail from this
    // sender via the add-on, and optionally tag future matches in Pending.
    const from = extractEmailAddress(options.from) || options.from;
    if (from) {
      await this.enqueueBulkFromSenders("bulk_archive", [from], "");
    }
    if (options.labelName) {
      await this.createLabel(options.labelName);
    }
    return { status: 200 };
  }

  async deleteFilter(_id: string): Promise<{ status: number }> {
    return { status: 200 };
  }

  async blockUnsubscribedEmail(_messageId: string): Promise<void> {
    await this.archiveMessage(_messageId);
  }

  async bulkArchiveFromSenders(
    fromEmails: string[],
    ownerEmail: string,
    _emailAccountId: string,
  ): Promise<void> {
    await this.enqueueBulkFromSenders("bulk_archive", fromEmails, ownerEmail);
  }

  async bulkTrashFromSenders(
    fromEmails: string[],
    ownerEmail: string,
    _emailAccountId: string,
  ): Promise<void> {
    await this.enqueueBulkFromSenders("bulk_trash", fromEmails, ownerEmail);
  }

  async watchEmails(): Promise<{
    expirationDate: Date;
    subscriptionId?: string;
  } | null> {
    return null;
  }

  async unwatchEmails(_subscriptionId?: string): Promise<void> {}

  private async enqueueBulkFromSenders(
    type: "bulk_archive" | "bulk_trash",
    fromEmails: string[],
    ownerEmail: string,
  ) {
    const normalized = [
      ...new Set(
        fromEmails
          .map((from) => extractEmailAddress(from).toLowerCase())
          .filter(Boolean),
      ),
    ];
    if (normalized.length === 0) return;

    const emailAccount = await prisma.emailAccount.findUnique({
      where: { id: this.emailAccountId },
      select: {
        email: true,
        account: { select: { providerAccountId: true } },
      },
    });

    await enqueueThunderbirdAction(this.emailAccountId, {
      type,
      id: randomUUID(),
      fromEmails: normalized,
      accountEmail: ownerEmail || emailAccount?.email,
      thunderbirdAccountId:
        emailAccount?.account.providerAccountId?.startsWith("manual-")
          ? undefined
          : emailAccount?.account.providerAccountId,
    });

    this.logger.info("Queued Thunderbird bulk sender action", {
      type,
      senderCount: normalized.length,
    });
  }

  private async resolveRef(messageId: string) {
    return getThunderbirdMessageRef(this.emailAccountId, messageId);
  }

  private async enqueueForThread(
    threadId: string,
    type: "archive" | "trash" | "mark_spam",
  ) {
    const messages = await this.getThreadMessages(threadId);
    const targets =
      messages.length > 0
        ? messages
        : [{ id: threadId, threadId } as ParsedMessage];

    for (const message of targets) {
      const ref = await this.resolveRef(message.id);
      await enqueueThunderbirdAction(this.emailAccountId, {
        type,
        id: randomUUID(),
        messageId: message.id,
        threadId,
        thunderbirdMessageId: ref?.thunderbirdMessageId,
        thunderbirdAccountId: ref?.thunderbirdAccountId,
        folderPath: ref?.folderPath,
      });
    }
  }
}
