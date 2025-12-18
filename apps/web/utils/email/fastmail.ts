import type { ParsedMessage } from "@/utils/types";
import type {
  FastmailClient,
  JMAPMethodCall,
  JMAPMethodResponse,
} from "@/utils/fastmail/client";
import { getAccessTokenFromClient } from "@/utils/fastmail/client";
import { FastmailMailbox } from "@/utils/fastmail/constants";
import type { InboxZeroLabel } from "@/utils/label";
import type { ThreadsQuery } from "@/app/api/threads/validation";
import type { OutlookFolder } from "@/utils/outlook/folders";
import type {
  EmailProvider,
  EmailThread,
  EmailLabel,
  EmailFilter,
  EmailSignature,
} from "@/utils/email/types";
import { createScopedLogger, type Logger } from "@/utils/logger";

// JMAP Email type
interface JMAPEmail {
  id: string;
  blobId: string;
  threadId: string;
  mailboxIds: Record<string, boolean>;
  keywords: Record<string, boolean>;
  size: number;
  receivedAt: string;
  messageId?: string[];
  inReplyTo?: string[];
  references?: string[];
  sender?: JMAPEmailAddress[];
  from?: JMAPEmailAddress[];
  to?: JMAPEmailAddress[];
  cc?: JMAPEmailAddress[];
  bcc?: JMAPEmailAddress[];
  replyTo?: JMAPEmailAddress[];
  subject?: string;
  sentAt?: string;
  hasAttachment: boolean;
  preview: string;
  bodyStructure?: JMAPBodyPart;
  bodyValues?: Record<string, { value: string; isEncodingProblem: boolean }>;
  textBody?: JMAPBodyPart[];
  htmlBody?: JMAPBodyPart[];
  attachments?: JMAPBodyPart[];
}

interface JMAPEmailAddress {
  name?: string;
  email: string;
}

interface JMAPBodyPart {
  partId?: string;
  blobId?: string;
  size: number;
  name?: string;
  type: string;
  charset?: string;
  disposition?: string;
  cid?: string;
  subParts?: JMAPBodyPart[];
}

interface JMAPThread {
  id: string;
  emailIds: string[];
}

interface JMAPMailbox {
  id: string;
  name: string;
  parentId?: string;
  role?: string;
  sortOrder: number;
  totalEmails: number;
  unreadEmails: number;
  totalThreads: number;
  unreadThreads: number;
  isSubscribed: boolean;
}

interface JMAPIdentity {
  id: string;
  name: string;
  email: string;
  replyTo?: JMAPEmailAddress[];
  bcc?: JMAPEmailAddress[];
  textSignature?: string;
  htmlSignature?: string;
  mayDelete: boolean;
}

// Cache for mailbox lookups
interface MailboxCache {
  byId: Map<string, JMAPMailbox>;
  byRole: Map<string, JMAPMailbox>;
  byName: Map<string, JMAPMailbox>;
}

// JMAP response data types (simplified - JMAP has complex generic response types)
interface JMAPGetResponse<T> {
  accountId: string;
  state: string;
  list: T[];
  notFound?: string[];
}

interface JMAPQueryResponse {
  accountId: string;
  queryState: string;
  ids: string[];
  position: number;
  total?: number;
  canCalculateChanges?: boolean;
}

interface JMAPSetResponse<T> {
  accountId: string;
  oldState?: string;
  newState: string;
  created?: Record<string, T>;
  updated?: Record<string, T | null>;
  destroyed?: string[];
  notCreated?: Record<string, { type: string; description?: string }>;
  notUpdated?: Record<string, { type: string; description?: string }>;
  notDestroyed?: Record<string, { type: string; description?: string }>;
}

// Helper to extract typed response data from JMAP method responses
// JMAP responses are [methodName, data, callId] tuples where data structure varies by method
// biome-ignore lint/suspicious/noExplicitAny: JMAP response types are complex and vary by method
function getResponseData<T>(response: JMAPMethodResponse): T {
  return response[1] as T;
}

/**
 * Fastmail email provider implementation using the JMAP protocol.
 *
 * JMAP (JSON Meta Application Protocol) is a modern, efficient protocol for
 * accessing mail, calendars, and contacts. Fastmail helped create the JMAP
 * specification and uses it as their primary API.
 *
 * Key differences from Gmail:
 * - Uses mailboxes (folders) instead of labels - messages can be in multiple mailboxes
 * - No built-in filter/rules API - Fastmail uses Sieve for server-side filtering
 * - Push notifications use EventSource instead of Pub/Sub webhooks
 *
 * @see https://jmap.io/spec-mail.html for JMAP Mail specification
 * @see https://www.fastmail.com/dev/ for Fastmail API documentation
 */
export class FastmailProvider implements EmailProvider {
  readonly name = "fastmail" as const;
  private readonly client: FastmailClient;
  private readonly logger: Logger;
  private mailboxCache: MailboxCache | null = null;
  private readonly inboxZeroLabels: Map<string, string> = new Map();

  /**
   * Creates a new FastmailProvider instance
   * @param client - Initialized Fastmail JMAP client
   * @param logger - Optional logger instance for debugging
   */
  constructor(client: FastmailClient, logger?: Logger) {
    this.client = client;
    this.logger = (logger || createScopedLogger("fastmail-provider")).with({
      provider: "fastmail",
    });
  }

  /**
   * Returns a JSON representation of this provider for logging purposes
   * @returns Object with provider name and type
   */
  toJSON() {
    return { name: this.name, type: "FastmailProvider" };
  }

