import type { ParsedMessage } from "@/utils/types";
import type { InboxZeroLabel } from "@/utils/label";
import type { ThreadsQuery } from "@/app/api/threads/validation";

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

export interface EmailProvider {
  readonly name: "google" | "microsoft";
  getThreads(folderId?: string): Promise<EmailThread[]>;
  getThread(threadId: string): Promise<EmailThread>;
  getLabels(): Promise<EmailLabel[]>;
  getLabelById(labelId: string): Promise<EmailLabel | null>;
  getMessage(messageId: string): Promise<ParsedMessage>;
  getMessages(query?: string, maxResults?: number): Promise<ParsedMessage[]>;
  getSentMessages(maxResults?: number): Promise<ParsedMessage[]>;
  getThreadMessages(threadId: string): Promise<ParsedMessage[]>;
  getPreviousConversationMessages(
    messageIds: string[],
  ): Promise<ParsedMessage[]>;
  archiveThread(threadId: string, ownerEmail: string): Promise<void>;
  archiveThreadWithLabel(
    threadId: string,
    ownerEmail: string,
    labelId?: string,
  ): Promise<void>;
  trashThread(
    threadId: string,
    ownerEmail: string,
    actionSource: "user" | "automation",
  ): Promise<void>;
  labelMessage(messageId: string, labelName: string): Promise<void>;
  removeThreadLabel(threadId: string, labelId: string): Promise<void>;
  getAwaitingReplyLabel(): Promise<string>;
  draftEmail(
    email: ParsedMessage,
    args: { to?: string; subject?: string; content: string },
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
  getOrCreateInboxZeroLabel(key: InboxZeroLabel): Promise<EmailLabel>;
  getOriginalMessage(
    originalMessageId: string | undefined,
  ): Promise<ParsedMessage | null>;
  getFiltersList(): Promise<EmailFilter[]>;
  createFilter(options: {
    from: string;
    addLabelIds?: string[];
    removeLabelIds?: string[];
  }): Promise<any>;
  deleteFilter(id: string): Promise<any>;
  createAutoArchiveFilter(options: {
    from: string;
    gmailLabelId?: string;
    labelName?: string;
  }): Promise<any>;
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
  getReplyTrackingLabels(): Promise<{
    awaitingReplyLabelId: string;
    needsReplyLabelId: string;
  }>;
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
}
