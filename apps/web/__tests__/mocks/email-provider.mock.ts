import { vi } from "vitest";
import type { EmailProvider } from "@/utils/email/types";
import type { ParsedMessage } from "@/utils/types";

/**
 * Creates a mock ParsedMessage for testing
 */
export function getMockParsedMessage(
  overrides: Partial<ParsedMessage> = {},
): ParsedMessage {
  const { headers: headerOverrides, ...rest } = overrides;
  return {
    id: "msg-123",
    threadId: "thread-123",
    labelIds: ["INBOX"],
    snippet: "Test email snippet",
    historyId: "12345",
    internalDate: "1704067200000",
    subject: "Test Email",
    date: "2024-01-01T00:00:00Z",
    headers: {
      from: "sender@example.com",
      to: "user@test.com",
      subject: "Test Email",
      date: "2024-01-01T00:00:00Z",
      ...headerOverrides,
    },
    textPlain: "Hello World",
    textHtml: "<p>Hello World</p>",
    ...rest,
    // Ensure required fields are never undefined
    inline: rest.inline ?? [],
  };
}

/**
 * Creates a mock EmailProvider with sensible defaults.
 * All methods are vi.fn() mocks that can be customized via overrides.
 */
export function createMockEmailProvider(
  overrides: Partial<Record<keyof EmailProvider, unknown>> = {},
): EmailProvider {
  const defaultMessage = getMockParsedMessage();

  const baseMock: EmailProvider = {
    name: "google",
    toJSON: vi.fn(() => ({ name: "google", type: "mock" })),

    // Message operations
    getMessage: vi.fn().mockResolvedValue(defaultMessage),
    getMessageByRfc822MessageId: vi.fn().mockResolvedValue(null),
    getMessagesBatch: vi.fn().mockResolvedValue([defaultMessage]),
    getOriginalMessage: vi.fn().mockResolvedValue(null),

    // Thread operations
    getThread: vi.fn().mockResolvedValue({
      id: "thread-123",
      messages: [defaultMessage],
      snippet: "Test snippet",
    }),
    getThreads: vi.fn().mockResolvedValue([]),
    getThreadMessages: vi.fn().mockResolvedValue([defaultMessage]),
    getThreadMessagesInInbox: vi.fn().mockResolvedValue([defaultMessage]),
    getThreadsWithQuery: vi.fn().mockResolvedValue({ threads: [] }),
    getThreadsWithParticipant: vi.fn().mockResolvedValue([]),
    getThreadsFromSenderWithSubject: vi.fn().mockResolvedValue([]),
    getPreviousConversationMessages: vi.fn().mockResolvedValue([]),

    // Message retrieval
    getSentMessages: vi.fn().mockResolvedValue([]),
    getInboxMessages: vi.fn().mockResolvedValue([defaultMessage]),
    getSentMessageIds: vi.fn().mockResolvedValue([]),
    getSentThreadsExcluding: vi.fn().mockResolvedValue([]),
    getDrafts: vi.fn().mockResolvedValue([]),
    getMessagesWithPagination: vi
      .fn()
      .mockResolvedValue({ messages: [], nextPageToken: undefined }),
    getMessagesFromSender: vi
      .fn()
      .mockResolvedValue({ messages: [], nextPageToken: undefined }),

    // Labels and folders
    getLabels: vi.fn().mockResolvedValue([]),
    getLabelById: vi.fn().mockResolvedValue(null),
    getLabelByName: vi.fn().mockResolvedValue(null),
    getFolders: vi.fn().mockResolvedValue([]),
    createLabel: vi
      .fn()
      .mockResolvedValue({ id: "label-123", name: "Test Label", type: "user" }),
    deleteLabel: vi.fn().mockResolvedValue(undefined),
    getOrCreateInboxZeroLabel: vi
      .fn()
      .mockResolvedValue({ id: "iz-label", name: "Inbox Zero", type: "user" }),

    // Thread/message actions
    archiveThread: vi.fn().mockResolvedValue(undefined),
    archiveThreadWithLabel: vi.fn().mockResolvedValue(undefined),
    archiveMessage: vi.fn().mockResolvedValue(undefined),
    trashThread: vi.fn().mockResolvedValue(undefined),
    markSpam: vi.fn().mockResolvedValue(undefined),
    markRead: vi.fn().mockResolvedValue(undefined),
    markReadThread: vi.fn().mockResolvedValue(undefined),
    moveThreadToFolder: vi.fn().mockResolvedValue(undefined),

    // Labeling
    labelMessage: vi.fn().mockResolvedValue({}),
    removeThreadLabel: vi.fn().mockResolvedValue(undefined),
    removeThreadLabels: vi.fn().mockResolvedValue(undefined),

    // Drafts and sending
    draftEmail: vi.fn().mockResolvedValue({ draftId: "draft-123" }),
    getDraft: vi.fn().mockResolvedValue(null),
    deleteDraft: vi.fn().mockResolvedValue(undefined),
    replyToEmail: vi.fn().mockResolvedValue(undefined),
    sendEmail: vi.fn().mockResolvedValue(undefined),
    sendEmailWithHtml: vi
      .fn()
      .mockResolvedValue({ messageId: "msg-new", threadId: "thread-new" }),
    forwardEmail: vi.fn().mockResolvedValue(undefined),

    // Bulk operations
    bulkArchiveFromSenders: vi.fn().mockResolvedValue(undefined),
    bulkTrashFromSenders: vi.fn().mockResolvedValue(undefined),
    blockUnsubscribedEmail: vi.fn().mockResolvedValue(undefined),

    // Filters
    getFiltersList: vi.fn().mockResolvedValue([]),
    createFilter: vi.fn().mockResolvedValue({ status: 200 }),
    deleteFilter: vi.fn().mockResolvedValue({ status: 200 }),
    createAutoArchiveFilter: vi.fn().mockResolvedValue({ status: 200 }),

    // Utilities
    getAccessToken: vi.fn().mockReturnValue("mock-access-token"),
    checkIfReplySent: vi.fn().mockResolvedValue(false),
    countReceivedMessages: vi.fn().mockResolvedValue(0),
    getAttachment: vi.fn().mockResolvedValue({ data: "", size: 0 }),
    hasPreviousCommunicationsWithSenderOrDomain: vi
      .fn()
      .mockResolvedValue(false),
    isReplyInThread: vi.fn().mockReturnValue(false),
    isSentMessage: vi.fn().mockReturnValue(false),
    getOrCreateOutlookFolderIdByName: vi.fn().mockResolvedValue("folder-123"),
    getSignatures: vi.fn().mockResolvedValue([]),

    // Watch/webhooks
    processHistory: vi.fn().mockResolvedValue(undefined),
    watchEmails: vi.fn().mockResolvedValue({
      expirationDate: new Date(),
      subscriptionId: "sub-123",
    }),
    unwatchEmails: vi.fn().mockResolvedValue(undefined),
  };

  // Apply overrides
  return { ...baseMock, ...overrides } as EmailProvider;
}

