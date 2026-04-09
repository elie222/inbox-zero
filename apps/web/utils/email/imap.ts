import type { Attachment as MailAttachment } from "nodemailer/lib/mailer";
import type { ImapFlow } from "imapflow";
import type { ThreadsQuery } from "@/app/api/threads/validation";
import type {
  EmailFilter,
  EmailLabel,
  EmailProvider,
  EmailSignature,
  EmailThread,
} from "@/utils/email/types";
import type { OutlookFolder } from "@/utils/outlook/folders";
import type { InboxZeroLabel } from "@/utils/label";
import type { Logger } from "@/utils/logger";
import type { ParsedMessage } from "@/utils/types";
import type { ImapCredentialConfig } from "@/utils/imap/types";
import { UnsupportedImapOperationError } from "@/utils/imap/types";
import { withImapConnection } from "@/utils/imap/client";
import {
  convertImapMessage,
  fetchMessageByUid,
  fetchMessagesByUids,
  fetchRecentMessages,
  parseSearchQuery,
  searchImapMessages,
} from "@/utils/imap/message";
import {
  findArchiveFolder,
  findDraftsFolder,
  findSentFolder,
  findTrashFolder,
  getOrCreateFolder,
  listFolders,
  listFoldersAsOutlookFolders,
  moveMessageToFolder,
} from "@/utils/imap/folder";
import { saveDraft } from "@/utils/imap/draft";
import { sendSmtpEmail } from "@/utils/imap/mail";
import { buildThreadId } from "@/utils/imap/thread";
import { createScopedLogger } from "@/utils/logger";

const defaultLogger = createScopedLogger("imap-provider");

export class ImapProvider implements EmailProvider {
  readonly name = "imap" as const;
  private readonly config: ImapCredentialConfig;
  private readonly logger: Logger;

  constructor(config: ImapCredentialConfig, logger?: Logger) {
    this.config = config;
    this.logger = logger || defaultLogger;
  }

  private async withConnection<T>(
    fn: (client: ImapFlow) => Promise<T>,
  ): Promise<T> {
    return withImapConnection(this.config, fn);
  }

  toJSON() {
    return { name: "imap", type: "imap" };
  }

  getAccessToken(): string {
    return "";
  }

  // --- Message Operations ---

  async getMessage(messageId: string): Promise<ParsedMessage> {
    return this.withConnection(async (client) => {
      await client.mailboxOpen("INBOX", { readOnly: true });
      const msg = await fetchMessageByUid(client, Number(messageId));
      if (!msg) throw new Error(`Message ${messageId} not found`);
      return msg;
    });
  }

  async getMessageByRfc822MessageId(
    rfc822MessageId: string,
  ): Promise<ParsedMessage | null> {
    return this.withConnection(async (client) => {
      await client.mailboxOpen("INBOX", { readOnly: true });
      const uids = await searchImapMessages(
        client,
        { header: { "Message-ID": rfc822MessageId } },
        1,
      );
      if (uids.length === 0) return null;
      return fetchMessageByUid(client, uids[0]);
    });
  }

  async getMessagesBatch(messageIds: string[]): Promise<ParsedMessage[]> {
    return this.withConnection(async (client) => {
      await client.mailboxOpen("INBOX", { readOnly: true });
      return fetchMessagesByUids(client, messageIds.map(Number));
    });
  }

  async getInboxMessages(maxResults?: number): Promise<ParsedMessage[]> {
    return this.withConnection(async (client) => {
      const mailbox = await client.mailboxOpen("INBOX", { readOnly: true });
      return fetchRecentMessages(client, mailbox, maxResults || 50);
    });
  }

