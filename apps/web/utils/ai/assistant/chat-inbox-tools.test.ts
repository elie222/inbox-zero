import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedMessage } from "@/utils/types";
import prisma from "@/utils/__mocks__/prisma";
import { createScopedLogger } from "@/utils/logger";
import { createEmailProvider } from "@/utils/email/provider";
import {
  forwardEmailTool,
  replyEmailTool,
  sendEmailTool,
} from "./chat-inbox-tools";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/email/provider");
vi.mock("@/utils/posthog", () => ({
  posthogCaptureEvent: vi.fn().mockResolvedValue(undefined),
}));

const logger = createScopedLogger("chat-inbox-tools-test");

describe("chat inbox tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("adds formatted from header when sending an email", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      name: "Test User",
      email: "sender@example.com",
    } as any);

    const toolInstance = sendEmailTool({
      email: "sender@example.com",
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
        from: "Test User <sender@example.com>",
      },
    });
  });

  it("rejects sendEmail input when recipient has no email address", async () => {
    const toolInstance = sendEmailTool({
      email: "sender@example.com",
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
      email: "sender@example.com",
    } as any);

    const message: ParsedMessage = {
      id: "message-1",
      threadId: "thread-1",
      snippet: "",
      historyId: "",
      inline: [],
      headers: {
        from: "contact@example.com",
        to: "sender@example.com",
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
      email: "sender@example.com",
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
      email: "sender@example.com",
    } as any);

    const message: ParsedMessage = {
      id: "message-1",
      threadId: "thread-1",
      snippet: "",
      historyId: "",
      inline: [],
      headers: {
        from: "contact@example.com",
        to: "sender@example.com",
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
      email: "sender@example.com",
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
      email: "sender@example.com",
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
});