  /**
   * Uploads a blob (file content) to Fastmail for use as an attachment.
   * @param content - Base64-encoded file content
   * @param contentType - MIME type of the file
   * @returns The blob ID and size for use in email attachments
   */
  private async uploadBlob(
    content: string,
    contentType: string,
  ): Promise<{ blobId: string; size: number }> {
    // Decode base64 content to binary
    const binaryString = atob(content);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Build upload URL with account ID
    const uploadUrl = this.client.session.uploadUrl.replace(
      "{accountId}",
      this.client.accountId,
    );

    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.client.accessToken}`,
        "Content-Type": contentType,
      },
      body: bytes,
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error("Failed to upload blob", {
        status: response.status,
        error: errorText,
      });
      throw new Error(`Failed to upload blob: ${response.status}`);
    }

    const result = await response.json();
    return {
      blobId: result.blobId,
      size: result.size,
    };
  }

  /**
   * Ensures the mailbox cache is populated and returns it.
   * The cache stores mailboxes indexed by ID, role, and name for fast lookups.
   * @returns The populated mailbox cache
   */
  private async ensureMailboxCache(): Promise<MailboxCache> {
    if (this.mailboxCache) return this.mailboxCache;

    const response = await this.client.request([
      [
        "Mailbox/get",
        {
          accountId: this.client.accountId,
          properties: [
            "id",
            "name",
            "parentId",
            "role",
            "sortOrder",
            "totalEmails",
            "unreadEmails",
            "totalThreads",
            "unreadThreads",
            "isSubscribed",
          ],
        },
        "0",
      ],
    ]);

    const mailboxes = getResponseData<JMAPGetResponse<JMAPMailbox>>(
      response.methodResponses[0],
    ).list;

    this.mailboxCache = {
      byId: new Map(mailboxes.map((m) => [m.id, m])),
      byRole: new Map(mailboxes.filter((m) => m.role).map((m) => [m.role!, m])),
      byName: new Map(mailboxes.map((m) => [m.name.toLowerCase(), m])),
    };

    return this.mailboxCache;
  }

  private async getMailboxByRole(role: string): Promise<JMAPMailbox | null> {
    const cache = await this.ensureMailboxCache();
    return cache.byRole.get(role) || null;
  }

  private async getMailboxById(id: string): Promise<JMAPMailbox | null> {
    const cache = await this.ensureMailboxCache();
    return cache.byId.get(id) || null;
  }

  private async getMailboxByName(name: string): Promise<JMAPMailbox | null> {
    const cache = await this.ensureMailboxCache();
    return cache.byName.get(name.toLowerCase()) || null;
  }

  private parseEmailAddress(addr: JMAPEmailAddress[] | undefined): string {
    if (!addr || addr.length === 0) return "";
    return addr
      .map((a) => (a.name ? `${a.name} <${a.email}>` : a.email))
      .join(", ");
  }

  private parseJMAPEmail(email: JMAPEmail): ParsedMessage {
    const textPlain =
      email.bodyValues && email.textBody?.[0]?.partId
        ? email.bodyValues[email.textBody[0].partId]?.value
        : undefined;
    const textHtml =
      email.bodyValues && email.htmlBody?.[0]?.partId
        ? email.bodyValues[email.htmlBody[0].partId]?.value
        : undefined;

    // Convert mailboxIds to labelIds
    const labelIds = Object.keys(email.mailboxIds || {});

    // Add keyword-based labels
    if (email.keywords?.$seen === false || !email.keywords?.$seen) {
      labelIds.push("UNREAD");
    }
    if (email.keywords?.$flagged) {
      labelIds.push("STARRED");
    }
    if (email.keywords?.$draft) {
      labelIds.push("DRAFT");
    }

    const attachments =
      email.attachments?.map((att) => ({
        filename: att.name || "attachment",
        mimeType: att.type,
        size: att.size,
        attachmentId: att.blobId || "",
        headers: {
          "content-type": att.type,
          "content-description": att.name || "",
          "content-transfer-encoding": "base64",
          "content-id": att.cid || "",
        },
      })) || [];

    return {
      id: email.id,
      threadId: email.threadId,
      labelIds,
      snippet: email.preview || "",
      historyId: "", // JMAP doesn't have historyId in the same way
      attachments: attachments.length > 0 ? attachments : undefined,
      inline: [],
      headers: {
        subject: email.subject || "",
        from: this.parseEmailAddress(email.from),
        to: this.parseEmailAddress(email.to),
        cc: this.parseEmailAddress(email.cc),
        bcc: this.parseEmailAddress(email.bcc),
        date: email.sentAt || email.receivedAt,
        "message-id": email.messageId?.[0],
        "reply-to": this.parseEmailAddress(email.replyTo),
        "in-reply-to": email.inReplyTo?.[0],
        references: email.references?.join(" "),
      },
      textPlain,
      textHtml,
      subject: email.subject || "",
      date: email.sentAt || email.receivedAt,
      internalDate: email.receivedAt,
    };
  }

  /**
   * Retrieves email threads from a specific folder or the inbox.
   * @param folderId - Optional mailbox ID to fetch threads from. Defaults to inbox.
   * @returns Array of email threads with their messages
   */
  async getThreads(folderId?: string): Promise<EmailThread[]> {
    const log = this.logger.with({ action: "getThreads", folderId });

    let mailboxId = folderId;
    if (!mailboxId) {
      const inbox = await this.getMailboxByRole(FastmailMailbox.INBOX);
      mailboxId = inbox?.id;
    }

    if (!mailboxId) {
      log.warn("No mailbox found");
      return [];
    }

    // First, query for threads
    const threadResponse = await this.client.request([
      [
        "Email/query",
        {
          accountId: this.client.accountId,
          filter: { inMailbox: mailboxId },
          sort: [{ property: "receivedAt", isAscending: false }],
          limit: 50,
          collapseThreads: true,
        },
        "0",
      ],
    ]);

    const emailIds = getResponseData<JMAPQueryResponse>(
      threadResponse.methodResponses[0],
    ).ids;

    if (emailIds.length === 0) {
      return [];
    }

    // Get full email data
    const emailResponse = await this.client.request([
      [
        "Email/get",
        {
          accountId: this.client.accountId,
          ids: emailIds,
          properties: [
            "id",
            "threadId",
            "mailboxIds",
            "keywords",
            "from",
            "to",
            "cc",
            "bcc",
            "subject",
            "receivedAt",
            "sentAt",
            "preview",
            "hasAttachment",
            "messageId",
            "inReplyTo",
            "references",
            "replyTo",
            "bodyStructure",
            "bodyValues",
            "textBody",
            "htmlBody",
            "attachments",
          ],
          fetchAllBodyValues: true,
        },
        "1",
      ],
    ]);

    const emails = getResponseData<JMAPGetResponse<JMAPEmail>>(
      emailResponse.methodResponses[0],
    ).list;

    // Group emails by thread
    const threadMap = new Map<string, ParsedMessage[]>();
    for (const email of emails) {
      const parsed = this.parseJMAPEmail(email);
      const existing = threadMap.get(email.threadId) || [];
      existing.push(parsed);
      threadMap.set(email.threadId, existing);
    }

    return Array.from(threadMap.entries()).map(([threadId, messages]) => ({
      id: threadId,
      messages,
      snippet: messages[0]?.snippet || "",
    }));
  }

  /**
   * Retrieves a single email thread with all its messages.
   * @param threadId - The JMAP thread ID
   * @returns The email thread with all messages sorted by received date
   */
  async getThread(threadId: string): Promise<EmailThread> {
    const log = this.logger.with({ action: "getThread", threadId });

    // Get all emails in the thread
    const response = await this.client.request([
      [
        "Email/query",
        {
          accountId: this.client.accountId,
          filter: { inThread: threadId },
          sort: [{ property: "receivedAt", isAscending: true }],
        },
        "0",
      ],
      [
        "Email/get",
        {
          accountId: this.client.accountId,
          "#ids": {
            resultOf: "0",
            name: "Email/query",
            path: "/ids",
          },
          properties: [
            "id",
            "threadId",
            "mailboxIds",
            "keywords",
            "from",
            "to",
            "cc",
            "bcc",
            "subject",
            "receivedAt",
            "sentAt",
            "preview",
            "hasAttachment",
            "messageId",
            "inReplyTo",
            "references",
            "replyTo",
            "bodyStructure",
            "bodyValues",
            "textBody",
            "htmlBody",
            "attachments",
          ],
          fetchAllBodyValues: true,
        },
        "1",
      ],
    ]);

    const emails = getResponseData<JMAPGetResponse<JMAPEmail>>(
      response.methodResponses[1],
    ).list;
    const messages = emails.map((e) => this.parseJMAPEmail(e));

    return {
      id: threadId,
      messages,
      snippet: messages[0]?.snippet || "",
    };
  }

  /**
   * Retrieves all mailboxes (labels/folders) from the account.
   * @returns Array of email labels representing mailboxes
   */
  async getLabels(): Promise<EmailLabel[]> {
    const cache = await this.ensureMailboxCache();

    return Array.from(cache.byId.values())
      .filter((mailbox) => !mailbox.role || mailbox.role === "archive")
      .map((mailbox) => ({
        id: mailbox.id,
        name: mailbox.name,
        type: mailbox.role ? "system" : "user",
        threadsTotal: mailbox.totalThreads,
      }));
  }

  async getLabelById(labelId: string): Promise<EmailLabel | null> {
    const mailbox = await this.getMailboxById(labelId);
    if (!mailbox) return null;

    return {
      id: mailbox.id,
      name: mailbox.name,
      type: mailbox.role ? "system" : "user",
      threadsTotal: mailbox.totalThreads,
    };
  }

  async getLabelByName(name: string): Promise<EmailLabel | null> {
    const mailbox = await this.getMailboxByName(name);
    if (!mailbox) return null;

    return {
      id: mailbox.id,
      name: mailbox.name,
      type: mailbox.role ? "system" : "user",
      threadsTotal: mailbox.totalThreads,
    };
  }

  /**
   * Retrieves a single email message by its ID.
   * @param messageId - The JMAP email ID
   * @returns The parsed email message
   * @throws Error if the message is not found
   */
  async getMessage(messageId: string): Promise<ParsedMessage> {
    const response = await this.client.request([
      [
        "Email/get",
        {
          accountId: this.client.accountId,
          ids: [messageId],
          properties: [
            "id",
            "threadId",
            "mailboxIds",
            "keywords",
            "from",
            "to",
            "cc",
            "bcc",
            "subject",
            "receivedAt",
            "sentAt",
            "preview",
            "hasAttachment",
            "messageId",
            "inReplyTo",
            "references",
            "replyTo",
            "bodyStructure",
            "bodyValues",
            "textBody",
            "htmlBody",
            "attachments",
          ],
          fetchAllBodyValues: true,
        },
        "0",
      ],
    ]);

    const emails = getResponseData<JMAPGetResponse<JMAPEmail>>(
      response.methodResponses[0],
    ).list;
    if (emails.length === 0) {
      throw new Error(`Email not found: ${messageId}`);
    }

    return this.parseJMAPEmail(emails[0]);
  }

  async getMessageByRfc822MessageId(
    rfc822MessageId: string,
  ): Promise<ParsedMessage | null> {
    const response = await this.client.request([
      [
        "Email/query",
        {
          accountId: this.client.accountId,
          filter: { header: ["message-id", rfc822MessageId] },
          limit: 1,
        },
        "0",
      ],
      [
        "Email/get",
        {
          accountId: this.client.accountId,
          "#ids": {
            resultOf: "0",
            name: "Email/query",
            path: "/ids",
          },
          properties: [
            "id",
            "threadId",
            "mailboxIds",
            "keywords",
            "from",
            "to",
            "cc",
            "bcc",
            "subject",
            "receivedAt",
            "sentAt",
            "preview",
            "hasAttachment",
            "messageId",
            "inReplyTo",
            "references",
            "replyTo",
            "bodyStructure",
            "bodyValues",
            "textBody",
            "htmlBody",
            "attachments",
          ],
          fetchAllBodyValues: true,
        },
        "1",
      ],
    ]);

    const emails = getResponseData<JMAPGetResponse<JMAPEmail>>(
      response.methodResponses[1],
    ).list;
    if (emails.length === 0) {
      return null;
    }

    return this.parseJMAPEmail(emails[0]);
  }

  async getSentMessages(maxResults = 20): Promise<ParsedMessage[]> {
    const sentMailbox = await this.getMailboxByRole(FastmailMailbox.SENT);
    if (!sentMailbox) return [];

    const response = await this.client.request([
      [
        "Email/query",
        {
          accountId: this.client.accountId,
          filter: { inMailbox: sentMailbox.id },
          sort: [{ property: "receivedAt", isAscending: false }],
          limit: maxResults,
        },
        "0",
      ],
      [
        "Email/get",
        {
          accountId: this.client.accountId,
          "#ids": {
            resultOf: "0",
            name: "Email/query",
            path: "/ids",
          },
          properties: [
            "id",
            "threadId",
            "mailboxIds",
            "keywords",
            "from",
            "to",
            "cc",
            "bcc",
            "subject",
            "receivedAt",
            "sentAt",
            "preview",
            "hasAttachment",
            "messageId",
            "inReplyTo",
            "references",
            "replyTo",
            "bodyStructure",
            "bodyValues",
            "textBody",
            "htmlBody",
            "attachments",
          ],
          fetchAllBodyValues: true,
        },
        "1",
      ],
    ]);

    const emails = getResponseData<JMAPGetResponse<JMAPEmail>>(
      response.methodResponses[1],
    ).list;
    return emails.map((e) => this.parseJMAPEmail(e));
  }

  async getInboxMessages(maxResults = 20): Promise<ParsedMessage[]> {
    const inbox = await this.getMailboxByRole(FastmailMailbox.INBOX);
    if (!inbox) return [];

    const response = await this.client.request([
      [
        "Email/query",
        {
          accountId: this.client.accountId,
          filter: { inMailbox: inbox.id },
          sort: [{ property: "receivedAt", isAscending: false }],
          limit: maxResults,
        },
        "0",
      ],
      [
        "Email/get",
        {
          accountId: this.client.accountId,
          "#ids": {
            resultOf: "0",
            name: "Email/query",
            path: "/ids",
          },
          properties: [
            "id",
            "threadId",
            "mailboxIds",
            "keywords",
            "from",
            "to",
            "cc",
            "bcc",
            "subject",
            "receivedAt",
            "sentAt",
            "preview",
            "hasAttachment",
            "messageId",
            "inReplyTo",
            "references",
            "replyTo",
            "bodyStructure",
            "bodyValues",
            "textBody",
            "htmlBody",
            "attachments",
          ],
          fetchAllBodyValues: true,
        },
        "1",
      ],
    ]);

    const emails = getResponseData<JMAPGetResponse<JMAPEmail>>(
      response.methodResponses[1],
    ).list;
    return emails.map((e) => this.parseJMAPEmail(e));
  }

  async getSentMessageIds(options: {
    maxResults: number;
    after?: Date;
    before?: Date;
  }): Promise<{ id: string; threadId: string }[]> {
    const sentMailbox = await this.getMailboxByRole(FastmailMailbox.SENT);
    if (!sentMailbox) return [];

    const filter: Record<string, unknown> = { inMailbox: sentMailbox.id };
    if (options.after) {
      filter.after = options.after.toISOString();
    }
    if (options.before) {
      filter.before = options.before.toISOString();
    }

    const response = await this.client.request([
      [
        "Email/query",
        {
          accountId: this.client.accountId,
          filter,
          sort: [{ property: "receivedAt", isAscending: false }],
          limit: options.maxResults,
        },
        "0",
      ],
      [
        "Email/get",
        {
          accountId: this.client.accountId,
          "#ids": {
            resultOf: "0",
            name: "Email/query",
            path: "/ids",
          },
          properties: ["id", "threadId"],
        },
        "1",
      ],
    ]);

    const emails = getResponseData<JMAPGetResponse<JMAPEmail>>(
      response.methodResponses[1],
    ).list;
    return emails.map((e) => ({ id: e.id, threadId: e.threadId }));
  }

  async getSentThreadsExcluding(options: {
    excludeToEmails?: string[];
    excludeFromEmails?: string[];
    maxResults?: number;
  }): Promise<EmailThread[]> {
    const sentMailbox = await this.getMailboxByRole(FastmailMailbox.SENT);
    if (!sentMailbox) return [];

    // JMAP doesn't have a direct way to exclude addresses, so we'll filter after fetching
    const response = await this.client.request([
      [
        "Email/query",
        {
          accountId: this.client.accountId,
          filter: { inMailbox: sentMailbox.id },
          sort: [{ property: "receivedAt", isAscending: false }],
          limit: (options.maxResults || 100) * 2, // Fetch extra to account for filtering
          collapseThreads: true,
        },
        "0",
      ],
      [
        "Email/get",
        {
          accountId: this.client.accountId,
          "#ids": {
            resultOf: "0",
            name: "Email/query",
            path: "/ids",
          },
          properties: ["id", "threadId", "from", "to", "preview"],
        },
        "1",
      ],
    ]);

    const emails = getResponseData<JMAPGetResponse<JMAPEmail>>(
      response.methodResponses[1],
    ).list;

    // Filter out excluded emails
    const excludeToSet = new Set(
      options.excludeToEmails?.map((e) => e.toLowerCase()) || [],
    );
    const excludeFromSet = new Set(
      options.excludeFromEmails?.map((e) => e.toLowerCase()) || [],
    );

    const filteredEmails = emails.filter((email) => {
      const toEmails = email.to?.map((t) => t.email.toLowerCase()) || [];
      const fromEmails = email.from?.map((f) => f.email.toLowerCase()) || [];

      const hasExcludedTo = toEmails.some((e) => excludeToSet.has(e));
      const hasExcludedFrom = fromEmails.some((e) => excludeFromSet.has(e));

      return !hasExcludedTo && !hasExcludedFrom;
    });

    // Group by thread and limit results
    const threadMap = new Map<string, JMAPEmail>();
    for (const email of filteredEmails) {
      if (!threadMap.has(email.threadId)) {
        threadMap.set(email.threadId, email);
      }
      if (threadMap.size >= (options.maxResults || 100)) break;
    }

    return Array.from(threadMap.values()).map((email) => ({
      id: email.threadId,
      messages: [],
      snippet: email.preview || "",
    }));
  }

  /**
   * Archives an email thread by removing it from inbox and moving to archive.
   * Uses JSON Pointer notation to patch mailbox flags without replacing other labels.
   * @param threadId - The thread ID to archive
   * @param _ownerEmail - The owner email (unused, for interface compatibility)
   */
  async archiveThread(threadId: string, _ownerEmail: string): Promise<void> {
    const log = this.logger.with({ action: "archiveThread", threadId });

    const inbox = await this.getMailboxByRole(FastmailMailbox.INBOX);
    const archive = await this.getMailboxByRole(FastmailMailbox.ARCHIVE);

    if (!inbox) {
      log.warn("Inbox mailbox not found");
      return;
    }

    // Get all emails in the thread
    const threadResponse = await this.client.request([
      [
        "Email/query",
        {
          accountId: this.client.accountId,
          filter: { inThread: threadId },
        },
        "0",
      ],
    ]);

    const emailIds = getResponseData<JMAPQueryResponse>(
      threadResponse.methodResponses[0],
    ).ids;

    if (emailIds.length === 0) return;

    // Build update object to remove from inbox using JSON Pointer notation
    // This patches individual mailbox flags instead of replacing all mailboxIds
    const update: Record<string, Record<string, boolean>> = {};
    for (const emailId of emailIds) {
      update[emailId] = {
        [`mailboxIds/${inbox.id}`]: false,
      };
      if (archive) {
        update[emailId][`mailboxIds/${archive.id}`] = true;
      }
    }

    await this.client.request([
      [
        "Email/set",
        {
          accountId: this.client.accountId,
          update,
        },
        "0",
      ],
    ]);

    log.info("Thread archived");
  }

  async archiveThreadWithLabel(
    threadId: string,
    ownerEmail: string,
    labelId?: string,
  ): Promise<void> {
    await this.archiveThread(threadId, ownerEmail);
    if (labelId) {
      // Get all emails in thread and add label
      const thread = await this.getThread(threadId);
      for (const message of thread.messages) {
        await this.labelMessage({
          messageId: message.id,
          labelId,
          labelName: null,
        });
      }
    }
  }

  async archiveMessage(messageId: string): Promise<void> {
    const log = this.logger.with({ action: "archiveMessage", messageId });

    const inbox = await this.getMailboxByRole(FastmailMailbox.INBOX);
    const archive = await this.getMailboxByRole(FastmailMailbox.ARCHIVE);

    if (!inbox) {
      log.warn("Inbox mailbox not found");
      return;
    }

    // Use JSON Pointer notation to patch individual mailbox flags
    // This preserves other mailbox memberships instead of replacing all mailboxIds
    const updatePatch: Record<string, boolean> = {
      [`mailboxIds/${inbox.id}`]: false,
    };
    if (archive) {
      updatePatch[`mailboxIds/${archive.id}`] = true;
    }

    await this.client.request([
      [
        "Email/set",
        {
          accountId: this.client.accountId,
          update: {
            [messageId]: updatePatch,
          },
        },
        "0",
      ],
    ]);

    log.info("Message archived");
  }

  async bulkArchiveFromSenders(
    fromEmails: string[],
    ownerEmail: string,
    _emailAccountId: string,
  ): Promise<void> {
    const log = this.logger.with({
      action: "bulkArchiveFromSenders",
      sendersCount: fromEmails.length,
    });

    for (const sender of fromEmails) {
      const inbox = await this.getMailboxByRole(FastmailMailbox.INBOX);
      if (!inbox) continue;

      // Query for all emails from this sender in inbox
      const response = await this.client.request([
        [
          "Email/query",
          {
            accountId: this.client.accountId,
            filter: {
              inMailbox: inbox.id,
              from: sender,
            },
            limit: 500,
          },
          "0",
        ],
      ]);

      const emailIds = getResponseData<JMAPQueryResponse>(
        response.methodResponses[0],
      ).ids;

      if (emailIds.length > 0) {
        // Archive all emails using JSON Pointer notation to patch mailbox flags
        const archive = await this.getMailboxByRole(FastmailMailbox.ARCHIVE);
        const update: Record<string, Record<string, boolean>> = {};

        for (const emailId of emailIds) {
          update[emailId] = {
            [`mailboxIds/${inbox.id}`]: false,
          };
          if (archive) {
            update[emailId][`mailboxIds/${archive.id}`] = true;
          }
        }

        await this.client.request([
          [
            "Email/set",
            {
              accountId: this.client.accountId,
              update,
            },
            "0",
          ],
        ]);
      }
    }

    log.info("Bulk archive completed");
  }

  async bulkTrashFromSenders(
    fromEmails: string[],
    _ownerEmail: string,
    _emailAccountId: string,
  ): Promise<void> {
    const log = this.logger.with({
      action: "bulkTrashFromSenders",
      sendersCount: fromEmails.length,
    });

    const trash = await this.getMailboxByRole(FastmailMailbox.TRASH);
    if (!trash) {
      log.warn("Trash mailbox not found");
      return;
    }

    for (const sender of fromEmails) {
      // Query for all emails from this sender
      const response = await this.client.request([
        [
          "Email/query",
          {
            accountId: this.client.accountId,
            filter: { from: sender },
            limit: 500,
          },
          "0",
        ],
      ]);

      const emailIds = getResponseData<JMAPQueryResponse>(
        response.methodResponses[0],
      ).ids;

      if (emailIds.length > 0) {
        // Move all to trash using JSON Pointer notation to patch mailbox flags
        const update: Record<string, Record<string, boolean>> = {};
        for (const emailId of emailIds) {
          update[emailId] = {
            [`mailboxIds/${trash.id}`]: true,
          };
        }

        await this.client.request([
          [
            "Email/set",
            {
              accountId: this.client.accountId,
              update,
            },
            "0",
          ],
        ]);
      }
    }

    log.info("Bulk trash completed");
  }

  async trashThread(
    threadId: string,
    _ownerEmail: string,
    _actionSource: "user" | "automation",
  ): Promise<void> {
    const log = this.logger.with({ action: "trashThread", threadId });

    const trash = await this.getMailboxByRole(FastmailMailbox.TRASH);
    if (!trash) {
      log.warn("Trash mailbox not found");
      return;
    }

    // Get all emails in the thread
    const threadResponse = await this.client.request([
      [
        "Email/query",
        {
          accountId: this.client.accountId,
          filter: { inThread: threadId },
        },
        "0",
      ],
    ]);

    const emailIds = getResponseData<JMAPQueryResponse>(
      threadResponse.methodResponses[0],
    ).ids;

    if (emailIds.length === 0) return;

    // Move all to trash using JSON Pointer notation to patch mailbox flags
    const update: Record<string, Record<string, boolean>> = {};
    for (const emailId of emailIds) {
      update[emailId] = {
        [`mailboxIds/${trash.id}`]: true,
      };
    }

    await this.client.request([
      [
        "Email/set",
        {
          accountId: this.client.accountId,
          update,
        },
        "0",
      ],
    ]);

    log.info("Thread trashed");
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
      // In JMAP, "labeling" means adding to a mailbox
      await this.client.request([
        [
          "Email/set",
          {
            accountId: this.client.accountId,
            update: {
              [messageId]: {
                [`mailboxIds/${labelId}`]: true,
              },
            },
          },
          "0",
        ],
      ]);

      return {};
    } catch (error) {
      // If label not found by ID, try by name
      if (labelName) {
        log.warn("Label not found by ID, trying by name");
        const mailbox = await this.getMailboxByName(labelName);
        if (mailbox) {
          await this.client.request([
            [
              "Email/set",
              {
                accountId: this.client.accountId,
                update: {
                  [messageId]: {
                    [`mailboxIds/${mailbox.id}`]: true,
                  },
                },
              },
              "0",
            ],
          ]);

          return { usedFallback: true, actualLabelId: mailbox.id };
        }
      }
      throw error;
    }
  }

  async getDraft(draftId: string): Promise<ParsedMessage | null> {
    try {
      return await this.getMessage(draftId);
    } catch {
      return null;
    }
  }

  async deleteDraft(draftId: string): Promise<void> {
    await this.client.request([
      [
        "Email/set",
        {
          accountId: this.client.accountId,
          destroy: [draftId],
        },
        "0",
      ],
    ]);
  }

  async draftEmail(
    email: ParsedMessage,
    args: { to?: string; subject?: string; content: string },
    userEmail: string,
    _executedRule?: { id: string; threadId: string; emailAccountId: string },
  ): Promise<{ draftId: string }> {
    const drafts = await this.getMailboxByRole(FastmailMailbox.DRAFTS);
    if (!drafts) {
      throw new Error("Drafts mailbox not found");
    }

    const to = args.to || email.headers.from;
    const subject = args.subject || `Re: ${email.subject}`;

    const response = await this.client.request([
      [
        "Email/set",
        {
          accountId: this.client.accountId,
          create: {
            draft: {
              mailboxIds: { [drafts.id]: true },
              keywords: { $draft: true },
              from: [{ email: userEmail }],
              to: [{ email: to }],
              subject,
              bodyValues: {
                body: { value: args.content, charset: "utf-8" },
              },
              textBody: [{ partId: "body", type: "text/plain" }],
              inReplyTo: email.headers["message-id"]
                ? [email.headers["message-id"]]
                : undefined,
              references: email.headers.references
                ? email.headers.references.split(" ")
                : undefined,
            },
          },
        },
        "0",
      ],
    ]);

    const created = getResponseData<
      JMAPSetResponse<{ id: string; threadId?: string }>
    >(response.methodResponses[0]).created?.draft;
    if (!created?.id) {
      throw new Error("Failed to create draft");
    }

    return { draftId: created.id };
  }

  async replyToEmail(email: ParsedMessage, content: string): Promise<void> {
    const sent = await this.getMailboxByRole(FastmailMailbox.SENT);
    if (!sent) {
      throw new Error("Sent mailbox not found");
    }

    // Get identity for sending
    const identityResponse = await this.client.request([
      [
        "Identity/get",
        {
          accountId: this.client.accountId,
        },
        "0",
      ],
    ]);

    const identities = getResponseData<JMAPGetResponse<JMAPIdentity>>(
      identityResponse.methodResponses[0],
    ).list;
    const identity = identities[0];

    if (!identity) {
      throw new Error("No identity found for sending");
    }

    const to = email.headers.from;

    await this.client.request([
      [
        "Email/set",
        {
          accountId: this.client.accountId,
          create: {
            reply: {
              mailboxIds: { [sent.id]: true },
              from: [{ email: identity.email, name: identity.name }],
              to: [{ email: to }],
              subject: `Re: ${email.subject}`,
              bodyValues: {
                body: { value: content, charset: "utf-8" },
              },
              textBody: [{ partId: "body", type: "text/plain" }],
              inReplyTo: email.headers["message-id"]
                ? [email.headers["message-id"]]
                : undefined,
              references: email.headers.references
                ? email.headers.references.split(" ")
                : undefined,
            },
          },
        },
        "0",
      ],
      [
        "EmailSubmission/set",
        {
          accountId: this.client.accountId,
          create: {
            submission: {
              identityId: identity.id,
              emailId: "#reply",
            },
          },
        },
        "1",
      ],
    ]);
  }

  /**
   * Sends a plain text email using JMAP EmailSubmission.
   * @param args - Email composition arguments
   * @param args.to - Comma-separated recipient email addresses
   * @param args.cc - Optional comma-separated CC addresses
   * @param args.bcc - Optional comma-separated BCC addresses
   * @param args.subject - Email subject line
   * @param args.messageText - Plain text message body
   */
  async sendEmail(args: {
    to: string;
    cc?: string;
    bcc?: string;
    subject: string;
    messageText: string;
  }): Promise<void> {
    const sent = await this.getMailboxByRole(FastmailMailbox.SENT);
    if (!sent) {
      throw new Error("Sent mailbox not found");
    }

    const identityResponse = await this.client.request([
      [
        "Identity/get",
        {
          accountId: this.client.accountId,
        },
        "0",
      ],
    ]);

    const identities = getResponseData<JMAPGetResponse<JMAPIdentity>>(
      identityResponse.methodResponses[0],
    ).list;
    const identity = identities[0];

    if (!identity) {
      throw new Error("No identity found for sending");
    }

    const toAddresses = args.to.split(",").map((e) => ({ email: e.trim() }));
    const ccAddresses = args.cc
      ? args.cc.split(",").map((e) => ({ email: e.trim() }))
      : undefined;
    const bccAddresses = args.bcc
      ? args.bcc.split(",").map((e) => ({ email: e.trim() }))
      : undefined;

    await this.client.request([
      [
        "Email/set",
        {
          accountId: this.client.accountId,
          create: {
            email: {
              mailboxIds: { [sent.id]: true },
              from: [{ email: identity.email, name: identity.name }],
              to: toAddresses,
              cc: ccAddresses,
              bcc: bccAddresses,
              subject: args.subject,
              bodyValues: {
                body: { value: args.messageText, charset: "utf-8" },
              },
              textBody: [{ partId: "body", type: "text/plain" }],
            },
          },
        },
        "0",
      ],
      [
        "EmailSubmission/set",
        {
          accountId: this.client.accountId,
          create: {
            submission: {
              identityId: identity.id,
              emailId: "#email",
            },
          },
        },
        "1",
      ],
    ]);
  }

  /**
   * Sends an HTML email with optional attachments using JMAP EmailSubmission.
   * @param body - Email composition options
   * @param body.replyToEmail - Optional reply context with thread info
   * @param body.to - Comma-separated recipient email addresses
   * @param body.cc - Optional comma-separated CC addresses
   * @param body.bcc - Optional comma-separated BCC addresses
   * @param body.replyTo - Optional reply-to address
   * @param body.subject - Email subject line
   * @param body.messageHtml - HTML message body
   * @param body.attachments - Optional array of attachments
   * @returns Object containing the created message ID and thread ID
   */
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
  }): Promise<{ messageId: string; threadId: string }> {
    const sent = await this.getMailboxByRole(FastmailMailbox.SENT);
    if (!sent) {
      throw new Error("Sent mailbox not found");
    }

    const identityResponse = await this.client.request([
      [
        "Identity/get",
        {
          accountId: this.client.accountId,
        },
        "0",
      ],
    ]);

    const identities = getResponseData<JMAPGetResponse<JMAPIdentity>>(
      identityResponse.methodResponses[0],
    ).list;
    const identity = identities[0];

    if (!identity) {
      throw new Error("No identity found for sending");
    }

    const toAddresses = body.to.split(",").map((e) => ({ email: e.trim() }));
    const ccAddresses = body.cc
      ? body.cc.split(",").map((e) => ({ email: e.trim() }))
      : undefined;
    const bccAddresses = body.bcc
      ? body.bcc.split(",").map((e) => ({ email: e.trim() }))
      : undefined;
    const replyToAddresses = body.replyTo
      ? [{ email: body.replyTo }]
      : undefined;

    // Upload attachments if provided
    const uploadedAttachments: Array<{
      blobId: string;
      type: string;
      name: string;
      size: number;
      disposition: string;
    }> = [];

    if (body.attachments && body.attachments.length > 0) {
      for (const attachment of body.attachments) {
        const uploaded = await this.uploadBlob(
          attachment.content,
          attachment.contentType,
        );
        uploadedAttachments.push({
          blobId: uploaded.blobId,
          type: attachment.contentType,
          name: attachment.filename,
          size: uploaded.size,
          disposition: "attachment",
        });
      }
    }

    const emailCreate: Record<string, unknown> = {
      mailboxIds: { [sent.id]: true },
      from: [{ email: identity.email, name: identity.name }],
      to: toAddresses,
      cc: ccAddresses,
      bcc: bccAddresses,
      replyTo: replyToAddresses,
      subject: body.subject,
      bodyValues: {
        body: { value: body.messageHtml, charset: "utf-8" },
      },
      htmlBody: [{ partId: "body", type: "text/html" }],
    };

    // Add attachments to the email if any were uploaded
    if (uploadedAttachments.length > 0) {
      emailCreate.attachments = uploadedAttachments;
    }

    if (body.replyToEmail) {
      emailCreate.inReplyTo = [body.replyToEmail.headerMessageId];
      if (body.replyToEmail.references) {
        emailCreate.references = body.replyToEmail.references.split(" ");
      }
    }

    const response = await this.client.request([
      [
        "Email/set",
        {
          accountId: this.client.accountId,
          create: { email: emailCreate },
        },
        "0",
      ],
      [
        "EmailSubmission/set",
        {
          accountId: this.client.accountId,
          create: {
            submission: {
              identityId: identity.id,
              emailId: "#email",
            },
          },
        },
        "1",
      ],
    ]);

    const created = getResponseData<
      JMAPSetResponse<{ id: string; threadId?: string }>
    >(response.methodResponses[0]).created?.email;
    if (!created?.id) {
      throw new Error("Failed to send email");
    }

    return {
      messageId: created.id,
      threadId: created.threadId || created.id,
    };
  }

  async forwardEmail(
    email: ParsedMessage,
    args: { to: string; cc?: string; bcc?: string; content?: string },
  ): Promise<void> {
    const originalContent = email.textHtml || email.textPlain || "";
    const forwardContent = args.content
      ? `${args.content}\n\n---------- Forwarded message ---------\n${originalContent}`
      : `---------- Forwarded message ---------\n${originalContent}`;

    await this.sendEmailWithHtml({
      to: args.to,
      cc: args.cc,
      bcc: args.bcc,
      subject: `Fwd: ${email.subject}`,
      messageHtml: forwardContent,
    });
  }

  async markSpam(threadId: string): Promise<void> {
    const junk = await this.getMailboxByRole(FastmailMailbox.JUNK);
    if (!junk) {
      this.logger.warn("Junk mailbox not found");
      return;
    }

    // Get all emails in the thread
    const threadResponse = await this.client.request([
      [
        "Email/query",
        {
          accountId: this.client.accountId,
          filter: { inThread: threadId },
        },
        "0",
      ],
    ]);

    const emailIds = getResponseData<JMAPQueryResponse>(
      threadResponse.methodResponses[0],
    ).ids;

    if (emailIds.length === 0) return;

    // Move all to junk using JSON Pointer notation to patch mailbox flags
    const update: Record<string, Record<string, boolean>> = {};
    for (const emailId of emailIds) {
      update[emailId] = {
        [`mailboxIds/${junk.id}`]: true,
      };
    }

    await this.client.request([
      [
        "Email/set",
        {
          accountId: this.client.accountId,
          update,
        },
        "0",
      ],
    ]);
  }

  async markRead(threadId: string): Promise<void> {
    await this.markReadThread(threadId, true);
  }

  async markReadThread(threadId: string, read: boolean): Promise<void> {
    // Get all emails in the thread
    const threadResponse = await this.client.request([
      [
        "Email/query",
        {
          accountId: this.client.accountId,
          filter: { inThread: threadId },
        },
        "0",
      ],
    ]);

    const emailIds = getResponseData<JMAPQueryResponse>(
      threadResponse.methodResponses[0],
    ).ids;

    if (emailIds.length === 0) return;

    // Update $seen keyword
    const update: Record<string, { keywords: Record<string, boolean> }> = {};
    for (const emailId of emailIds) {
      update[emailId] = {
        keywords: { $seen: read },
      };
    }

    await this.client.request([
      [
        "Email/set",
        {
          accountId: this.client.accountId,
          update,
        },
        "0",
      ],
    ]);
  }

  async blockUnsubscribedEmail(messageId: string): Promise<void> {
    // Archive the message (remove from inbox)
    await this.archiveMessage(messageId);
  }

  async getThreadMessages(threadId: string): Promise<ParsedMessage[]> {
    const thread = await this.getThread(threadId);
    return thread.messages;
  }

  async getThreadMessagesInInbox(threadId: string): Promise<ParsedMessage[]> {
    const inbox = await this.getMailboxByRole(FastmailMailbox.INBOX);
    if (!inbox) return [];

    const messages = await this.getThreadMessages(threadId);
    return messages.filter((m) => m.labelIds?.includes(inbox.id));
  }

  async getPreviousConversationMessages(
    messageIds: string[],
  ): Promise<ParsedMessage[]> {
    return this.getMessagesBatch(messageIds);
  }

  async removeThreadLabel(threadId: string, labelId: string): Promise<void> {
    // Get all emails in the thread
    const threadResponse = await this.client.request([
      [
        "Email/query",
        {
          accountId: this.client.accountId,
          filter: { inThread: threadId },
        },
        "0",
      ],
    ]);

    const emailIds = getResponseData<JMAPQueryResponse>(
      threadResponse.methodResponses[0],
    ).ids;

    if (emailIds.length === 0) return;

    // Remove label from all emails
    const update: Record<string, Record<string, boolean>> = {};
    for (const emailId of emailIds) {
      update[emailId] = {
        [`mailboxIds/${labelId}`]: false,
      };
    }

    await this.client.request([
      [
        "Email/set",
        {
          accountId: this.client.accountId,
          update,
        },
        "0",
      ],
    ]);
  }

  async removeThreadLabels(
    threadId: string,
    labelIds: string[],
  ): Promise<void> {
    if (labelIds.length === 0) return;

    for (const labelId of labelIds) {
      await this.removeThreadLabel(threadId, labelId);
    }
  }

  /**
   * Creates a new mailbox (label/folder) in the Fastmail account.
   * @param name - Display name for the new mailbox
   * @param _description - Unused, for interface compatibility
   * @returns The created email label
   */
  async createLabel(name: string, _description?: string): Promise<EmailLabel> {
    const response = await this.client.request([
      [
        "Mailbox/set",
        {
          accountId: this.client.accountId,
          create: {
            newMailbox: {
              name,
              isSubscribed: true,
            },
          },
        },
        "0",
      ],
    ]);

    const created = getResponseData<
      JMAPSetResponse<{ id: string; threadId?: string }>
    >(response.methodResponses[0]).created?.newMailbox;
    if (!created?.id) {
      throw new Error("Failed to create mailbox");
    }

    // Invalidate cache
    this.mailboxCache = null;

    return {
      id: created.id,
      name,
      type: "user",
    };
  }

  async deleteLabel(labelId: string): Promise<void> {
    await this.client.request([
      [
        "Mailbox/set",
        {
          accountId: this.client.accountId,
          destroy: [labelId],
        },
        "0",
      ],
    ]);

    // Invalidate cache
    this.mailboxCache = null;
  }

  async getOrCreateInboxZeroLabel(key: InboxZeroLabel): Promise<EmailLabel> {
    const labelName = `InboxZero/${key}`;

    // Check cache first
    const cachedId = this.inboxZeroLabels.get(key);
    if (cachedId) {
      const label = await this.getLabelById(cachedId);
      if (label) return label;
    }

    // Try to find existing
    const existing = await this.getLabelByName(labelName);
    if (existing) {
      this.inboxZeroLabels.set(key, existing.id);
      return existing;
    }

    // Create new
    const created = await this.createLabel(labelName);
    this.inboxZeroLabels.set(key, created.id);
    return created;
  }

  async getOriginalMessage(
    originalMessageId: string | undefined,
  ): Promise<ParsedMessage | null> {
    if (!originalMessageId) return null;
    return this.getMessageByRfc822MessageId(originalMessageId);
  }

  async getFiltersList(): Promise<EmailFilter[]> {
    // JMAP doesn't have native filter support like Gmail
    // Fastmail uses Sieve for filters, which requires a different approach
    this.logger.warn("Filters are not directly supported in JMAP");
    return [];
  }

  async createFilter(_options: {
    from: string;
    addLabelIds?: string[];
    removeLabelIds?: string[];
  }): Promise<{ status: number }> {
    this.logger.warn("Creating filters is not supported in JMAP");
    return { status: 501 };
  }

  async createAutoArchiveFilter(_options: {
    from: string;
    gmailLabelId?: string;
    labelName?: string;
  }): Promise<{ status: number }> {
    this.logger.warn("Creating auto-archive filters is not supported in JMAP");
    return { status: 501 };
  }

  async deleteFilter(_id: string): Promise<{ status: number }> {
    this.logger.warn("Deleting filters is not supported in JMAP");
    return { status: 501 };
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
    const filter: Record<string, unknown> = {};

    if (options.query) {
      filter.text = options.query;
    }
    if (options.before) {
      filter.before = options.before.toISOString();
    }
    if (options.after) {
      filter.after = options.after.toISOString();
    }

    const position = options.pageToken
      ? Number.parseInt(options.pageToken, 10)
      : 0;
    const limit = options.maxResults || 20;

    const response = await this.client.request([
      [
        "Email/query",
        {
          accountId: this.client.accountId,
          filter: Object.keys(filter).length > 0 ? filter : undefined,
          sort: [{ property: "receivedAt", isAscending: false }],
          position,
          limit,
        },
        "0",
      ],
      [
        "Email/get",
        {
          accountId: this.client.accountId,
          "#ids": {
            resultOf: "0",
            name: "Email/query",
            path: "/ids",
          },
          properties: [
            "id",
            "threadId",
            "mailboxIds",
            "keywords",
            "from",
            "to",
            "cc",
            "bcc",
            "subject",
            "receivedAt",
            "sentAt",
            "preview",
            "hasAttachment",
            "messageId",
            "inReplyTo",
            "references",
            "replyTo",
            "bodyStructure",
            "bodyValues",
            "textBody",
            "htmlBody",
            "attachments",
          ],
          fetchAllBodyValues: true,
        },
        "1",
      ],
    ]);

    const queryResult = getResponseData<JMAPQueryResponse>(
      response.methodResponses[0],
    );
    const emails = getResponseData<JMAPGetResponse<JMAPEmail>>(
      response.methodResponses[1],
    ).list;
    const messages = emails.map((e) => this.parseJMAPEmail(e));

    const total = queryResult.total || 0;
    const nextPosition = position + emails.length;
    const nextPageToken =
      nextPosition < total ? String(nextPosition) : undefined;

    return { messages, nextPageToken };
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
    const filter: Record<string, unknown> = {
      from: options.senderEmail,
    };

    if (options.before) {
      filter.before = options.before.toISOString();
    }
    if (options.after) {
      filter.after = options.after.toISOString();
    }

    const position = options.pageToken
      ? Number.parseInt(options.pageToken, 10)
      : 0;
    const limit = options.maxResults || 20;

    const response = await this.client.request([
      [
        "Email/query",
        {
          accountId: this.client.accountId,
          filter,
          sort: [{ property: "receivedAt", isAscending: false }],
          position,
          limit,
        },
        "0",
      ],
      [
        "Email/get",
        {
          accountId: this.client.accountId,
          "#ids": {
            resultOf: "0",
            name: "Email/query",
            path: "/ids",
          },
          properties: [
            "id",
            "threadId",
            "mailboxIds",
            "keywords",
            "from",
            "to",
            "cc",
            "bcc",
            "subject",
            "receivedAt",
            "sentAt",
            "preview",
            "hasAttachment",
            "messageId",
            "inReplyTo",
            "references",
            "replyTo",
            "bodyStructure",
            "bodyValues",
            "textBody",
            "htmlBody",
            "attachments",
          ],
          fetchAllBodyValues: true,
        },
        "1",
      ],
    ]);

    const queryResult = getResponseData<JMAPQueryResponse>(
      response.methodResponses[0],
    );
    const emails = getResponseData<JMAPGetResponse<JMAPEmail>>(
      response.methodResponses[1],
    ).list;
    const messages = emails.map((e) => this.parseJMAPEmail(e));

    const total = queryResult.total || 0;
    const nextPosition = position + emails.length;
    const nextPageToken =
      nextPosition < total ? String(nextPosition) : undefined;

    return { messages, nextPageToken };
  }

  async getThreadsWithParticipant(options: {
    participantEmail: string;
    maxThreads?: number;
  }): Promise<EmailThread[]> {
    const { participantEmail, maxThreads = 5 } = options;

    const response = await this.client.request([
      [
        "Email/query",
        {
          accountId: this.client.accountId,
          filter: {
            operator: "OR",
            conditions: [{ from: participantEmail }, { to: participantEmail }],
          },
          sort: [{ property: "receivedAt", isAscending: false }],
          limit: maxThreads * 3, // Fetch extra to account for multiple emails per thread
          collapseThreads: true,
        },
        "0",
      ],
      [
        "Email/get",
        {
          accountId: this.client.accountId,
          "#ids": {
            resultOf: "0",
            name: "Email/query",
            path: "/ids",
          },
          properties: [
            "id",
            "threadId",
            "mailboxIds",
            "keywords",
            "from",
            "to",
            "cc",
            "bcc",
            "subject",
            "receivedAt",
            "sentAt",
            "preview",
            "hasAttachment",
            "messageId",
            "inReplyTo",
            "references",
            "replyTo",
            "bodyStructure",
            "bodyValues",
            "textBody",
            "htmlBody",
            "attachments",
          ],
          fetchAllBodyValues: true,
        },
        "1",
      ],
    ]);

    const emails = getResponseData<JMAPGetResponse<JMAPEmail>>(
      response.methodResponses[1],
    ).list;

    // Group by thread
    const threadMap = new Map<string, ParsedMessage[]>();
    for (const email of emails) {
      const parsed = this.parseJMAPEmail(email);
      const existing = threadMap.get(email.threadId) || [];
      existing.push(parsed);
      threadMap.set(email.threadId, existing);
      if (threadMap.size >= maxThreads) break;
    }

    return Array.from(threadMap.entries())
      .slice(0, maxThreads)
      .map(([threadId, messages]) => ({
        id: threadId,
        messages,
        snippet: messages[0]?.snippet || "",
      }));
  }

  async getDrafts(options?: { maxResults?: number }): Promise<ParsedMessage[]> {
    const drafts = await this.getMailboxByRole(FastmailMailbox.DRAFTS);
    if (!drafts) return [];

    const response = await this.client.request([
      [
        "Email/query",
        {
          accountId: this.client.accountId,
          filter: { inMailbox: drafts.id },
          sort: [{ property: "receivedAt", isAscending: false }],
          limit: options?.maxResults || 50,
        },
        "0",
      ],
      [
        "Email/get",
        {
          accountId: this.client.accountId,
          "#ids": {
            resultOf: "0",
            name: "Email/query",
            path: "/ids",
          },
          properties: [
            "id",
            "threadId",
            "mailboxIds",
            "keywords",
            "from",
            "to",
            "cc",
            "bcc",
            "subject",
            "receivedAt",
            "sentAt",
            "preview",
            "hasAttachment",
            "messageId",
            "inReplyTo",
            "references",
            "replyTo",
            "bodyStructure",
            "bodyValues",
            "textBody",
            "htmlBody",
            "attachments",
          ],
          fetchAllBodyValues: true,
        },
        "1",
      ],
    ]);

    const emails = getResponseData<JMAPGetResponse<JMAPEmail>>(
      response.methodResponses[1],
    ).list;
    return emails.map((e) => this.parseJMAPEmail(e));
  }

  async getMessagesBatch(messageIds: string[]): Promise<ParsedMessage[]> {
    if (messageIds.length === 0) return [];

    const response = await this.client.request([
      [
        "Email/get",
        {
          accountId: this.client.accountId,
          ids: messageIds,
          properties: [
            "id",
            "threadId",
            "mailboxIds",
            "keywords",
            "from",
            "to",
            "cc",
            "bcc",
            "subject",
            "receivedAt",
            "sentAt",
            "preview",
            "hasAttachment",
            "messageId",
            "inReplyTo",
            "references",
            "replyTo",
            "bodyStructure",
            "bodyValues",
            "textBody",
            "htmlBody",
            "attachments",
          ],
          fetchAllBodyValues: true,
        },
        "0",
      ],
    ]);

    const emails = getResponseData<JMAPGetResponse<JMAPEmail>>(
      response.methodResponses[0],
    ).list;
    return emails.map((e) => this.parseJMAPEmail(e));
  }

  getAccessToken(): string {
    return getAccessTokenFromClient(this.client);
  }

  async checkIfReplySent(senderEmail: string): Promise<boolean> {
    const log = this.logger.with({
      action: "checkIfReplySent",
      sender: senderEmail,
    });

    try {
      const sent = await this.getMailboxByRole(FastmailMailbox.SENT);
      if (!sent) return true;

      const response = await this.client.request([
        [
          "Email/query",
          {
            accountId: this.client.accountId,
            filter: {
              inMailbox: sent.id,
              to: senderEmail,
            },
            limit: 1,
          },
          "0",
        ],
      ]);

      const ids = getResponseData<JMAPQueryResponse>(
        response.methodResponses[0],
      ).ids;
      const hasSent = ids.length > 0;
      log.info("Checked for sent reply", { hasSent });
      return hasSent;
    } catch (error) {
      log.error("Error checking if reply was sent", { error });
      return true; // Default to true on error
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
      const response = await this.client.request([
        [
          "Email/query",
          {
            accountId: this.client.accountId,
            filter: { from: senderEmail },
            limit: threshold,
          },
          "0",
        ],
      ]);

      const ids = getResponseData<JMAPQueryResponse>(
        response.methodResponses[0],
      ).ids;
      const count = ids.length;
      log.info("Received message count", { count });
      return count;
    } catch (error) {
      log.error("Error counting received messages", { error });
      return 0;
    }
  }

  /**
   * Downloads an email attachment by its blob ID.
   * @param messageId - The email message ID (unused, for interface compatibility)
   * @param attachmentId - The JMAP blob ID of the attachment
   * @returns Object with base64-encoded data and size in bytes
   */
  async getAttachment(
    messageId: string,
    attachmentId: string,
  ): Promise<{ data: string; size: number }> {
    // JMAP uses blob download URL
    const downloadUrl = this.client.session.downloadUrl
      .replace("{accountId}", this.client.accountId)
      .replace("{blobId}", attachmentId)
      .replace("{name}", "attachment")
      .replace("{type}", "application/octet-stream");

    const response = await fetch(downloadUrl, {
      headers: {
        Authorization: `Bearer ${this.client.accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to download attachment: ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    // Convert ArrayBuffer to base64 using Web APIs
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);

