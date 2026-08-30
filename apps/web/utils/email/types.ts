import type { ParsedMessage } from "@/utils/types";
import type { InboxZeroLabel } from "@/utils/label";
import type { ThreadsQuery } from "@/utils/threads/validation";
import type {
  OutlookFolder,
  OutlookSystemFolder,
} from "@/utils/outlook/folders";
import type { Attachment as MailAttachment } from "nodemailer/lib/mailer";
import type { SendEmailBody } from "@/utils/types/mail";
import type { EmailContact } from "@/utils/email/contact";

export interface EmailThread {
  historyId?: string;
  id: string;
  messages: ParsedMessage[];
  snippet: string;
}

export type MailboxSyncPage = {
  cursor: string;
  deletedMessageIds: string[];
  hasMore: boolean;
  reset: boolean;
  upsertedMessages: ParsedMessage[];
};

export interface EmailLabel {
  color?: {
    textColor?: string | null;
    backgroundColor?: string | null;
  };
  id: string;
  labelListVisibility?: string;
  messageListVisibility?: string;
  name: string;
  threadsTotal?: number;
  // Only populated by providers that report per-label counts (Gmail `labels.get`)
  threadsUnread?: number;
  type: string;
}

export type EmailLabelColor = {
  backgroundColor: string;
  textColor: string;
};

export type EmailLabelUpdate = {
  color?: EmailLabelColor;
  name?: string;
};

export type EmailFolderCount = {
  id: string;
  name: string;
  total: number;
  unread: number;
  systemType?: OutlookSystemFolder;
};

export interface EmailFilter {
  action?: {
    addLabelIds?: string[];
    removeLabelIds?: string[];
  };
  criteria?: {
    from?: string;
  };
  id: string;
}

export interface EmailSignature {
  displayName?: string;
  email: string;
  isDefault: boolean;
  signature: string;
}

export interface SentMessagePage {
  messages: { id: string; threadId: string }[];
  nextPageToken?: string;
}

export type BulkArchiveThread = {
  threadId: string;
  messageIds: string[];
};

export type BulkArchiveResult = {
  succeededThreadIds: string[];
  failedThreadIds: string[];
};

