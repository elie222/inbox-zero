import type { ParsedMessage } from "@/utils/types";
import type { InboxZeroLabel } from "@/utils/label";
import type { ThreadsQuery } from "@/app/api/threads/validation";
import type { OutlookFolder } from "@/utils/outlook/folders";
import type { Logger } from "@/utils/logger";
import type { Attachment as MailAttachment } from "nodemailer/lib/mailer";

export interface EmailThread {
  historyId?: string;
  id: string;
  messages: ParsedMessage[];
  snippet: string;
}

export interface EmailLabel {
  color?: {
    textColor?: string;
    backgroundColor?: string;
  };
  id: string;
  labelListVisibility?: string;
  messageListVisibility?: string;
  name: string;
  threadsTotal?: number;
  type: string;
}

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

export interface EmailProvider {
  archiveMessage(messageId: string): Promise<void>;
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
    args: { to: string; cc?: string; bcc?: string; content?: string },
  ): Promise<void>;
  getAccessToken(): string;
  getAttachment(
    messageId: string,
    attachmentId: string,
  ): Promise<{ data: string; size: number }>;
  getDraft(draftId: string): Promise<ParsedMessage | null>;
  getDrafts(options?: { maxResults?: number }): Promise<ParsedMessage[]>;
  getFiltersList(): Promise<EmailFilter[]>;
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
  }): Promise<{ id: string; threadId: string }[]>;
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
  markRead(threadId: string): Promise<void>;
  markReadThread(threadId: string, read: boolean): Promise<void>;
  markSpam(threadId: string): Promise<void>;
  moveThreadToFolder(
    threadId: string,
    ownerEmail: string,
    folderName: string,
  ): Promise<void>;
  readonly name: "google" | "microsoft";
  processHistory(options: {
    emailAddress: string;
    historyId?: number;
    startHistoryId?: number;
    subscriptionId?: string;
    resourceData?: {
      id: string;
      conversationId?: string;
    };
    logger?: Logger;
  }): Promise<void>;
  removeThreadLabel(threadId: string, labelId: string): Promise<void>;
  removeThreadLabels(threadId: string, labelIds: string[]): Promise<void>;
  replyToEmail(
    email: ParsedMessage,
    content: string,
    options?: {
      replyTo?: string;
      from?: string;
      attachments?: MailAttachment[];
    },
  ): Promise<void>;
  searchMessages(options: {
    query: string;
    maxResults?: number;
    pageToken?: string;
  }): Promise<{
    messages: ParsedMessage[];
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
  }): Promise<void>;
  sendEmailWithHtml(body: {
    replyToEmail?: {
      threadId: string;
      headerMessageId: string;
      references?: string;
      messageId?: string; // Platform-specific message ID (Graph ID for Outlook)
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
  }): Promise<{
    messageId: string;
    threadId: string;
  }>;
  toJSON(): { name: string; type: string };
  trashThread(
    threadId: string,
    ownerEmail: string,
    actionSource: "user" | "automation",
  ): Promise<void>;
  unwatchEmails(subscriptionId?: string): Promise<void>;
  updateDraft(
    draftId: string,
    params: {
      messageHtml?: string;
      subject?: string;
    },
  ): Promise<void>;
  watchEmails(): Promise<{
    expirationDate: Date;
    subscriptionId?: string;
  } | null>;
}