    return {
      data: base64,
      size: buffer.byteLength,
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
    const { fromEmail, after, before, isUnread, type, labelId } =
      options.query || {};

    const filter: Record<string, unknown> = {};

    if (fromEmail) {
      filter.from = fromEmail;
    }
    if (after) {
      filter.after = after.toISOString();
    }
    if (before) {
      filter.before = before.toISOString();
    }
    if (isUnread) {
      filter.notKeyword = "$seen";
    }

    // Handle type-based mailbox filtering
    let mailboxId: string | undefined;
    if (labelId) {
      mailboxId = labelId;
    } else if (type) {
      const roleMap: Record<string, string> = {
        inbox: FastmailMailbox.INBOX,
        sent: FastmailMailbox.SENT,
        draft: FastmailMailbox.DRAFTS,
        trash: FastmailMailbox.TRASH,
        spam: FastmailMailbox.JUNK,
        starred: FastmailMailbox.FLAGGED,
        archive: FastmailMailbox.ARCHIVE,
      };
      const role = roleMap[type];
      if (role) {
        const mailbox = await this.getMailboxByRole(role);
        mailboxId = mailbox?.id;
      }
    }

    if (mailboxId) {
      filter.inMailbox = mailboxId;
    }

    const position = options.pageToken
      ? Number.parseInt(options.pageToken, 10)
      : 0;
    const limit = options.maxResults || 50;

    const response = await this.client.request([
      [
        "Email/query",
        {
          accountId: this.client.accountId,
          filter: Object.keys(filter).length > 0 ? filter : undefined,
          sort: [{ property: "receivedAt", isAscending: false }],
          position,
          limit,
          collapseThreads: true,
        },
        "0",
      ],
      [
        "Email/get",
        {
          accountId: this.client.accountId,
          "#ids": {
            resultOf: "0",
            name: "Email/query",
            path: "/ids",
          },
          properties: [
            "id",
            "threadId",
            "mailboxIds",
            "keywords",
            "from",
            "to",
            "cc",
            "bcc",
            "subject",
            "receivedAt",
            "sentAt",
            "preview",
            "hasAttachment",
            "messageId",
            "inReplyTo",
            "references",
            "replyTo",
            "bodyStructure",
            "bodyValues",
            "textBody",
            "htmlBody",
            "attachments",
          ],
          fetchAllBodyValues: true,
        },
        "1",
      ],
    ]);

    const queryResult = getResponseData<JMAPQueryResponse>(
      response.methodResponses[0],
    );
    const emails = getResponseData<JMAPGetResponse<JMAPEmail>>(
      response.methodResponses[1],
    ).list;

    // Group by thread
    const threadMap = new Map<string, ParsedMessage[]>();
    for (const email of emails) {
      const parsed = this.parseJMAPEmail(email);
      const existing = threadMap.get(email.threadId) || [];
      existing.push(parsed);
      threadMap.set(email.threadId, existing);
    }

    const threads: EmailThread[] = Array.from(threadMap.entries()).map(
      ([threadId, messages]) => ({
        id: threadId,
        messages,
        snippet: messages[0]?.snippet || "",
      }),
    );

    const total = queryResult.total || 0;
    const nextPosition = position + emails.length;
    const nextPageToken =
      nextPosition < total ? String(nextPosition) : undefined;

    return { threads, nextPageToken };
  }

