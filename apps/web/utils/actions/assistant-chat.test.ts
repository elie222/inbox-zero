import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createEmailProvider } from "@/utils/email/provider";
import { confirmAssistantEmailAction } from "@/utils/actions/assistant-chat";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/email/provider");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: "u1", email: "owner@example.com" } })),
}));

describe("confirmAssistantEmailAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends a pending prepared email and persists confirmed output", async () => {
    (prisma.emailAccount.findUnique as any)
      .mockResolvedValueOnce({
        email: "owner@example.com",
        account: { userId: "u1", provider: "google" },
      })
      .mockResolvedValueOnce({
        name: "Owner",
        email: "owner@example.com",
      });

    prisma.chatMessage.findFirst.mockResolvedValue({
      id: "chat-message-1",
      chatId: "chat-1",
      updatedAt: new Date("2026-02-23T00:00:00.000Z"),
      parts: [buildPendingSendPart()],
    } as any);

    prisma.chatMessage.updateMany.mockResolvedValue({ count: 1 } as any);
    prisma.chatMessage.update.mockResolvedValue({
      id: "chat-message-1",
    } as any);

    const sendEmailWithHtml = vi.fn().mockResolvedValue({
      messageId: "msg-1",
      threadId: "thr-1",
    });
    vi.mocked(createEmailProvider).mockResolvedValue({
      sendEmailWithHtml,
    } as any);

    const result = await confirmAssistantEmailAction(
      "ea_1" as any,
      {
        chatMessageId: "chat-message-1",
        toolCallId: "tool-1",
        actionType: "send_email",
      } as any,
    );

    expect(sendEmailWithHtml).toHaveBeenCalledWith({
      to: "recipient@example.com",
      cc: undefined,
      bcc: undefined,
      subject: "Hello",
      messageHtml: "<p>Hi there</p>",
      from: "Owner <owner@example.com>",
    });
    expect(result?.data?.confirmationState).toBe("confirmed");
    expect(result?.data?.confirmationResult).toMatchObject({
      actionType: "send_email",
      messageId: "msg-1",
      threadId: "thr-1",
      to: "recipient@example.com",
      subject: "Hello",
    });

    const processingParts = (
      prisma.chatMessage.updateMany.mock.calls[0][0] as any
    ).data.parts as any[];
    expect(processingParts[0].output.confirmationState).toBe("processing");

    const updatedParts = (prisma.chatMessage.update.mock.calls[0][0] as any)
      .data.parts as any[];
    expect(updatedParts[0].output.confirmationState).toBe("confirmed");
    expect(updatedParts[0].output.confirmationResult.actionType).toBe(
      "send_email",
    );
  });

  it("sends a pending prepared reply and persists confirmed output", async () => {
    (prisma.emailAccount.findUnique as any).mockResolvedValueOnce({
      email: "owner@example.com",
      account: { userId: "u1", provider: "google" },
    });

    prisma.chatMessage.findFirst.mockResolvedValue({
      id: "chat-message-1",
      chatId: "chat-1",
      updatedAt: new Date("2026-02-23T00:00:00.000Z"),
      parts: [buildPendingReplyPart()],
    } as any);

    prisma.chatMessage.updateMany.mockResolvedValue({ count: 1 } as any);
    prisma.chatMessage.update.mockResolvedValue({
      id: "chat-message-1",
    } as any);

    const sourceMessage = {
      id: "source-message-1",
      threadId: "thread-1",
      headers: {
        from: "sender@example.com",
        "reply-to": "reply-to@example.com",
        subject: "Original subject",
      },
      subject: "Original subject",
    };
    const replyToEmail = vi.fn().mockResolvedValue(undefined);
    vi.mocked(createEmailProvider).mockResolvedValue({
      getMessage: vi.fn().mockResolvedValue(sourceMessage),
      replyToEmail,
      getLatestMessageInThread: vi.fn().mockResolvedValue({
        id: "reply-message-2",
      }),
    } as any);

    const result = await confirmAssistantEmailAction(
      "ea_1" as any,
      {
        chatMessageId: "chat-message-1",
        toolCallId: "tool-1",
        actionType: "reply_email",
      } as any,
    );

    expect(replyToEmail).toHaveBeenCalledWith(sourceMessage, "Thanks!");
    expect(result?.data?.confirmationState).toBe("confirmed");
    expect(result?.data?.confirmationResult).toMatchObject({
      actionType: "reply_email",
      messageId: "reply-message-2",
      threadId: "thread-1",
      to: "reply-to@example.com",
      subject: "Original subject",
    });
  });

  it("sends a pending prepared forward and persists confirmed output", async () => {
    (prisma.emailAccount.findUnique as any).mockResolvedValueOnce({
      email: "owner@example.com",
      account: { userId: "u1", provider: "google" },
    });

    prisma.chatMessage.findFirst.mockResolvedValue({
      id: "chat-message-1",
      chatId: "chat-1",
      updatedAt: new Date("2026-02-23T00:00:00.000Z"),
      parts: [buildPendingForwardPart()],
    } as any);

    prisma.chatMessage.updateMany.mockResolvedValue({ count: 1 } as any);
    prisma.chatMessage.update.mockResolvedValue({
      id: "chat-message-1",
    } as any);

    const sourceMessage = {
      id: "source-message-1",
      threadId: "thread-1",
      headers: {
        from: "sender@example.com",
        subject: "Original subject",
      },
      subject: "Original subject",
    };
    const forwardEmail = vi.fn().mockResolvedValue(undefined);
    vi.mocked(createEmailProvider).mockResolvedValue({
      getMessage: vi.fn().mockResolvedValue(sourceMessage),
      forwardEmail,
      getLatestMessageInThread: vi.fn().mockResolvedValue({
        id: "forward-message-2",
      }),
    } as any);

    const result = await confirmAssistantEmailAction(
      "ea_1" as any,
      {
        chatMessageId: "chat-message-1",
        toolCallId: "tool-1",
        actionType: "forward_email",
      } as any,
    );

    expect(forwardEmail).toHaveBeenCalledWith(sourceMessage, {
      to: "recipient@example.com",
      cc: undefined,
      bcc: undefined,
      content: "FYI",
    });
    expect(result?.data?.confirmationState).toBe("confirmed");
    expect(result?.data?.confirmationResult).toMatchObject({
      actionType: "forward_email",
      messageId: "forward-message-2",
      threadId: "thread-1",
      to: "recipient@example.com",
      subject: "Original subject",
    });
  });

  it("does not re-send an already confirmed action", async () => {
    (prisma.emailAccount.findUnique as any).mockResolvedValue({
      email: "owner@example.com",
      account: { userId: "u1", provider: "google" },
    });

    prisma.chatMessage.findFirst.mockResolvedValue({
      id: "chat-message-1",
      chatId: "chat-1",
      updatedAt: new Date("2026-02-23T00:00:00.000Z"),
      parts: [
        {
          type: "tool-sendEmail",
          toolCallId: "tool-1",
          state: "output-available",
          output: {
            success: true,
            actionType: "send_email",
            requiresConfirmation: true,
            confirmationState: "confirmed",
            pendingAction: {
              to: "recipient@example.com",
              cc: null,
              bcc: null,
              subject: "Hello",
              messageHtml: "<p>Hi there</p>",
              from: null,
            },
            confirmationResult: {
              actionType: "send_email",
              messageId: "msg-1",
              threadId: "thr-1",
              to: "recipient@example.com",
              subject: "Hello",
              confirmedAt: "2026-02-22T00:00:00.000Z",
            },
          },
        },
      ],
    } as any);

    const result = await confirmAssistantEmailAction(
      "ea_1" as any,
      {
        chatMessageId: "chat-message-1",
        toolCallId: "tool-1",
        actionType: "send_email",
      } as any,
    );

    expect(createEmailProvider).not.toHaveBeenCalled();
    expect(prisma.chatMessage.updateMany).not.toHaveBeenCalled();
    expect(prisma.chatMessage.update).not.toHaveBeenCalled();
    expect(result?.data?.confirmationResult).toMatchObject({
      messageId: "msg-1",
      threadId: "thr-1",
    });
  });

  it("blocks confirm when another confirm is already processing", async () => {
    (prisma.emailAccount.findUnique as any).mockResolvedValue({
      email: "owner@example.com",
      account: { userId: "u1", provider: "google" },
    });

    prisma.chatMessage.findFirst.mockResolvedValue({
      id: "chat-message-1",
      chatId: "chat-1",
      updatedAt: new Date("2026-02-23T00:00:00.000Z"),
      parts: [
        buildProcessingSendPart({ processingAt: new Date().toISOString() }),
      ],
    } as any);

    const result = await confirmAssistantEmailAction(
      "ea_1" as any,
      {
        chatMessageId: "chat-message-1",
        toolCallId: "tool-1",
        actionType: "send_email",
      } as any,
    );

    expect(result?.serverError).toBe(
      "Email action confirmation already in progress",
    );
    expect(createEmailProvider).not.toHaveBeenCalled();
    expect(prisma.chatMessage.updateMany).not.toHaveBeenCalled();
  });

  it("reclaims stale processing state and sends once", async () => {
    (prisma.emailAccount.findUnique as any)
      .mockResolvedValueOnce({
        email: "owner@example.com",
        account: { userId: "u1", provider: "google" },
      })
      .mockResolvedValueOnce({
        name: "Owner",
        email: "owner@example.com",
      });

    prisma.chatMessage.findFirst.mockResolvedValue({
      id: "chat-message-1",
      chatId: "chat-1",
      updatedAt: new Date("2026-02-23T00:00:00.000Z"),
      parts: [
        buildProcessingSendPart({
          processingAt: "2025-01-01T00:00:00.000Z",
        }),
      ],
    } as any);

    prisma.chatMessage.updateMany.mockResolvedValue({ count: 1 } as any);
    prisma.chatMessage.update.mockResolvedValue({
      id: "chat-message-1",
    } as any);

    const sendEmailWithHtml = vi.fn().mockResolvedValue({
      messageId: "msg-1",
      threadId: "thr-1",
    });
    vi.mocked(createEmailProvider).mockResolvedValue({
      sendEmailWithHtml,
    } as any);

    const result = await confirmAssistantEmailAction(
      "ea_1" as any,
      {
        chatMessageId: "chat-message-1",
        toolCallId: "tool-1",
        actionType: "send_email",
      } as any,
    );

    expect(sendEmailWithHtml).toHaveBeenCalledTimes(1);
    expect(prisma.chatMessage.updateMany).toHaveBeenCalledTimes(1);
    expect(result?.data?.confirmationState).toBe("confirmed");
  });

  it("blocks duplicate send when reservation race is lost", async () => {
    (prisma.emailAccount.findUnique as any).mockResolvedValue({
      email: "owner@example.com",
      account: { userId: "u1", provider: "google" },
    });

    prisma.chatMessage.findFirst
      .mockResolvedValueOnce({
        id: "chat-message-1",
        chatId: "chat-1",
        updatedAt: new Date("2026-02-23T00:00:00.000Z"),
        parts: [buildPendingSendPart()],
      } as any)
      .mockResolvedValueOnce({
        id: "chat-message-1",
        parts: [buildProcessingSendPart()],
      } as any);

    prisma.chatMessage.updateMany.mockResolvedValue({ count: 0 } as any);

    const result = await confirmAssistantEmailAction(
      "ea_1" as any,
      {
        chatMessageId: "chat-message-1",
        toolCallId: "tool-1",
        actionType: "send_email",
      } as any,
    );

    expect(result?.serverError).toBe(
      "Email action confirmation already in progress",
    );
    expect(createEmailProvider).not.toHaveBeenCalled();
  });

  it("falls back to matching assistant message when chat message id is stale", async () => {
    (prisma.emailAccount.findUnique as any)
      .mockResolvedValueOnce({
        email: "owner@example.com",
        account: { userId: "u1", provider: "google" },
      })
      .mockResolvedValueOnce({
        name: "Owner",
        email: "owner@example.com",
      });

    prisma.chatMessage.findFirst.mockResolvedValue(null as any);
    prisma.chatMessage.findMany.mockResolvedValue([
      {
        id: "assistant-message-1",
        chatId: "chat-1",
        updatedAt: new Date("2026-02-23T00:00:00.000Z"),
        parts: [buildPendingSendPart()],
      },
    ] as any);

    prisma.chatMessage.updateMany.mockResolvedValue({ count: 1 } as any);
    prisma.chatMessage.update.mockResolvedValue({
      id: "assistant-message-1",
    } as any);

    const sendEmailWithHtml = vi.fn().mockResolvedValue({
      messageId: "msg-1",
      threadId: "thr-1",
    });
    vi.mocked(createEmailProvider).mockResolvedValue({
      sendEmailWithHtml,
    } as any);

    const result = await confirmAssistantEmailAction(
      "ea_1" as any,
      {
        chatMessageId: "stale-message-id",
        toolCallId: "tool-1",
        actionType: "send_email",
      } as any,
    );

    expect(result?.data?.confirmationState).toBe("confirmed");
    expect(sendEmailWithHtml).toHaveBeenCalledTimes(1);
    expect(prisma.chatMessage.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.chatMessage.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "assistant-message-1",
        }),
      }),
    );
  });

  it("returns not found when chat message id is stale and no fallback candidate matches", async () => {
    (prisma.emailAccount.findUnique as any).mockResolvedValue({
      email: "owner@example.com",
      account: { userId: "u1", provider: "google" },
    });

    prisma.chatMessage.findFirst.mockResolvedValue(null as any);
    prisma.chatMessage.findMany.mockResolvedValue([
      {
        id: "assistant-message-1",
        chatId: "chat-1",
        updatedAt: new Date("2026-02-23T00:00:00.000Z"),
        parts: [buildPendingSendPart()],
      },
    ] as any);

    const result = await confirmAssistantEmailAction(
      "ea_1" as any,
      {
        chatMessageId: "stale-message-id",
        toolCallId: "tool-missing",
        actionType: "send_email",
      } as any,
    );

    expect(result?.serverError).toBe("Chat message not found");
    expect(createEmailProvider).not.toHaveBeenCalled();
    expect(prisma.chatMessage.updateMany).not.toHaveBeenCalled();
  });

  it("clears processing state when provider send fails", async () => {
    (prisma.emailAccount.findUnique as any)
      .mockResolvedValueOnce({
        email: "owner@example.com",
        account: { userId: "u1", provider: "google" },
      })
      .mockResolvedValueOnce({
        name: "Owner",
        email: "owner@example.com",
      });

    prisma.chatMessage.findFirst
      .mockResolvedValueOnce({
        id: "chat-message-1",
        chatId: "chat-1",
        updatedAt: new Date("2026-02-23T00:00:00.000Z"),
        parts: [buildPendingSendPart()],
      } as any)
      .mockResolvedValueOnce({
        id: "chat-message-1",
        parts: [buildProcessingSendPart()],
      } as any);

    prisma.chatMessage.updateMany.mockResolvedValue({ count: 1 } as any);
    prisma.chatMessage.update.mockResolvedValue({
      id: "chat-message-1",
    } as any);

    vi.mocked(createEmailProvider).mockResolvedValue({
      sendEmailWithHtml: vi.fn().mockRejectedValue(new Error("send failed")),
    } as any);

    const result = await confirmAssistantEmailAction(
      "ea_1" as any,
      {
        chatMessageId: "chat-message-1",
        toolCallId: "tool-1",
        actionType: "send_email",
      } as any,
    );

    expect(result?.serverError).toBe("Failed to send email");
    const revertedParts = (prisma.chatMessage.update.mock.calls[0][0] as any)
      .data.parts as any[];
    expect(revertedParts[0].output.confirmationState).toBe("pending");
  });

  it("retries persisting confirmed state before succeeding", async () => {
    (prisma.emailAccount.findUnique as any)
      .mockResolvedValueOnce({
        email: "owner@example.com",
        account: { userId: "u1", provider: "google" },
      })
      .mockResolvedValueOnce({
        name: "Owner",
        email: "owner@example.com",
      });

    prisma.chatMessage.findFirst.mockResolvedValue({
      id: "chat-message-1",
      chatId: "chat-1",
      updatedAt: new Date("2026-02-23T00:00:00.000Z"),
      parts: [buildPendingSendPart()],
    } as any);

    prisma.chatMessage.updateMany.mockResolvedValue({ count: 1 } as any);
    prisma.chatMessage.update
      .mockRejectedValueOnce(new Error("transient-1"))
      .mockRejectedValueOnce(new Error("transient-2"))
      .mockResolvedValueOnce({ id: "chat-message-1" } as any);

    const sendEmailWithHtml = vi.fn().mockResolvedValue({
      messageId: "msg-1",
      threadId: "thr-1",
    });
    vi.mocked(createEmailProvider).mockResolvedValue({
      sendEmailWithHtml,
    } as any);

    const result = await confirmAssistantEmailAction(
      "ea_1" as any,
      {
        chatMessageId: "chat-message-1",
        toolCallId: "tool-1",
        actionType: "send_email",
      } as any,
    );

    expect(result?.data?.confirmationState).toBe("confirmed");
    expect(prisma.chatMessage.update).toHaveBeenCalledTimes(3);
  });
});