/**
 * Pre-configured error providers for common error scenarios
 */
export const ErrorProviders = {
  /**
   * Gmail "not found" error - message was deleted
   */
  gmailNotFound: () =>
    createMockEmailProvider({
      getMessage: vi
        .fn()
        .mockRejectedValue(new Error("Requested entity was not found.")),
    }),

  /**
   * Outlook "not found" error - item was deleted
   */
  outlookNotFound: () =>
    createMockEmailProvider({
      name: "microsoft",
      getMessage: vi.fn().mockRejectedValue(
        Object.assign(
          new Error("The specified object was not found in the store."),
          {
            code: "ErrorItemNotFound",
          },
        ),
      ),
    }),

  /**
   * Gmail rate limit exceeded
   */
  gmailRateLimit: () =>
    createMockEmailProvider({
      getMessage: vi.fn().mockRejectedValue(
        Object.assign(new Error("Rate limit exceeded"), {
          errors: [
            { reason: "rateLimitExceeded", message: "Rate Limit Exceeded" },
          ],
        }),
      ),
    }),

  /**
   * Gmail quota exceeded
   */
  gmailQuotaExceeded: () =>
    createMockEmailProvider({
      getMessage: vi.fn().mockRejectedValue(
        Object.assign(new Error("Quota exceeded"), {
          errors: [{ reason: "quotaExceeded", message: "Quota Exceeded" }],
        }),
      ),
    }),

  /**
   * Outlook throttling error
   */
  outlookThrottling: () =>
    createMockEmailProvider({
      name: "microsoft",
      getMessage: vi.fn().mockRejectedValue(
        Object.assign(new Error("Too many requests"), {
          statusCode: 429,
          code: "TooManyRequests",
        }),
      ),
    }),

  /**
   * Invalid grant - OAuth token expired/revoked
   */
  invalidGrant: () =>
    createMockEmailProvider({
      getMessage: vi.fn().mockRejectedValue(new Error("invalid_grant")),
    }),

  /**
   * Generic network error
   */
  networkError: () =>
    createMockEmailProvider({
      getMessage: vi.fn().mockRejectedValue(new Error("fetch failed")),
    }),
};