  async hasPreviousCommunicationsWithSenderOrDomain(options: {
    from: string;
    date: Date;
    messageId: string;
  }): Promise<boolean> {
    const { from, date } = options;

    // Extract email from "Name <email>" format
    const emailMatch = from.match(/<([^>]+)>/) || [null, from];
    const email = emailMatch[1] || from;
    const domain = email.split("@")[1];

    // Check for previous emails from this sender before this date
    const response = await this.client.request([
      [
        "Email/query",
        {
          accountId: this.client.accountId,
          filter: {
            operator: "OR",
            conditions: [
              { from: email, before: date.toISOString() },
              { from: `@${domain}`, before: date.toISOString() },
            ],
          },
          limit: 1,
        },
        "0",
      ],
    ]);

    const ids = getResponseData<JMAPQueryResponse>(
      response.methodResponses[0],
    ).ids;
    return ids.length > 0;
  }

  async getThreadsFromSenderWithSubject(
    sender: string,
    limit: number,
  ): Promise<Array<{ id: string; snippet: string; subject: string }>> {
    const response = await this.client.request([
      [
        "Email/query",
        {
          accountId: this.client.accountId,
          filter: { from: sender },
          sort: [{ property: "receivedAt", isAscending: false }],
          limit,
          collapseThreads: true,
        },
        "0",
      ],
      [
        "Email/get",
        {
          accountId: this.client.accountId,
          "#ids": {
            resultOf: "0",
            name: "Email/query",
            path: "/ids",
          },
          properties: ["id", "threadId", "subject", "preview"],
        },
        "1",
      ],
    ]);

    const emails = getResponseData<JMAPGetResponse<JMAPEmail>>(
      response.methodResponses[1],
    ).list;

    // Dedupe by thread
    const seen = new Set<string>();
    return emails
      .filter((e) => {
        if (seen.has(e.threadId)) return false;
        seen.add(e.threadId);
        return true;
      })
      .map((e) => ({
        id: e.threadId,
        snippet: e.preview || "",
        subject: e.subject || "",
      }));
  }

