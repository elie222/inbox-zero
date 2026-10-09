import type { MailPredicate } from "@inboxzero/mail-core/queries";
import type { LocalMailSyncRequest } from "@/utils/actions/local-mail-sync.validation";
import type { LocalMailSyncResponse } from "@/utils/email/local-mail-sync-types";
import type { ParsedMessage } from "@/utils/types";
import type { InboxZeroLabel } from "@/utils/label";
import type { ThreadsQuery } from "@/utils/threads/validation";
import type {
  OutlookFolder,
  OutlookSystemFolder,
} from "@/utils/outlook/folders";
import type { Attachment as MailAttachment } from "nodemailer/lib/mailer";
import type { SendEmailBody } from "@/utils/types/mail";
import type { DraftAttachmentMetadata } from "@/utils/actions/draft-attachments.validation";
import type { DraftMessageUploadPart } from "@/utils/email/draft-attachment-upload";
import type { EmailContact } from "@/utils/email/contact";
import type {
  LabelVisibility,
  MessageVisibility,
} from "@/utils/gmail/constants";

export type DraftAttachment = {
  /** Stays the same across draft saves, so the composer can remove it later. */
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  disposition: "attachment" | "inline";
  contentId?: string;
  /** Where the attachment content route reads the bytes from right now. */
  messageId: string;
  providerAttachmentId: string;
};

export type DraftAttachmentsResult = {
  messageId: string;
  attachments: DraftAttachment[];
};

/**
 * How the browser sends a file too large for one request to our server.
 * Outlook hands out a pre-authenticated URL the browser uploads to directly.
 * Gmail replaces the whole message, so the browser uploads the full MIME
 * (server-built text around the attachment bytes) through our chunk proxy.
 */
export type DraftAttachmentUploadStart =
  | { type: "provider-url"; uploadUrl: string }
  | {
      type: "gmail-message";
      sessionUri: string;
      parts: DraftMessageUploadPart[];
      totalBytes: number;
    };

export type SendEmailOptions = {
  /** Keep the provider's reply subject when changing it would break threading. */
  preserveThreadSubject?: boolean;
};

export interface EmailThread {
  historyId?: string;
  id: string;
  messages: ParsedMessage[];
  participantMessages?: Array<{
    headers: Pick<ParsedMessage["headers"], "from" | "to">;
  }>;
  snippet: string;
}

