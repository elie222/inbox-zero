import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedMessage } from "@/utils/types";
import prisma from "@/utils/__mocks__/prisma";
import { createTestLogger } from "@/__tests__/helpers";
import { createEmailProvider } from "@/utils/email/provider";
import {
  forwardEmailTool,
  getSenderCategorizationStatusTool,
  getSenderCategoryOverviewTool,
  manageInboxTool,
  manageSenderCategoryTool,
  replyEmailTool,
  searchInboxTool,
  sendEmailTool,
  startSenderCategorizationTool,
} from "./chat-inbox-tools";

vi.mock("@/utils/prisma");
vi.mock("@/utils/email/provider");
vi.mock("@/utils/posthog", () => ({
  posthogCaptureEvent: vi.fn().mockResolvedValue(undefined),
}));

const {
  mockArchiveCategory,
  mockGetCategoryOverview,
  mockStartBulkCategorization,
  mockGetCategorizationProgress,
  mockGetCategorizationStatusSnapshot,
} = vi.hoisted(() => ({
  mockArchiveCategory: vi.fn(),
  mockGetCategoryOverview: vi.fn(),
  mockStartBulkCategorization: vi.fn(),
  mockGetCategorizationProgress: vi.fn(),
  mockGetCategorizationStatusSnapshot: vi.fn(),
}));

vi.mock("@/utils/categorize/senders/archive-category", () => ({
  archiveCategory: (...args: Parameters<typeof mockArchiveCategory>) =>
    mockArchiveCategory(...args),
}));

vi.mock("@/utils/categorize/senders/get-category-overview", () => ({
  getCategoryOverview: (...args: Parameters<typeof mockGetCategoryOverview>) =>
    mockGetCategoryOverview(...args),
}));

vi.mock("@/utils/categorize/senders/start-bulk-categorization", () => ({
  startBulkCategorization: (
    ...args: Parameters<typeof mockStartBulkCategorization>
  ) => mockStartBulkCategorization(...args),
}));

vi.mock("@/utils/redis/categorization-progress", () => ({
  getCategorizationProgress: (
    ...args: Parameters<typeof mockGetCategorizationProgress>
  ) => mockGetCategorizationProgress(...args),
  getCategorizationStatusSnapshot: (
    ...args: Parameters<typeof mockGetCategorizationStatusSnapshot>
  ) => mockGetCategorizationStatusSnapshot(...args),
}));

const TEST_EMAIL = "user@test.com";
const logger = createTestLogger();