  async processHistory(_options: {
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
    // JMAP uses EventSource for real-time updates, not history-based sync
    this.logger.warn("processHistory is not implemented for Fastmail JMAP");
  }

  async watchEmails(): Promise<{
    expirationDate: Date;
    subscriptionId?: string;
  } | null> {
    // JMAP uses EventSource for push notifications
    // This would require setting up a persistent connection
    this.logger.warn("watchEmails is not fully implemented for Fastmail JMAP");
    return null;
  }

  async unwatchEmails(_subscriptionId?: string): Promise<void> {
    this.logger.warn("unwatchEmails is not implemented for Fastmail JMAP");
  }

  isReplyInThread(message: ParsedMessage): boolean {
    // Check if this message has in-reply-to or references headers
    return !!(message.headers["in-reply-to"] || message.headers.references);
  }

  isSentMessage(message: ParsedMessage): boolean {
    // Check if the message is in the sent mailbox
    // This would need to be checked against actual mailbox IDs
    return (
      message.labelIds?.some(async (id) => {
        const mailbox = await this.getMailboxById(id);
        return mailbox?.role === FastmailMailbox.SENT;
      }) || false
    );
  }

  async getFolders(): Promise<OutlookFolder[]> {
    const cache = await this.ensureMailboxCache();

    // Build folder tree structure
    const rootFolders: OutlookFolder[] = [];
    const folderMap = new Map<string, OutlookFolder>();

    // First pass: create all folder objects
    for (const mailbox of cache.byId.values()) {
      const folder: OutlookFolder = {
        id: mailbox.id,
        displayName: mailbox.name,
        childFolders: [],
        childFolderCount: 0,
      };
      folderMap.set(mailbox.id, folder);
    }

    // Second pass: build tree structure
    for (const mailbox of cache.byId.values()) {
      const folder = folderMap.get(mailbox.id)!;
      if (mailbox.parentId) {
        const parent = folderMap.get(mailbox.parentId);
        if (parent) {
          parent.childFolders.push(folder);
          parent.childFolderCount = parent.childFolders.length;
        } else {
          rootFolders.push(folder);
        }
      } else {
        rootFolders.push(folder);
      }
    }

    return rootFolders;
  }

  async moveThreadToFolder(
    threadId: string,
    _ownerEmail: string,
    folderName: string,
  ): Promise<void> {
    const mailbox = await this.getMailboxByName(folderName);
    if (!mailbox) {
      this.logger.warn("Mailbox not found", { folderName });
      return;
    }

    // Get all emails in the thread
    const threadResponse = await this.client.request([
      [
        "Email/query",
        {
          accountId: this.client.accountId,
          filter: { inThread: threadId },
        },
        "0",
      ],
    ]);

    const emailIds = getResponseData<JMAPQueryResponse>(
      threadResponse.methodResponses[0],
    ).ids;

    if (emailIds.length === 0) return;

    // Move all to target mailbox using JSON Pointer notation to patch mailbox flags
    const update: Record<string, Record<string, boolean>> = {};
    for (const emailId of emailIds) {
      update[emailId] = {
        [`mailboxIds/${mailbox.id}`]: true,
      };
    }

    await this.client.request([
      [
        "Email/set",
        {
          accountId: this.client.accountId,
          update,
        },
        "0",
      ],
    ]);
  }

  async getOrCreateOutlookFolderIdByName(folderName: string): Promise<string> {
    const existing = await this.getMailboxByName(folderName);
    if (existing) return existing.id;

    const created = await this.createLabel(folderName);
    return created.id;
  }

  async getSignatures(): Promise<EmailSignature[]> {
    const response = await this.client.request([
      [
        "Identity/get",
        {
          accountId: this.client.accountId,
        },
        "0",
      ],
    ]);

    const identities = getResponseData<JMAPGetResponse<JMAPIdentity>>(
      response.methodResponses[0],
    ).list;

    return identities.map((identity, index) => ({
      email: identity.email,
      signature: identity.htmlSignature || identity.textSignature || "",
      isDefault: index === 0,
      displayName: identity.name,
    }));
  }
}