export type MailboxSyncPage = {
  changedThreadIds?: string[];
  cursor: string;
  deletedMessageIds: string[];
  hasMore: boolean;
  removedMessageIds?: string[];
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
  labelListVisibility?: LabelVisibility;
  messageListVisibility?: MessageVisibility;
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

type DraftReference = {
  id: string;
  version?: string;
};

export type GetThreadOptions = {
  complete?: boolean;
  signal?: AbortSignal;
  includeDrafts?: boolean;
};

export type ProviderMailboxSearch = {
  text?: Extract<MailPredicate, { kind: "text" }>;
  mailbox:
    | "all"
    | "inbox"
    | "sent"
    | "drafts"
    | "spam"
    | "trash"
    | "archive"
    | "starred";
  read?: boolean;
  starred?: boolean;
  hasAttachment?: boolean;
  excludedRoles?: Array<Extract<MailPredicate, { kind: "role" }>["role"]>;
};

export interface EmailProvider {
  addDraftAttachment(
    draftId: string,
    attachment: DraftAttachmentMetadata & { content: Buffer },
  ): Promise<DraftAttachmentsResult & { attachmentId: string }>;
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
  bulkArchiveSenderOrThrow(
    fromEmail: string,
    ownerEmail: string,
    emailAccountId: string,
  ): Promise<number>;
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
  /** Exact message count, including drafts. Folder and label scopes intersect. */
  countMessages(options: {
    folderId?: string;
    labelId?: string;
  }): Promise<number>;
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
    /** Starts the draft as a forward of this message, carrying its files. */
    forwardedMessageId?: string;
  }): Promise<{ id: string }>;
  createFilter(options: {
    from: string;
    addLabelIds?: string[];
    removeLabelIds?: string[];
  }): Promise<{ status: number }>;
  createLabel(name: string, description?: string): Promise<EmailLabel>;
  deleteDraft(draftId: string, version?: string): Promise<boolean>;
  deleteFilter(id: string): Promise<{ status: number }>;
  deleteFolder(folderId: string): Promise<void>;
  deleteLabel(labelId: string): Promise<void>;
  draftEmail(
    email: ParsedMessage,
    args: {
      to?: string;
      subject?: string;
      /** HTML-safe: escape untrusted text; newlines become line breaks. */
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
  getAttachmentStream(
    messageId: string,
    attachmentId: string,
    signal?: AbortSignal,
  ): Promise<ReadableStream<Uint8Array>>;
  /** Real contact photos keyed by canonical email address. */
  getContactPhotos(): Promise<Record<string, string>>;
  getDraft(
    draftId: string,
    options?: { includeAttachments?: boolean },
  ): Promise<ParsedMessage | null>;
  getDraftAttachments(draftId: string): Promise<DraftAttachmentsResult | null>;
  getDraftReferenceForMessage(
    messageId: string,
  ): Promise<DraftReference | null>;
  getDrafts(options?: { maxResults?: number }): Promise<ParsedMessage[]>;
  getFiltersList(): Promise<EmailFilter[]>;
  getFolderCounts(): Promise<EmailFolderCount[]>;
  getFolders(): Promise<OutlookFolder[]>;
  getForwardingAddresses(): Promise<string[]>;
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
    folderId?: string;
    limit: number;
  }): Promise<MailboxSyncPage>;
  getMessage(
    messageId: string,
    options?: { includeCalendarContent?: boolean },
  ): Promise<ParsedMessage>;
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
    folderId?: string;
    before?: Date;
    after?: Date;
    inboxOnly?: boolean;
    unreadOnly?: boolean;
    includeDrafts?: boolean;
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
  // Thread messages are returned in chronological order with drafts excluded unless requested.
  getThread(threadId: string, options?: GetThreadOptions): Promise<EmailThread>;
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
  readonly localMailSyncStrategy: "account-history" | "folder-delta";
  markMessagesReadState(messageIds: string[], read: boolean): Promise<void>;
  markMessagesStarredState(
    messageIds: string[],
    starred: boolean,
  ): Promise<void>;
  markNotSpam(threadId: string): Promise<void>;
  markRead(threadId: string): Promise<void>;
  markReadThread(threadId: string, read: boolean): Promise<void>;
  markSpam(threadId: string): Promise<void>;
  moveThreadToFolder(
    threadId: string,
    ownerEmail: string,
    folderName: string,
  ): Promise<void>;
  readonly name: "google" | "microsoft";
  removeDraftAttachment(
    draftId: string,
    attachmentId: string,
  ): Promise<DraftAttachmentsResult>;
  removeThreadLabel(threadId: string, labelId: string): Promise<void>;
  removeThreadLabels(threadId: string, labelIds: string[]): Promise<void>;
  renameFolder(folderId: string, name: string): Promise<void>;
  replyToEmail(
    email: ParsedMessage,
    /** HTML-safe: escape untrusted text; newlines become line breaks. */
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
    fromEmail?: string;
    readState?: "read" | "unread";
    labelName?: string;
    /** Scope an Outlook search to a resolved mail folder. */
    folderId?: string;
    labelIds?: string[];
    /** Gmail omits spam and trash unless this is set. Outlook uses `folder` instead. */
    includeSpamTrash?: boolean;
    folder?: "spam" | "trash";
    mailboxSearch?: ProviderMailboxSearch;
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
    /** Gmail omits spam and trash unless this is set. Outlook uses `folder` instead. */
    includeSpamTrash?: boolean;
    folder?: "spam" | "trash";
    labelIds?: string[];
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
  sendEmailWithHtml(
    body: SendEmailBody,
    options?: SendEmailOptions,
  ): Promise<{
    messageId: string;
    threadId: string;
  }>;
  starMessage(messageId: string): Promise<void>;
  startDraftAttachmentUpload(
    draftId: string,
    attachment: DraftAttachmentMetadata,
  ): Promise<DraftAttachmentUploadStart>;
  syncLocalMail(
    request: LocalMailSyncRequest,
    context: { emailAccountId: string },
  ): Promise<LocalMailSyncResponse>;
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
      to?: string;
      cc?: string;
      bcc?: string;
    },
  ): Promise<void>;
  updateLabel(labelId: string, update: EmailLabelUpdate): Promise<void>;
  watchEmails(): Promise<{
    expirationDate: Date;
    subscriptionId?: string;
  } | null>;
}