describe("chat inbox tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("adds formatted from header when sending an email", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      name: "Test User",
      email: TEST_EMAIL,
    } as any);

    const toolInstance = sendEmailTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result = await (toolInstance.execute as any)({
      to: "recipient@example.com",
      subject: "Hello",
      messageHtml: "<p>Hi there</p>",
    });

    expect(createEmailProvider).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      actionType: "send_email",
      requiresConfirmation: true,
      confirmationState: "pending",
      pendingAction: {
        to: "recipient@example.com",
        subject: "Hello",
        messageHtml: "<p>Hi there</p>",
        from: `Test User <${TEST_EMAIL}>`,
      },
    });
  });

  it("rejects sendEmail input when recipient has no email address", async () => {
    const toolInstance = sendEmailTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result = await (toolInstance.execute as any)({
      to: "Jack Cohen",
      subject: "Hello",
      messageHtml: "<p>Hi there</p>",
    });

    expect(result).toEqual({
      error: "Invalid sendEmail input: to must include valid email address(es)",
    });
    expect(createEmailProvider).not.toHaveBeenCalled();
  });

  it("prepares threaded reply flow without sending immediately", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      name: "Test User",
      email: TEST_EMAIL,
    } as any);

    const message: ParsedMessage = {
      id: "message-1",
      threadId: "thread-1",
      snippet: "",
      historyId: "",
      inline: [],
      headers: {
        from: "contact@example.com",
        to: TEST_EMAIL,
        subject: "Question",
        date: "2026-02-18T00:00:00.000Z",
      },
      subject: "Question",
      date: "2026-02-18T00:00:00.000Z",
    };

    const getMessage = vi.fn().mockResolvedValue(message);
    const replyToEmail = vi.fn().mockResolvedValue(undefined);

    vi.mocked(createEmailProvider).mockResolvedValue({
      getMessage,
      replyToEmail,
    } as any);

    const toolInstance = replyEmailTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result = await (toolInstance.execute as any)({
      messageId: "message-1",
      content: "Thanks for the update.",
    });

    expect(getMessage).toHaveBeenCalledWith("message-1");
    expect(replyToEmail).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      actionType: "reply_email",
      requiresConfirmation: true,
      confirmationState: "pending",
      pendingAction: {
        messageId: "message-1",
        content: "Thanks for the update.",
      },
      reference: {
        messageId: "message-1",
        threadId: "thread-1",
      },
    });
  });

  it("prepares forward flow without sending immediately", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      name: "Test User",
      email: TEST_EMAIL,
    } as any);

    const message: ParsedMessage = {
      id: "message-1",
      threadId: "thread-1",
      snippet: "",
      historyId: "",
      inline: [],
      headers: {
        from: "contact@example.com",
        to: TEST_EMAIL,
        subject: "Question",
        date: "2026-02-18T00:00:00.000Z",
      },
      subject: "Question",
      date: "2026-02-18T00:00:00.000Z",
    };

    const getMessage = vi.fn().mockResolvedValue(message);
    const forwardEmail = vi.fn().mockResolvedValue(undefined);

    vi.mocked(createEmailProvider).mockResolvedValue({
      getMessage,
      forwardEmail,
    } as any);

    const toolInstance = forwardEmailTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result = await (toolInstance.execute as any)({
      messageId: "message-1",
      to: "recipient@example.com",
      content: "Forwarding this along.",
    });

    expect(getMessage).toHaveBeenCalledWith("message-1");
    expect(forwardEmail).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      actionType: "forward_email",
      requiresConfirmation: true,
      confirmationState: "pending",
      pendingAction: {
        messageId: "message-1",
        to: "recipient@example.com",
        content: "Forwarding this along.",
      },
      reference: {
        messageId: "message-1",
        threadId: "thread-1",
      },
    });
  });

  it("rejects forwardEmail input when recipient has no email address", async () => {
    const toolInstance = forwardEmailTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result = await (toolInstance.execute as any)({
      messageId: "message-1",
      to: "Jack Cohen",
      content: "Forwarding this along.",
    });

    expect(result).toEqual({
      error:
        "Invalid forwardEmail input: to must include valid email address(es)",
    });
    expect(createEmailProvider).not.toHaveBeenCalled();
  });

  it("resolves a label name before archiving threads", async () => {
    const archiveThreadWithLabel = vi.fn().mockResolvedValue(undefined);
    const getLabelByName = vi.fn().mockResolvedValue({
      id: "Label_123",
      name: "To-Delete",
      type: "user",
    });

    vi.mocked(createEmailProvider).mockResolvedValue({
      archiveThreadWithLabel,
      getLabelByName,
    } as any);

    const toolInstance = manageInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result = await (toolInstance.execute as any)({
      action: "archive_threads",
      label: "To-Delete",
      threadIds: ["thread-1", "thread-2"],
    });

    expect(getLabelByName).toHaveBeenCalledWith("To-Delete");
    expect(getLabelByName).toHaveBeenCalledTimes(1);
    expect(archiveThreadWithLabel).toHaveBeenNthCalledWith(
      1,
      "thread-1",
      TEST_EMAIL,
      "Label_123",
    );
    expect(archiveThreadWithLabel).toHaveBeenNthCalledWith(
      2,
      "thread-2",
      TEST_EMAIL,
      "Label_123",
    );
    expect(result).toMatchObject({
      action: "archive_threads",
      success: true,
      failedCount: 0,
      successCount: 2,
      requestedCount: 2,
    });
  });

  it("resolves an exact labelName to the provider label before labeling threads", async () => {
    const getThreadMessages = vi.fn().mockImplementation(async (threadId) => [
      {
        id: `${threadId}-message-1`,
        threadId,
      },
      {
        id: `${threadId}-message-2`,
        threadId,
      },
    ]);
    const getLabelByName = vi.fn().mockResolvedValue({
      id: "Label_123",
      name: "Finance",
      type: "user",
    });
    const labelMessage = vi.fn().mockResolvedValue(undefined);

    vi.mocked(createEmailProvider).mockResolvedValue({
      getThreadMessages,
      getLabelByName,
      labelMessage,
    } as any);

    const toolInstance = manageInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result = await (toolInstance.execute as any)({
      action: "label_threads",
      labelName: "Finance",
      threadIds: ["thread-1", "thread-2"],
    });

    expect(getLabelByName).toHaveBeenCalledWith("Finance");
    expect(getLabelByName).toHaveBeenCalledTimes(1);
    expect(getThreadMessages).toHaveBeenNthCalledWith(1, "thread-1");
    expect(getThreadMessages).toHaveBeenNthCalledWith(2, "thread-2");
    expect(labelMessage).toHaveBeenCalledTimes(4);
    expect(labelMessage.mock.calls).toEqual(
      expect.arrayContaining([
        [
          {
            messageId: "thread-1-message-1",
            labelId: "Label_123",
            labelName: "Finance",
          },
        ],
        [
          {
            messageId: "thread-1-message-2",
            labelId: "Label_123",
            labelName: "Finance",
          },
        ],
        [
          {
            messageId: "thread-2-message-1",
            labelId: "Label_123",
            labelName: "Finance",
          },
        ],
        [
          {
            messageId: "thread-2-message-2",
            labelId: "Label_123",
            labelName: "Finance",
          },
        ],
      ]),
    );
    expect(result).toMatchObject({
      action: "label_threads",
      success: true,
      failedCount: 0,
      successCount: 2,
      requestedCount: 2,
      labelId: "Label_123",
      labelName: "Finance",
    });
  });

  it("throttles Gmail label_threads writes to small batches", async () => {
    const getThreadMessages = vi.fn().mockImplementation(async (threadId) => [
      {
        id: `${threadId}-message-1`,
        threadId,
      },
      {
        id: `${threadId}-message-2`,
        threadId,
      },
    ]);
    const getLabelByName = vi.fn().mockResolvedValue({
      id: "Label_123",
      name: "Finance",
      type: "user",
    });
    let inFlight = 0;
    let maxInFlight = 0;
    const labelMessage = vi.fn().mockImplementation(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return {};
    });

    vi.mocked(createEmailProvider).mockResolvedValue({
      name: "google",
      getThreadMessages,
      getLabelByName,
      labelMessage,
    } as any);

    const toolInstance = manageInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result = await (toolInstance.execute as any)({
      action: "label_threads",
      labelName: "Finance",
      threadIds: ["thread-1", "thread-2", "thread-3"],
    });

    expect(result).toMatchObject({
      action: "label_threads",
      success: true,
      failedCount: 0,
      successCount: 3,
      requestedCount: 3,
    });
    expect(labelMessage).toHaveBeenCalledTimes(6);
    expect(maxInFlight).toBeLessThanOrEqual(3);
  });

  it("returns a descriptive error when label_threads receives an unknown labelName", async () => {
    const getThreadMessages = vi.fn();
    const getLabelByName = vi.fn().mockResolvedValue(null);
    const labelMessage = vi.fn();

    vi.mocked(createEmailProvider).mockResolvedValue({
      getThreadMessages,
      getLabelByName,
      labelMessage,
    } as any);

    const toolInstance = manageInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result = await (toolInstance.execute as any)({
      action: "label_threads",
      labelName: "Finance",
      threadIds: ["thread-1"],
    });

    expect(result).toEqual({
      error:
        'Label "Finance" does not exist. Use createOrGetLabel first if you want to create it.',
      toolErrorVisibility: "hidden",
    });
    expect(getLabelByName).toHaveBeenCalledWith("Finance");
    expect(getLabelByName).toHaveBeenCalledTimes(1);
    expect(getThreadMessages).not.toHaveBeenCalled();
    expect(labelMessage).not.toHaveBeenCalled();
  });

  it("marks a thread labeling action as failed when any message label call fails", async () => {
    const getThreadMessages = vi.fn().mockResolvedValue([
      { id: "thread-1-message-1", threadId: "thread-1" },
      { id: "thread-1-message-2", threadId: "thread-1" },
    ]);
    const getLabelByName = vi.fn().mockResolvedValue({
      id: "Label_123",
      name: "Finance",
      type: "user",
    });
    const labelMessage = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("label failed"));

    vi.mocked(createEmailProvider).mockResolvedValue({
      getThreadMessages,
      getLabelByName,
      labelMessage,
    } as any);

    const toolInstance = manageInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result = await (toolInstance.execute as any)({
      action: "label_threads",
      labelName: "Finance",
      threadIds: ["thread-1"],
    });

    expect(result).toMatchObject({
      action: "label_threads",
      success: false,
      failedCount: 1,
      successCount: 0,
      requestedCount: 1,
      failedThreadIds: ["thread-1"],
    });
  });
});