function buildPendingSendPart() {
  return {
    type: "tool-sendEmail",
    toolCallId: "tool-1",
    state: "output-available",
    output: {
      success: true,
      actionType: "send_email",
      requiresConfirmation: true,
      confirmationState: "pending",
      pendingAction: {
        to: "recipient@example.com",
        cc: null,
        bcc: null,
        subject: "Hello",
        messageHtml: "<p>Hi there</p>",
        from: null,
      },
    },
  };
}

function buildProcessingSendPart({
  processingAt = new Date().toISOString(),
}: {
  processingAt?: string;
} = {}) {
  return {
    ...buildPendingSendPart(),
    output: {
      ...buildPendingSendPart().output,
      confirmationState: "processing",
      confirmationProcessingAt: processingAt,
    },
  };
}

function buildPendingReplyPart() {
  return {
    type: "tool-replyEmail",
    toolCallId: "tool-1",
    state: "output-available",
    output: {
      success: true,
      actionType: "reply_email",
      requiresConfirmation: true,
      confirmationState: "pending",
      pendingAction: {
        messageId: "source-message-1",
        content: "Thanks!",
      },
      reference: {
        messageId: "source-message-1",
        threadId: "thread-1",
        from: "sender@example.com",
        subject: "Original subject",
      },
    },
  };
}

function buildPendingForwardPart() {
  return {
    type: "tool-forwardEmail",
    toolCallId: "tool-1",
    state: "output-available",
    output: {
      success: true,
      actionType: "forward_email",
      requiresConfirmation: true,
      confirmationState: "pending",
      pendingAction: {
        messageId: "source-message-1",
        to: "recipient@example.com",
        cc: null,
        bcc: null,
        content: "FYI",
      },
      reference: {
        messageId: "source-message-1",
        threadId: "thread-1",
        from: "sender@example.com",
        subject: "Original subject",
      },
    },
  };
}
