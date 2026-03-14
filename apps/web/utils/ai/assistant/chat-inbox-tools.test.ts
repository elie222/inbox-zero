import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedMessage } from "@/utils/types";
import prisma from "@/utils/__mocks__/prisma";
import { createScopedLogger } from "@/utils/logger";
import { createEmailProvider } from "@/utils/email/provider";
import {
  forwardEmailTool,
  manageInboxTool,
  replyEmailTool,
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

  it("prefers the provider label name when labelId resolves", async () => {
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
    const getLabelById = vi.fn().mockResolvedValue({
      id: "Label_123",
      name: "Finance",
      type: "user",
    });
    const labelMessage = vi.fn().mockResolvedValue(undefined);

    vi.mocked(createEmailProvider).mockResolvedValue({
      getThreadMessages,
      getLabelById,
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
      labelId: "Label_123",
      labelName: "Old Finance",
      threadIds: ["thread-1", "thread-2"],
    });

    expect(getThreadMessages).toHaveBeenNthCalledWith(1, "thread-1");
    expect(getThreadMessages).toHaveBeenNthCalledWith(2, "thread-2");
    expect(labelMessage).toHaveBeenNthCalledWith(1, {
      messageId: "thread-1-message-1",
      labelId: "Label_123",
      labelName: "Finance",
    });
    expect(labelMessage).toHaveBeenNthCalledWith(2, {
      messageId: "thread-1-message-2",
      labelId: "Label_123",
      labelName: "Finance",
    });
    expect(labelMessage).toHaveBeenNthCalledWith(3, {
      messageId: "thread-2-message-1",
      labelId: "Label_123",
      labelName: "Finance",
    });
    expect(labelMessage).toHaveBeenNthCalledWith(4, {
      messageId: "thread-2-message-2",
      labelId: "Label_123",
      labelName: "Finance",
    });
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

  it("re-resolves a missing labelId from labelName before labeling threads", async () => {
    const getThreadMessages = vi
      .fn()
      .mockResolvedValue([{ id: "thread-1-message-1", threadId: "thread-1" }]);
    const getLabelById = vi.fn().mockResolvedValue(null);
    const getLabelByName = vi.fn().mockResolvedValue({
      id: "Label_456",
      name: "Finance",
      type: "user",
    });
    const labelMessage = vi.fn().mockResolvedValue(undefined);

    vi.mocked(createEmailProvider).mockResolvedValue({
      getThreadMessages,
      getLabelById,
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
      labelId: "Deleted_Label",
      labelName: "Finance",
      threadIds: ["thread-1"],
    });

    expect(getLabelById).toHaveBeenCalledWith("Deleted_Label");
    expect(getLabelByName).toHaveBeenCalledWith("Finance");
    expect(labelMessage).toHaveBeenCalledWith({
      messageId: "thread-1-message-1",
      labelId: "Label_456",
      labelName: "Finance",
    });
    expect(result).toMatchObject({
      action: "label_threads",
      success: true,
      failedCount: 0,
      successCount: 1,
      requestedCount: 1,
      labelId: "Label_456",
      labelName: "Finance",
    });
  });

  it("returns a descriptive error when label_threads receives a deleted labelId without labelName", async () => {
    const getThreadMessages = vi.fn();
    const getLabelById = vi.fn().mockResolvedValue(null);
    const labelMessage = vi.fn();

    vi.mocked(createEmailProvider).mockResolvedValue({
      getThreadMessages,
      getLabelById,
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
      labelId: "Deleted_Label",
      threadIds: ["thread-1"],
    });

    expect(result).toEqual({
      error:
        "The selected label no longer exists. Use createOrGetLabel first or provide labelName so it can be recreated.",
    });
    expect(getThreadMessages).not.toHaveBeenCalled();
    expect(labelMessage).not.toHaveBeenCalled();
  });

  it("marks a thread labeling action as failed when any message label call fails", async () => {
    const getThreadMessages = vi.fn().mockResolvedValue([
      { id: "thread-1-message-1", threadId: "thread-1" },
      { id: "thread-1-message-2", threadId: "thread-1" },
    ]);
    const getLabelById = vi.fn().mockResolvedValue({
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
      getLabelById,
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
      labelId: "Label_123",
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