  async getInboxStats(): Promise<{ total: number; unread: number }> {
    return this.withConnection(async (client) => {
      const mailbox = await client.mailboxOpen("INBOX", { readOnly: true });
      const unreadUids = await searchImapMessages(client, { unseen: true });
      return {
        total: mailbox.exists || 0,
        unread: unreadUids.length,
      };
    });
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
    return this.withConnection(async (client) => {
      const folder = options.inboxOnly !== false ? "INBOX" : "INBOX";
      const mailbox = await client.mailboxOpen(folder, { readOnly: true });
      const total = mailbox.exists || 0;

      const maxResults = options.maxResults || 20;
      const offset = options.pageToken ? Number(options.pageToken) : 0;

      // For simple listing without query, use sequence numbers (most reliable)
      if (
        !options.query &&
        !options.before &&
        !options.after &&
        !options.unreadOnly
      ) {
        const end = Math.max(1, total - offset);
        const start = Math.max(1, end - maxResults + 1);
        if (end < 1) return { messages: [] };

        const messages: ParsedMessage[] = [];
        for await (const msg of client.fetch(`${start}:${end}`, {
          uid: true,
          envelope: true,
          flags: true,
        })) {
          const parsed = await convertImapMessage(msg);
          if (parsed) messages.push(parsed);
        }
        messages.reverse();

        const nextOffset = offset + maxResults;
        const nextPageToken =
          nextOffset < total ? String(nextOffset) : undefined;
        return { messages, nextPageToken };
      }

      // For queries, use IMAP SEARCH then fetch by UID
      const criteria: Record<string, unknown> = {};
      if (options.query) {
        Object.assign(criteria, parseSearchQuery(options.query));
      } else {
        criteria.all = true;
      }
      if (options.before) criteria.before = options.before;
      if (options.after) criteria.since = options.after;
      if (options.unreadOnly) criteria.unseen = true;

      const allUids = await searchImapMessages(client, criteria);
      const pageUids = allUids.slice(offset, offset + maxResults);
      const messages = await fetchMessagesByUids(client, pageUids);

      const nextOffset = offset + maxResults;
      const nextPageToken =
        nextOffset < allUids.length ? String(nextOffset) : undefined;

      return { messages, nextPageToken };
    });
  }

  async searchMessages(options: {
    query: string;
    maxResults?: number;
    pageToken?: string;
  }): Promise<{ messages: ParsedMessage[]; nextPageToken?: string }> {
    return this.getMessagesWithPagination({
      query: options.query,
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
  }): Promise<{ messages: ParsedMessage[]; nextPageToken?: string }> {
    return this.getMessagesWithPagination({
      query: `from:${options.senderEmail}`,
      maxResults: options.maxResults,
      pageToken: options.pageToken,
      before: options.before,
      after: options.after,
    });
  }

  async getMessagesWithAttachments(options: {
    maxResults?: number;
    pageToken?: string;
  }): Promise<{ messages: ParsedMessage[]; nextPageToken?: string }> {
    return this.withConnection(async (client) => {
      await client.mailboxOpen("INBOX", { readOnly: true });
      // Search for messages with attachments is not universally supported
      // Fall back to text search
      const uids = await searchImapMessages(
        client,
        { all: true },
        options.maxResults || 20,
      );
      const messages = await fetchMessagesByUids(client, uids);
      // Filter client-side for messages with attachments
      const withAttachments = messages.filter(
        (m) => m.attachments && m.attachments.length > 0,
      );
      return { messages: withAttachments };
    });
  }

  // --- Thread Operations ---

  async getThread(threadId: string): Promise<EmailThread> {
    const messages = await this.getThreadMessages(threadId);
    if (messages.length === 0) {
      throw new Error(`Thread ${threadId} not found`);
    }
    return {
      id: threadId,
      messages,
      snippet: messages[0].snippet,
    };
  }

  async getThreadMessages(threadId: string): Promise<ParsedMessage[]> {
    return this.withConnection(async (client) => {
      const mailbox = await client.mailboxOpen("INBOX", { readOnly: true });
      // Use sequence range fetch (single IMAP command) instead of
      // fetching UIDs one-by-one which is slow on WorkMail
      const messages = await fetchRecentMessages(client, mailbox, 200);
      return messages
        .filter((m) => m.threadId === threadId)
        .sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
        );
    });
  }

  async getThreadMessagesInInbox(threadId: string): Promise<ParsedMessage[]> {
    return this.getThreadMessages(threadId);
  }