describe("chat inbox tools - bulk pagination guidance (INB-134)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("searchInbox result signals when more pages remain (hasMore)", async () => {
    (createEmailProvider as any).mockResolvedValue({
      searchMessages: vi.fn().mockResolvedValue({
        messages: [
          {
            id: "m1",
            threadId: "t1",
            snippet: "",
            historyId: "",
            inline: [],
            headers: {
              from: "a@b.com",
              to: TEST_EMAIL,
              subject: "hi",
              date: "2026-01-01T00:00:00.000Z",
            },
            subject: "hi",
            textPlain: "",
            textHtml: "",
            labelIds: [],
            internalDate: "0",
          },
        ],
        nextPageToken: "PAGE_TOKEN_2",
      }),
      getLabels: vi.fn().mockResolvedValue([]),
    });

    const toolInstance = searchInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result: any = await (toolInstance.execute as any)({
      query: "older_than:3y is:unread",
      limit: 20,
    });

    expect(result.nextPageToken).toBe("PAGE_TOKEN_2");
    expect(result.hasMore).toBe(true);
  });

  it("searchInbox uses the capped default page size when limit is omitted", async () => {
    const searchMessages = vi.fn().mockResolvedValue({
      messages: [
        {
          id: "m1",
          threadId: "t1",
          snippet: "",
          historyId: "",
          inline: [],
          headers: {
            from: "a@b.com",
            to: TEST_EMAIL,
            subject: "hi",
            date: "2026-01-01T00:00:00.000Z",
          },
          subject: "hi",
          textPlain: "",
          textHtml: "",
          labelIds: [],
          internalDate: "0",
        },
      ],
      nextPageToken: undefined,
    });

    (createEmailProvider as any).mockResolvedValue({
      searchMessages,
      getLabels: vi.fn().mockResolvedValue([]),
    });

    const toolInstance = searchInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    await (toolInstance.execute as any)({
      query: "older_than:3y is:unread",
    });

    expect(searchMessages).toHaveBeenCalledWith({
      query: "older_than:3y is:unread",
      maxResults: 20,
      pageToken: undefined,
    });
  });

  it("searchInbox result reports hasMore=false when no more pages", async () => {
    (createEmailProvider as any).mockResolvedValue({
      searchMessages: vi.fn().mockResolvedValue({
        messages: [],
        nextPageToken: undefined,
      }),
      getLabels: vi.fn().mockResolvedValue([]),
    });

    const toolInstance = searchInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result: any = await (toolInstance.execute as any)({
      query: "older_than:10y",
      limit: 20,
    });

    expect(result.hasMore).toBe(false);
  });

  it("searchInbox retries Microsoft fielded sender searches with a plain-text fallback", async () => {
    const searchMessages = vi
      .fn()
      .mockRejectedValueOnce(new Error("Search syntax failed"))
      .mockResolvedValueOnce({
        messages: [
          {
            id: "m1",
            threadId: "t1",
            snippet: "Can you take a look?",
            historyId: "",
            inline: [],
            headers: {
              from: "sender@example.com",
              to: TEST_EMAIL,
              subject: "Review request",
              date: "2026-01-01T00:00:00.000Z",
            },
            subject: "Review request",
            textPlain: "",
            textHtml: "",
            labelIds: [],
            internalDate: "0",
          },
        ],
        nextPageToken: undefined,
      });

    (createEmailProvider as any).mockResolvedValue({
      searchMessages,
      getLabels: vi.fn().mockResolvedValue([]),
    });

    const toolInstance = searchInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "microsoft",
      logger,
    });

    const result: any = await (toolInstance.execute as any)({
      query: "from:sender@example.com",
      limit: 20,
    });

    expect(searchMessages).toHaveBeenNthCalledWith(1, {
      query: "from:sender@example.com",
      maxResults: 20,
      pageToken: undefined,
      readState: undefined,
      labelName: undefined,
    });
    expect(searchMessages).toHaveBeenNthCalledWith(2, {
      query: '"sender@example.com"',
      maxResults: 20,
      pageToken: undefined,
      readState: undefined,
      labelName: undefined,
    });
    expect(result.messages).toHaveLength(1);
    expect(result.queryUsed).toBe('"sender@example.com"');
  });

  it("searchInbox passes structured Outlook label and read-state filters", async () => {
    const searchMessages = vi.fn().mockResolvedValue({
      messages: [],
      nextPageToken: undefined,
    });

    (createEmailProvider as any).mockResolvedValue({
      searchMessages,
      getLabels: vi.fn().mockResolvedValue([]),
    });

    const toolInstance = searchInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "microsoft",
      logger,
    });

    await (toolInstance.execute as any)({
      query: "",
      labelName: "Newsletter",
      readState: "unread",
      limit: 20,
    });

    expect(searchMessages).toHaveBeenCalledWith({
      query: "",
      maxResults: 20,
      pageToken: undefined,
      readState: "unread",
      labelName: "Newsletter",
    });
  });

  it("searchInbox does not pass structured Outlook filters to Google", async () => {
    const searchMessages = vi.fn().mockResolvedValue({
      messages: [],
      nextPageToken: undefined,
    });

    (createEmailProvider as any).mockResolvedValue({
      searchMessages,
      getLabels: vi.fn().mockResolvedValue([]),
    });

    const toolInstance = searchInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    await (toolInstance.execute as any)({
      query: "newsletter",
      labelName: "Newsletter",
      readState: "unread",
      limit: 20,
    });

    expect(searchMessages).toHaveBeenCalledWith({
      query: "newsletter",
      maxResults: 20,
      pageToken: undefined,
    });
  });

  it("searchInbox returns structured Microsoft failure feedback when every attempt fails", async () => {
    const searchMessages = vi.fn().mockRejectedValue(
      Object.assign(new Error("Unsupported search clause"), {
        statusCode: 400,
        code: "BadRequest",
      }),
    );

    (createEmailProvider as any).mockResolvedValue({
      searchMessages,
      getLabels: vi.fn().mockResolvedValue([]),
    });

    const toolInstance = searchInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "microsoft",
      logger,
    });

    const result: any = await (toolInstance.execute as any)({
      query: "from:sender@example.com",
      limit: 20,
    });

    expect(result).toMatchObject({
      queryUsed: "from:sender@example.com",
      error: "Failed to search inbox",
      provider: "microsoft",
      microsoftSearchFeedback: {
        failureType: "query_failed",
        summary:
          "Outlook did not return results for the attempted search query. Retry with one simpler Outlook clause at a time.",
        suggestedNextStep:
          'Retry with one simpler Outlook query. Start with "sender@example.com" and keep it to a single clause.',
        fallbackAttempted: true,
        likelyCause: "Retry with one simpler Outlook clause at a time.",
        removedTerms: [],
        retryQueries: ["sender@example.com"],
      },
    });
    expect(result.microsoftSearchFeedback.attempts).toEqual([
      {
        query: "from:sender@example.com",
        status: 400,
        code: "BadRequest",
        message: "Unsupported search clause",
      },
      {
        query: '"sender@example.com"',
        status: 400,
        code: "BadRequest",
        message: "Unsupported search clause",
      },
    ]);
    expect(searchMessages).toHaveBeenCalledTimes(2);
  });

  it("searchInbox suggests concrete simpler retries for complex Microsoft queries", async () => {
    const searchMessages = vi.fn().mockRejectedValue(
      Object.assign(new Error("Unsupported search clause"), {
        statusCode: 400,
        code: "BadRequest",
      }),
    );

    (createEmailProvider as any).mockResolvedValue({
      searchMessages,
      getLabels: vi.fn().mockResolvedValue([]),
    });

    const toolInstance = searchInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "microsoft",
      logger,
    });

    const result: any = await (toolInstance.execute as any)({
      query: 'unread sender@example.com subject:"weekly site report"',
      limit: 20,
    });

    expect(result.microsoftSearchFeedback).toMatchObject({
      failureType: "query_failed",
      likelyCause:
        "The failed query mixed a read-state term with other filters. Retry with one simpler clause.",
      removedTerms: ["unread"],
      retryQueries: [
        "sender@example.com",
        'subject:"weekly site report"',
        '"weekly site report"',
      ],
      suggestedNextStep:
        'Retry with one simpler Outlook query. Start with "sender@example.com" and keep it to a single clause.',
    });
  });

  it("searchInbox preserves backslashes when generating Microsoft keyword retry queries", async () => {
    const searchMessages = vi.fn().mockRejectedValue(
      Object.assign(new Error("Unsupported search clause"), {
        statusCode: 400,
        code: "BadRequest",
      }),
    );

    (createEmailProvider as any).mockResolvedValue({
      searchMessages,
      getLabels: vi.fn().mockResolvedValue([]),
    });

    const toolInstance = searchInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "microsoft",
      logger,
    });

    const result: any = await (toolInstance.execute as any)({
      query: String.raw`subject:"Folder \ Review" unread`,
      limit: 20,
    });

    expect(result.microsoftSearchFeedback.retryQueries).toContain(
      String.raw`"Folder \\ Review"`,
    );
  });

  it("searchInbox keeps the generic Google failure payload unchanged", async () => {
    const searchMessages = vi
      .fn()
      .mockRejectedValue(new Error("Search syntax failed"));

    (createEmailProvider as any).mockResolvedValue({
      searchMessages,
      getLabels: vi.fn().mockResolvedValue([]),
    });

    const toolInstance = searchInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result: any = await (toolInstance.execute as any)({
      query: "from:sender@example.com",
      limit: 20,
    });

    expect(result).toEqual({
      queryUsed: "from:sender@example.com",
      error: "Failed to search inbox",
    });
    expect(searchMessages).toHaveBeenCalledTimes(1);
  });
});

