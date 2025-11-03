import type { ParsedMessage } from "@/utils/types";
import type { InboxZeroLabel } from "@/utils/label";
import type { ThreadsQuery } from "@/app/api/threads/validation";
import type { OutlookFolder } from "@/utils/outlook/folders";

export interface EmailThread {
  id: string;
  messages: ParsedMessage[];
  snippet: string;
  historyId?: string;
}

export interface EmailLabel {
  id: string;
  name: string;
  type: string;
  threadsTotal?: number;
  color?: {
    textColor?: string;
    backgroundColor?: string;
  };
  labelListVisibility?: string;
  messageListVisibility?: string;
}

export interface EmailFilter {
  id: string;
  criteria?: {
    from?: string;
  };
  action?: {
    addLabelIds?: string[];
    removeLabelIds?: string[];
  };
}

export interface EmailSignature {
  email: string;
  signature: string;
  isDefault: boolean;
  displayName?: string;
}

export interface EmailProvider {
  readonly name: "google" | "microsoft";
  getThreads(folderId?: string): Promise<EmailThread[]>;
  getThread(threadId: string): Promise<EmailThread>;
  getLabels(): Promise<EmailLabel[]>;
  getLabelById(labelId: string): Promise<EmailLabel | null>;
  getLabelByName(name: string): Promise<EmailLabel | null>;
  getFolders(): Promise<OutlookFolder[]>;
  getMessage(messageId: string): Promise<ParsedMessage>;
  getMessageByRfc822MessageId(
    rfc822MessageId: string,
  ): Promise<ParsedMessage | null>;
  getMessagesByFields(options: {
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
  }>;
  getSentMessages(maxResults?: number): Promise<ParsedMessage[]>;
  getSentThreadsExcluding(options: {
    excludeToEmails?: string[];
    excludeFromEmails?: string[];
    maxResults?: number;
  }): Promise<EmailThread[]>;
  getDrafts(options?: { maxResults?: number }): Promise<ParsedMessage[]>;
  getThreadMessages(threadId: string): Promise<ParsedMessage[]>;
  getThreadMessagesInInbox(threadId: string): Promise<ParsedMessage[]>;
  getPreviousConversationMessages(
    messageIds: string[],
  ): Promise<ParsedMessage[]>;
  archiveThread(threadId: string, ownerEmail: string): Promise<void>;
  archiveThreadWithLabel(
    threadId: string,
    ownerEmail: string,
    labelId?: string,
  ): Promise<void>;
  archiveMessage(messageId: string): Promise<void>;
  trashThread(
    threadId: string,
    ownerEmail: string,
    actionSource: "user" | "automation",
  ): Promise<void>;
  labelMessage(options: { messageId: string; labelId: string }): Promise<void>;
  removeThreadLabel(threadId: string, labelId: string): Promise<void>;
  removeThreadLabels(threadId: string, labelIds: string[]): Promise<void>;
  draftEmail(
    email: ParsedMessage,
    args: { to?: string; subject?: string; content: string },
    userEmail: string,
    executedRule?: { id: string; threadId: string; emailAccountId: string },
  ): Promise<{ draftId: string }>;
  replyToEmail(email: ParsedMessage, content: string): Promise<void>;
  sendEmail(args: {
    to: string;
    cc?: string;
    bcc?: string;
    subject: string;
    messageText: string;
  }): Promise<void>;
  sendEmailWithHtml(body: {
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
  }): Promise<{
    messageId: string;
    threadId: string;
  }>;
  forwardEmail(
    email: ParsedMessage,
    args: { to: string; cc?: string; bcc?: string; content?: string },
  ): Promise<void>;
  markSpam(threadId: string): Promise<void>;
  markRead(threadId: string): Promise<void>;
  markReadThread(threadId: string, read: boolean): Promise<void>;
  getDraft(draftId: string): Promise<ParsedMessage | null>;
  deleteDraft(draftId: string): Promise<void>;
  createLabel(name: string, description?: string): Promise<EmailLabel>;
  deleteLabel(labelId: string): Promise<void>;
  getOrCreateInboxZeroLabel(key: InboxZeroLabel): Promise<EmailLabel>;
  blockUnsubscribedEmail(messageId: string): Promise<void>;
  getOriginalMessage(
    originalMessageId: string | undefined,
  ): Promise<ParsedMessage | null>;
  getFiltersList(): Promise<EmailFilter[]>;
  createFilter(options: {
    from: string;
    addLabelIds?: string[];
    removeLabelIds?: string[];
  }): Promise<{ status: number }>;
  deleteFilter(id: string): Promise<{ status: number }>;
  createAutoArchiveFilter(options: {
    from: string;
    gmailLabelId?: string;
    labelName?: string;
  }): Promise<{ status: number }>;
  getMessagesWithPagination(options: {
    query?: string;
    maxResults?: number;
    pageToken?: string;
    before?: Date;
    after?: Date;
  }): Promise<{
    messages: ParsedMessage[];
    nextPageToken?: string;
  }>;
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
  getMessagesBatch(messageIds: string[]): Promise<ParsedMessage[]>;
  getAccessToken(): string;
  checkIfReplySent(senderEmail: string): Promise<boolean>;
  countReceivedMessages(
    senderEmail: string,
    threshold: number,
  ): Promise<number>;
  getAttachment(
    messageId: string,
    attachmentId: string,
  ): Promise<{ data: string; size: number }>;
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
  getThreadsFromSenderWithSubject(
    sender: string,
    limit: number,
  ): Promise<Array<{ id: string; snippet: string; subject: string }>>;
  processHistory(options: {
    emailAddress: string;
    historyId?: number;
    startHistoryId?: number;
    subscriptionId?: string;
    resourceData?: {
      id: string;
      conversationId?: string;
    };
  }): Promise<void>;
  watchEmails(): Promise<{
    expirationDate: Date;
    subscriptionId?: string;
  } | null>;
  unwatchEmails(subscriptionId?: string): Promise<void>;
  isReplyInThread(message: ParsedMessage): boolean;
  isSentMessage(message: ParsedMessage): boolean;
  moveThreadToFolder(
    threadId: string,
    ownerEmail: string,
    folderName: string,
  ): Promise<void>;
  getOrCreateOutlookFolderIdByName(folderName: string): Promise<string>;
  getSignatures(): Promise<EmailSignature[]>;
}