  async getThreads(_folderId?: string): Promise<EmailThread[]> {
    return this.withConnection(async (client) => {
      const folder = _folderId || "INBOX";
      const mailbox = await client.mailboxOpen(folder, { readOnly: true });
      const messages = await fetchRecentMessages(client, mailbox, 50);

      // Group messages by threadId
      const threadMap = new Map<string, ParsedMessage[]>();
      for (const msg of messages) {
        const existing = threadMap.get(msg.threadId) || [];
        existing.push(msg);
        threadMap.set(msg.threadId, existing);
      }

      return [...threadMap.entries()].map(([id, msgs]) => ({
        id,
        messages: msgs.sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
        ),
        snippet: msgs[msgs.length - 1].snippet,
      }));
    });
  }

  async getThreadsWithQuery(options: {
    query?: ThreadsQuery;
    maxResults?: number;
    pageToken?: string;
  }): Promise<{ threads: EmailThread[]; nextPageToken?: string }> {
    const queryStr = options.query
      ? typeof options.query === "string"
        ? options.query
        : ""
      : "";

    const { messages, nextPageToken } = await this.getMessagesWithPagination({
      query: queryStr,
      maxResults: options.maxResults,
      pageToken: options.pageToken,
    });

    // Group into threads
    const threadMap = new Map<string, ParsedMessage[]>();
    for (const msg of messages) {
      const existing = threadMap.get(msg.threadId) || [];
      existing.push(msg);
      threadMap.set(msg.threadId, existing);
    }

    const threads = [...threadMap.entries()].map(([id, msgs]) => ({
      id,
      messages: msgs,
      snippet: msgs[msgs.length - 1].snippet,
    }));

    return { threads, nextPageToken };
  }

  async getThreadsWithLabel(options: {
    labelId: string;
    maxResults?: number;
  }): Promise<EmailThread[]> {
    return this.withConnection(async (client) => {
      await client.mailboxOpen(options.labelId, { readOnly: true });
      const uids = await searchImapMessages(
        client,
        { all: true },
        options.maxResults || 20,
      );
      const messages = await fetchMessagesByUids(client, uids);

      const threadMap = new Map<string, ParsedMessage[]>();
      for (const msg of messages) {
        const existing = threadMap.get(msg.threadId) || [];
        existing.push(msg);
        threadMap.set(msg.threadId, existing);
      }

      return [...threadMap.entries()].map(([id, msgs]) => ({
        id,
        messages: msgs,
        snippet: msgs[msgs.length - 1].snippet,
      }));
    });
  }

  async getThreadsWithParticipant(options: {
    participantEmail: string;
    maxThreads?: number;
  }): Promise<EmailThread[]> {
    const { messages } = await this.getMessagesFromSender({
      senderEmail: options.participantEmail,
      maxResults: options.maxThreads || 20,
    });

    const threadMap = new Map<string, ParsedMessage[]>();
    for (const msg of messages) {
      const existing = threadMap.get(msg.threadId) || [];
      existing.push(msg);
      threadMap.set(msg.threadId, existing);
    }

    return [...threadMap.entries()].map(([id, msgs]) => ({
      id,
      messages: msgs,
      snippet: msgs[msgs.length - 1].snippet,
    }));
  }

  async getThreadsFromSenderWithSubject(
    sender: string,
    limit: number,
  ): Promise<Array<{ id: string; snippet: string; subject: string }>> {
    const { messages } = await this.getMessagesFromSender({
      senderEmail: sender,
      maxResults: limit,
    });

    const threadMap = new Map<
      string,
      { id: string; snippet: string; subject: string }
    >();
    for (const msg of messages) {
      if (!threadMap.has(msg.threadId)) {
        threadMap.set(msg.threadId, {
          id: msg.threadId,
          snippet: msg.snippet,
          subject: msg.subject,
        });
      }
    }

    return [...threadMap.values()];
  }

  async getLatestMessageInThread(
    threadId: string,
  ): Promise<ParsedMessage | null> {
    const messages = await this.getThreadMessages(threadId);
    return messages.length > 0 ? messages[messages.length - 1] : null;
  }

  async getLatestMessageFromThreadSnapshot(
    thread: Pick<EmailThread, "id" | "messages">,
  ): Promise<ParsedMessage | null> {
    if (thread.messages.length > 0) {
      return thread.messages[thread.messages.length - 1];
    }
    return this.getLatestMessageInThread(thread.id);
  }

  async getPreviousConversationMessages(
    messageIds: string[],
  ): Promise<ParsedMessage[]> {
    return this.getMessagesBatch(messageIds);
  }

  // --- Label/Folder Operations ---

  async getLabels(_options?: {
    includeHidden?: boolean;
  }): Promise<EmailLabel[]> {
    return this.withConnection(async (client) => {
      return listFolders(client);
    });
  }

  async getLabelById(labelId: string): Promise<EmailLabel | null> {
    const labels = await this.getLabels();
    return labels.find((l) => l.id === labelId) || null;
  }

  async getLabelByName(name: string): Promise<EmailLabel | null> {
    const labels = await this.getLabels();
    return (
      labels.find((l) => l.name.toLowerCase() === name.toLowerCase()) || null
    );
  }

  async getOrCreateInboxZeroLabel(_key: InboxZeroLabel): Promise<EmailLabel> {
    const folderName = `InboxZero/${_key}`;
    return this.withConnection(async (client) => {
      const path = await getOrCreateFolder(client, folderName);
      return {
        id: path,
        name: folderName,
        type: "user",
      };
    });
  }

  async createLabel(name: string, _description?: string): Promise<EmailLabel> {
    return this.withConnection(async (client) => {
      await client.mailboxCreate(name);
      return {
        id: name,
        name,
        type: "user",
      };
    });
  }

  async deleteLabel(labelId: string): Promise<void> {
    return this.withConnection(async (client) => {
      await client.mailboxDelete(labelId);
    });
  }

  async labelMessage(options: {
    messageId: string;
    labelId: string;
    labelName: string | null;
  }): Promise<{ usedFallback?: boolean; actualLabelId?: string }> {
    // For IMAP, "labeling" means moving to a folder
    return this.withConnection(async (client) => {
      await client.mailboxOpen("INBOX");
      await moveMessageToFolder(
        client,
        Number(options.messageId),
        options.labelId,
      );
      return { actualLabelId: options.labelId };
    });
  }

  async removeThreadLabel(threadId: string, _labelId: string): Promise<void> {
    // For IMAP, removing a "label" would mean moving back to INBOX
    // This is a no-op for folder-based systems since a message can only be in one folder
    this.logger.warn("removeThreadLabel is a no-op for IMAP", {
      threadId,
    });
  }

  async removeThreadLabels(
    threadId: string,
    _labelIds: string[],
  ): Promise<void> {
    this.logger.warn("removeThreadLabels is a no-op for IMAP", {
      threadId,
    });
  }

  // --- Thread Actions ---

  async archiveThread(threadId: string, _ownerEmail: string): Promise<void> {
    const messages = await this.getThreadMessages(threadId);
    if (messages.length === 0) return;

    return this.withConnection(async (client) => {
      await client.mailboxOpen("INBOX");
      const archiveFolder = await findArchiveFolder(client);
      for (const msg of messages) {
        try {
          await moveMessageToFolder(client, Number(msg.id), archiveFolder);
        } catch {
          // Message might already be in archive or another folder
        }
      }
    });
  }

  async archiveThreadWithLabel(
    threadId: string,
    ownerEmail: string,
    _labelId?: string,
  ): Promise<void> {
    // For IMAP, archive with label = move to the label folder (or archive)
    if (_labelId) {
      const messages = await this.getThreadMessages(threadId);
      return this.withConnection(async (client) => {
        await client.mailboxOpen("INBOX");
        for (const msg of messages) {
          await moveMessageToFolder(client, Number(msg.id), _labelId);
        }
      });
    }
    return this.archiveThread(threadId, ownerEmail);
  }

  async archiveMessage(messageId: string): Promise<void> {
    return this.withConnection(async (client) => {
      await client.mailboxOpen("INBOX");
      const archiveFolder = await findArchiveFolder(client);
      await moveMessageToFolder(client, Number(messageId), archiveFolder);
    });
  }

  async trashThread(
    threadId: string,
    _ownerEmail: string,
    _actionSource: "user" | "automation",
  ): Promise<void> {
    const messages = await this.getThreadMessages(threadId);
    if (messages.length === 0) return;

    return this.withConnection(async (client) => {
      await client.mailboxOpen("INBOX");
      const trashFolder = await findTrashFolder(client);
      for (const msg of messages) {
        try {
          await moveMessageToFolder(client, Number(msg.id), trashFolder);
        } catch {
          // Message might already be trashed
        }
      }
    });
  }

  async markReadThread(threadId: string, read: boolean): Promise<void> {
    const messages = await this.getThreadMessages(threadId);
    return this.withConnection(async (client) => {
      await client.mailboxOpen("INBOX");
      for (const msg of messages) {
        if (read) {
          await client.messageFlagsAdd(String(msg.id), ["\\Seen"], {
            uid: true,
          });
        } else {
          await client.messageFlagsRemove(String(msg.id), ["\\Seen"], {
            uid: true,
          });
        }
      }
    });
  }

  async markRead(threadId: string): Promise<void> {
    return this.markReadThread(threadId, true);
  }

  async markSpam(threadId: string): Promise<void> {
    // Move to Junk/Spam folder
    const messages = await this.getThreadMessages(threadId);
    return this.withConnection(async (client) => {
      await client.mailboxOpen("INBOX");
      const mailboxes = await client.list();
      const junkFolder = mailboxes.find(
        (mb) =>
          mb.specialUse === "\\Junk" ||
          mb.name.toLowerCase() === "spam" ||
          mb.name.toLowerCase() === "junk",
      );
      const targetFolder = junkFolder?.path || "Junk";

      for (const msg of messages) {
        await moveMessageToFolder(client, Number(msg.id), targetFolder);
      }
    });
  }

  async blockUnsubscribedEmail(_messageId: string): Promise<void> {
    throw new UnsupportedImapOperationError("blockUnsubscribedEmail");
  }

  async moveThreadToFolder(
    threadId: string,
    _ownerEmail: string,
    folderName: string,
  ): Promise<void> {
    const messages = await this.getThreadMessages(threadId);
    return this.withConnection(async (client) => {
      await client.mailboxOpen("INBOX");
      for (const msg of messages) {
        await moveMessageToFolder(client, Number(msg.id), folderName);
      }
    });
  }

  // --- Bulk Operations ---

  async bulkArchiveFromSenders(
    fromEmails: string[],
    _ownerEmail: string,
    _emailAccountId: string,
  ): Promise<void> {
    return this.withConnection(async (client) => {
      await client.mailboxOpen("INBOX");
      const archiveFolder = await findArchiveFolder(client);

      for (const email of fromEmails) {
        const uids = await searchImapMessages(client, { from: email });
        for (const uid of uids) {
          await moveMessageToFolder(client, uid, archiveFolder);
        }
      }
    });
  }

  async bulkTrashFromSenders(
    fromEmails: string[],
    _ownerEmail: string,
    _emailAccountId: string,
  ): Promise<void> {
    return this.withConnection(async (client) => {
      await client.mailboxOpen("INBOX");
      const trashFolder = await findTrashFolder(client);

      for (const email of fromEmails) {
        const uids = await searchImapMessages(client, { from: email });
        for (const uid of uids) {
          await moveMessageToFolder(client, uid, trashFolder);
        }
      }
    });
  }

  // --- Sent Messages ---

  async getSentMessages(maxResults?: number): Promise<ParsedMessage[]> {
    return this.withConnection(async (client) => {
      const sentFolder = await findSentFolder(client);
      await client.mailboxOpen(sentFolder, { readOnly: true });
      const uids = await searchImapMessages(
        client,
        { all: true },
        maxResults || 20,
      );
      return fetchMessagesByUids(client, uids);
    });
  }

  async getSentMessageIds(options: {
    maxResults: number;
    after?: Date;
    before?: Date;
  }): Promise<{ id: string; threadId: string }[]> {
    return this.withConnection(async (client) => {
      const sentFolder = await findSentFolder(client);
      await client.mailboxOpen(sentFolder, { readOnly: true });

      const criteria: Record<string, unknown> = { all: true };
      if (options.after) criteria.since = options.after;
      if (options.before) criteria.before = options.before;

      const uids = await searchImapMessages(
        client,
        criteria,
        options.maxResults,
      );
      const messages = await fetchMessagesByUids(client, uids);
      return messages.map((m) => ({ id: m.id, threadId: m.threadId }));
    });
  }

  async getSentThreadsExcluding(options: {
    excludeToEmails?: string[];
    excludeFromEmails?: string[];
    maxResults?: number;
  }): Promise<EmailThread[]> {
    const messages = await this.getSentMessages(options.maxResults || 20);

    const filtered = messages.filter((m) => {
      if (
        options.excludeToEmails?.some((e) =>
          m.headers.to.toLowerCase().includes(e.toLowerCase()),
        )
      )
        return false;
      if (
        options.excludeFromEmails?.some((e) =>
          m.headers.from.toLowerCase().includes(e.toLowerCase()),
        )
      )
        return false;
      return true;
    });

    const threadMap = new Map<string, ParsedMessage[]>();
    for (const msg of filtered) {
      const existing = threadMap.get(msg.threadId) || [];
      existing.push(msg);
      threadMap.set(msg.threadId, existing);
    }

    return [...threadMap.entries()].map(([id, msgs]) => ({
      id,
      messages: msgs,
      snippet: msgs[msgs.length - 1].snippet,
    }));
  }

  // --- Email Sending ---

  async sendEmail(args: {
    to: string;
    cc?: string;
    bcc?: string;
    subject: string;
    messageText: string;
    attachments?: MailAttachment[];
  }): Promise<void> {
    await sendSmtpEmail(this.config, {
      to: args.to,
      cc: args.cc,
      bcc: args.bcc,
      subject: args.subject,
      text: args.messageText,
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
    const result = await sendSmtpEmail(this.config, {
      to: body.to,
      from: body.from,
      cc: body.cc,
      bcc: body.bcc,
      subject: body.subject,
      html: body.messageHtml,
      replyTo: body.replyTo,
      inReplyTo: body.replyToEmail?.headerMessageId,
      references: body.replyToEmail?.references,
      attachments: body.attachments,
    });

    const threadId =
      body.replyToEmail?.threadId ||
      buildThreadId(
        body.replyToEmail?.references,
        body.replyToEmail?.headerMessageId,
        result.messageId,
      );

    return { messageId: result.messageId, threadId };
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
    const replySubject = email.subject.startsWith("Re:")
      ? email.subject
      : `Re: ${email.subject}`;

    await sendSmtpEmail(this.config, {
      to: email.headers.from,
      from: options?.from,
      subject: replySubject,
      html: content,
      replyTo: options?.replyTo,
      inReplyTo: email.headers["message-id"],
      references: email.headers.references
        ? `${email.headers.references} ${email.headers["message-id"]}`
        : email.headers["message-id"],
    });
  }

  async forwardEmail(
    email: ParsedMessage,
    args: { to: string; cc?: string; bcc?: string; content?: string },
  ): Promise<void> {
    const fwdSubject = email.subject.startsWith("Fwd:")
      ? email.subject
      : `Fwd: ${email.subject}`;

    const forwardedBody = `
${args.content || ""}
<br/><br/>
---------- Forwarded message ----------<br/>
From: ${email.headers.from}<br/>
Date: ${email.headers.date}<br/>
Subject: ${email.headers.subject}<br/>
To: ${email.headers.to}<br/>
<br/>
${email.textHtml || email.textPlain || ""}
    `.trim();

    await sendSmtpEmail(this.config, {
      to: args.to,
      cc: args.cc,
      bcc: args.bcc,
      subject: fwdSubject,
      html: forwardedBody,
    });
  }

  // --- Drafts ---

  async getDrafts(options?: { maxResults?: number }): Promise<ParsedMessage[]> {
    return this.withConnection(async (client) => {
      const draftsFolder = await findDraftsFolder(client);
      await client.mailboxOpen(draftsFolder, { readOnly: true });
      const uids = await searchImapMessages(
        client,
        { all: true },
        options?.maxResults || 20,
      );
      return fetchMessagesByUids(client, uids);
    });
  }

  async getDraft(draftId: string): Promise<ParsedMessage | null> {
    return this.withConnection(async (client) => {
      const draftsFolder = await findDraftsFolder(client);
      await client.mailboxOpen(draftsFolder, { readOnly: true });
      return fetchMessageByUid(client, Number(draftId));
    });
  }

  async createDraft(params: {
    to: string;
    subject: string;
    messageHtml: string;
    replyToMessageId?: string;
  }): Promise<{ id: string }> {
    return this.withConnection(async (client) => {
      const id = await saveDraft(client, {
        from: this.config.email,
        to: params.to,
        subject: params.subject,
        html: params.messageHtml,
        inReplyTo: params.replyToMessageId,
      });
      return { id };
    });
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
    _executedRule?: { id: string; threadId: string; emailAccountId: string },
  ): Promise<{ draftId: string }> {
    return this.withConnection(async (client) => {
      const draftId = await saveDraft(client, {
        from: userEmail,
        to: args.to || email.headers.from,
        subject:
          args.subject ||
          (email.subject.startsWith("Re:")
            ? email.subject
            : `Re: ${email.subject}`),
        html: args.content,
        inReplyTo: email.headers["message-id"],
        references: email.headers.references,
      });
      return { draftId };
    });
  }

  async updateDraft(
    _draftId: string,
    _params: { messageHtml?: string; subject?: string },
  ): Promise<void> {
    throw new UnsupportedImapOperationError("updateDraft");
  }

  async deleteDraft(draftId: string): Promise<void> {
    return this.withConnection(async (client) => {
      const draftsFolder = await findDraftsFolder(client);
      await client.mailboxOpen(draftsFolder);
      await client.messageDelete(draftId, { uid: true });
    });
  }

  async sendDraft(
    _draftId: string,
  ): Promise<{ messageId: string; threadId: string }> {
    throw new UnsupportedImapOperationError("sendDraft");
  }

  // --- Folders ---

  async getFolders(): Promise<OutlookFolder[]> {
    return this.withConnection(async (client) => {
      return listFoldersAsOutlookFolders(client);
    });
  }

  async getOrCreateFolderIdByName(folderName: string): Promise<string> {
    return this.withConnection(async (client) => {
      return getOrCreateFolder(client, folderName);
    });
  }

  // --- Filters (not supported) ---

  async getFiltersList(): Promise<EmailFilter[]> {
    return [];
  }

  async createFilter(_options: {
    from: string;
    addLabelIds?: string[];
    removeLabelIds?: string[];
  }): Promise<{ status: number }> {
    throw new UnsupportedImapOperationError("createFilter");
  }

  async createAutoArchiveFilter(_options: {
    from: string;
    gmailLabelId?: string;
    labelName?: string;
  }): Promise<{ status: number }> {
    throw new UnsupportedImapOperationError("createAutoArchiveFilter");
  }

  async deleteFilter(_id: string): Promise<{ status: number }> {
    throw new UnsupportedImapOperationError("deleteFilter");
  }

  // --- Utility Methods ---

  async getSignatures(): Promise<EmailSignature[]> {
    return [];
  }

  async getAttachment(
    _messageId: string,
    _attachmentId: string,
  ): Promise<{ data: string; size: number }> {
    throw new UnsupportedImapOperationError("getAttachment");
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

  async checkIfReplySent(senderEmail: string): Promise<boolean> {
    return this.withConnection(async (client) => {
      const sentFolder = await findSentFolder(client);
      await client.mailboxOpen(sentFolder, { readOnly: true });
      const uids = await searchImapMessages(client, { to: senderEmail }, 1);
      return uids.length > 0;
    });
  }

  async countReceivedMessages(
    senderEmail: string,
    threshold: number,
  ): Promise<number> {
    return this.withConnection(async (client) => {
      await client.mailboxOpen("INBOX", { readOnly: true });
      const uids = await searchImapMessages(
        client,
        { from: senderEmail },
        threshold,
      );
      return uids.length;
    });
  }

  async hasPreviousCommunicationsWithSenderOrDomain(options: {
    from: string;
    date: Date;
    messageId: string;
  }): Promise<boolean> {
    return this.withConnection(async (client) => {
      const sentFolder = await findSentFolder(client);
      await client.mailboxOpen(sentFolder, { readOnly: true });

      // Check if we've sent to this address before
      const email = options.from.match(/<([^>]+)>/)?.[1] || options.from;
      const uids = await searchImapMessages(
        client,
        { to: email, before: options.date },
        1,
      );
      return uids.length > 0;
    });
  }

  isSentMessage(message: ParsedMessage): boolean {
    const from = message.headers.from.toLowerCase();
    return from.includes(this.config.email.toLowerCase());
  }

  isReplyInThread(message: ParsedMessage): boolean {
    return !!(message.headers["in-reply-to"] || message.headers.references);
  }

  // --- Watch (polling-based, no push) ---

  async watchEmails(): Promise<{
    expirationDate: Date;
    subscriptionId?: string;
  } | null> {
    // IMAP doesn't support push notifications via webhooks.
    // Polling is handled separately via /api/imap/poll
    return null;
  }

  async unwatchEmails(_subscriptionId?: string): Promise<void> {
    // No-op for IMAP
  }
}
