import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedMessage } from "@/utils/types";
import prisma from "@/utils/__mocks__/prisma";
import { createScopedLogger } from "@/utils/logger";
import { createEmailProvider } from "@/utils/email/provider";
import {
  forwardEmailTool,
  manageInboxTool,
  replyEmailTool,
  searchInboxTool,
  sendEmailTool,
} from "./chat-inbox-tools";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/email/provider");
vi.mock("@/utils/posthog", () => ({
  posthogCaptureEvent: vi.fn().mockResolvedValue(undefined),
}));

const TEST_EMAIL = "user@test.com";
const logger = createScopedLogger("chat-inbox-tools-test");

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

  it("searchInbox description tells the model to paginate for bulk 'all matching' requests", () => {
    const toolInstance = searchInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const description = toolInstance.description ?? "";
    expect(description.toLowerCase()).toMatch(/paginat|nextpagetoken/);
    expect(description.toLowerCase()).toMatch(/all/);
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

  it("manageInbox description calls out the 100-threadId cap per call", () => {
    const toolInstance = manageInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const description = toolInstance.description ?? "";
    expect(description).toMatch(/100/);
    expect(description.toLowerCase()).toMatch(/thread/);
  });
});