describe("chat inbox tools - sender categories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getSenderCategoryOverview returns the shared overview payload", async () => {
    mockGetCategoryOverview.mockResolvedValue({
      autoCategorizeSenders: true,
      categorization: {
        status: "completed",
        totalItems: 4,
        completedItems: 4,
        remainingItems: 0,
        message: "Sender categorization completed for 4 senders.",
      },
      categorizedSenderCount: 12,
      uncategorizedSenderCount: 3,
      categories: [],
    });

    const toolInstance = getSenderCategoryOverviewTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      logger,
    });

    const result = await (toolInstance.execute as any)({});

    expect(mockGetCategoryOverview).toHaveBeenCalledWith({
      emailAccountId: "email-account-1",
    });
    expect(createEmailProvider).not.toHaveBeenCalled();
    expect(result.categorizedSenderCount).toBe(12);
  });

  it("startSenderCategorization delegates to the shared start helper", async () => {
    vi.mocked(createEmailProvider).mockResolvedValue({
      provider: "google",
    } as any);
    mockStartBulkCategorization.mockResolvedValue({
      started: true,
      alreadyRunning: false,
      totalQueuedSenders: 8,
      autoCategorizeSenders: true,
      progress: {
        status: "running",
        totalItems: 8,
        completedItems: 0,
        remainingItems: 8,
        message: "Categorizing senders: 0 of 8 completed.",
      },
    });

    const toolInstance = startSenderCategorizationTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result = await (toolInstance.execute as any)({});

    expect(createEmailProvider).toHaveBeenCalledWith({
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });
    expect(mockStartBulkCategorization).toHaveBeenCalledWith({
      emailAccountId: "email-account-1",
      emailProvider: { provider: "google" },
      logger,
    });
    expect(result.totalQueuedSenders).toBe(8);
  });

  it("getSenderCategorizationStatus waits briefly before reading progress", async () => {
    vi.useFakeTimers();
    mockGetCategorizationProgress.mockResolvedValue({
      totalItems: 8,
      completedItems: 3,
      status: "running",
      startedAt: "2026-04-16T00:00:00.000Z",
      updatedAt: "2026-04-16T00:01:00.000Z",
    });
    mockGetCategorizationStatusSnapshot.mockReturnValue({
      status: "running",
      totalItems: 8,
      completedItems: 3,
      remainingItems: 5,
      message: "Categorizing senders: 3 of 8 completed.",
    });

    const toolInstance = getSenderCategorizationStatusTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      logger,
    });

    const resultPromise = (toolInstance.execute as any)({ waitMs: 250 });

    await vi.advanceTimersByTimeAsync(250);

    const result = await resultPromise;

    expect(mockGetCategorizationProgress).toHaveBeenCalledWith({
      emailAccountId: "email-account-1",
    });
    expect(result).toEqual({
      status: "running",
      totalItems: 8,
      completedItems: 3,
      remainingItems: 5,
      message: "Categorizing senders: 3 of 8 completed.",
    });

    vi.useRealTimers();
  });

  it("getSenderCategorizationStatus caps waitMs at 1500", async () => {
    vi.useFakeTimers();
    mockGetCategorizationProgress.mockResolvedValue({
      totalItems: 8,
      completedItems: 3,
      status: "running",
      startedAt: "2026-04-16T00:00:00.000Z",
      updatedAt: "2026-04-16T00:01:00.000Z",
    });
    mockGetCategorizationStatusSnapshot.mockReturnValue({
      status: "running",
      totalItems: 8,
      completedItems: 3,
      remainingItems: 5,
      message: "Categorizing senders: 3 of 8 completed.",
    });

    const toolInstance = getSenderCategorizationStatusTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      logger,
    });

    const resultPromise = (toolInstance.execute as any)({ waitMs: 2000 });

    await vi.advanceTimersByTimeAsync(1499);
    expect(mockGetCategorizationProgress).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);

    const result = await resultPromise;

    expect(mockGetCategorizationProgress).toHaveBeenCalledWith({
      emailAccountId: "email-account-1",
    });
    expect(result).toEqual({
      status: "running",
      totalItems: 8,
      completedItems: 3,
      remainingItems: 5,
      message: "Categorizing senders: 3 of 8 completed.",
    });

    vi.useRealTimers();
  });

  it("manageSenderCategory delegates to the archive helper", async () => {
    vi.mocked(createEmailProvider).mockResolvedValue({
      provider: "google",
    } as any);
    mockArchiveCategory.mockResolvedValue({
      success: true,
      action: "archive_category",
      category: { id: "cat-1", name: "Newsletters" },
      sendersCount: 6,
      senders: ["one@example.com"],
      message: 'Archived mail from 6 senders in "Newsletters".',
    });

    const toolInstance = manageSenderCategoryTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result = await (toolInstance.execute as any)({
      action: "archive_category",
      categoryId: "cat-1",
    });

    expect(mockArchiveCategory).toHaveBeenCalledWith({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      emailProvider: { provider: "google" },
      logger,
      categoryId: "cat-1",
      categoryName: undefined,
    });
    expect(result.sendersCount).toBe(6);
  });
});
