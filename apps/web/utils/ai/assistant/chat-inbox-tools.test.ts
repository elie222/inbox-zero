import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedMessage } from "@/utils/types";
import prisma from "@/utils/__mocks__/prisma";
import { createScopedLogger } from "@/utils/logger";
import { createEmailProvider } from "@/utils/email/provider";
import { replyEmailTool, sendEmailTool } from "./chat-inbox-tools";

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

    const sendEmailWithHtml = vi.fn().mockResolvedValue({
      messageId: "message-1",
      threadId: "thread-1",
    });

    vi.mocked(createEmailProvider).mockResolvedValue({
      sendEmailWithHtml,
    } as any);

    const toolInstance = sendEmailTool({
      email: "sender@example.com",
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result = await toolInstance.execute({
      to: "recipient@example.com",
      subject: "Hello",
      messageHtml: "<p>Hi there</p>",
    });

    expect(sendEmailWithHtml).toHaveBeenCalledWith({
      to: "recipient@example.com",
      subject: "Hello",
      messageHtml: "<p>Hi there</p>",
      from: "Test User <sender@example.com>",
    });
    expect(result).toMatchObject({
      success: true,
      messageId: "message-1",
      threadId: "thread-1",
    });
  });

  it("uses threaded reply flow when replying", async () => {
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

    const result = await toolInstance.execute({
      messageId: "message-1",
      content: "Thanks for the update.",
    });

    expect(getMessage).toHaveBeenCalledWith("message-1");
    expect(replyToEmail).toHaveBeenCalledWith(
      message,
      "Thanks for the update.",
    );
    expect(result).toMatchObject({
      success: true,
      messageId: "message-1",
      threadId: "thread-1",
    });
  });
});