export interface EmailProvider {
  archiveMessage(messageId: string): Promise<void>;
  archiveMessages(messageIds: string[], labelId?: string): Promise<void>;
  archiveThread(threadId: string, ownerEmail: string): Promise<void>;
  archiveThreadWithLabel(
    threadId: string,
    ownerEmail: string,
    labelId?: string,
  ): Promise<void>;
  blockUnsubscribedEmail(messageId: string): Promise<void>;
  bulkArchiveFromSenders(
    fromEmails: string[],
    ownerEmail: string,
    emailAccountId: string,
  ): Promise<void>;
  bulkArchiveThreads(
    threads: BulkArchiveThread[],
    ownerEmail: string,
  ): Promise<BulkArchiveResult>;
  bulkTrashFromSenders(
    fromEmails: string[],
    ownerEmail: string,
    emailAccountId: string,
  ): Promise<void>;
  checkIfReplySent(senderEmail: string): Promise<boolean>;
  countReceivedMessages(
    senderEmail: string,
    threshold: number,
  ): Promise<number>;
  createAutoArchiveFilter(options: {
    from: string;
    gmailLabelId?: string;
    labelName?: string;
  }): Promise<{ status: number }>;
  createDraft(params: {
    to: string;
    subject: string;
    messageHtml: string;
    replyToMessageId?: string; // For proper threading
  }): Promise<{ id: string }>;
  createFilter(options: {
    from: string;
    addLabelIds?: string[];
    removeLabelIds?: string[];
  }): Promise<{ status: number }>;
  createLabel(name: string, description?: string): Promise<EmailLabel>;
  deleteDraft(draftId: string): Promise<void>;
  deleteFilter(id: string): Promise<{ status: number }>;
  deleteFolder(folderId: string): Promise<void>;
  deleteLabel(labelId: string): Promise<void>;
  draftEmail(
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
  ): Promise<{ draftId: string }>;
  forwardEmail(
    email: ParsedMessage,
    args: {
      to: string;
      cc?: string;
      bcc?: string;
      content?: string;
      from?: string;
    },
  ): Promise<{ messageId: string }>;
  getAccessToken(): string;
  getAttachment(
    messageId: string,
    attachmentId: string,
  ): Promise<{ data: string; size: number }>;
  getDraft(draftId: string): Promise<ParsedMessage | null>;
  getDrafts(options?: { maxResults?: number }): Promise<ParsedMessage[]>;
  getFiltersList(): Promise<EmailFilter[]>;
  getFolderCounts(): Promise<EmailFolderCount[]>;
  getFolders(): Promise<OutlookFolder[]>;
  getInboxMessages(maxResults?: number): Promise<ParsedMessage[]>;
  getInboxStats(): Promise<{ total: number; unread: number }>;
  getLabelById(labelId: string): Promise<EmailLabel | null>;
  getLabelByName(name: string): Promise<EmailLabel | null>;
  getLabels(options?: { includeHidden?: boolean }): Promise<EmailLabel[]>;
  getLatestMessageFromThreadSnapshot(
    thread: Pick<EmailThread, "id" | "messages">,
  ): Promise<ParsedMessage | null>;
  getLatestMessageInThread(threadId: string): Promise<ParsedMessage | null>;
  getMailboxSyncPage(options: {
    after?: Date;
    cursor?: string;
    limit: number;
  }): Promise<MailboxSyncPage>;
  getMessage(messageId: string): Promise<ParsedMessage>;
  getMessageByRfc822MessageId(
    rfc822MessageId: string,
  ): Promise<ParsedMessage | null>;
  getMessagesBatch(messageIds: string[]): Promise<ParsedMessage[]>;
  getMessagesFromSender(options: {
    senderEmail: string;
    maxResults?: number;
    pageToken?: string;
    before?: Date;
    after?: Date;
  }): Promise<{
    messages: ParsedMessage[];
    nextPageToken?: string;
  }>;
  getMessagesWithAttachments(options: {
    maxResults?: number;
    pageToken?: string;
  }): Promise<{
    messages: ParsedMessage[];
    nextPageToken?: string;
  }>;
  getMessagesWithPagination(options: {
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
  }>;
  getOrCreateFolderIdByName(folderName: string): Promise<string>;
  getOrCreateInboxZeroLabel(key: InboxZeroLabel): Promise<EmailLabel>;
  getOriginalMessage(
    originalMessageId: string | undefined,
  ): Promise<ParsedMessage | null>;
  getPreviousConversationMessages(
    messageIds: string[],
  ): Promise<ParsedMessage[]>;
  getSentMessageIds(options: {
    maxResults: number;
    after?: Date;
    before?: Date;
    pageToken?: string;
  }): Promise<SentMessagePage>;
  getSentMessages(maxResults?: number): Promise<ParsedMessage[]>;
  getSentThreadsExcluding(options: {
    excludeToEmails?: string[];
    excludeFromEmails?: string[];
    maxResults?: number;
  }): Promise<EmailThread[]>;
  getSignatures(): Promise<EmailSignature[]>;
  getThread(threadId: string): Promise<EmailThread>;
  getThreadMessages(threadId: string): Promise<ParsedMessage[]>;
  getThreadMessagesInInbox(threadId: string): Promise<ParsedMessage[]>;
  getThreads(folderId?: string): Promise<EmailThread[]>;
  getThreadsFromSenderWithSubject(
    sender: string,
    limit: number,
  ): Promise<Array<{ id: string; snippet: string; subject: string }>>;
  getThreadsWithLabel(options: {
    labelId: string;
    maxResults?: number;
  }): Promise<EmailThread[]>;
  getThreadsWithParticipant(options: {
    participantEmail: string;
    maxThreads?: number;
  }): Promise<EmailThread[]>;
  getThreadsWithQuery(options: {
    query?: ThreadsQuery;
    maxResults?: number;
    pageToken?: string;
    messageFormat?: "full" | "metadata";
  }): Promise<{
    threads: EmailThread[];
    nextPageToken?: string;
  }>;
  hasPreviousCommunicationsWithSenderOrDomain(options: {
    from: string;
    date: Date;
    messageId: string;
  }): Promise<boolean>;
  isReplyInThread(message: ParsedMessage): boolean;
  isSentMessage(message: ParsedMessage): boolean;
  labelMessage(options: {
    messageId: string;
    labelId: string;
    labelName: string | null;
  }): Promise<{ usedFallback?: boolean; actualLabelId?: string }>;
  markMessagesReadState(messageIds: string[], read: boolean): Promise<void>;
  markRead(threadId: string): Promise<void>;
  markReadThread(threadId: string, read: boolean): Promise<void>;
  markSpam(threadId: string): Promise<void>;
  moveThreadToFolder(
    threadId: string,
    ownerEmail: string,
    folderName: string,
  ): Promise<void>;
  readonly name: "google" | "microsoft";
  removeThreadLabel(threadId: string, labelId: string): Promise<void>;
  removeThreadLabels(threadId: string, labelIds: string[]): Promise<void>;
  renameFolder(folderId: string, name: string): Promise<void>;
  replyToEmail(
    email: ParsedMessage,
    content: string,
    options?: {
      replyTo?: string;
      from?: string;
      attachments?: MailAttachment[];
    },
  ): Promise<{ messageId: string }>;
  searchContacts(query: string): Promise<EmailContact[]>;
  searchMessages(options: {
    query: string;
    maxResults?: number;
    pageToken?: string;
    readState?: "read" | "unread";
    labelName?: string;
  }): Promise<{
    messages: ParsedMessage[];
    nextPageToken?: string;
  }>;
  /** Free-text search over the whole mailbox, like the provider's own search box. */
  searchThreads(options: {
    query: string;
    maxResults?: number;
    pageToken?: string;
    messageFormat?: "full" | "metadata";
  }): Promise<{
    threads: EmailThread[];
    nextPageToken?: string;
  }>;
  sendDraft(draftId: string): Promise<{ messageId: string; threadId: string }>;
  sendEmail(args: {
    to: string;
    cc?: string;
    bcc?: string;
    subject: string;
    messageText: string;
    attachments?: MailAttachment[];
  }): Promise<{ messageId: string }>;
  sendEmailWithHtml(body: SendEmailBody): Promise<{
    messageId: string;
    threadId: string;
  }>;
  starMessage(messageId: string): Promise<void>;
  toJSON(): { name: string; type: string };
  trashMessages(messageIds: string[]): Promise<void>;
  trashThread(
    threadId: string,
    ownerEmail: string,
    actionSource: "user" | "automation",
  ): Promise<void>;
  unarchiveMessages(messageIds: string[]): Promise<void>;
  unarchiveThread(threadId: string): Promise<void>;
  /**
   * Restores a trashed thread, to undo `trashThread`. Gmail puts it back under
   * its pre-trash labels; Outlook has no such record and moves it to the inbox.
   */
  untrashMessages(messageIds: string[]): Promise<void>;
  untrashThread(threadId: string): Promise<void>;
  unwatchEmails(subscriptionId?: string): Promise<void>;
  updateDraft(
    draftId: string,
    params: {
      messageHtml?: string;
      subject?: string;
    },
  ): Promise<void>;
  updateLabel(labelId: string, update: EmailLabelUpdate): Promise<void>;
  watchEmails(): Promise<{
    expirationDate: Date;
    subscriptionId?: string;
  } | null>;
}
