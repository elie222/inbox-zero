import { vi } from "vitest";
import type { EmailProvider } from "@/utils/email/types";

/**
 * Creates a mock EmailProvider for testing
 *
 * Use this when:
 * - You need a complete EmailProvider implementation
 * - You're testing functions that interact with multiple EmailProvider methods
 * - You want consistent default behavior across tests
 *
 * For simple tests that only use a few methods, consider creating a minimal mock:
 * ```ts
 * const mockProvider = {
 *   getMessage: vi.fn(),
 *   labelMessage: vi.fn(),
 * } as unknown as EmailProvider;
 * ```
 *
 * @example
 * ```ts
 * // Basic usage
 * const mockProvider = createMockEmailProvider();
 *
 * // With overrides
 * const mockProvider = createMockEmailProvider({
 *   name: "microsoft",
 *   getMessage: vi.fn().mockResolvedValue(customMessage),
 * });
 *
 * // Setup specific behavior
 * vi.mocked(mockProvider.getThreadMessages).mockResolvedValue([message1, message2]);
 * ```
 */
export const createMockEmailProvider = (
  overrides?: Partial<EmailProvider>,
): EmailProvider => ({
  name: "google",
  getThreads: vi.fn().mockResolvedValue([]),
  getThread: vi.fn().mockResolvedValue({
    id: "thread1",
    messages: [],
    snippet: "Test thread snippet",
  }),
  getLabels: vi.fn().mockResolvedValue([]),
  getLabelById: vi.fn().mockResolvedValue(null),
  getLabelByName: vi.fn().mockResolvedValue(null),
  getMessageByRfc822MessageId: vi.fn().mockResolvedValue(null),
  getFolders: vi.fn().mockResolvedValue([]),
  getSignatures: vi.fn().mockResolvedValue([]),
  getMessage: vi.fn().mockResolvedValue({
    id: "msg1",
    threadId: "thread1",
    headers: {
      from: "test@example.com",
      to: "user@example.com",
      subject: "Test",
      date: new Date().toISOString(),
    },
    snippet: "Test message",
    historyId: "12345",
    subject: "Test",
    date: new Date().toISOString(),
    textPlain: "Test content",
    textHtml: "<p>Test content</p>",
    attachments: [],
    inline: [],
    labelIds: [],
  }),
  getSentMessages: vi.fn().mockResolvedValue([]),
  getSentThreadsExcluding: vi.fn().mockResolvedValue([]),
  getThreadMessages: vi.fn().mockResolvedValue([]),
  getThreadMessagesInInbox: vi.fn().mockResolvedValue([]),
  getPreviousConversationMessages: vi.fn().mockResolvedValue([]),
  archiveThread: vi.fn().mockResolvedValue(undefined),
  archiveThreadWithLabel: vi.fn().mockResolvedValue(undefined),
  archiveMessage: vi.fn().mockResolvedValue(undefined),
  trashThread: vi.fn().mockResolvedValue(undefined),
  labelMessage: vi.fn().mockResolvedValue(undefined),
  removeThreadLabel: vi.fn().mockResolvedValue(undefined),
  removeThreadLabels: vi.fn().mockResolvedValue(undefined),
  draftEmail: vi.fn().mockResolvedValue({ draftId: "draft1" }),
  replyToEmail: vi.fn().mockResolvedValue(undefined),
  sendEmail: vi.fn().mockResolvedValue(undefined),
  forwardEmail: vi.fn().mockResolvedValue(undefined),
  markSpam: vi.fn().mockResolvedValue(undefined),
  blockUnsubscribedEmail: vi.fn().mockResolvedValue(undefined),
  markRead: vi.fn().mockResolvedValue(undefined),
  markReadThread: vi.fn().mockResolvedValue(undefined),
  getDraft: vi.fn().mockResolvedValue(null),
  deleteDraft: vi.fn().mockResolvedValue(undefined),
  createLabel: vi
    .fn()
    .mockResolvedValue({ id: "label1", name: "Test Label", type: "user" }),
  deleteLabel: vi.fn().mockResolvedValue(undefined),
  getOrCreateInboxZeroLabel: vi
    .fn()
    .mockResolvedValue({ id: "label1", name: "Test Label", type: "user" }),
  getOriginalMessage: vi.fn().mockResolvedValue(null),
  getFiltersList: vi.fn().mockResolvedValue([]),
  createFilter: vi.fn().mockResolvedValue({}),
  deleteFilter: vi.fn().mockResolvedValue({}),
  createAutoArchiveFilter: vi.fn().mockResolvedValue({}),
  getMessagesWithPagination: vi
    .fn()
    .mockResolvedValue({ messages: [], nextPageToken: undefined }),
  getMessagesFromSender: vi
    .fn()
    .mockResolvedValue({ messages: [], nextPageToken: undefined }),
  getMessagesBatch: vi.fn().mockResolvedValue([]),
  getAccessToken: vi.fn().mockReturnValue("mock-token"),
  checkIfReplySent: vi.fn().mockResolvedValue(false),
  countReceivedMessages: vi.fn().mockResolvedValue(0),
  getAttachment: vi.fn().mockResolvedValue({ data: "", size: 0 }),
  getThreadsWithQuery: vi
    .fn()
    .mockResolvedValue({ threads: [], nextPageToken: undefined }),
  hasPreviousCommunicationsWithSenderOrDomain: vi.fn().mockResolvedValue(false),
  watchEmails: vi
    .fn()
    .mockResolvedValue({ expirationDate: new Date(), subscriptionId: "sub1" }),
  unwatchEmails: vi.fn().mockResolvedValue(undefined),
  isReplyInThread: vi.fn().mockReturnValue(false),
  isSentMessage: vi.fn().mockReturnValue(false),
  getThreadsFromSenderWithSubject: vi.fn().mockResolvedValue([]),
  processHistory: vi.fn().mockResolvedValue(undefined),
  moveThreadToFolder: vi.fn().mockResolvedValue(undefined),
  getMessagesByFields: vi
    .fn()
    .mockResolvedValue({ messages: [], nextPageToken: undefined }),
  getOrCreateOutlookFolderIdByName: vi.fn().mockResolvedValue("folder1"),
  sendEmailWithHtml: vi.fn().mockResolvedValue(undefined),
  getDrafts: vi.fn().mockResolvedValue([]),
  ...overrides,
});

export const mockGmailProvider = createMockEmailProvider({ name: "google" });
export const mockOutlookProvider = createMockEmailProvider({
  name: "microsoft",
});
